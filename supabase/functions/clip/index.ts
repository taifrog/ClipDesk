// Chrome 拡張機能などからクリップを受信する Edge Function
// 認証は x-api-key ヘッダーによる API キー認証を行う。
// AI 要約・日時・場所抽出は即時には行わず、登録後に enrich-clip を非同期で呼び出す。

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getServiceClient, getApiKey, getJwt, resolveUserIdByApiKey, resolveUserIdByJwt } from '../_shared/supabase.ts';

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

// enrich-clip Edge Function を非同期で呼び出す
// fire-and-forget: レスポンスを待たずに処理を続行する
// @param req 元のリクエスト（認証ヘッダー取得用）
// @param clipId 登録したクリップの ID
// @param payload enrich-clip へ渡すペイロード
async function enqueueEnrichClip(req: Request, clipId: number, payload: Omit<ClipPayload, 'summary' | 'categoryId' | 'comment'> & { clipId: number }) {
  try {
    const url = new URL(req.url);
    const enrichUrl = `${url.protocol}//${url.host}/functions/v1/enrich-clip`;

    // 元のリクエストと同じ認証ヘッダーを引き継ぐ
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const apiKey = getApiKey(req);
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    const jwt = getJwt(req);
    if (jwt) {
      headers['Authorization'] = `Bearer ${jwt}`;
    }

    debug(`enrich-clip 非同期呼び出し: ${enrichUrl}, clipId=${clipId}`);
    fetch(enrichUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    }).catch((err) => {
      debug(`enrich-clip fire-and-forget 失敗: ${err instanceof Error ? err.message : '不明なエラー'}`);
    });
  } catch (err) {
    debug(`enrich-clip キューイング失敗: ${err instanceof Error ? err.message : '不明なエラー'}`);
  }
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

  debug(`クリップ受信: ${url}, summary=${(summary || '').length}, rawBody=${(rawBody || '').length}, text=${(text || '').length}`);

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

  // クリップ登録（AI 要約は未済の状態。要約が渡されていればそのまま保存する）
  const { data: inserted, error } = await supabase
    .from('clips')
    .insert({
      user_id: userId,
      url,
      title,
      summary: summary || '',
      raw_body: rawBody || '',
      category_id: categoryId || 'others',
      is_pinned: false,
      is_checked: false,
      comment: comment || '',
      ai_enrichment_status: 'pending',
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

  // 要約が未設定の場合のみ、非同期で AI 要約を実行する
  if (!summary) {
    enqueueEnrichClip(req, inserted.id, {
      clipId: inserted.id,
      url,
      title,
      rawBody: rawBody || '',
      text: text || '',
    });
  }

  debug(`クリップ登録成功: id=${inserted.id}`);
  return new Response(JSON.stringify({ ok: true, clip: inserted }), {
    status: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
