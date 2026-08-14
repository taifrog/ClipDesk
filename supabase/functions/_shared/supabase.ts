// Edge Functions 用 Supabase クライアント生成
// service_role キーを使い、Edge Function 内では RLS をバイパスして操作する。

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';

// 環境変数から Supabase URL と service_role キーを取得する
export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get('SB_URL');
  const key = Deno.env.get('SB_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('SB_URL または SB_SERVICE_ROLE_KEY が設定されていません');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// リクエストヘッダーから anon キーで認証済みユーザーのクライアントを生成する
// フロントエンドからの認証リクエスト用
export function getUserClient(req: Request): SupabaseClient {
  const url = Deno.env.get('SB_URL');
  const key = Deno.env.get('SB_ANON_KEY');
  if (!url || !key) {
    throw new Error('SB_URL または SB_ANON_KEY が設定されていません');
  }
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  });
}

// Bearer トークンを取り出して JWT を返す
export function getJwt(req: Request): string | null {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

// API キー（x-api-key ヘッダー）を取り出す
export function getApiKey(req: Request): string | null {
  return req.headers.get('x-api-key') || req.headers.get('X-Api-Key') || null;
}

// JWT からユーザー ID を解決する
// service_role クライアントを使い、トークンの検証とユーザー取得を行う
export async function resolveUserIdByJwt(supabase: SupabaseClient, jwt: string): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) {
    return null;
  }
  return data.user.id;
}

// API キーからユーザー ID を解決する
// 平文のキーを SHA-256 でハッシュ化し、user_api_keys テーブルで照合する
export async function resolveUserIdByApiKey(supabase: SupabaseClient, apiKey: string): Promise<string | null> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  const { data: rows, error } = await supabase
    .from('user_api_keys')
    .select('user_id')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (error || !rows) {
    return null;
  }

  // 最終利用日時を更新する
  await supabase.from('user_api_keys').update({ last_used_at: new Date().toISOString() }).eq('key_hash', keyHash);

  return rows.user_id as string;
}
