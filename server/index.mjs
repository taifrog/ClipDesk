// ClipDesk APIサーバー
// SQLiteファイルでクリップとカテゴリを永続化する

import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const DB_PATH = path.join(__dirname, '..', 'clipdesk.db');

// SQLiteデータベースを開く（ファイルがなければ自動作成）
const db = new Database(DB_PATH);

// パフォーマンスと安全性の設定
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// テーブルがなければ作成する
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'grid',
    sortOrder INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS clips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    rawBody TEXT NOT NULL DEFAULT '',
    categoryId TEXT NOT NULL DEFAULT 'others',
    isPinned INTEGER NOT NULL DEFAULT 0,
    isChecked INTEGER NOT NULL DEFAULT 0,
    checkedAt TEXT,
    comment TEXT NOT NULL DEFAULT '',
    receivedAt TEXT NOT NULL,
    deletedAt TEXT,
    FOREIGN KEY (categoryId) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS source_sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag TEXT NOT NULL,
    siteUrl TEXT NOT NULL,
    rssUrl TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// 既存のclipsテーブルに deletedAt カラムがなければ追加する
function debugLog(label, data) {
  console.log(`[ClipDesk API] ${label}:`, data);
}

try {
  db.exec(`ALTER TABLE clips ADD COLUMN deletedAt TEXT`);
  debugLog('マイグレーション', 'clips.deletedAt カラムを追加しました');
} catch (err) {
  if (!err.message.includes('duplicate column name')) {
    console.error('マイグレーション失敗:', err);
  }
}

try {
  db.exec(`ALTER TABLE clips ADD COLUMN isChecked INTEGER NOT NULL DEFAULT 0`);
  debugLog('マイグレーション', 'clips.isChecked カラムを追加しました');
} catch (err) {
  if (!err.message.includes('duplicate column name')) {
    console.error('マイグレーション失敗:', err);
  }
}

try {
  db.exec(`ALTER TABLE clips ADD COLUMN checkedAt TEXT`);
  debugLog('マイグレーション', 'clips.checkedAt カラムを追加しました');
} catch (err) {
  if (!err.message.includes('duplicate column name')) {
    console.error('マイグレーション失敗:', err);
  }
}

// 初期カテゴリ
debugLog('初期カテゴリ', 'カテゴリテーブルを初期化します');
const defaultCategories = [
  { id: 'all', name: 'すべてのクリップ', icon: 'inbox', sortOrder: 0 },
  { id: 'design', name: 'デザイン', icon: 'palette', sortOrder: 1 },
  { id: 'technology', name: 'テクノロジー', icon: 'cpu', sortOrder: 2 },
  { id: 'marketing', name: 'マーケティング', icon: 'trending-up', sortOrder: 3 },
  { id: 'business', name: 'ビジネス', icon: 'briefcase', sortOrder: 4 },
  { id: 'lifestyle', name: 'ライフスタイル', icon: 'coffee', sortOrder: 5 },
  { id: 'education', name: '教育', icon: 'book-open', sortOrder: 6 },
  { id: 'news', name: 'ニュース', icon: 'globe', sortOrder: 7 },
  { id: 'others', name: 'その他', icon: 'grid', sortOrder: 99 },
];

const upsertCategoryStmt = db.prepare(`
  INSERT INTO categories (id, name, icon, sortOrder)
  VALUES (@id, @name, @icon, @sortOrder)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    icon = excluded.icon,
    sortOrder = excluded.sortOrder
`);
for (const category of defaultCategories) {
  upsertCategoryStmt.run(category);
}

// サイト設定を取得する（存在しない場合はデフォルト値を返す）
function getAppSettings() {
  const keys = ['aiSummaryEnabled', 'aiSummaryApiKey', 'aiSummaryModel', 'aiSummaryLanguage'];
  const defaults = {
    aiSummaryEnabled: 'true',
    aiSummaryApiKey: '',
    aiSummaryModel: 'gpt-4o-mini',
    aiSummaryLanguage: 'ja',
  };

  // 利用できなくなったモデル名が保存されている場合はデフォルトに戻す
  const supportedModels = new Set([
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-3.5-turbo',
    'claude-3-haiku',
    'claude-3-sonnet',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ]);
  const settings = { ...defaults };
  const selectStmt = db.prepare(`SELECT key, value FROM app_settings WHERE key IN (${keys.map(() => '?').join(',')})`);
  const rows = selectStmt.all(...keys);
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  // 保存されているモデル名がサポート対象外の場合はデフォルトに戻す
  const model = supportedModels.has(settings.aiSummaryModel) ? settings.aiSummaryModel : defaults.aiSummaryModel;
  if (model !== settings.aiSummaryModel) {
    debugLog('未対応モデル検出', `${settings.aiSummaryModel} -> ${model}`);
  }

  return {
    enabled: settings.aiSummaryEnabled === 'true',
    apiKey: settings.aiSummaryApiKey,
    model,
    language: settings.aiSummaryLanguage,
  };
}

// サイト設定を保存する
function saveAppSettings(settings) {
  const allowedKeys = new Set(['aiSummaryEnabled', 'aiSummaryApiKey', 'aiSummaryModel', 'aiSummaryLanguage']);
  const insertStmt = db.prepare(`INSERT INTO app_settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  for (const [key, value] of Object.entries(settings)) {
    if (!allowedKeys.has(key)) continue;
    insertStmt.run({ key, value: String(value) });
  }
}

// テキストを指定文字数に制限する
function truncateText(text, maxChars) {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n…（以下省略）';
}

// OpenCode Go でテキストを要約する
// @param text 要約対象の本文
// @param title Webページのタイトル
// @param settings AI要約設定（enabled, apiKey, model, language）
// @returns 要約文字列
async function summarizeWithOpenCodeGo(text, title, settings) {
  if (!settings.apiKey) {
    throw new Error('OpenCode Go APIキーが設定されていません');
  }
  const bodyText = truncateText(text, 4000);
  const prompt = `以下のWebページを「${settings.language === 'ja' ? '日本語' : settings.language}」で簡潔に要約してください。\n\nタイトル: ${title}\n\n本文:\n${bodyText}`;

  debugLog('AI要約APIリクエスト', {
    model: settings.model,
    language: settings.language,
    bodyLength: bodyText.length,
    title: title.slice(0, 100),
  });

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
    const errorText = await response.text().catch(() => '');
    debugLog('AI要約APIエラー', `${response.status} ${errorText.slice(0, 200)}`);
    throw new Error(`AI APIの呼び出しに失敗しました: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  if (!data.choices || data.choices.length === 0) {
    debugLog('AI要約API空応答', JSON.stringify(data).slice(0, 200));
    throw new Error('AIからの応答が空です');
  }
  const summary = String(data.choices[0].message.content || '').trim();
  debugLog('AI要約API成功', `要約長: ${summary.length}文字`);
  return summary;
}

// URLからHTML/XMLテキストを取得する
function fetchText(targetUrl, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('リダイレクト回数が上限に達しました'));
      return;
    }
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(
      targetUrl,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 15000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, targetUrl).toString();
          fetchText(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => { resolve(data); });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('タイムアウト')); });
  });
}

// RSSフィードURLを検出する
async function detectRssUrl(siteUrl) {
  let html = '';
  try {
    html = await fetchText(siteUrl);
  } catch (err) {
    debugLog('HTML取得失敗（RSS検出）', err.message);
    return null;
  }
  const $ = cheerio.load(html);
  const candidates = [];
  $('link[rel="alternate"]').each((_, el) => {
    const type = $(el).attr('type') || '';
    const href = $(el).attr('href') || '';
    if (type.includes('rss') || type.includes('atom') || href.includes('feed') || href.includes('rss')) {
      candidates.push(new URL(href, siteUrl).toString());
    }
  });
  const commonPaths = ['/feed', '/feed.xml', '/rss', '/rss.xml', '/index.xml', '/atom.xml', '/feeds/posts/default'];
  for (const path of commonPaths) {
    candidates.push(new URL(path, siteUrl).toString());
  }
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const text = await fetchText(candidate);
      if (text.trim().startsWith('<?xml') || text.trim().startsWith('<rss') || text.trim().startsWith('<feed')) {
        return candidate;
      }
    } catch (err) {
      // 無視
    }
  }
  return null;
}

// RSS/Atom解析
function parseRss(xmlText, siteUrl) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });
  const parsed = parser.parse(xmlText);
  const items = [];
  let entries = [];
  if (parsed.rss && parsed.rss.channel && parsed.rss.channel.item) {
    entries = Array.isArray(parsed.rss.channel.item) ? parsed.rss.channel.item : [parsed.rss.channel.item];
  } else if (parsed.feed && parsed.feed.entry) {
    entries = Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry];
  }
  for (const entry of entries) {
    const title = (entry.title && (entry.title['#text'] || entry.title)) || 'タイトルなし';
    let link = '';
    if (entry.link) {
      if (typeof entry.link === 'string') link = entry.link;
      else if (Array.isArray(entry.link)) {
        const alternate = entry.link.find((l) => l['@_rel'] === 'alternate');
        link = alternate ? alternate['@_href'] : entry.link[0]['@_href'] || entry.link[0];
      } else if (entry.link['@_href']) link = entry.link['@_href'];
      else if (entry.link['#text']) link = entry.link['#text'];
    }
    if (!link && entry.guid) link = typeof entry.guid === 'string' ? entry.guid : entry.guid['#text'];
    let summary = '';
    if (entry.description) summary = entry.description['#text'] || entry.description;
    else if (entry.summary) summary = entry.summary['#text'] || entry.summary;
    else if (entry.content) summary = entry.content['#text'] || entry.content;
    summary = summary.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (summary.length > 300) summary = summary.slice(0, 300) + '…';
    if (link) items.push({ title: String(title).trim(), url: new URL(String(link), siteUrl).toString(), summary });
  }
  return items;
}

// HTMLスクレイピング
function scrapeArticles(html, siteUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();
  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') || '';
    const title = $el.text().trim();
    if (!href || !title || title.length < 5) return;
    try {
      const url = new URL(href, siteUrl).toString();
      if (seen.has(url)) return;
      seen.add(url);
      const parsed = new URL(url);
      const hostMatch = parsed.hostname === new URL(siteUrl).hostname;
      const isArticleLike = /\/(\d{4}[\/\-]\d{2}|\d{4}\/\d{2}\/\d{2}|\d{4}-\d{2}-\d{2}|articles?|posts?|news|entry|p=|post_id=)/i.test(parsed.pathname);
      if (hostMatch && isArticleLike) items.push({ title, url, summary: '' });
    } catch (err) {
      // 無視
    }
  });
  return items;
}

// 指定サイトから記事を収集する
async function collectArticlesFromSite(siteUrl, rssUrl) {
  let articles = [];
  if (rssUrl) {
    try {
      const xmlText = await fetchText(rssUrl);
      articles = parseRss(xmlText, siteUrl);
      debugLog('RSSから記事取得', `${siteUrl} => ${articles.length}件`);
    } catch (err) {
      debugLog('RSS取得失敗、スクレイピングへフォールバック', err.message);
    }
  }
  if (articles.length === 0) {
    try {
      const html = await fetchText(siteUrl);
      articles = scrapeArticles(html, siteUrl);
      debugLog('スクレイピングから記事取得', `${siteUrl} => ${articles.length}件`);
    } catch (err) {
      debugLog('スクレイピング失敗', err.message);
    }
  }
  return articles;
}

app.use(cors());
app.use(express.json());

// クリップを受け取るエンドポイント
// アドオンからは要約なしで送信され、サイト側の設定に応じて AI 要約を実行する
app.post('/api/clip', async (req, res) => {
  const body = req.body || {};
  const { url, title, summary, rawBody } = body;
  if (!url || !title) {
    return res.status(400).json({ error: 'url と title は必須です', receivedBody: body });
  }

  // 送信された summary が空で、rawBody があればサイト側で AI 要約を行う
  let finalSummary = summary || '';
  let aiSummaryError = null;
  const aiSettings = getAppSettings();

  debugLog('クリップ受信判定', {
    url,
    hasSummary: Boolean(finalSummary),
    summaryLength: finalSummary.length,
    hasRawBody: Boolean(rawBody),
    rawBodyLength: rawBody ? rawBody.length : 0,
    aiEnabled: aiSettings.enabled,
    hasApiKey: Boolean(aiSettings.apiKey),
    model: aiSettings.model,
    language: aiSettings.language,
  });

  if (!finalSummary && rawBody && aiSettings.enabled && aiSettings.apiKey) {
    try {
      const aiSummary = await summarizeWithOpenCodeGo(rawBody, title, aiSettings);
      if (aiSummary) finalSummary = aiSummary;
    } catch (err) {
      aiSummaryError = err.message || '不明なエラー';
      debugLog('AI要約失敗（クリップ受信）', `${url}: ${aiSummaryError}`);
      // 要約に失敗してもクリップ登録は続行する
    }
  } else {
    debugLog('AI要約スキップ', {
      reason: finalSummary ? 'summaryあり' : !rawBody ? 'rawBodyなし' : !aiSettings.enabled ? 'AI要約無効' : 'APIキー未設定',
    });
  }

  const clip = {
    url,
    title,
    summary: finalSummary,
    rawBody: rawBody || '',
    categoryId: 'others',
    isPinned: 0,
    isChecked: 0,
    comment: '',
    receivedAt: new Date().toISOString(),
  };
  const insertStmt = db.prepare(`
    INSERT INTO clips (url, title, summary, rawBody, categoryId, isPinned, isChecked, comment, receivedAt)
    VALUES (@url, @title, @summary, @rawBody, @categoryId, @isPinned, @isChecked, @comment, @receivedAt)
  `);
  const result = insertStmt.run(clip);
  debugLog('クリップ登録', { title, summaryLength: finalSummary.length });
  res.status(201).json({ ok: true, clip: { id: result.lastInsertRowid, ...clip }, aiSummaryError });
});

// クリップ一覧
app.get('/api/clip', (_req, res) => {
  const selectStmt = db.prepare(`
    SELECT id, url, title, summary, rawBody, categoryId, isPinned, isChecked, checkedAt, comment, receivedAt, deletedAt
    FROM clips WHERE deletedAt IS NULL ORDER BY isPinned DESC, receivedAt DESC
  `);
  const rows = selectStmt.all();
  const clips = rows.map((row) => ({
    ...row,
    isPinned: row.isPinned === 1,
    isChecked: row.isChecked === 1,
  }));
  res.json({ clips });
});

// ゴミ箱一覧
app.get('/api/clip/trash', (_req, res) => {
  const selectStmt = db.prepare(`
    SELECT id, url, title, summary, rawBody, categoryId, isPinned, isChecked, checkedAt, comment, receivedAt, deletedAt
    FROM clips WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC
  `);
  const rows = selectStmt.all();
  const clips = rows.map((row) => ({
    ...row,
    isPinned: row.isPinned === 1,
    isChecked: row.isChecked === 1,
  }));
  res.json({ clips });
});

// ゴミ箱へ移動
app.patch('/api/clip/:id/trash', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id が不正です' });
  const updateStmt = db.prepare(`UPDATE clips SET deletedAt = @deletedAt WHERE id = @id AND deletedAt IS NULL`);
  const result = updateStmt.run({ id, deletedAt: new Date().toISOString() });
  if (result.changes === 0) return res.status(404).json({ error: 'クリップが見つかりません' });
  debugLog('クリップをゴミ箱へ移動', id);
  res.json({ ok: true, id });
});

// ゴミ箱から復元
app.patch('/api/clip/:id/restore', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id が不正です' });
  const updateStmt = db.prepare(`UPDATE clips SET deletedAt = NULL WHERE id = @id AND deletedAt IS NOT NULL`);
  const result = updateStmt.run({ id });
  if (result.changes === 0) return res.status(404).json({ error: 'クリップが見つかりません' });
  debugLog('クリップを復元', id);
  res.json({ ok: true, id });
});

// クリップ更新
app.patch('/api/clip/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id が不正です' });
  const updates = req.body || {};
  const allowedFields = ['categoryId', 'isPinned', 'isChecked', 'comment'];
  const fields = [];
  const values = {};
  for (const key of allowedFields) {
    if (key in updates) {
      if (key === 'isChecked') {
        const isChecked = Boolean(updates[key]);
        fields.push('isChecked = @isChecked', 'checkedAt = @checkedAt');
        values.isChecked = isChecked ? 1 : 0;
        values.checkedAt = isChecked ? new Date().toISOString() : null;
      } else if (key === 'isPinned') {
        fields.push(`${key} = @${key}`);
        values[key] = updates[key] ? 1 : 0;
      } else {
        fields.push(`${key} = @${key}`);
        values[key] = updates[key];
      }
    }
  }
  if (fields.length === 0) return res.status(400).json({ error: '更新する項目がありません' });
  values.id = id;
  const updateStmt = db.prepare(`UPDATE clips SET ${fields.join(', ')} WHERE id = @id`);
  const result = updateStmt.run(values);
  if (result.changes === 0) return res.status(404).json({ error: 'クリップが見つかりません' });
  const selectStmt = db.prepare(`SELECT id, url, title, summary, rawBody, categoryId, isPinned, isChecked, checkedAt, comment, receivedAt FROM clips WHERE id = @id`);
  const row = selectStmt.get({ id });
  res.json({ ok: true, clip: { ...row, isPinned: row.isPinned === 1, isChecked: row.isChecked === 1 } });
});

// クリップを削除するエンドポイント
app.delete('/api/clip/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id が不正です' });
  const deleteStmt = db.prepare('DELETE FROM clips WHERE id = @id');
  const result = deleteStmt.run({ id });
  if (result.changes === 0) return res.status(404).json({ error: 'クリップが見つかりません' });
  debugLog('クリップ削除', id);
  res.json({ ok: true, id });
});

// カテゴリ一覧
app.get('/api/category', (_req, res) => {
  const selectStmt = db.prepare(`SELECT id, name, icon, sortOrder FROM categories ORDER BY sortOrder ASC, id ASC`);
  res.json({ categories: selectStmt.all() });
});

// カテゴリ追加
app.post('/api/category', (req, res) => {
  const body = req.body || {};
  const { id, name, icon } = body;
  if (!id || !name) return res.status(400).json({ error: 'id と name は必須です' });
  const category = { id, name, icon: icon || 'grid', sortOrder: 10 };
  try {
    const insertStmt = db.prepare(`INSERT INTO categories (id, name, icon, sortOrder) VALUES (@id, @name, @icon, @sortOrder)`);
    insertStmt.run(category);
    debugLog('カテゴリ追加', name);
    res.status(201).json({ ok: true, category });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: '同じ id のカテゴリが既に存在します' });
    }
    throw err;
  }
});

// カテゴリ更新
app.patch('/api/category/:id', (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'id が不正です' });
  const updates = req.body || {};
  const allowedFields = ['name', 'icon'];
  const fields = [];
  const values = {};
  for (const key of allowedFields) {
    if (key in updates) {
      fields.push(`${key} = @${key}`);
      values[key] = updates[key];
    }
  }
  if (fields.length === 0) return res.status(400).json({ error: '更新する項目がありません' });
  values.id = id;
  const updateStmt = db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = @id`);
  const result = updateStmt.run(values);
  if (result.changes === 0) return res.status(404).json({ error: 'カテゴリーが見つかりません' });
  const selectStmt = db.prepare(`SELECT id, name, icon, sortOrder FROM categories WHERE id = @id`);
  res.json({ ok: true, category: selectStmt.get({ id }) });
});

// カテゴリ削除
app.delete('/api/category/:id', (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'id が不正です' });
  if (id === 'all' || id === 'others') return res.status(403).json({ error: 'このカテゴリーは削除できません' });
  const selectStmt = db.prepare(`SELECT id, name, icon, sortOrder FROM categories WHERE id = @id`);
  const category = selectStmt.get({ id });
  if (!category) return res.status(404).json({ error: 'カテゴリーがみつかりません' });
  db.prepare(`UPDATE clips SET categoryId = 'others' WHERE categoryId = @id`).run({ id });
  db.prepare(`DELETE FROM categories WHERE id = @id`).run({ id });
  debugLog('カテゴリー削除', category.name);
  res.json({ ok: true, id });
});

// 収集元サイト一覧
app.get('/api/source-site', (_req, res) => {
  const selectStmt = db.prepare(`SELECT id, tag, siteUrl, rssUrl, createdAt FROM source_sites ORDER BY tag ASC, id ASC`);
  res.json({ sites: selectStmt.all() });
});

// 収集元サイト追加（RSS自動検出）
app.post('/api/source-site', async (req, res) => {
  const body = req.body || {};
  const { tag, siteUrl } = body;
  if (!tag || !siteUrl) return res.status(400).json({ error: 'tag と siteUrl は必須です' });
  const trimmedTag = String(tag).trim();
  const trimmedUrl = String(siteUrl).trim();
  if (!trimmedTag || !trimmedUrl) return res.status(400).json({ error: 'tag と siteUrl は空白にできません' });

  // 同一タグあたり最大5件まで登録可能
  const countStmt = db.prepare(`SELECT COUNT(*) AS count FROM source_sites WHERE tag = @tag`);
  const { count } = countStmt.get({ tag: trimmedTag });
  if (count >= 5) {
    return res.status(409).json({ error: '同じタグには最大5件までしか登録できません' });
  }
  let rssUrl = null;
  try {
    rssUrl = await detectRssUrl(trimmedUrl);
  } catch (err) {
    debugLog('RSS検出失敗', err.message);
  }
  const site = { tag: trimmedTag, siteUrl: trimmedUrl, rssUrl, createdAt: new Date().toISOString() };
  try {
    const insertStmt = db.prepare(`INSERT INTO source_sites (tag, siteUrl, rssUrl, createdAt) VALUES (@tag, @siteUrl, @rssUrl, @createdAt)`);
    const result = insertStmt.run(site);
    debugLog('収集元サイト追加', trimmedTag);
    res.status(201).json({ ok: true, site: { id: result.lastInsertRowid, ...site } });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: '同じサイトURLが既に登録されています' });
    }
    throw err;
  }
});

// 収集元サイト削除
app.delete('/api/source-site/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id が不正です' });
  const deleteStmt = db.prepare('DELETE FROM source_sites WHERE id = @id');
  const result = deleteStmt.run({ id });
  if (result.changes === 0) return res.status(404).json({ error: 'サイトがみつかりません' });
  debugLog('収集元サイト削除', id);
  res.json({ ok: true, id });
});

// アプリ設定を取得する
app.get('/api/settings', (_req, res) => {
  const settings = getAppSettings();
  res.json({ settings });
});

// アプリ設定を保存する
app.post('/api/settings', (req, res) => {
  const body = req.body || {};
  const updates = {};
  if (typeof body.aiSummaryEnabled === 'boolean') updates.aiSummaryEnabled = String(body.aiSummaryEnabled);
  if (typeof body.aiSummaryApiKey === 'string') updates.aiSummaryApiKey = body.aiSummaryApiKey;
  if (typeof body.aiSummaryModel === 'string') updates.aiSummaryModel = body.aiSummaryModel;
  if (typeof body.aiSummaryLanguage === 'string') updates.aiSummaryLanguage = body.aiSummaryLanguage;
  saveAppSettings(updates);
  debugLog('アプリ設定保存', Object.keys(updates).join(', '));
  res.json({ ok: true, settings: getAppSettings() });
});

// クリップ収集実行
app.post('/api/collect', async (req, res) => {
  const body = req.body || {};
  const tag = String(body.tag || '').trim();
  const keyword = String(body.keyword || '').trim();
  const count = Math.max(1, Math.min(20, Number(body.count) || 5));

  if (!tag && !keyword) {
    return res.status(400).json({ error: 'タグまたはキーワードを指定してください' });
  }

  // タグ・キーワードに一致する収集元サイトを探す
  const query = tag || keyword;
  const selectStmt = db.prepare(`SELECT id, tag, siteUrl, rssUrl FROM source_sites`);
  const allSites = selectStmt.all();
  const matchedSites = allSites.filter((site) => site.tag.toLowerCase().includes(query.toLowerCase()));

  if (matchedSites.length === 0) {
    return res.status(404).json({ error: '該当するタグの収集元サイトが登録されていません。設定から追加してください。' });
  }

  // AI要約設定を取得する
  const aiSettings = getAppSettings();

  const collected = [];
  for (const site of matchedSites) {
    if (collected.length >= count) break;
    const articles = await collectArticlesFromSite(site.siteUrl, site.rssUrl);
    for (const article of articles) {
      if (collected.length >= count) break;
      // 重複チェック（URLで判定）
      // 通常クリップだけでなく、ゴミ箱内のクリップも含めて重複を排除する
      // 完全に削除されたレコードは clips テーブルに存在しないため対象外となる
      const exists = db.prepare(`SELECT id FROM clips WHERE url = @url`).get({ url: article.url });
      if (exists) continue;

      let summary = article.summary || '';
      // AI要約が有効でAPIキーが設定されている場合、RSSの要約本文を使って要約を生成する
      if (aiSettings.enabled && aiSettings.apiKey && summary) {
        try {
          const aiSummary = await summarizeWithOpenCodeGo(summary, article.title, aiSettings);
          if (aiSummary) summary = aiSummary;
        } catch (err) {
          debugLog('AI要約失敗', `${article.url}: ${err.message}`);
          // 要約に失敗しても収集は続行し、元の要約を使用する
        }
      }

      const clip = {
        url: article.url,
        title: article.title,
        summary,
        rawBody: '',
        categoryId: 'others',
        isPinned: 0,
        isChecked: 0,
        comment: '',
        receivedAt: new Date().toISOString(),
      };
      const insertStmt = db.prepare(`
        INSERT INTO clips (url, title, summary, rawBody, categoryId, isPinned, isChecked, comment, receivedAt)
        VALUES (@url, @title, @summary, @rawBody, @categoryId, @isPinned, @isChecked, @comment, @receivedAt)
      `);
      const result = insertStmt.run(clip);
      collected.push({ id: result.lastInsertRowid, ...clip });
    }
  }

  debugLog('クリップ収集完了', `${collected.length}件`);
  res.json({ ok: true, count: collected.length, clips: collected });
});

// 24時間以上経過したゴミ箱クリップを削除
function purgeOldTrashClips() {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare(`DELETE FROM clips WHERE deletedAt IS NOT NULL AND deletedAt <= @oneDayAgo`).run({ oneDayAgo });
    if (result.changes > 0) debugLog('古いゴミ箱クリップを削除', `${result.changes}件`);
  } catch (err) {
    console.error('ゴミ箱クリップの削除に失敗しました:', err);
  }
}
purgeOldTrashClips();
setInterval(purgeOldTrashClips, 60 * 60 * 1000);

// その他カテゴリでチェックマークがONかつ24時間経過したクリップをゴミ箱へ移動する
function moveCheckedOthersToTrash() {
  try {
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE clips
      SET deletedAt = @now
      WHERE deletedAt IS NULL
        AND categoryId = 'others'
        AND isChecked = 1
        AND isPinned = 0
        AND checkedAt IS NOT NULL
        AND checkedAt <= datetime(@now, '-1 day')
    `).run({ now });
    if (result.changes > 0) debugLog('確認済みクリップをゴミ箱へ移動', `${result.changes}件`);
  } catch (err) {
    console.error('確認済みクリップのゴミ箱移動に失敗しました:', err);
  }
}
moveCheckedOthersToTrash();
setInterval(moveCheckedOthersToTrash, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`[ClipDesk API] http://localhost:${PORT}/api/clip で待受中`);
});
