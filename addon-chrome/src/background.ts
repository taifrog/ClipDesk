// Service Worker（background script）
// タブ情報の取得、ClipDeskへの投稿を制御する

import type { ClipPayload, ExtensionMessage, ExtensionSettings, PageInfo } from './types';
import { loadSettings } from './storage';

// デバッグ用ログ出力
// @param msg 出力するメッセージ
function debug(msg: string): void {
  console.log('[ClipDesk BG]', msg);
}

// 設定を取得する
async function getSettings(): Promise<ExtensionSettings> {
  return await loadSettings();
}

// Supabase URL と clip Edge Function のエンドポイントを組み立てる
// @param supabaseUrl Supabase プロジェクトの URL
// @returns clip Edge Function の完全な URL
function buildClipEndpoint(supabaseUrl: string): string {
  const base = supabaseUrl.replace(/\/$/, '');
  return `${base}/functions/v1/clip`;
}

// content script が注入可能なスキームか判定する
function isInjectableUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /^(https?|file|ftp):/i.test(url);
}

// アクティブなタブの情報を取得する
// コンテンツスクリプトにメッセージを送り、タイトル・URL・本文を取得する
async function getActivePageInfo(): Promise<PageInfo> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab || !tab.id) {
    throw new Error('アクティブなタブが見つかりません');
  }

  if (!isInjectableUrl(tab.url)) {
    throw new Error('このページではクリップできません（通常のWebページでお試しください）');
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' });
    if (!response || !response.ok) {
      throw new Error('ページ情報の取得に失敗しました');
    }
    return response.info as PageInfo;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Receiving end does not exist')) {
      throw new Error('このページではクリップできません（通常のWebページでお試しください）');
    }
    throw err;
  }
}

// ClipDesk（Supabase Edge Functions）にクリップを投稿する
// @param payload 送信するクリップ情報
// @param siteUrl 投稿先 URL
// @param apiKey x-api-key ヘッダーに付与する API キー
async function postToClipDesk(payload: ClipPayload, siteUrl: string, apiKey: string): Promise<void> {
  const response = await fetch(siteUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(getErrorMessage(response.status, text));
  }
}

// ステータスコードに応じたユーザー向けエラーメッセージを返す
// @param status HTTP ステータスコード
// @param detail サーバーから返却された詳細メッセージ
function getErrorMessage(status: number, detail: string): string {
  if (status === 401) {
    return 'API キーが必要です。オプション画面で API キーを設定してください。';
  }
  if (status === 403) {
    return 'API キーが無効です。Webアプリの設定画面で再発行してください。';
  }
  if (status === 405) {
    return '接続先が不正です。Supabase URL を確認してください。';
  }
  // サーバーから返却された JSON エラー内容を含めて、原因特定をしやすくする
  let extra = '';
  if (detail) {
    try {
      const parsed = JSON.parse(detail);
      if (parsed.error) {
        extra = ` — ${parsed.error}`;
      }
    } catch {
      extra = ` — ${detail}`;
    }
  }
  return `ClipDeskへの投稿に失敗しました: ${status}${extra}`;
}

// クリップ作成の一連の処理を実行する
// ページ情報取得 → Edge Function への投稿（要約はサイト側で行う）
async function createClip(): Promise<{ ok: true; payload: ClipPayload } | { ok: false; error: string }> {
  try {
    const settings = await getSettings();
    if (!settings.siteUrl) {
      return { ok: false, error: 'ClipDesk サイト URL が設定されていません。オプション画面から設定してください。' };
    }
    if (!settings.supabaseUrl) {
      return { ok: false, error: 'Supabase URL が設定されていません。オプション画面から設定してください。' };
    }
    if (!settings.apiKey) {
      return { ok: false, error: 'API キーが設定されていません。Webアプリの設定画面で発行してください。' };
    }

    const info = await getActivePageInfo();
    const payload: ClipPayload = {
      url: info.url,
      title: info.title,
      summary: '',
      rawBody: info.body,
    };

    debug(`送信ペイロード: rawBody=${payload.rawBody ? payload.rawBody.length : 0}文字, title=${payload.title.slice(0, 50)}`);

    const endpoint = buildClipEndpoint(settings.supabaseUrl);
    await postToClipDesk(payload, endpoint, settings.apiKey);
    return { ok: true, payload };
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
    debug(`クリップ作成失敗: ${message}`);
    return { ok: false, error: message };
  }
}

// 拡張機能からのメッセージを受け取る
chrome.runtime.onMessage.addListener((request: ExtensionMessage, _sender, sendResponse) => {
  // クリップ作成リクエスト
  if (request.type === 'CREATE_CLIP') {
    createClip().then(sendResponse);
    return true;
  }

  // 現在のページ情報を取得するリクエスト
  if (request.type === 'GET_CURRENT_PAGE') {
    getActivePageInfo()
      .then((info) => sendResponse({ ok: true, info }))
      .catch((err) => {
        const message = err instanceof Error ? err.message : '不明なエラー';
        sendResponse({ ok: false, error: message });
      });
    return true;
  }

  return false;
});

// インストール時の初期化
chrome.runtime.onInstalled.addListener(() => {
  debug('ClipDesk extension installed');
});

// 型をエクスポートして、モジュールとして認識させる
export type { ClipPayload };
