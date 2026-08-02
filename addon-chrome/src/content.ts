// コンテンツスクリプト
// 表示中のページのタイトル、URL、本文を抽出し、拡張機能からのリクエストに応答する

import type { ExtensionMessage, PageInfo } from './types';

// ページから本文のテキストを取得する
// 不要な空白を取り除き、可読性のあるテキストに整形する
function extractBodyText(): string {
  const body = document.body;
  if (!body) {
    return '';
  }

  // 不要な要素を除外して本文を取得する
  const clone = body.cloneNode(true) as HTMLElement;
  const removeSelectors = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe'];
  for (const selector of removeSelectors) {
    const elements = clone.querySelectorAll(selector);
    elements.forEach((el) => el.remove());
  }

  const text = clone.innerText || clone.textContent || '';
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// ページ情報をまとめて取得する
function getPageInfo(): PageInfo {
  return {
    url: location.href,
    title: document.title || '',
    body: extractBodyText(),
  };
}

// ランタイムメッセージを受け取って、ページ情報を返す
chrome.runtime.onMessage.addListener((request: ExtensionMessage, _sender, sendResponse) => {
  // ページ情報をリクエストされた場合のみ処理する
  if (request.type === 'GET_PAGE_INFO') {
    const info = getPageInfo();
    sendResponse({ ok: true, info });
    // 非同期応答を示すため true を返す（必要に応じて）
    return true;
  }

  // 不明なメッセージは無視する
  return false;
});
