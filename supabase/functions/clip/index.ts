// Chrome 拡張機能などからクリップを受信する Edge Function
// 認証は x-api-key ヘッダーによる API キー認証を行う。

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getServiceClient, getApiKey, resolveUserIdByApiKey } from '../_shared/supabase.ts';
import { summarizeWithOpenCodeGo } from '../_shared/ai.ts';
import { getAppSettings } from '../_shared/settings.ts';

interface ClipPayload {
  url?: string;
  title?: string;
  summary?: string;
  rawBody?: string;
}

// デバッグメッセージ出力用関数
// @param msg 出力する文字列
function debug(msg: string) {
  // 開発時は有効、本番はここをコメントアウト
  console.log(`[DEBUG] ${msg}`);
}

Deno.serve(async (req) => {
  // CORS プリフライト対応
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // API キー認証
  const apiKey = getApiKey(req);
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'APIキーが必要です' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // API キーからユーザー ID を解決する際と DB 操作時で service_role クライアントを分離する
  const adminClient = getServiceClient();
  const userId = await resolveUserIdByApiKey(adminClient, apiKey);
  if (!userId) {
    return new Response(JSON.stringify({ error: '無効なAPIキーです' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = getServiceClient();

  // POST のみ受け付ける
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POSTメソッドのみ許可されています' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: ClipPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'リクエストボディをJSONとして解析できません' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { url, title, summary, rawBody } = body;
  if (!url || !title) {
    return new Response(JSON.stringify({ error: 'url と title は必須です', receivedBody: body }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // AI 要約処理
  let finalSummary = summary || '';
  let aiSummaryError: string | null = null;
  const aiSettings = await getAppSettings(supabase, userId);

  debug(`クリップ受信: ${url}, summary=${finalSummary.length}, rawBody=${rawBody?.length || 0}, aiEnabled=${aiSettings.enabled}`);

  if (!finalSummary && rawBody && aiSettings.enabled && aiSettings.apiKey) {
    try {
      const aiSummary = await summarizeWithOpenCodeGo(rawBody, title, aiSettings);
      if (aiSummary) finalSummary = aiSummary;
    } catch (err) {
      aiSummaryError = err instanceof Error ? err.message : '不明なエラー';
      debug(`AI要約失敗: ${aiSummaryError}`);
    }
  }

  // 重複チェック（同一ユーザー内で未削除の同じURL）
  const { data: existing } = await supabase
    .from('clips')
    .select('id')
    .eq('user_id', userId)
    .eq('url', url)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ ok: true, duplicate: true, id: existing.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // クリップ登録
  const { data: inserted, error } = await supabase
    .from('clips')
    .insert({
      user_id: userId,
      url,
      title,
      summary: finalSummary,
      raw_body: rawBody || '',
      category_id: 'others',
      is_pinned: false,
      is_checked: false,
      comment: '',
    })
    .select()
    .single();

  if (error || !inserted) {
    debug(`クリップ登録失敗: ${error?.message}`);
    return new Response(JSON.stringify({ error: error?.message || 'クリップ登録に失敗しました' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  debug(`クリップ登録成功: id=${inserted.id}`);
  return new Response(JSON.stringify({ ok: true, clip: inserted, aiSummaryError }), {
    status: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
