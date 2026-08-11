-- service_role に対して各テーブルの基本操作権限を付与する
GRANT ALL PRIVILEGES ON TABLE categories TO service_role;
GRANT ALL PRIVILEGES ON TABLE clips TO service_role;
GRANT ALL PRIVILEGES ON TABLE source_sites TO service_role;
GRANT ALL PRIVILEGES ON TABLE app_settings TO service_role;
GRANT ALL PRIVILEGES ON TABLE user_api_keys TO service_role;

-- シーケンス（BIGSERIAL など）の使用権限も付与する
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
