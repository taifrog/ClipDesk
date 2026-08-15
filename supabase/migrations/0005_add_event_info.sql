-- ClipDesk clips テーブルにイベント情報を追加するマイグレーション
-- イベント・展示などの開始日・終了日・場所を保存するためのカラムを追加する。

-- クリップテーブルにイベント開始日・終了日・場所のカラムを追加する
ALTER TABLE clips
  ADD COLUMN IF NOT EXISTS event_start_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_end_date   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location         TEXT;
