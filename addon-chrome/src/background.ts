// Service Worker（background script）
// タブ情報の取得、ClipDeskへの投稿を制御する

import type { ClipPayload, ExtensionMessage, ExtensionSettings, PageInfo } from './types';
import { loadSettings } from './storage';

// デバッグ用ログ出力
function debug(msg: string): void {
  console.log('[ClipDesk BG]', msg);
}

// 設定を取得する
async function getSettings(): Promise<ExtensionSettings> {
  return await loadSettings();
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

// ClipDesk ローカルサイトにクリップを投稿する
async function postToClipDesk(payload: ClipPayload, localSiteUrl: string): Promise<void> {
  const response = await fetch(localSiteUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`ClipDeskへの投稿に失敗しました: ${response.status} ${text}`);
  }
}

// クリップ作成の一連の処理を実行する
// ページ情報取得 → ローカルサイトへの投稿（要約はサイト側で行う）
async function createClip(): Promise<{ ok: true; payload: ClipPayload } | { ok: false; error: string }> {
  try {
    const settings = await getSettings();
    if (!settings.localSiteUrl) {
      return { ok: false, error: '投稿先URLが設定されていません。オプション画面から設定してください。' };
    }

    const info = await getActivePageInfo();
    const payload: ClipPayload = {
      url: info.url,
      title: info.title,
      summary: '',
      rawBody: info.body,
    };

    debug(`送信ペイロード: rawBody=${payload.rawBody ? payload.rawBody.length : 0}文字, title=${payload.title.slice(0, 50)}`);

    await postToClipDesk(payload, settings.localSiteUrl);
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
