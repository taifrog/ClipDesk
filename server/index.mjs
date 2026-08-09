// ClipDesk APIサーバー
// SQLiteファイルでクリップとカテゴリを永続化する

import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
// clips: ブラウザアドオンから受信したWebページ情報
// categories: クリップを分類するカテゴリ
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
    comment TEXT NOT NULL DEFAULT '',
    receivedAt TEXT NOT NULL,
    deletedAt TEXT,
    FOREIGN KEY (categoryId) REFERENCES categories(id)
  );
`);

// 既存のclipsテーブルに deletedAt カラムがなければ追加する
try {
  db.exec(`ALTER TABLE clips ADD COLUMN deletedAt TEXT`);
  debugLog('マイグレーション', 'clips.deletedAt カラムを追加しました');
} catch (err) {
  // カラムが既に存在する場合は無視する
  if (!err.message.includes('duplicate column name')) {
    console.error('マイグレーション失敗:', err);
  }
}

// 初期カテゴリが存在しなければ挿入する
// UI側で参照するため、最低限のカテゴリをあらかじめ用意する
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

// デバッグログ出力
function debugLog(label, data) {
  console.log(`[ClipDesk API] ${label}:`, data);
}

// 初期カテゴリを upsert する
// 既存の行があっても name/icon/sortOrder を最新のデフォルト値で上書きする
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

// CORS を許可し、JSON ボディをパースする
app.use(cors());
app.use(express.json());

// クリップを受け取るエンドポイント
// ブラウザアドオンから POST される
app.post('/api/clip', (req, res) => {
  const body = req.body || {};
  const { url, title, summary, rawBody } = body;

  if (!url || !title) {
    return res.status(400).json({ error: 'url と title は必須です', receivedBody: body });
  }

  const clip = {
    url,
    title,
    summary: summary || '',
    rawBody: rawBody || '',
    categoryId: 'others',
    isPinned: 0,
    comment: '',
    receivedAt: new Date().toISOString(),
  };

  const insertStmt = db.prepare(`
    INSERT INTO clips (url, title, summary, rawBody, categoryId, isPinned, comment, receivedAt)
    VALUES (@url, @title, @summary, @rawBody, @categoryId, @isPinned, @comment, @receivedAt)
  `);
  const result = insertStmt.run(clip);

  debugLog('クリップ受信', title);
  res.status(201).json({ ok: true, clip: { id: result.lastInsertRowid, ...clip } });
});

// クリップ一覧を返すエンドポイント
// フロントエンドから GET される（削除されていないクリップのみ）
app.get('/api/clip', (_req, res) => {
  const selectStmt = db.prepare(`
    SELECT id, url, title, summary, rawBody, categoryId, isPinned, comment, receivedAt, deletedAt
    FROM clips
    WHERE deletedAt IS NULL
    ORDER BY isPinned DESC, receivedAt DESC
  `);
  const rows = selectStmt.all();

  // isPinnedは整数（0/1）なので、フロントエンド用にbooleanに変換する
  const clips = rows.map((row) => ({
    ...row,
    isPinned: row.isPinned === 1,
  }));

  res.json({ clips });
});

// ゴミ箱のクリップ一覧を返すエンドポイント
app.get('/api/clip/trash', (_req, res) => {
  const selectStmt = db.prepare(`
    SELECT id, url, title, summary, rawBody, categoryId, isPinned, comment, receivedAt, deletedAt
    FROM clips
    WHERE deletedAt IS NOT NULL
    ORDER BY deletedAt DESC
  `);
  const rows = selectStmt.all();

  const clips = rows.map((row) => ({
    ...row,
    isPinned: row.isPinned === 1,
  }));

  res.json({ clips });
});

// クリップをゴミ箱に移動するエンドポイント
app.patch('/api/clip/:id/trash', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'id が不正です' });
  }

  const updateStmt = db.prepare(`
    UPDATE clips SET deletedAt = @deletedAt WHERE id = @id AND deletedAt IS NULL
  `);
  const result = updateStmt.run({ id, deletedAt: new Date().toISOString() });

  if (result.changes === 0) {
    return res.status(404).json({ error: 'クリップが見つかりません' });
  }

  debugLog('クリップをゴミ箱へ移動', id);
  res.json({ ok: true, id });
});

// クリップをゴミ箱から元に戻すエンドポイント
app.patch('/api/clip/:id/restore', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'id が不正です' });
  }

  const updateStmt = db.prepare(`
    UPDATE clips SET deletedAt = NULL WHERE id = @id AND deletedAt IS NOT NULL
  `);
  const result = updateStmt.run({ id });

  if (result.changes === 0) {
    return res.status(404).json({ error: 'クリップが見つかりません' });
  }

  debugLog('クリップを復元', id);
  res.json({ ok: true, id });
});

// クリップを更新するエンドポイント
// カテゴリ変更、ピン留め切り替え、コメント追加などに使用する
app.patch('/api/clip/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'id が不正です' });
  }

  const updates = req.body || {};
  const allowedFields = ['categoryId', 'isPinned', 'comment'];
  const fields = [];
  const values = {};

  for (const key of allowedFields) {
    if (key in updates) {
      fields.push(`${key} = @${key}`);
      // isPinnedはSQLiteのINTEGERカラムなので、booleanを0/1に変換する
      if (key === 'isPinned') {
        values[key] = updates[key] ? 1 : 0;
      } else {
        values[key] = updates[key];
      }
    }
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: '更新する項目がありません' });
  }

  values.id = id;

  const updateStmt = db.prepare(`
    UPDATE clips SET ${fields.join(', ')} WHERE id = @id
  `);
  const result = updateStmt.run(values);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'クリップが見つかりません' });
  }

  const selectStmt = db.prepare(`
    SELECT id, url, title, summary, rawBody, categoryId, isPinned, comment, receivedAt
    FROM clips WHERE id = @id
  `);
  const row = selectStmt.get({ id });
  res.json({ ok: true, clip: { ...row, isPinned: row.isPinned === 1 } });
});

// クリップを削除するエンドポイント
app.delete('/api/clip/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'id が不正です' });
  }

  const deleteStmt = db.prepare('DELETE FROM clips WHERE id = @id');
  const result = deleteStmt.run({ id });

  if (result.changes === 0) {
    return res.status(404).json({ error: 'クリップが見つかりません' });
  }

  debugLog('クリップ削除', id);
  res.json({ ok: true, id });
});

// カテゴリ一覧を返すエンドポイント
app.get('/api/category', (_req, res) => {
  const selectStmt = db.prepare(`
    SELECT id, name, icon, sortOrder FROM categories ORDER BY sortOrder ASC, id ASC
  `);
  const categories = selectStmt.all();
  res.json({ categories });
});

// カテゴリを追加するエンドポイント
app.post('/api/category', (req, res) => {
  const body = req.body || {};
  const { id, name, icon } = body;

  if (!id || !name) {
    return res.status(400).json({ error: 'id と name は必須です' });
  }

  const category = {
    id,
    name,
    icon: icon || 'grid',
    sortOrder: 10,
  };

  try {
    const insertStmt = db.prepare(`
      INSERT INTO categories (id, name, icon, sortOrder)
      VALUES (@id, @name, @icon, @sortOrder)
    `);
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

// カテゴリーを更新するエンドポイント
// 名称変更やアイコン変更に使用する
app.patch('/api/category/:id', (req, res) => {
  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ error: 'id が不正です' });
  }

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

  if (fields.length === 0) {
    return res.status(400).json({ error: '更新する項目がありません' });
  }

  values.id = id;

  const updateStmt = db.prepare(`
    UPDATE categories SET ${fields.join(', ')} WHERE id = @id
  `);
  const result = updateStmt.run(values);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'カテゴリーが見つかりません' });
  }

  const selectStmt = db.prepare(`
    SELECT id, name, icon, sortOrder FROM categories WHERE id = @id
  `);
  const row = selectStmt.get({ id });
  debugLog('カテゴリー更新', row);
  res.json({ ok: true, category: row });
});

// カテゴリーを削除するエンドポイント
// 削除前に、当該カテゴリーに属するクリップを「その他（others）」に移動する
app.delete('/api/category/:id', (req, res) => {
  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ error: 'id が不正です' });
  }

  // 保護対象のカテゴリーは削除できない
  if (id === 'all' || id === 'others') {
    return res.status(403).json({ error: 'このカテゴリーは削除できません' });
  }

  // 対象カテゴリーが存在するか確認する
  const selectStmt = db.prepare(`
    SELECT id, name, icon, sortOrder FROM categories WHERE id = @id
  `);
  const category = selectStmt.get({ id });
  if (!category) {
    return res.status(404).json({ error: 'カテゴリーが見つかりません' });
  }

  // 関連クリップを others に移動する
  const moveClipsStmt = db.prepare(`
    UPDATE clips SET categoryId = 'others' WHERE categoryId = @id
  `);
  moveClipsStmt.run({ id });

  // カテゴリーを削除する
  const deleteStmt = db.prepare(`
    DELETE FROM categories WHERE id = @id
  `);
  deleteStmt.run({ id });

  debugLog('カテゴリー削除', category.name);
  res.json({ ok: true, id });
});

// 24時間以上経過したゴミ箱のクリップを物理削除する
function purgeOldTrashClips() {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const deleteStmt = db.prepare(`
      DELETE FROM clips WHERE deletedAt IS NOT NULL AND deletedAt <= @oneDayAgo
    `);
    const result = deleteStmt.run({ oneDayAgo });
    if (result.changes > 0) {
      debugLog('古いゴミ箱クリップを削除', `${result.changes}件`);
    }
  } catch (err) {
    console.error('ゴミ箱クリップの削除に失敗しました:', err);
  }
}

// 起動時と1時間ごとに古いゴミ箱クリップを削除する
purgeOldTrashClips();
setInterval(purgeOldTrashClips, 60 * 60 * 1000);

// サーバーを起動する
app.listen(PORT, () => {
  console.log(`[ClipDesk API] http://localhost:${PORT}/api/clip で待受中`);
});
