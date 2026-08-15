// Chrome 拡張機能などからクリップを受信する Edge Function
// 認証は x-api-key ヘッダーによる API キー認証を行う。

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getServiceClient, getApiKey, getJwt, resolveUserIdByApiKey, resolveUserIdByJwt } from '../_shared/supabase.ts';
import { summarizeWithOpenCodeGo, type AiSummaryResult } from '../_shared/ai.ts';
import { getAppSettings } from '../_shared/settings.ts';
import { fetchPageText } from '../_shared/fetchPage.ts';

interface ClipPayload {
  url?: string;
  title?: string;
  summary?: string;
  rawBody?: string;
  text?: string;
  categoryId?: string;
  comment?: string;
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

  // API キー認証または JWT 認証からユーザー ID を解決する
  const adminClient = getServiceClient();
  let userId: string | null = null;

  const apiKey = getApiKey(req);
  if (apiKey) {
    userId = await resolveUserIdByApiKey(adminClient, apiKey);
  }

  if (!userId) {
    const jwt = getJwt(req);
    if (jwt) {
      userId = await resolveUserIdByJwt(adminClient, jwt);
    }
  }

  if (!userId) {
    return new Response(JSON.stringify({ error: 'APIキーが必要です' }), {
      status: 401,
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

  const { url, title, summary, rawBody, text, categoryId, comment } = body;
  if (!url || !title) {
    return new Response(JSON.stringify({ error: 'url と title は必須です', receivedBody: body }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // AI 要約処理
  let finalSummary = summary || '';
  let finalRawBody = rawBody || '';
  let aiSummaryError: string | null = null;
  const aiSettings = await getAppSettings(supabase, userId);

  debug(`クリップ受信: ${url}, summary=${finalSummary.length}, rawBody=${finalRawBody.length}, aiEnabled=${aiSettings.enabled}`);

  // rawBody が空の場合、共有テキストのうち URL 以外の部分をフォールバックとして使用する
  if (!finalRawBody && text) {
    const textWithoutUrl = text.replace(/https?:\/\/[^\s]+/g, ' ').trim();
    if (textWithoutUrl) {
      finalRawBody = textWithoutUrl;
      debug(`共有テキストを rawBody フォールバックとして使用: ${finalRawBody.length}文字`);
    }
  }

  // rawBody がまだ空で AI 要約が有効な場合、URL から HTML を取得して本文を補完する
  if (!finalRawBody && url && aiSettings.enabled && aiSettings.apiKey) {
    debug(`URL から HTML を取得して本文を補完します: ${url}`);
    const fetchedText = await fetchPageText(url);
    if (fetchedText) {
      finalRawBody = fetchedText;
      debug(`HTML 取得成功: ${finalRawBody.length}文字`);
    } else {
      debug('HTML 取得失敗: 要約をスキップします');
    }
  }

  // イベント情報の抽出結果を保持する変数
  let eventStartDate: string | null = null;
  let eventEndDate: string | null = null;
  let location: string | null = null;

  if (!finalSummary && finalRawBody && aiSettings.enabled && aiSettings.apiKey) {
    try {
      const aiResult: AiSummaryResult = await summarizeWithOpenCodeGo(finalRawBody, title, aiSettings);
      if (aiResult.summary) finalSummary = aiResult.summary;
      eventStartDate = aiResult.eventStartDate;
      eventEndDate = aiResult.eventEndDate;
      location = aiResult.location;
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
      raw_body: finalRawBody,
      category_id: categoryId || 'others',
      is_pinned: false,
      is_checked: false,
      comment: comment || '',
      event_start_date: eventStartDate,
      event_end_date: eventEndDate,
      location,
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
