import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient } from './lib/supabase'
import type { Category } from './types'
import './App.css'

// Web Share Target から受け取った共有データを表す型
interface SharedData {
  url: string
  title: string
  text: string
}

// URL クエリパラメータから共有データを取得する
// @param searchParams 現在の URL 検索パラメータ
// @returns 共有データ（url / title / text）
function parseSharedData(searchParams: URLSearchParams): SharedData {
  let url = searchParams.get('url') || ''
  const title = searchParams.get('title') || ''
  const text = searchParams.get('text') || ''

  // text に URL が含まれる場合、url が空なら抽出する
  if (!url && text) {
    const matched = text.match(/https?:\/\/[^\s]+/)
    if (matched) {
      url = matched[0]
    }
  }

  return { url, title, text }
}

// Supabase Edge Functions のベースパスを環境に応じて決定する
const FUNCTIONS_BASE = import.meta.env.DEV
  ? '/functions/v1'
  : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

// ローカルストレージで使用する API キー保存用キー
const API_KEY_STORAGE_KEY = 'clipdesk-share-api-key'

// 共有受信ページ（Web Share Target から遷移してくる画面）
// タイトル・URL・カテゴリ・コメントを確認・編集してクリップ登録する
export default function ShareTargetPage() {
  const supabase = getSupabaseClient()

  // 現在の認証セッション
  const [session, setSession] = useState<Session | null>(null)
  // 認証状態の初期確認中フラグ
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  // 共有データ
  const [sharedData, setSharedData] = useState<SharedData>({ url: '', title: '', text: '' })
  // カテゴリ一覧
  const [categories, setCategories] = useState<Category[]>([])
  // カテゴリ読み込み中フラグ
  const [isLoadingCategories, setIsLoadingCategories] = useState(false)
  // 選択中のカテゴリID
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('others')
  // コメント入力
  const [comment, setComment] = useState('')
  // API キー入力
  const [apiKey, setApiKey] = useState('')
  // 登録中フラグ
  const [isSubmitting, setIsSubmitting] = useState(false)
  // 登録結果メッセージ
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  // 認証状態の初期化
  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) {
        console.error('セッション取得失敗:', error)
      }
      setSession(data.session)
      setIsAuthLoading(false)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      setSession(newSession)
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [supabase])

  // URL クエリパラメータから共有データを読み込む
  useEffect(() => {
    const data = parseSharedData(new URLSearchParams(window.location.search))
    setSharedData(data)
  }, [])

  // ローカルストレージから API キーを復元する
  useEffect(() => {
    const saved = localStorage.getItem(API_KEY_STORAGE_KEY)
    if (saved) {
      setApiKey(saved)
    }
  }, [])

  // 認証ヘッダーを取得する
  const getAuthHeaders = useCallback(
    (contentType = true): Record<string, string> => {
      const headers: Record<string, string> = {}
      if (contentType) {
        headers['Content-Type'] = 'application/json'
      }
      const token = session?.access_token
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      return headers
    },
    [session],
  )

  // ログイン済みの場合、カテゴリ一覧を取得する
  useEffect(() => {
    if (!session) return
    let mounted = true
    setIsLoadingCategories(true)

    fetch(`${FUNCTIONS_BASE}/categories`, {
      headers: getAuthHeaders(false),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`カテゴリの取得に失敗しました: ${response.status}`)
        }
        const data = await response.json()
        const apiCategories: Category[] = (data.categories || []).map((raw: Record<string, unknown>) => ({
          id: String(raw.id),
          name: String(raw.name),
          icon: String(raw.icon ?? 'grid'),
        }))
        // 論理カテゴリを補完する
        const logical = [
          { id: 'all', name: 'すべてのクリップ', icon: 'inbox' },
          { id: 'others', name: 'その他', icon: 'grid' },
        ]
        const result = [...apiCategories]
        for (const cat of logical) {
          if (!result.some((c) => c.id === cat.id)) {
            if (cat.id === 'all') {
              result.unshift(cat)
            } else {
              result.push(cat)
            }
          }
        }
        if (mounted) {
          setCategories(result)
        }
      })
      .catch((err) => {
        console.error('カテゴリ取得失敗:', err)
      })
      .finally(() => {
        if (mounted) {
          setIsLoadingCategories(false)
        }
      })

    return () => {
      mounted = false
    }
  }, [session, getAuthHeaders])

  // ユーザーに表示するカテゴリ選択肢（all は選択不可のため除外）
  const selectableCategories = useMemo(
    () => categories.filter((cat) => cat.id !== 'all'),
    [categories],
  )

  // クリップ登録を実行する
  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      if (!sharedData.url || !sharedData.title) {
        setResultMessage('URL とタイトルが必要です')
        return
      }

      setIsSubmitting(true)
      setResultMessage(null)

      try {
        // 使用する API キーを決定する（ログイン済みなら不要、未ログインなら入力必須）
        const effectiveApiKey = session ? undefined : apiKey.trim()
        if (!session && !effectiveApiKey) {
          setResultMessage('API キーを入力するか、ログインしてください')
          return
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (effectiveApiKey) {
          headers['x-api-key'] = effectiveApiKey
        }
        if (session) {
          headers['Authorization'] = `Bearer ${session.access_token}`
        }

        const body: Record<string, unknown> = {
          url: sharedData.url,
          title: sharedData.title,
        }
        if (selectedCategoryId && selectedCategoryId !== 'all') {
          body.categoryId = selectedCategoryId
        }
        if (comment.trim()) {
          body.comment = comment.trim()
        }

        const response = await fetch(`${FUNCTIONS_BASE}/clip`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        })

        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(data.error || 'クリップ登録に失敗しました')
        }

        // 成功したら API キーを保存する
        if (effectiveApiKey) {
          localStorage.setItem(API_KEY_STORAGE_KEY, effectiveApiKey)
        }

        if (data.duplicate) {
          setResultMessage('この URL は既に登録されています')
        } else {
          setResultMessage('クリップを登録しました')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'クリップ登録に失敗しました'
        setResultMessage(message)
      } finally {
        setIsSubmitting(false)
      }
    },
    [sharedData, session, apiKey, selectedCategoryId, comment],
  )

  // タイトルが空の場合、text から補完するための入力欄
  const handleTitleChange = (value: string) => {
    setSharedData((prev) => ({ ...prev, title: value }))
  }

  // URL が空の場合、text から補完するための入力欄
  const handleUrlChange = (value: string) => {
    setSharedData((prev) => ({ ...prev, url: value }))
  }

  return (
    <div className="share-target-page">
      <header className="share-target-header">
        <h1>ClipDesk にクリップ</h1>
      </header>

      <main className="share-target-main">
        {isAuthLoading ? (
          <p className="empty-message">読み込み中…</p>
        ) : (
          <form className="share-target-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="share-title">タイトル</label>
              <input
                id="share-title"
                type="text"
                value={sharedData.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="share-url">URL</label>
              <input
                id="share-url"
                type="url"
                value={sharedData.url}
                onChange={(e) => handleUrlChange(e.target.value)}
                required
              />
            </div>

            {session ? (
              <div className="form-group">
                <label htmlFor="share-category">カテゴリ</label>
                {isLoadingCategories ? (
                  <p>カテゴリ読み込み中…</p>
                ) : (
                  <select
                    id="share-category"
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                  >
                    {selectableCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <div className="form-group">
                <label htmlFor="share-api-key">API キー</label>
                <input
                  id="share-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="拡張機能用 API キー"
                  required
                />
                <p className="form-hint">
                  ログイン中でない場合、拡張機能用 API キーが必要です。
                </p>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="share-comment">コメント</label>
              <textarea
                id="share-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="任意でコメントを入力"
              />
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="button-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? '登録中…' : 'クリップする'}
              </button>
            </div>

            {resultMessage && (
              <p className={`form-result ${resultMessage.includes('失敗') || resultMessage.includes('必要') ? 'error' : 'success'}`}>
                {resultMessage}
              </p>
            )}

            {!session && (
              <p className="form-hint">
                カテゴリを選択するには、ClipDesk にログインしてください。
              </p>
            )}
          </form>
        )}
      </main>
    </div>
  )
}
