-- Edge Functions 内の service_role クライアントが RLS をバイパスできるようにする
-- service_role ロールは Supabase 管理下の信頼されたロールであり、Edge Functions 内のみで使用する

-- service_role に対して各テーブルの基本操作権限を付与する
GRANT ALL PRIVILEGES ON TABLE categories TO service_role;
GRANT ALL PRIVILEGES ON TABLE clips TO service_role;
GRANT ALL PRIVILEGES ON TABLE source_sites TO service_role;
GRANT ALL PRIVILEGES ON TABLE app_settings TO service_role;
GRANT ALL PRIVILEGES ON TABLE user_api_keys TO service_role;

-- シーケンス（BIGSERIAL など）の使用権限も付与する
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'categories' AND policyname = 'Service role bypasses RLS on categories'
  ) THEN
    CREATE POLICY "Service role bypasses RLS on categories"
      ON categories FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clips' AND policyname = 'Service role bypasses RLS on clips'
  ) THEN
    CREATE POLICY "Service role bypasses RLS on clips"
      ON clips FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'source_sites' AND policyname = 'Service role bypasses RLS on source_sites'
  ) THEN
    CREATE POLICY "Service role bypasses RLS on source_sites"
      ON source_sites FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'app_settings' AND policyname = 'Service role bypasses RLS on app_settings'
  ) THEN
    CREATE POLICY "Service role bypasses RLS on app_settings"
      ON app_settings FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_api_keys' AND policyname = 'Service role bypasses RLS on user_api_keys'
  ) THEN
    CREATE POLICY "Service role bypasses RLS on user_api_keys"
      ON user_api_keys FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;
