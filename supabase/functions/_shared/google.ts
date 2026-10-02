// Googleカレンダー連携用の共通ヘルパー
// 設計書 01_design_google-calendar.md M2 に対応する
// イベント登録・一覧取得の共通処理として、
// トークン更新・一覧取得・イベント作成・日時変換・エラー正規化を一か所に集約する。
// なぜ集約するか: google-calendar（作成）と google-calendars（一覧）の2 Functionから
// 同じリフレッシュ手順・同じエラー文言を使うため、重複と食い違いを防ぐ。

import type { GoogleCalendarSettings } from './ai.ts';

// Google OAuth トークンエンドポイント
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
// Google Calendar API v3 のベース URL
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
// イベント登録・一覧取得に使う最小権限スコープ（設計で固定）
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
// カレンダー一覧取得に必要な最小スコープ（calendarList.list用）
export const GOOGLE_CALENDAR_LIST_SCOPE = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';

// カレンダー一覧1件の正規化型
// フロントのドロップダウン表示用に id / summary / primary / accessRole のみ返す
export interface GoogleCalendarItem {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
}

// クリップからイベント作成に必要な最小情報
// Function 側で DB 行からこの形に変換して渡すことで、Google API 依存を分離する
export interface ClipEventSource {
  title: string;
  url: string;
  summary: string | null;
  receivedAt: string;
  eventStartDate: string;
  eventEndDate: string | null;
  location: string | null;
}

// Google API 失敗時に投げる正規化エラー
// status により呼び出し元が 400/401/403/404/500 を出し分けできるようにする
export class GoogleApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Google連携設定の不足を検証する
// なぜここで弾くか: トークン取得前に弾くことで、無駄な外部通信と分かりにくいエラーを防ぐ
export function assertGoogleSettings(settings: GoogleCalendarSettings): void {
  if (!settings.clientId || !settings.clientSecret || !settings.refreshToken) {
    throw new GoogleApiError(400, 'MISSING_SETTINGS', 'Google連携設定が完了していません');
  }
}

// 登録先カレンダーIDを確定する
// 空文字は primary 扱いにして、設定画面の未入力でも動作させる
export function resolveCalendarId(settings: GoogleCalendarSettings): string {
  const trimmed = (settings.calendarId || '').trim();
  return trimmed || 'primary';
}

// リフレッシュトークンからアクセストークンを取得する
// なぜリフレッシュ方式か: フロントに秘密を置かず、Edge Function 内でのみ短命トークンを扱うため（要件 FR-1 B方式）
export async function refreshAccessToken(settings: GoogleCalendarSettings): Promise<string> {
  assertGoogleSettings(settings);

  const body = new URLSearchParams({
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    refresh_token: settings.refreshToken,
    grant_type: 'refresh_token',
  });

  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    throw new GoogleApiError(500, 'TOKEN_NETWORK_ERROR', 'Google認証サーバーへの接続に失敗しました');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // invalid_grant は Refresh Token 失効・取り消しを意味するので再発行案内にする
    const code = typeof data.error === 'string' ? data.error : 'TOKEN_ERROR';
    if (code === 'invalid_grant') {
      throw new GoogleApiError(401, code, '再認証が必要です。Refresh Tokenを再発行してください');
    }
    if (code === 'invalid_client') {
      throw new GoogleApiError(401, code, 'Client ID または Client Secret を確認してください');
    }
    throw new GoogleApiError(401, code, 'Google認証に失敗しました');
  }

  const accessToken = data.access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new GoogleApiError(401, 'TOKEN_EMPTY', 'Google認証に失敗しました');
  }
  return accessToken;
}

// 日付文字列（YYYY-MM-DD）に日数を加算する
// 終日イベントの排他的終了日（Google仕様: end.date は翌日）を求めるために使う
function addDaysToDateString(dateString: string, days: number): string {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// ISO 8601 文字列が終日扱いかを判定する
// ClipDesk の AI 抽出は時刻不明時に 00:00:00+09:00 を入れるため、
// 開始が午前0時かつ終了が同日・なしの場合のみ終日とみなす（設計 3.5）
function isAllDayEvent(startIso: string, endIso: string | null): boolean {
  const start = new Date(startIso);
  if (isNaN(start.getTime())) return false;
  // JST での時刻部を取り出す（+09:00 基準の入力を想定）
  const timeMatch = startIso.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
  const isMidnight = timeMatch ? timeMatch[1] === '00' && timeMatch[2] === '00' : false;
  if (!isMidnight) return false;
  if (!endIso) return true;
  const end = new Date(endIso);
  if (isNaN(end.getTime())) return true;
  const startDay = startIso.slice(0, 10);
  const endDay = endIso.slice(0, 10);
  return startDay === endDay;
}

// クリップ日時を開始・終了の Google 形式に変換する
// 終日は { date }、時刻ありは { dateTime, timeZone } を返す
function buildStartEnd(source: ClipEventSource): { start: Record<string, string>; end: Record<string, string> } {
  const startDate = new Date(source.eventStartDate);
  if (isNaN(startDate.getTime())) {
    throw new GoogleApiError(400, 'INVALID_START_DATE', 'イベント開始日が不正です');
  }

  let endIso = source.eventEndDate;
  if (endIso) {
    const endDate = new Date(endIso);
    if (isNaN(endDate.getTime())) {
      throw new GoogleApiError(400, 'INVALID_END_DATE', 'イベント終了日が不正です');
    }
    // 終了が開始より前の場合は開始に丸める（Google 400 を避けるため）
    if (endDate.getTime() < startDate.getTime()) {
      endIso = source.eventStartDate;
    }
  }

  if (isAllDayEvent(source.eventStartDate, endIso)) {
    const startDay = source.eventStartDate.slice(0, 10);
    const endDay = endIso ? endIso.slice(0, 10) : startDay;
    // Google の終日終了日は排他的なので +1 日する
    const exclusiveEnd = addDaysToDateString(endDay, 1);
    return { start: { date: startDay }, end: { date: exclusiveEnd } };
  }

  const startDateTime = source.eventStartDate;
  const endDateTime = endIso ?? source.eventStartDate;
  return {
    start: { dateTime: startDateTime, timeZone: 'Asia/Tokyo' },
    end: { dateTime: endDateTime, timeZone: 'Asia/Tokyo' },
  };
}

// クリップから Google イベントボディを組み立てる
// description には要約・URL・受信日を必ず含め、情報落ちを防ぐ
export function buildCalendarEventBody(source: ClipEventSource): Record<string, unknown> {
  const { start, end } = buildStartEnd(source);
  const lines: string[] = [];
  if (source.summary) {
    lines.push(source.summary);
    lines.push('');
  }
  if (source.url) {
    lines.push(`URL: ${source.url}`);
  }
  if (source.receivedAt) {
    lines.push(`受信日: ${source.receivedAt}`);
  }
  const body: Record<string, unknown> = {
    summary: source.title || '（タイトルなし）',
    description: lines.join('\n'),
    start,
    end,
  };
  if (source.location) {
    body.location = source.location;
  }
  return body;
}

// カレンダーにイベントを作成する
// @returns 作成したイベントの ID と URL（htmlLink）
export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  source: ClipEventSource,
): Promise<{ eventId: string; eventUrl: string }> {
  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildCalendarEventBody(source)),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 403) {
      throw new GoogleApiError(403, 'FORBIDDEN', '権限がありません。スコープ https://www.googleapis.com/auth/calendar.events を確認してください');
    }
    if (response.status === 404) {
      throw new GoogleApiError(404, 'CALENDAR_NOT_FOUND', 'カレンダーIDを確認してください');
    }
    const message = typeof data?.error?.message === 'string' ? data.error.message : `Google Calendar API エラー（${response.status}）`;
    throw new GoogleApiError(response.status, 'EVENTS_INSERT_FAILED', message);
  }
  const eventId = data.id;
  const eventUrl = data.htmlLink;
  if (typeof eventId !== 'string' || typeof eventUrl !== 'string') {
    throw new GoogleApiError(500, 'EVENT_RESPONSE_EMPTY', 'Google からの応答にイベント情報が含まれていません');
  }
  return { eventId, eventUrl };
}

// カレンダー一覧を取得する（FR-3b用）
// 書き込み可否はフロントで出し分けるため、ここでは絞り込まずに返す
export async function listCalendars(accessToken: string): Promise<GoogleCalendarItem[]> {
  const url = `${CALENDAR_API_BASE}/users/me/calendarList?maxResults=250`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 403) {
      throw new GoogleApiError(403, 'FORBIDDEN', '権限がありません。Refresh Token発行時にスコープ https://www.googleapis.com/auth/calendar.calendarlist.readonly を含めたか確認してください');
    }
    const message = typeof data?.error?.message === 'string' ? data.error.message : `Google Calendar API エラー（${response.status}）`;
    throw new GoogleApiError(response.status, 'CALENDAR_LIST_FAILED', message);
  }
  const items = Array.isArray(data.items) ? data.items : [];
  return items
    .filter((item: Record<string, unknown>) => typeof item.id === 'string')
    .map((item: Record<string, unknown>) => ({
      id: String(item.id),
      summary: typeof item.summary === 'string' ? item.summary : String(item.id),
      primary: Boolean(item.primary),
      accessRole: typeof item.accessRole === 'string' ? item.accessRole : '',
    }));
}
