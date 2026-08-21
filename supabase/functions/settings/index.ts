// アプリ設定の取得・保存を行う Edge Function

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getServiceClient, getUserClient, getJwt } from '../_shared/supabase.ts';
import { getAppSettings, saveAiSummarySettings, saveObsidianSettings } from '../_shared/settings.ts';

// デバッグメッセージ出力用関数
// @param msg 出力する文字列
function debug(msg: string) {
  // 開発時は有効、本番はここをコメントアウト
  console.log(`[DEBUG] ${msg}`);
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
  const supabase = getServiceClient();

  // GET /settings 取得
  if (req.method === 'GET') {
    const settings = await getAppSettings(supabase, userId);
    return new Response(JSON.stringify({ settings }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // POST /settings 保存
  if (req.method === 'POST') {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'JSONボディが不正です' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    debug(`settings POST body: aiSummaryEnabled=${body.aiSummaryEnabled}, aiSummaryApiKey存在=${typeof body.aiSummaryApiKey === 'string'}, aiSummaryModel=${body.aiSummaryModel}, obsidianApiKey存在=${typeof body.obsidianApiKey === 'string'}`);

    // AI 要約設定の保存
    if (
      typeof body.aiSummaryEnabled === 'boolean' ||
      typeof body.aiSummaryApiKey === 'string' ||
      typeof body.aiSummaryModel === 'string' ||
      typeof body.aiSummaryLanguage === 'string'
    ) {
      const aiSettings = await saveAiSummarySettings(supabase, userId, {
        enabled: typeof body.aiSummaryEnabled === 'boolean' ? body.aiSummaryEnabled : undefined,
        apiKey: typeof body.aiSummaryApiKey === 'string' ? body.aiSummaryApiKey : undefined,
        model: typeof body.aiSummaryModel === 'string' ? body.aiSummaryModel : undefined,
        language: typeof body.aiSummaryLanguage === 'string' ? body.aiSummaryLanguage : undefined,
      });
      return new Response(JSON.stringify({ ok: true, settings: aiSettings }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Obsidian 連携設定の保存
    if (
      typeof body.obsidianApiKey === 'string' ||
      typeof body.obsidianFolder === 'string' ||
      typeof body.obsidianFilenameTemplate === 'string' ||
      typeof body.obsidianNoteTemplate === 'string'
    ) {
      const obsidianSettings = await saveObsidianSettings(supabase, userId, {
        apiKey: typeof body.obsidianApiKey === 'string' ? body.obsidianApiKey : undefined,
        folder: typeof body.obsidianFolder === 'string' ? body.obsidianFolder : undefined,
        filenameTemplate: typeof body.obsidianFilenameTemplate === 'string'
          ? body.obsidianFilenameTemplate
          : undefined,
        noteTemplate: typeof body.obsidianNoteTemplate === 'string'
          ? body.obsidianNoteTemplate
          : undefined,
      });
      return new Response(JSON.stringify({ ok: true, settings: obsidianSettings }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: '更新する設定項目がありません' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
