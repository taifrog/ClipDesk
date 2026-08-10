// 認証パネルコンポーネント
// Supabase Auth を使ったメール・パスワードによるログイン・新規登録・ログアウト UI を提供する。

import { useState } from 'react'
import { getSupabaseClient } from '../lib/supabase'

// 認証パネルのプロパティ
interface AuthPanelProps {
  // 認証状態変更時に親コンポーネントで再取得を行うためのコールバック
  onAuthChange: () => void
}

// 認証パネル
export function AuthPanel({ onAuthChange }: AuthPanelProps) {
  // メールアドレス入力値
  const [email, setEmail] = useState<string>('')
  // パスワード入力値
  const [password, setPassword] = useState<string>('')
  // ログインモード（true）か新規登録モード（false）か
  const [isLogin, setIsLogin] = useState<boolean>(true)
  // 処理中フラグ
  const [isLoading, setIsLoading] = useState<boolean>(false)
  // エラーメッセージ
  const [error, setError] = useState<string | null>(null)

  const supabase = getSupabaseClient()

  // フォーム送信時の処理（ログインまたは新規登録）
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        })
        if (signUpError) throw signUpError
      }
      onAuthChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : '認証に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  // モード切り替え時に入力とエラーをリセットする
  const toggleMode = () => {
    setIsLogin((prev) => !prev)
    setError(null)
  }

  return (
    <div className="auth-panel">
      <h2 className="auth-title">{isLogin ? 'ログイン' : '新規登録'}</h2>
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label htmlFor="auth-email">メールアドレス</label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            disabled={isLoading}
          />
        </div>
        <div className="form-group">
          <label htmlFor="auth-password">パスワード</label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            disabled={isLoading}
            minLength={6}
          />
        </div>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="button-primary" disabled={isLoading}>
          {isLoading ? '処理中…' : isLogin ? 'ログイン' : '新規登録'}
        </button>
      </form>
      <p className="auth-toggle">
        {isLogin ? 'アカウントをお持ちでないですか？' : '既にアカウントをお持ちですか？'}
        <button type="button" className="button-link" onClick={toggleMode}>
          {isLogin ? '新規登録' : 'ログイン'}
        </button>
      </p>
    </div>
  )
}
