-- Notion カレンダー連携用の設定とクリップ状態を追加するマイグレーション
-- クリップのイベント情報を Notion データベース（カレンダー）へ登録するための情報を保持する

-- アプリ設定テーブルに Notion 連携設定を追加
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS notion_api_key          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notion_database_id      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notion_date_property    TEXT NOT NULL DEFAULT 'Date',
  ADD COLUMN IF NOT EXISTS notion_title_property   TEXT NOT NULL DEFAULT 'Name',
  ADD COLUMN IF NOT EXISTS notion_url_property     TEXT NOT NULL DEFAULT 'URL',
  ADD COLUMN IF NOT EXISTS notion_summary_property TEXT NOT NULL DEFAULT 'Summary';

-- クリップテーブルに Notion 連携済み状態を追加
ALTER TABLE clips
  ADD COLUMN IF NOT EXISTS notion_exported       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notion_exported_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notion_page_id        TEXT,
  ADD COLUMN IF NOT EXISTS notion_page_url       TEXT;

-- 既存レコードを未連携状態に更新（DEFAULT FALSE により自動設定されるが、明示的に保証しておく）
UPDATE clips SET notion_exported = FALSE WHERE notion_exported IS NULL;
