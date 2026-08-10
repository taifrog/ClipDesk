// Supabase クライアント設定
// フロントエンドから Supabase Auth および Edge Functions を呼び出すための設定を管理する。

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// 環境変数から Supabase プロジェクトの URL と anon キーを取得する
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// シングルトンで Supabase クライアントを保持する
let supabase: SupabaseClient | null = null

// Supabase クライアントを取得する（未作成の場合は作成する）
export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('VITE_SUPABASE_URL または VITE_SUPABASE_ANON_KEY が設定されていません')
    }
    supabase = createClient(supabaseUrl, supabaseAnonKey)
  }
  return supabase
}
