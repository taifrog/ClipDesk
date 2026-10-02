// クリップのイベント情報を Googleカレンダーに登録する Edge Function
// 登録成功後は clips テーブルの google_* フラグを更新し、ゴミ箱へ移動する。
// 設計書 01_design_google-calendar.md M3 に対応する。

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getServiceClient, getUserClient, getJwt } from '../_shared/supabase.ts';
import { getAppSettings } from '../_shared/settings.ts';
import {
  GoogleApiError,
  createCalendarEvent,
  refreshAccessToken,
  resolveCalendarId,
} from '../_shared/google.ts';

// Supabase から取得するクリップの型
interface ClipRow {
  id: number;
  user_id: string;
  title: string;
  url: string;
  summary: string | null;
  received_at: string;
  event_start_date: string | null;
  event_end_date: string | null;
  location: string | null;
  google_exported: boolean;
  deleted_at: string | null;
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
      'id, user_id, title, url, summary, received_at, event_start_date, event_end_date, location, google_exported, deleted_at',
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
  if (typedClip.google_exported) {
    return new Response(JSON.stringify({ error: 'このクリップは既に Googleカレンダーに登録されています' }), {
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

  // Google 連携設定を取得してバリデーションする
  const appSettings = await getAppSettings(supabase, userId);
  const googleSettings = appSettings.google;
  if (!googleSettings.clientId || !googleSettings.clientSecret || !googleSettings.refreshToken) {
    return new Response(JSON.stringify({ error: 'Google連携設定が完了していません' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const calendarId = resolveCalendarId(googleSettings);

  // Google へイベントを作成する（エラーは状態コード付きで返す）
  let eventId: string;
  let eventUrl: string;
  try {
    const accessToken = await refreshAccessToken(googleSettings);
    const created = await createCalendarEvent(accessToken, calendarId, {
      title: typedClip.title,
      url: typedClip.url,
      summary: typedClip.summary,
      receivedAt: typedClip.received_at,
      eventStartDate: typedClip.event_start_date,
      eventEndDate: typedClip.event_end_date,
      location: typedClip.location,
    });
    eventId = created.eventId;
    eventUrl = created.eventUrl;
  } catch (err) {
    if (err instanceof GoogleApiError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'Googleカレンダーへの登録に失敗しました' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const exportedAt = new Date().toISOString();

  // クリップの Google 連携状態を更新し、同時にゴミ箱へ移動する
  const { error: updateError } = await supabase
    .from('clips')
    .update({
      google_exported: true,
      google_exported_at: exportedAt,
      google_event_id: eventId,
      google_event_url: eventUrl,
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
    JSON.stringify({ ok: true, eventId, eventUrl, exportedAt, calendarId }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
