// クリップのイベント情報を Notion カレンダー（データベース）に登録する Edge Function
// 登録成功後は clips テーブルの notion_* フラグを更新し、ゴミ箱へ移動する。

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getServiceClient, getUserClient, getJwt } from '../_shared/supabase.ts';
import { getAppSettings } from '../_shared/settings.ts';
import { NotionSettings } from '../_shared/ai.ts';

// Supabase から取得するクリップの型
interface ClipRow {
  id: number;
  user_id: string;
  title: string;
  url: string;
  summary: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
  notion_exported: boolean;
  deleted_at: string | null;
}

// Notion API へのリクエストボディを組み立てる
// @param clip 登録対象クリップ
// @param settings Notion 連携設定
// @returns Notion pages API 用のプロパティオブジェクト
function buildNotionProperties(
  clip: ClipRow,
  settings: NotionSettings,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    [settings.titlePropertyName]: {
      title: [{ text: { content: clip.title || '（タイトルなし）' } }],
    },
  };

  if (clip.event_start_date) {
    const datePayload: { start: string; end?: string } = { start: clip.event_start_date };
    if (clip.event_end_date && clip.event_end_date !== clip.event_start_date) {
      datePayload.end = clip.event_end_date;
    }
    properties[settings.datePropertyName] = { date: datePayload };
  }

  if (clip.url) {
    properties[settings.urlPropertyName] = { url: clip.url };
  }

  if (clip.summary) {
    properties[settings.summaryPropertyName] = {
      rich_text: [{ text: { content: clip.summary } }],
    };
  }

  return properties;
}
// Notion データベースにクリップを登録する
// @param clip 登録対象クリップ
// @param settings Notion 連携設定
// @returns 作成したページの ID と URL
async function createNotionPage(
  clip: ClipRow,
  settings: NotionSettings,
): Promise<{ pageId: string; pageUrl: string }> {
  // URL に含まれる ?v=... やハイフンを除去して、32 文字のデータベース ID のみを使用する
  const databaseId = settings.databaseId
    .split('?')[0]
    .replace(/-/g, '')
    .match(/([0-9a-f]{32})$/i)?.[1] ?? settings.databaseId.split('?')[0];

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.apiKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: buildNotionProperties(clip, settings),
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.message || `Notion API エラー（${response.status}）`;
    throw new Error(message);
  }

  const pageId = data.id;
  const pageUrl = data.url;
  if (typeof pageId !== 'string' || typeof pageUrl !== 'string') {
    throw new Error('Notion からの応答にページ情報が含まれていません');
  }

  return { pageId, pageUrl };
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const jwt = getJwt(req);
  if (!jwt) {
    return new Response(JSON.stringify({ error: '認証が必要です' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // JWT 検証は anon キーのユーザークライアントで行い、DB 操作は service_role クライアントで行う
  const authClient = getUserClient(req);
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: '認証に失敗しました' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSONボディが不正です' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const clipId = typeof body.clipId === 'number' ? body.clipId : Number(body.clipId);
  if (!Number.isFinite(clipId) || clipId <= 0) {
    return new Response(JSON.stringify({ error: 'clipId が不正です' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = getServiceClient();

  // 対象クリップを取得する（自分のクリップかつ未削除・未登録）
  const { data: clip, error: clipError } = await supabase
    .from('clips')
    .select(
      'id, user_id, title, url, summary, event_start_date, event_end_date, notion_exported, deleted_at',
    )
    .eq('id', clipId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();

  if (clipError || !clip) {
    return new Response(JSON.stringify({ error: 'クリップが見つかりません' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const typedClip = clip as ClipRow;
  if (typedClip.notion_exported) {
    return new Response(JSON.stringify({ error: 'このクリップは既に Notion に登録されています' }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!typedClip.event_start_date) {
    return new Response(JSON.stringify({ error: 'イベント開始日が登録されていません' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Notion 連携設定を取得してバリデーションする
  const appSettings = await getAppSettings(supabase, userId);
  const notionSettings = appSettings.notion;
  if (!notionSettings.apiKey) {
    return new Response(JSON.stringify({ error: 'Notion API キーが設定されていません' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!notionSettings.databaseId) {
    return new Response(JSON.stringify({ error: 'Notion データベース ID が設定されていません' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Notion へページを作成する
  const { pageId, pageUrl } = await createNotionPage(typedClip, notionSettings);
  const exportedAt = new Date().toISOString();

  // クリップの Notion 連携状態を更新し、同時にゴミ箱へ移動する
  const { error: updateError } = await supabase
    .from('clips')
    .update({
      notion_exported: true,
      notion_exported_at: exportedAt,
      notion_page_id: pageId,
      notion_page_url: pageUrl,
      deleted_at: exportedAt,
    })
    .eq('id', clipId)
    .eq('user_id', userId);

  if (updateError) {
    return new Response(JSON.stringify({ error: `クリップの更新に失敗しました: ${updateError.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, pageId, pageUrl, exportedAt }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});

