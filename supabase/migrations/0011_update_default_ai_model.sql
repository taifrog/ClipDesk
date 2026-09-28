-- 0011: 既定AIモデルを glm-5.3-flash に変更（コスパ優先）
-- Go 2025-09-06以降の x-opencode-session 必須化に伴い gpt-4o-mini は非対応
ALTER TABLE app_settings ALTER COLUMN ai_summary_model SET DEFAULT 'glm-5.3-flash';
-- 既存レコードで gpt-4o-mini のままのものは互換維持のため放置（フロント/Edgeでは引き続き許容）
-- 新規ユーザー向けにデフォルトを変更。既存ユーザーは設定画面で glm-5.3-flash / deepseek-v4-flash に再保存を推奨
