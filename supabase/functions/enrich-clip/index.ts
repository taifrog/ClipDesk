// クリップ登録後に非同期で AI 要約・日時・場所抽出を行う Edge Function
// clip Edge Function から fire-and-forget で呼び出されることを想定している。

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getServiceClient, getApiKey, getJwt, resolveUserIdByApiKey, resolveUserIdByJwt } from '../_shared/supabase.ts';
import { summarizeWithOpenCodeGo } from '../_shared/ai.ts';
import { getAppSettings } from '../_shared/settings.ts';
import { fetchPageText } from '../_shared/fetchPage.ts';

// enrich-clip へのリクエストボディの型
interface EnrichClipPayload {
  clipId?: number;
  url?: string;
  title?: string;
  rawBody?: string;
  text?: string;
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

  // POST のみ受け付ける
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POSTメソッドのみ許可されています' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: EnrichClipPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'リクエストボディをJSONとして解析できません' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { clipId, url, title, rawBody, text } = body;
  if (!clipId || !url || !title) {
    return new Response(JSON.stringify({ error: 'clipId, url, title は必須です' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = getServiceClient();

  // AI 要約ステータスを processing に更新する
  const { error: processingError } = await supabase
    .from('clips')
    .update({ ai_enrichment_status: 'processing' })
    .eq('id', clipId)
    .eq('user_id', userId);

  if (processingError) {
    debug(`enrich-clip processing ステータス更新失敗: ${processingError.message}`);
  }

  try {
    const aiSettings = await getAppSettings(supabase, userId);

    // AI 要約用の入力テキストを構築する
    // 優先順位: rawBody > 共有テキスト（URL除去） > URL から取得した HTML
    let aiInputText = rawBody || '';

    if (!aiInputText && text) {
      const textWithoutUrl = text.replace(/https?:\/\/[^\s]+/g, ' ').trim();
      if (textWithoutUrl) {
        aiInputText = textWithoutUrl;
        debug(`enrich-clip: 共有テキストを AI 入力フォールバックとして使用: ${aiInputText.length}文字`);
      }
    }

    // AI 入力テキストが不足している場合（500文字未満）、URL から HTML を取得して補完する
    const MIN_AI_INPUT_LENGTH = 500;
    if (aiInputText.length < MIN_AI_INPUT_LENGTH && url && aiSettings.enabled && aiSettings.apiKey) {
      debug(`enrich-clip: AI 入力テキストが不足（${aiInputText.length}文字）: URL から HTML を取得します: ${url}`);
      const fetchedText = await fetchPageText(url);
      if (fetchedText) {
        aiInputText = fetchedText;
        debug(`enrich-clip: HTML 取得成功: ${aiInputText.length}文字`);
      } else {
        debug('enrich-clip: HTML 取得失敗: 既存のテキストで AI 要約を試行します');
      }
    }

    // イベント情報の抽出結果を保持する変数
    let eventStartDate: string | null = null;
    let eventEndDate: string | null = null;
    let location: string | null = null;
    let finalSummary = '';

    // AI 要約を実行する
    if (aiInputText && aiSettings.enabled && aiSettings.apiKey) {
      debug(`enrich-clip: AI 要約実行: 入力=${aiInputText.length}文字, title=${title}`);
      const aiResult = await summarizeWithOpenCodeGo(aiInputText, title, aiSettings);
      debug(`enrich-clip: AI 要約結果: summary=${aiResult.summary.length}, eventStartDate=${aiResult.eventStartDate}, eventEndDate=${aiResult.eventEndDate}, location=${aiResult.location}`);
      if (aiResult.summary) finalSummary = aiResult.summary;
      eventStartDate = aiResult.eventStartDate;
      eventEndDate = aiResult.eventEndDate;
      location = aiResult.location;
    } else {
      let skipReason = '';
      if (!aiInputText) skipReason += 'AI入力テキストなし ';
      if (!aiSettings.enabled) skipReason += 'AI無効 ';
      if (!aiSettings.apiKey) skipReason += 'APIキー未設定 ';
      debug(`enrich-clip: AI 要約スキップ: ${skipReason.trim() || 'unknown'}`);
    }

    // クリップを AI 要約結果で更新し、ステータスを completed にする
    const { error: updateError } = await supabase
      .from('clips')
      .update({
        summary: finalSummary,
        raw_body: aiInputText,
        event_start_date: eventStartDate,
        event_end_date: eventEndDate,
        location,
        ai_enrichment_status: 'completed',
      })
      .eq('id', clipId)
      .eq('user_id', userId);

    if (updateError) {
      debug(`enrich-clip クリップ更新失敗: ${updateError.message}`);
      throw updateError;
    }

    debug(`enrich-clip 完了: clipId=${clipId}`);
    return new Response(JSON.stringify({ ok: true, clipId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // AI 要約失敗時はステータスを failed に更新する（ユーザーへの通知は行わない）
    const message = err instanceof Error ? err.message : '不明なエラー';
    debug(`enrich-clip 失敗: ${message}`);
    await supabase
      .from('clips')
      .update({ ai_enrichment_status: 'failed' })
      .eq('id', clipId)
      .eq('user_id', userId);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
