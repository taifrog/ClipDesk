-- ClipDesk clips テーブルに AI 要約ステータスカラムを追加するマイグレーション
-- クリップ登録後の AI 要約・日時・場所抽出の処理状態を管理する。

-- クリップテーブルに AI 要約ステータスカラムを追加する
-- pending: 要約待ち（登録直後）
-- processing: AI 要約処理中
-- completed: AI 要約処理完了
-- failed: AI 要約処理失敗（ユーザー通知はしない）
ALTER TABLE clips
  ADD COLUMN IF NOT EXISTS ai_enrichment_status TEXT NOT NULL DEFAULT 'pending';

-- ステータスによる検索を高速化するインデックス
CREATE INDEX IF NOT EXISTS idx_clips_ai_enrichment_status ON clips(ai_enrichment_status);
