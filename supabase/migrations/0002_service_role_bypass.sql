-- Edge Functions 内の service_role クライアントが RLS をバイパスできるようにする
-- service_role ロールは Supabase 管理下の信頼されたロールであり、Edge Functions 内のみで使用する

CREATE POLICY IF NOT EXISTS "Service role bypasses RLS on categories"
  ON categories FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Service role bypasses RLS on clips"
  ON clips FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Service role bypasses RLS on source_sites"
  ON source_sites FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Service role bypasses RLS on app_settings"
  ON app_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Service role bypasses RLS on user_api_keys"
  ON user_api_keys FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
