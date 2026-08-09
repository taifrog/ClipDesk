// Service Worker（background script）
// タブ情報の取得、AI要約、ClipDeskへの投稿を制御する

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

// 本文を指定文字数に制限する
function truncateBody(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars) + '\n…（以下省略）';
}

// OpenCode Go でページ本文を要約する
async function summarizePage(info: PageInfo, settings: ExtensionSettings): Promise<string> {
  const bodyText = truncateBody(info.body, 4000);
  const prompt = `以下のWebページを「${settings.language === 'ja' ? '日本語' : settings.language}」で簡潔に要約してください。\n\nタイトル: ${info.title}\nURL: ${info.url}\n\n本文:\n${bodyText}`;

  const response = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: 'あなたはWebページの内容を要約するアシスタントです。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 500,
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`AI APIの呼び出しに失敗しました: ${response.status} ${text}`);
  }

  const data = await response.json();
  if (!data.choices || data.choices.length === 0) {
    throw new Error('AIからの応答が空です');
  }

  return data.choices[0].message.content as string;
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
// ページ情報取得 → AI要約 → ローカルサイトへの投稿
async function createClip(): Promise<{ ok: true; payload: ClipPayload } | { ok: false; error: string }> {
  try {
    const settings = await getSettings();
    if (!settings.apiKey) {
      return { ok: false, error: 'APIキーが設定されていません。オプション画面から設定してください。' };
    }
    if (!settings.localSiteUrl) {
      return { ok: false, error: '投稿先URLが設定されていません。オプション画面から設定してください。' };
    }

    const info = await getActivePageInfo();
    const summary = await summarizePage(info, settings);
    const payload: ClipPayload = {
      url: info.url,
      title: info.title,
      summary,
      rawBody: info.body,
    };

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
