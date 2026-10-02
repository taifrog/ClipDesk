// Googleカレンダーの一覧を取得する Edge Function（FR-3b用）
// 設定画面のドロップダウン表示のため、calendarList.list を代理取得する。DB 更新はしない。
// 設計書 01_design_google-calendar.md M4 に対応する。

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getServiceClient, getUserClient, getJwt } from '../_shared/supabase.ts';
import { getAppSettings } from '../_shared/settings.ts';
import { GoogleApiError, listCalendars, refreshAccessToken } from '../_shared/google.ts';

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

  if (req.method !== 'GET') {
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
  const supabase = getServiceClient();

  // Google 連携設定を取得してバリデーションする
  const appSettings = await getAppSettings(supabase, userId);
  const googleSettings = appSettings.google;
  if (!googleSettings.clientId || !googleSettings.clientSecret || !googleSettings.refreshToken) {
    return new Response(JSON.stringify({ error: 'Google連携設定が完了していません' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // トークン更新→一覧取得を行い、正規化して返す
  try {
    const accessToken = await refreshAccessToken(googleSettings);
    const calendars = await listCalendars(accessToken);
    return new Response(JSON.stringify({ calendars }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof GoogleApiError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'カレンダー一覧の取得に失敗しました' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
