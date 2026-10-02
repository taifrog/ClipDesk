-- Googleカレンダー連携用の設定とクリップ状態を追加するマイグレーション
-- 設計書 01_design_google-calendar.md M1 に対応する
-- Notion用の notion_* カラムは履歴保全のため残し、コード参照のみ除去する

-- アプリ設定テーブルに Google 連携設定を追加する
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS google_client_id      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS google_client_secret  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS google_refresh_token  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS google_calendar_id    TEXT NOT NULL DEFAULT 'kenmichi@gmail.com';

-- クリップテーブルに Google 連携済み状態を追加する
ALTER TABLE clips
  ADD COLUMN IF NOT EXISTS google_exported    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS google_exported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_event_id    TEXT,
  ADD COLUMN IF NOT EXISTS google_event_url   TEXT;

-- 既存レコードを未連携状態に更新する（DEFAULT FALSE により自動設定されるが明示的に保証する）
UPDATE clips SET google_exported = FALSE WHERE google_exported IS NULL;
