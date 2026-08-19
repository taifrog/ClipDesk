-- Obsidian 連携用カラムと設定を追加するマイグレーション
-- PC 版 ClipDesk ローカルサーバー経由で Obsidian Local REST API へクリップを書き出すための情報を保持する

-- clips テーブルに Obsidian 書き出し予定フラグと書き出し日時を追加
-- obsidian_pending: スマホ・PC 問わず「あとで Obsidian へ書き出す」マーク
-- obsidian_exported_at: 実際に Obsidian へ書き出された日時（将来の確認・重複防止用）
ALTER TABLE clips
ADD COLUMN IF NOT EXISTS obsidian_pending BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS obsidian_exported_at TIMESTAMPTZ;

-- app_settings テーブルに Obsidian 連携設定を追加
ALTER TABLE app_settings
ADD COLUMN IF NOT EXISTS obsidian_api_key TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS obsidian_folder TEXT NOT NULL DEFAULT 'ClipDesk',
ADD COLUMN IF NOT EXISTS obsidian_filename_template TEXT NOT NULL DEFAULT '{{title}}',
ADD COLUMN IF NOT EXISTS obsidian_note_template TEXT NOT NULL DEFAULT $TEMPLATE$
---
registered_at: {{registeredAt}}
url: {{url}}
title: {{title}}
event_start_date: {{eventStartDate}}
event_end_date: {{eventEndDate}}
location: {{location}}
category: {{category}}
comment: {{comment}}
---

# {{title}}

URL: {{url}}

## 要約

{{summary}}

## コメント

{{comment}}
$TEMPLATE$;
