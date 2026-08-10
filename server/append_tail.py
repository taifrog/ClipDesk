# [非推奨] 旧 Express/SQLite サーバー（server/index.mjs）へコードを追記するユーティリティ
# Supabase 移行後は使用しません。履歴保持のため残しています。

import pathlib

tail = r'''
  const result = updateStmt.run(values);
  if (result.changes === 0) return res.status(404).json({ error: 'クリップが見つかりません' });
  const selectStmt = db.prepare(`SELECT id, url, title, summary, rawBody, categoryId, isPinned, comment, receivedAt FROM clips WHERE id = @id`);
  const row = selectStmt.get({ id });
  res.json({ ok: true, clip: { ...row, isPinned: row.isPinned === 1 } });
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
  if (result.changes === 0) return res.status(404).json({ error: 'サイトが見つかりません' });
  debugLog('収集元サイト削除', id);
  res.json({ ok: true, id });
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

  const collected = [];
  for (const site of matchedSites) {
    if (collected.length >= count) break;
    const articles = await collectArticlesFromSite(site.siteUrl, site.rssUrl);
    for (const article of articles) {
      if (collected.length >= count) break;
      // 重複チェック（URLで判定）
      const exists = db.prepare(`SELECT id FROM clips WHERE url = @url AND deletedAt IS NULL`).get({ url: article.url });
      if (exists) continue;
      const clip = {
        url: article.url,
        title: article.title,
        summary: article.summary,
        rawBody: '',
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

app.listen(PORT, () => {
  console.log(`[ClipDesk API] http://localhost:${PORT}/api/clip で待受中`);
});
'''

p = pathlib.Path('c:/data/Github/ClipDesk/server/index.mjs')
text = p.read_text(encoding='utf-8')
# 末尾の空白・改行をトリム
text = text.rstrip()
# 既に tail が含まれていなければ追加
if 'app.listen(PORT' not in text:
    p.write_text(text + tail, encoding='utf-8')
    print('末尾を追加しました')
else:
    print('既に末尾が存在します')
