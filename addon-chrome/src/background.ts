// Service Worker（background script）
// タブ情報の取得、ClipDeskへの投稿を制御する

import type { Category, ClipPayload, ExtensionMessage, ExtensionSettings, ObsidianExportRequest, ObsidianExportResult, PageInfo } from './types';
import { loadSettings } from './storage';

// ClipDesk Obsidian Bridge ローカルサーバーのベース URL
const OBSIDIAN_BRIDGE_BASE_URL = 'http://127.0.0.1:3002';

// Service Worker 内で保持するログエントリ
const logEntries: string[] = [];
const MAX_LOG_ENTRIES = 200;

// デバッグ用ログ出力
// コンソールとメモリ上のログバッファの両方に出力する
// @param msg 出力するメッセージ
function debug(msg: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [ClipDesk BG] ${msg}`;
  console.log(line);
  logEntries.push(line);
  if (logEntries.length > MAX_LOG_ENTRIES) {
    logEntries.shift();
  }
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

// Supabase URL と categories Edge Function のエンドポイントを組み立てる
// @param supabaseUrl Supabase プロジェクトの URL
// @returns categories Edge Function の完全な URL
function buildCategoriesEndpoint(supabaseUrl: string): string {
  const base = supabaseUrl.replace(/\/$/, '');
  return `${base}/functions/v1/categories`;
}

// content script が注入可能なスキームか判定する
function isInjectableUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /^(https?|file|ftp):/i.test(url);
}

// content script が応答しない原因が「受信側が存在しない」ことか判定する
function isReceivingEndMissingError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('Receiving end does not exist');
}

// 対象タブに content script を動的に注入する
// @param tabId 注入先タブID
async function injectContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
    debug(`content script をタブ ${tabId} に動的注入しました`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    debug(`content script の動的注入に失敗: ${message}`);
    throw err;
  }
}

// content script にページ情報を問い合わせる
// @param tabId 問い合わせ先タブID
async function queryPageInfo(tabId: number): Promise<PageInfo> {
  const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_INFO' });
  if (!response || !response.ok) {
    throw new Error('ページ情報の取得に失敗しました');
  }
  return response.info as PageInfo;
}

// アクティブなタブの情報を取得する
// コンテンツスクリプトにメッセージを送り、タイトル・URL・本文を取得する
// content script が注入されていない場合は動的に注入してリトライする
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
    return await queryPageInfo(tab.id);
  } catch (err) {
    if (!isReceivingEndMissingError(err)) {
      throw err;
    }
    // content script が未注入の可能性があるため、動的に注入してリトライする
    await injectContentScript(tab.id);
    return await queryPageInfo(tab.id);
  }
}

// ClipDesk（Supabase Edge Functions）にクリップを投稿する
// @param payload 送信するクリップ情報
// @param siteUrl 投稿先 URL
// @param apiKey x-api-key ヘッダーに付与する API キー
// @returns サーバーから返却された診断情報（diagnostics）など
async function postToClipDesk(payload: ClipPayload, siteUrl: string, apiKey: string): Promise<Record<string, unknown>> {
  const response = await fetch(siteUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  const responseData = await response.json().catch(() => ({})) as Record<string, unknown>;

  if (!response.ok) {
    const text = responseData.error ? String(responseData.error) : await response.text().catch(() => '');
    throw new Error(getErrorMessage(response.status, text));
  }

  return responseData;
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
// @param categoryId 紐づけるカテゴリID（省略可）
// @param comment ユーザーが入力したコメント（省略可）
async function createClip(
  categoryId?: string,
  comment?: string,
): Promise<{ ok: true; payload: ClipPayload; diagnostics?: Record<string, unknown> } | { ok: false; error: string }> {
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
      categoryId,
      comment,
    };

    debug(`送信ペイロード: rawBody=${payload.rawBody ? payload.rawBody.length : 0}文字, title=${payload.title.slice(0, 50)}, categoryId=${payload.categoryId || 'others'}, comment=${payload.comment ? 'あり' : 'なし'}`);

    const endpoint = buildClipEndpoint(settings.supabaseUrl);
    const responseData = await postToClipDesk(payload, endpoint, settings.apiKey);
    debug(`clip 応答: ok=${responseData.ok}, duplicate=${responseData.duplicate}, aiSummaryError=${responseData.aiSummaryError}`);
    if (responseData.diagnostics) {
      const diag = responseData.diagnostics as Record<string, unknown>;
      debug(`診断情報: aiEnabled=${diag.aiEnabled}, hasApiKey=${diag.hasApiKey}, model=${diag.model}`);
      debug(`入力長: rawBody=${diag.originalRawBodyLength}, text=${diag.originalTextLength}, aiInput=${diag.aiInputTextLength}, fetched=${diag.fetchedPageTextLength}`);
      debug(`AI結果: attempted=${diag.aiAttempted}, skipped=${diag.aiSkippedReason}, summary=${diag.aiResultSummaryLength}, start=${diag.aiResultEventStartDate}, end=${diag.aiResultEventEndDate}, loc=${diag.aiResultLocation}, err=${diag.aiSummaryError}`);
    }
    return { ok: true, payload, diagnostics: responseData.diagnostics as Record<string, unknown> | undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
    debug(`クリップ作成失敗: ${message}`);
    return { ok: false, error: message };
  }
}

// カテゴリ一覧を取得する
// @returns カテゴリ配列、またはエラー情報
async function getCategories(): Promise<{ ok: true; categories: Category[] } | { ok: false; error: string }> {
  try {
    const settings = await getSettings();
    if (!settings.supabaseUrl) {
      return { ok: false, error: 'Supabase URL が設定されていません。オプション画面から設定してください。' };
    }
    if (!settings.apiKey) {
      return { ok: false, error: 'API キーが設定されていません。Webアプリの設定画面で発行してください。' };
    }

    debug(`カテゴリ一覧取得: endpoint=${buildCategoriesEndpoint(settings.supabaseUrl)}, apiKey=${settings.apiKey.slice(0, 4)}...`);

    const endpoint = buildCategoriesEndpoint(settings.supabaseUrl);
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'x-api-key': settings.apiKey,
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(getErrorMessage(response.status, text));
    }

    const json = (await response.json()) as { categories?: Category[] };
    debug(`カテゴリ一覧取得成功: ${json.categories?.length || 0} 件`);
    return { ok: true, categories: json.categories || [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
    debug(`カテゴリ取得失敗: ${message}`);
    return { ok: false, error: message };
  }
}

// Obsidian Bridge ローカルサーバーの生存確認
// @returns サーバーが応答すれば true
async function checkObsidianBridgeHealth(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(`${OBSIDIAN_BRIDGE_BASE_URL}/health`, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`ステータス ${response.status}`);
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    debug(`Obsidian Bridge ヘルスチェック失敗: ${message}`);
    return { ok: false, error: `ローカルサーバーに接続できません。server/obsidian-bridge.mjs を起動してください: ${message}` };
  }
}

// Obsidian Bridge ローカルサーバーを経由して Obsidian Local REST API の接続テストを行う
// @param apiKey Obsidian API キー
// @returns 接続結果
async function validateObsidianConnection(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const health = await checkObsidianBridgeHealth();
  if (!health.ok) return health;

  try {
    const response = await fetch(`${OBSIDIAN_BRIDGE_BASE_URL}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    const json = (await response.json()) as { ok: boolean; error?: string };
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `ステータス ${response.status}`);
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    debug(`Obsidian 接続テスト失敗: ${message}`);
    return { ok: false, error: message };
  }
}

// Obsidian Bridge ローカルサーバーを経由してクリップを Obsidian に書き出す
// @param request 書き出しリクエスト
// @returns 書き出し結果
async function exportToObsidian(request: ObsidianExportRequest): Promise<ObsidianExportResult> {
  debug(`Obsidian 書き出し開始: title=${request.clip.title?.slice(0, 40)}, folder=${request.settings.folder}`);
  const health = await checkObsidianBridgeHealth();
  if (!health.ok) {
    debug(`Obsidian 書き出し中止: ${health.error}`);
    return { ok: false, error: health.error };
  }

  try {
    debug(`Obsidian Bridge へリクエスト送信: ${OBSIDIAN_BRIDGE_BASE_URL}/export`);
    const response = await fetch(`${OBSIDIAN_BRIDGE_BASE_URL}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const json = (await response.json()) as { ok: boolean; path?: string; error?: string };
    debug(`Obsidian Bridge 応答: status=${response.status}, ok=${json.ok}, path=${json.path || 'none'}`);
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `ステータス ${response.status}`);
    }
    debug(`Obsidian 書き出し成功: ${json.path}`);
    return { ok: true, path: json.path };
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    debug(`Obsidian 書き出し失敗: ${message}`);
    return { ok: false, error: message };
  }
}

// 新規カテゴリを作成する
// @param id カテゴリID
// @param name カテゴリ表示名
// @returns 作成されたカテゴリ、またはエラー情報
async function createCategory(
  id: string,
  name: string,
): Promise<{ ok: true; category: Category } | { ok: false; error: string }> {
  try {
    const settings = await getSettings();
    if (!settings.supabaseUrl) {
      return { ok: false, error: 'Supabase URL が設定されていません。オプション画面から設定してください。' };
    }
    if (!settings.apiKey) {
      return { ok: false, error: 'API キーが設定されていません。Webアプリの設定画面で発行してください。' };
    }

    debug(`カテゴリ作成: endpoint=${buildCategoriesEndpoint(settings.supabaseUrl)}, apiKey=${settings.apiKey.slice(0, 4)}..., id=${id}, name=${name}`);

    const endpoint = buildCategoriesEndpoint(settings.supabaseUrl);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
      },
      body: JSON.stringify({ id, name, icon: 'grid' }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(getErrorMessage(response.status, text));
    }

    const json = (await response.json()) as { category?: Category };
    if (!json.category) {
      throw new Error('カテゴリ作成の応答が不正です');
    }
    return { ok: true, category: json.category };
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました';
    debug(`カテゴリ作成失敗: ${message}`);
    return { ok: false, error: message };
  }
}

// Web アプリから拡張機能に対してクリップを Obsidian に書き出すよう依頼する
// @param payload 書き出し対象クリップ、カテゴリ名、Obsidian 設定
async function handleExportToObsidian(payload: { clip: ObsidianExportRequest['clip']; categoryName?: string; settings: ObsidianExportRequest['settings'] }): Promise<ObsidianExportResult> {
  const request: ObsidianExportRequest = {
    clip: payload.clip,
    categoryName: payload.categoryName,
    settings: payload.settings,
  };
  return exportToObsidian(request);
}

// 拡張機能からのメッセージを受け取る
chrome.runtime.onMessage.addListener((request: ExtensionMessage, _sender, sendResponse) => {
  // クリップ作成リクエスト
  if (request.type === 'CREATE_CLIP') {
    const payload = (request.payload as { categoryId?: string; comment?: string }) || {};
    createClip(payload.categoryId, payload.comment).then(sendResponse);
    return true;
  }

  // カテゴリ一覧取得リクエスト
  if (request.type === 'GET_CATEGORIES') {
    getCategories().then(sendResponse);
    return true;
  }

  // 新規カテゴリ作成リクエスト
  if (request.type === 'CREATE_CATEGORY') {
    const payload = (request.payload as { id?: string; name?: string }) || {};
    if (!payload.id || !payload.name) {
      sendResponse({ ok: false, error: 'id と name は必須です' });
      return true;
    }
    createCategory(payload.id, payload.name).then(sendResponse);
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

  // Obsidian Local REST API 接続テストリクエスト
  if (request.type === 'VALIDATE_OBSIDIAN') {
    const payload = (request.payload as { apiKey?: string }) || {};
    if (!payload.apiKey) {
      sendResponse({ ok: false, error: 'apiKey が必要です' });
      return true;
    }
    validateObsidianConnection(payload.apiKey).then(sendResponse);
    return true;
  }

  // Obsidian 書き出しリクエスト
  if (request.type === 'EXPORT_TO_OBSIDIAN') {
    const payload = (request.payload as { clip: ObsidianExportRequest['clip']; categoryName?: string; settings: ObsidianExportRequest['settings'] }) || {};
    handleExportToObsidian(payload).then(sendResponse);
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
