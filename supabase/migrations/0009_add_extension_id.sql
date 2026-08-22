-- Chrome 拡張機能 ID 保存用カラムを追加するマイグレーション
-- Web アプリから拡張機能への sendMessage 連携で明示的な拡張機能 ID を使用できるようにする

-- app_settings テーブルに拡張機能 ID を追加
ALTER TABLE app_settings
ADD COLUMN IF NOT EXISTS extension_id TEXT NOT NULL DEFAULT '';
