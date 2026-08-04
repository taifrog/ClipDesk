// ClipDesk テスト用簡易APIサーバー
// 拡張機能から投稿されたクリップ情報をインメモリで保持し、フロントエンドに表示する

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

// インメモリのクリップストレージ
// テスト用なので永続化は行わない
const clips = [];

// CORS を許可し、JSON ボディをパースする
app.use(cors());
app.use(express.json());

// クリップを受け取るエンドポイント
// 拡張機能から POST される
app.post('/api/clip', (req, res) => {
  const body = req.body || {};
  const { url, title, summary, rawBody } = body;

  if (!url || !title) {
    return res.status(400).json({ error: 'url と title は必須です', receivedBody: body });
  }

  const clip = {
    id: clips.length + 1,
    url,
    title,
    summary: summary || '',
    rawBody: rawBody || '',
    receivedAt: new Date().toISOString(),
  };

  // 最新のクリップを先頭に追加し、最大 50 件まで保持する
  clips.unshift(clip);
  if (clips.length > 50) {
    clips.pop();
  }

  console.log('[ClipDesk API] クリップ受信:', title);
  res.status(201).json({ ok: true, clip });
});

// クリップ一覧を返すエンドポイント
// フロントエンドから GET される
app.get('/api/clip', (req, res) => {
  res.json({ clips });
});

// サーバーを起動する
app.listen(PORT, () => {
  console.log(`[ClipDesk API] http://localhost:${PORT}/api/clip で待受中`);
});
