-- Edge Functions 内の service_role クライアントが RLS をバイパスできるようにする
-- service_role ロールは Supabase 管理下の信頼されたロールであり、Edge Functions 内のみで使用する

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
