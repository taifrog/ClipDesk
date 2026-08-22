// Obsidian Local REST API への書き出しを中継する ClipDesk ローカルサーバー
// GitHub Pages 等の HTTPS ページから、ブラウザ拡張機能経由で利用されることを想定
// 直接ブラウザから呼ばれる場合、HTTPS ページから HTTP localhost への mixed-content 制約に注意

import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.OBSIDIAN_BRIDGE_PORT || 3002;
const OBSIDIAN_BASE_URL = process.env.OBSIDIAN_BASE_URL || 'http://127.0.0.1:27123';
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'obsidian-bridge.log');

// ログディレクトリがなければ作成する
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// JSON ボディと CORS を有効化
app.use(express.json());
app.use(cors({ origin: '*' }));

// 日時文字列を取得する
function getTimestamp() {
  return new Date().toISOString();
}

// ファイルとコンソールの両方にログを出力する
// @param level ログレベル（INFO / ERROR）
// @param label ログのラベル
// @param data 出力するデータ
function writeLog(level, label, data) {
  const timestamp = getTimestamp();
  const line = `[${timestamp}] [${level}] [ClipDesk Obsidian Bridge] ${label}: ${typeof data === 'string' ? data : JSON.stringify(data)}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (err) {
    console.error(`[${timestamp}] [ERROR] ログファイル書き込み失敗: ${err.message}`);
  }
}

// デバッグ用ログ出力
// @param label ログのラベル
// @param data 出力するデータ
function debugLog(label, data) {
  writeLog('INFO', label, data);
}

// エラーログ出力
// @param label ログのラベル
// @param data 出力するデータ（エラー内容）
function errorLog(label, data) {
  writeLog('ERROR', label, data);
}

// ファイル名に使用できない文字をサニタイズする
// @param name 元のファイル名
// @returns サニタイズ後のファイル名
function sanitizeFileName(name) {
  // Windows / macOS / Linux で問題のある文字を置換
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

// テンプレート文字列に変数を埋め込む
// @param template テンプレート文字列
// @param variables 埋め込む変数のマップ
// @returns レンダリング結果
function renderTemplate(template, variables) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const value = variables[key];
    return value !== undefined && value !== null ? String(value) : '';
  });
}

// Obsidian 書き出し用の変数を作成する
// @param clip クリップ情報
// @param categoryName カテゴリ表示名
// @returns テンプレート変数マップ
function buildTemplateVariables(clip, categoryName) {
  return {
    title: clip.title || '無題',
    url: clip.url || '',
    summary: clip.summary || '',
    comment: clip.comment || '',
    registeredAt: clip.receivedAt || '',
    eventStartDate: clip.eventStartDate || '',
    eventEndDate: clip.eventEndDate || '',
    location: clip.location || '',
    category: categoryName || clip.categoryId || '',
  };
}

// Obsidian Local REST API への HTTP リクエストを実行する
// @param apiKey Obsidian API キー
// @param path URL パス（/vault/...）
// @param method HTTP メソッド
// @param body リクエストボディ
// @returns レスポンスオブジェクト
async function callObsidianApi(apiKey, path, method = 'GET', body) {
  const url = `${OBSIDIAN_BASE_URL}${path}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'text/markdown',
  };
  if (method === 'GET') {
    delete headers['Content-Type'];
  }
  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? body : undefined,
  });
  return response;
}

// 全リクエストの共通ログを出力するミドルウェア
app.use((req, _res, next) => {
  debugLog('リクエスト受信', { method: req.method, path: req.path, origin: req.headers.origin });
  next();
});

// ヘルスチェックエンドポイント
// ローカルサーバーが起動しているかを確認する
app.get('/health', (_req, res) => {
  debugLog('ヘルスチェック', 'ok');
  res.json({ ok: true, service: 'clipdesk-obsidian-bridge' });
});

// Obsidian Local REST API 接続テスト
// 実際に API キーで ping 的なアクセスを行う
app.post('/validate', async (req, res) => {
  const { apiKey } = req.body || {};
  debugLog('接続テスト受信', { hasApiKey: !!apiKey });
  if (!apiKey) {
    errorLog('接続テスト失敗', 'apiKey が必要です');
    return res.status(400).json({ ok: false, error: 'apiKey が必要です' });
  }
  try {
    // 空のフォルダパスで接続テスト（存在しない場合は 404 だが認証は検証できる）
    const response = await callObsidianApi(apiKey, '/vault/', 'GET');
    debugLog('接続テスト Obsidian 応答', { status: response.status });
    if (response.status === 401 || response.status === 403) {
      errorLog('接続テスト失敗', 'Obsidian API キーが無効です');
      return res.status(401).json({ ok: false, error: 'Obsidian API キーが無効です' });
    }
    // 200 または 404 なら接続自体は成功
    const ok = response.status === 200 || response.status === 404;
    if (!ok) {
      errorLog('接続テスト失敗', `Obsidian Local REST API が予期しない応答を返しました: ${response.status}`);
    }
    return res.status(ok ? 200 : 502).json({
      ok,
      status: response.status,
      error: ok ? undefined : `Obsidian Local REST API が予期しない応答を返しました: ${response.status}`,
    });
  } catch (err) {
    errorLog('Obsidian 接続テスト失敗', err.message);
    return res.status(502).json({ ok: false, error: `Obsidian Local REST API に接続できません: ${err.message}` });
  }
});

// クリップを Obsidian に書き出す
app.post('/export', async (req, res) => {
  const { clip, settings, categoryName } = req.body || {};
  debugLog('書き出しリクエスト受信', { hasClip: !!clip, hasSettings: !!settings, categoryName });
  if (!clip || !settings) {
    errorLog('書き出し失敗', 'clip と settings は必須です');
    return res.status(400).json({ ok: false, error: 'clip と settings は必須です' });
  }
  if (!settings.apiKey) {
    errorLog('書き出し失敗', 'Obsidian API キーが設定されていません');
    return res.status(400).json({ ok: false, error: 'Obsidian API キーが設定されていません' });
  }

  const variables = buildTemplateVariables(clip, categoryName);
  const fileName = sanitizeFileName(renderTemplate(settings.filenameTemplate, variables)) || 'clip';
  const noteBody = renderTemplate(settings.noteTemplate, variables);
  const folderPath = (settings.folder || 'ClipDesk').replace(/\/$/, '');
  const fullPath = `${folderPath}/${fileName}.md`;

  debugLog('書き出し先', fullPath);

  try {
    // Obsidian Local REST API は /vault/{path} に PUT でファイル作成/更新を行う
    const response = await callObsidianApi(
      settings.apiKey,
      `/vault/${encodeURIComponent(fullPath)}`,
      'PUT',
      noteBody,
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      errorLog('Obsidian 書き出し失敗', { status: response.status, text });
      return res.status(502).json({
        ok: false,
        error: `Obsidian への書き出しに失敗しました: ${response.status} ${text}`,
      });
    }

    debugLog('Obsidian 書き出し成功', fullPath);
    return res.json({ ok: true, path: fullPath });
  } catch (err) {
    errorLog('Obsidian 書き出し例外', err.message);
    return res.status(502).json({ ok: false, error: `Obsidian への書き出し中にエラーが発生しました: ${err.message}` });
  }
});

// 予期しないエラーをキャッチしてログに残す
app.use((err, _req, _res, next) => {
  errorLog('サーバー未処理エラー', err.stack || err.message || String(err));
  next(err);
});

app.listen(PORT, () => {
  debugLog('起動', `http://127.0.0.1:${PORT}`);
  debugLog('ターゲット Obsidian', OBSIDIAN_BASE_URL);
});
