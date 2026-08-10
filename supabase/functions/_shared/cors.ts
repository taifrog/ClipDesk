// Edge Functions 用 CORS ヘッダー
// フロントエンド（Vite dev / Supabase hosting）と Chrome 拡張機能からの呼び出しを許可する。

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

// プリフライトリクエストに対するレスポンスを返す
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }
  return null;
}
