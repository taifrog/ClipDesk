import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ClipGrid } from './components/ClipGrid'
import { CollectDialog } from './components/CollectDialog'
import { Header } from './components/Header'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { AuthPanel } from './components/AuthPanel'
import { initialCategories, initialClips } from './data/mock'
import { getSupabaseClient } from './lib/supabase'
import type { AiSummarySettings, Category, Clip, SortMode, SourceSite, UserApiKey } from './types'
import './App.css'

// AI要約設定のデフォルト値
const DEFAULT_AI_SUMMARY_SETTINGS: AiSummarySettings = {
  enabled: true,
  apiKey: '',
  model: 'gpt-4o-mini',
  language: 'ja',
}

// Supabase Edge Functions のベースパス
const FUNCTIONS_BASE = '/functions/v1'

// Supabase から返されるクリップの生データ（snake_case）をアプリ内の Clip 型に正規化する
function normalizeApiClip(raw: Record<string, unknown>): Clip {
  return {
    id: Number(raw.id),
    url: String(raw.url),
    title: String(raw.title),
    summary: String(raw.summary ?? ''),
    rawBody: String(raw.raw_body ?? ''),
    categoryId: String(raw.category_id ?? 'others'),
    isPinned: Boolean(raw.is_pinned),
    isChecked: Boolean(raw.is_checked),
    comment: String(raw.comment ?? ''),
    receivedAt: String(raw.received_at),
    deletedAt: raw.deleted_at ? String(raw.deleted_at) : null,
    checkedAt: raw.checked_at ? String(raw.checked_at) : null,
  }
}

// Supabase から返されるカテゴリの生データ（snake_case）をアプリ内の Category 型に正規化する
function normalizeApiCategory(raw: Record<string, unknown>): Category {
  return {
    id: String(raw.id),
    name: String(raw.name),
    icon: String(raw.icon ?? 'grid'),
  }
}

// Supabase から返される収集元サイトの生データ（snake_case）を SourceSite 型に正規化する
function normalizeApiSourceSite(raw: Record<string, unknown>): SourceSite {
  return {
    id: Number(raw.id),
    tag: String(raw.tag),
    siteUrl: String(raw.site_url),
    rssUrl: raw.rss_url ? String(raw.rss_url) : null,
    createdAt: String(raw.created_at),
  }
}

function App() {
  // 現在の認証セッション
  const [session, setSession] = useState<Session | null>(null)
  // 認証状態の初期確認中フラグ
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true)
  // クリップ一覧の状態（API取得前はモックを表示しておく）
  const [clips, setClips] = useState<Clip[]>(initialClips)
  // ゴミ箱のクリップ一覧の状態
  const [trashClips, setTrashClips] = useState<Clip[]>([])
  // カテゴリ一覧の状態
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  // 選択中のカテゴリID
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
  // ドラッグ中のクリップID
  const [draggingClipId, setDraggingClipId] = useState<number | null>(null)
  // データ読み込み中フラグ
  const [isLoading, setIsLoading] = useState<boolean>(false)
  // 検索クエリ
  const [searchQuery, setSearchQuery] = useState<string>('')
  // クリップ一覧の並び替えモード
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  // 収集元サイト一覧の状態
  const [sourceSites, setSourceSites] = useState<SourceSite[]>([])
  // AI要約設定の状態
  const [aiSummarySettings, setAiSummarySettings] = useState<AiSummarySettings>(DEFAULT_AI_SUMMARY_SETTINGS)
  // クリップ収集ダイアログの表示状態
  const [isCollectDialogOpen, setIsCollectDialogOpen] = useState<boolean>(false)
  // 設定ダイアログの表示状態
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState<boolean>(false)
  // 拡張機能用 API キー一覧の状態
  const [apiKeys, setApiKeys] = useState<UserApiKey[]>([])
  // API キー一覧読み込み中フラグ
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState<boolean>(false)
  // API キー一覧取得エラー
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  // 発行直後の平文 API キー
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)

  const supabase = getSupabaseClient()

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

  // 認証状態の初期化と変更監視
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

  // 収集元サイト一覧を取得する
  const fetchSourceSites = useCallback(async () => {
    if (!session) return
    try {
      const response = await fetch(`${FUNCTIONS_BASE}/source-sites`, {
        headers: getAuthHeaders(false),
      })
      if (!response.ok) {
        throw new Error(`収集元サイトの取得に失敗しました: ${response.status}`)
      }
      const data = await response.json()
      setSourceSites((data.sites || []).map(normalizeApiSourceSite))
    } catch (err) {
      console.error('収集元サイト取得失敗:', err)
    }
  }, [session, getAuthHeaders])

  // AI要約設定を取得する
  const fetchAiSummarySettings = useCallback(async () => {
    if (!session) return
    try {
      const response = await fetch(`${FUNCTIONS_BASE}/settings`, {
        headers: getAuthHeaders(false),
      })
      if (!response.ok) {
        throw new Error(`AI要約設定の取得に失敗しました: ${response.status}`)
      }
      const data = await response.json()
      const settings: AiSummarySettings = data.settings || DEFAULT_AI_SUMMARY_SETTINGS
      setAiSummarySettings({
        enabled: settings.enabled ?? DEFAULT_AI_SUMMARY_SETTINGS.enabled,
        apiKey: settings.apiKey ?? DEFAULT_AI_SUMMARY_SETTINGS.apiKey,
        model: settings.model || DEFAULT_AI_SUMMARY_SETTINGS.model,
        language: settings.language || DEFAULT_AI_SUMMARY_SETTINGS.language,
      })
    } catch (err) {
      console.error('AI要約設定取得失敗:', err)
    }
  }, [session, getAuthHeaders])

  // 拡張機能用 API キー一覧を取得する
  const fetchApiKeys = useCallback(async () => {
    if (!session) return
    setIsLoadingApiKeys(true)
    setApiKeyError(null)
    try {
      const response = await fetch(`${FUNCTIONS_BASE}/user-api-keys`, {
        headers: getAuthHeaders(false),
      })
      if (!response.ok) {
        throw new Error(`API キーの取得に失敗しました: ${response.status}`)
      }
      const data = await response.json()
      setApiKeys(
        (data.keys || []).map((raw: Record<string, unknown>): UserApiKey => ({
          id: Number(raw.id),
          label: String(raw.label ?? ''),
          createdAt: String(raw.created_at),
          lastUsedAt: raw.last_used_at ? String(raw.last_used_at) : null,
        })),
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'API キーの取得に失敗しました'
      setApiKeyError(message)
      console.error('API キー取得失敗:', err)
    } finally {
      setIsLoadingApiKeys(false)
    }
  }, [session, getAuthHeaders])

  // 拡張機能用 API キーを新規発行する
  const handleCreateApiKey = useCallback(
    async (label: string) => {
      if (!session) return
      const response = await fetch(`${FUNCTIONS_BASE}/user-api-keys`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ label }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'API キーの発行に失敗しました')
      }
      const data = await response.json()
      const rawKey = data.key?.rawKey
      if (rawKey) {
        setNewlyCreatedKey(String(rawKey))
      }
      await fetchApiKeys()
    },
    [session, getAuthHeaders, fetchApiKeys],
  )

  // 拡張機能用 API キーを削除する
  const handleDeleteApiKey = useCallback(
    async (id: number) => {
      if (!session) return
      const response = await fetch(`${FUNCTIONS_BASE}/user-api-keys/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(false),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'API キーの削除に失敗しました')
      }
      setApiKeys((prev) => prev.filter((key) => key.id !== id))
    },
    [session, getAuthHeaders],
  )

  // 発行直後の API キー表示をクリアする
  const handleClearNewlyCreatedKey = useCallback(() => {
    setNewlyCreatedKey(null)
  }, [])

  // Edge Functions からカテゴリとクリップを取得する
  const fetchData = useCallback(
    async (showLoading = false) => {
      if (!session) return
      if (showLoading) setIsLoading(true)
      try {
        // AI要約設定も合わせて取得する
        await fetchAiSummarySettings()

        // カテゴリを取得する
        const categoryResponse = await fetch(`${FUNCTIONS_BASE}/categories`, {
          headers: getAuthHeaders(false),
        })
        if (!categoryResponse.ok) {
          throw new Error(`カテゴリの取得に失敗しました: ${categoryResponse.status}`)
        }
        const categoryData = await categoryResponse.json()
        const apiCategories: Category[] = (categoryData.categories || []).map(normalizeApiCategory)
        setCategories(apiCategories)

        // クリップを取得する
        const clipResponse = await fetch(`${FUNCTIONS_BASE}/clips`, {
          headers: getAuthHeaders(false),
        })
        if (!clipResponse.ok) {
          throw new Error(`クリップの取得に失敗しました: ${clipResponse.status}`)
        }
        const clipData = await clipResponse.json()
        const apiClips: Clip[] = (clipData.clips || []).map(normalizeApiClip)
        setClips(apiClips)

        // ゴミ箱のクリップを取得する
        const trashResponse = await fetch(`${FUNCTIONS_BASE}/clips?trash=true`, {
          headers: getAuthHeaders(false),
        })
        if (!trashResponse.ok) {
          throw new Error(`ゴミ箱の取得に失敗しました: ${trashResponse.status}`)
        }
        const trashData = await trashResponse.json()
        const apiTrashClips: Clip[] = (trashData.clips || []).map(normalizeApiClip)
        setTrashClips(apiTrashClips)

        // 収集元サイトも合わせて取得する
        await fetchSourceSites()
      } catch (err) {
        console.error('データ取得失敗:', err)
        // 取得失敗時はモックデータのままにせず、空の状態にしてエラーを分かりやすくする
        setClips([])
        setTrashClips([])
        setCategories(initialCategories)
      } finally {
        if (showLoading) setIsLoading(false)
      }
    },
    [session, getAuthHeaders, fetchAiSummarySettings, fetchSourceSites],
  )

  // 認証後またはセッション変更時にデータを取得する
  useEffect(() => {
    if (session) {
      fetchData(true)
    }
  }, [session, fetchData])

  // 定期的に最新のクリップ一覧を取得する（拡張機能からの投稿を反映するため）
  useEffect(() => {
    if (!session) return
    const intervalId = window.setInterval(() => {
      fetchData(false)
    }, 5000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [session, fetchData])

  // 選択中カテゴリの名称を取得
  const selectedCategoryName = useMemo(() => {
    if (selectedCategoryId === 'trash') return 'ゴミ箱'
    const found = categories.find((cat) => cat.id === selectedCategoryId)
    return found?.name ?? 'すべてのクリップ'
  }, [categories, selectedCategoryId])

  // 2つのクリップの受信日時を比較する（新しい順）
  const compareReceivedAtDesc = (a: Clip, b: Clip) => {
    return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  }

  // 2つのクリップの受信日時を比較する（古い順）
  const compareReceivedAtAsc = (a: Clip, b: Clip) => {
    return new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
  }

  // 表示対象のクリップ一覧（通常 or ゴミ箱）
  // 並び替えモードに応じてソートする（ゴミ箱は常に削除日時降順）
  const displayClips = useMemo(() => {
    if (selectedCategoryId === 'trash') return trashClips

    let filtered = clips
    if (selectedCategoryId !== 'all') {
      filtered = clips.filter((clip) => clip.categoryId === selectedCategoryId)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (clip) =>
          clip.title.toLowerCase().includes(query) ||
          clip.summary.toLowerCase().includes(query),
      )
    }

    // カテゴリ別モード以外は受信日時でソート
    if (sortMode === 'newest') {
      return [...filtered].sort(compareReceivedAtDesc)
    }
    if (sortMode === 'oldest') {
      return [...filtered].sort(compareReceivedAtAsc)
    }
    return filtered
  }, [clips, trashClips, selectedCategoryId, searchQuery, sortMode])

  // 上段に表示するピン留めクリップ（最大4件）
  // カテゴリ別モード時はピン留めも各カテゴリに含めるため使用しない
  const pinnedClips = useMemo(() => {
    if (sortMode === 'category') return []
    return displayClips.filter((clip) => clip.isPinned).slice(0, 4)
  }, [displayClips, sortMode])

  // 下段に表示する通常クリップ（最大16件）
  // カテゴリ別モード時はピン留めも各カテゴリに含めるため使用しない
  const normalClips = useMemo(() => {
    if (sortMode === 'category') return []
    return displayClips.filter((clip) => !clip.isPinned).slice(0, 16)
  }, [displayClips, sortMode])

  // カテゴリ別モードで表示するカテゴリごとのクリップグループ
  const categoryGroups = useMemo(() => {
    if (sortMode !== 'category' || selectedCategoryId === 'trash') return []

    // すべて/ゴミ箱以外のカテゴリを表示順（sortOrder相当）に並べる
    const visibleCategories = categories.filter((cat) => cat.id !== 'all' && cat.id !== 'trash')

    return visibleCategories
      .map((category) => {
        const categoryClips = displayClips
          .filter((clip) => clip.categoryId === category.id)
          .sort(compareReceivedAtDesc)
          .slice(0, 16)
        return { category, clips: categoryClips }
      })
      .filter((group) => group.clips.length > 0)
  }, [categories, displayClips, selectedCategoryId, sortMode])

  // カテゴリ選択時の処理
  const handleSelectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId)
  }

  // 検索クエリ変更時の処理
  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
  }

  // 並び替えモード変更時の処理
  const handleSortChange = (mode: SortMode) => {
    setSortMode(mode)
  }

  // クリップ情報を Edge Functions 経由で更新する
  // 成功したらローカル状態も同期する
  const updateClip = async (id: number, updates: Partial<Pick<Clip, 'categoryId' | 'isPinned' | 'isChecked' | 'comment'>>) => {
    try {
      const response = await fetch(`${FUNCTIONS_BASE}/clips/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates),
      })
      if (!response.ok) {
        throw new Error('クリップの更新に失敗しました')
      }
      const data = await response.json()
      const updatedClip = normalizeApiClip(data.clip as Record<string, unknown>)
      setClips((prev) =>
        prev.map((clip) => (clip.id === id ? updatedClip : clip)),
      )
      return true
    } catch (err) {
      console.error('クリップ更新失敗:', err)
      return false
    }
  }

  // クリップをカテゴリ（またはゴミ箱）にドロップしたときの処理
  const handleDropToCategory = async (categoryId: string) => {
    if (draggingClipId === null) return

    if (categoryId === 'trash') {
      // ゴミ箱へ移動
      try {
        const response = await fetch(`${FUNCTIONS_BASE}/clips/${draggingClipId}/trash`, {
          method: 'PATCH',
          headers: getAuthHeaders(false),
        })
        if (!response.ok) {
          throw new Error('ゴミ箱への移動に失敗しました')
        }
        const movedClip = clips.find((c) => c.id === draggingClipId)
        if (movedClip) {
          setClips((prev) => prev.filter((clip) => clip.id !== draggingClipId))
          setTrashClips((prev) => [{ ...movedClip, deletedAt: new Date().toISOString() }, ...prev])
        }
        setDraggingClipId(null)
      } catch (err) {
        console.error('ゴミ箱移動失敗:', err)
      }
      return
    }

    const success = await updateClip(draggingClipId, { categoryId })
    if (success) {
      setDraggingClipId(null)
    }
  }

  // ゴミ箱からクリップを復元する
  const handleRestoreClip = async (id: number) => {
    try {
      const response = await fetch(`${FUNCTIONS_BASE}/clips/${id}/restore`, {
        method: 'PATCH',
        headers: getAuthHeaders(false),
      })
      if (!response.ok) {
        throw new Error('クリップの復元に失敗しました')
      }
      const restoredClip = trashClips.find((c) => c.id === id)
      if (restoredClip) {
        setTrashClips((prev) => prev.filter((clip) => clip.id !== id))
        setClips((prev) => [restoredClip, ...prev])
      }
    } catch (err) {
      console.error('クリップ復元失敗:', err)
    }
  }

  // ピン留め切り替え時の処理
  const handleTogglePin = async (id: number) => {
    const clip = clips.find((c) => c.id === id)
    if (!clip) return
    await updateClip(id, { isPinned: !clip.isPinned })
  }

  // 確認済みチェックマーク切り替え時の処理
  const handleToggleCheck = async (id: number) => {
    const clip = clips.find((c) => c.id === id)
    if (!clip) return
    await updateClip(id, { isChecked: !clip.isChecked })
  }

  // コメント更新時の処理
  const handleUpdateComment = async (id: number, comment: string) => {
    await updateClip(id, { comment })
  }

  // カテゴリ追加時の処理（簡易的にプロンプト入力）
  const handleAddCategory = async () => {
    const name = window.prompt('新しいカテゴリ名を入力してください')
    if (!name || name.trim() === '') return

    const newCategory: Category = {
      id: `cat-${Date.now()}`,
      name: name.trim(),
      icon: 'grid',
    }

    try {
      const response = await fetch(`${FUNCTIONS_BASE}/categories`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newCategory),
      })
      if (!response.ok) {
        throw new Error('カテゴリの追加に失敗しました')
      }
      const data = await response.json()
      setCategories((prev) => [...prev, normalizeApiCategory(data.category as Record<string, unknown>)])
    } catch (err) {
      console.error('カテゴリ追加失敗:', err)
    }
  }

  // カテゴリ名変更時の処理（簡易的にプロンプト入力）
  const handleRenameCategory = async (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId)
    if (!category) return

    const newName = window.prompt('カテゴリ名を変更してください', category.name)
    if (!newName || newName.trim() === '') return
    const trimmedName = newName.trim()
    if (trimmedName === category.name) return

    try {
      const response = await fetch(`${FUNCTIONS_BASE}/categories/${categoryId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: trimmedName }),
      })
      if (!response.ok) {
        throw new Error('カテゴリ名の変更に失敗しました')
      }
      const data = await response.json()
      const updatedCategory = normalizeApiCategory(data.category as Record<string, unknown>)
      setCategories((prev) =>
        prev.map((cat) => (cat.id === categoryId ? updatedCategory : cat)),
      )
    } catch (err) {
      console.error('カテゴリ名変更失敗:', err)
    }
  }

  // クリップ収集ボタン押下時の処理
  const handleOpenCollectDialog = () => {
    setIsCollectDialogOpen(true)
  }

  // クリップ収集実行時の処理
  const handleCollectClips = async (params: { tag?: string; keyword?: string; count: number }) => {
    const response = await fetch(`${FUNCTIONS_BASE}/collect`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || 'クリップの収集に失敗しました')
    }
    // 収集後は一覧を更新する
    await fetchData(false)
  }

  // 掃除：チェック済み・ピン留めなしのクリップをゴミ箱に移動する
  const handleCleanupClips = async () => {
    const targets = clips.filter((clip) => clip.isChecked && !clip.isPinned)
    if (targets.length === 0) return

    const confirmed = window.confirm(
      `チェック済みのクリップ ${targets.length}件をゴミ箱に移動しますか？`,
    )
    if (!confirmed) return

    try {
      await Promise.all(
        targets.map((clip) =>
          fetch(`${FUNCTIONS_BASE}/clips/${clip.id}/trash`, {
            method: 'PATCH',
            headers: getAuthHeaders(false),
          }),
        ),
      )
      await fetchData(false)
    } catch (err) {
      console.error('掃除失敗:', err)
    }
  }

  // 掃除対象のクリップ件数
  const cleanupCount = useMemo(
    () => clips.filter((clip) => clip.isChecked && !clip.isPinned).length,
    [clips],
  )

  // 設定ボタン押下時の処理
  const handleOpenSettings = () => {
    setIsSettingsDialogOpen(true)
  }

  // AI要約設定保存時の処理
  const handleSaveAiSummarySettings = async (settings: AiSummarySettings) => {
    const response = await fetch(`${FUNCTIONS_BASE}/settings`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        aiSummaryEnabled: settings.enabled,
        aiSummaryApiKey: settings.apiKey,
        aiSummaryModel: settings.model,
        aiSummaryLanguage: settings.language,
      }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || 'AI要約設定の保存に失敗しました')
    }
    const data = await response.json()
    const saved: AiSummarySettings = data.settings || settings
    setAiSummarySettings({
      enabled: saved.enabled ?? settings.enabled,
      apiKey: saved.apiKey ?? settings.apiKey,
      model: saved.model || settings.model,
      language: saved.language || settings.language,
    })
  }

  // 収集元サイト追加時の処理
  const handleAddSourceSite = async (site: { tag: string; siteUrl: string }) => {
    const response = await fetch(`${FUNCTIONS_BASE}/source-sites`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(site),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || 'サイトの追加に失敗しました')
    }
    await fetchSourceSites()
  }

  // 収集元サイト削除時の処理
  const handleDeleteSourceSite = async (id: number) => {
    const response = await fetch(`${FUNCTIONS_BASE}/source-sites/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(false),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || 'サイトの削除に失敗しました')
    }
    setSourceSites((prev) => prev.filter((site) => site.id !== id))
  }

  // カテゴリ削除時の処理
  // 削除前に確認ダイアログを表示し、関連クリップは others に移動される
  const handleDeleteCategory = async (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId)
    if (!category) return

    if (categoryId === 'all' || categoryId === 'others') return

    const confirmed = window.confirm(
      `「${category.name}」を削除しますか？\nこのカテゴリに属するクリップは「その他」に移動されます。`,
    )
    if (!confirmed) return

    try {
      const response = await fetch(`${FUNCTIONS_BASE}/categories/${categoryId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(false),
      })
      if (!response.ok) {
        throw new Error('カテゴリの削除に失敗しました')
      }
      setCategories((prev) => prev.filter((cat) => cat.id !== categoryId))
      // 関連クリップを others に移動する
      setClips((prev) =>
        prev.map((clip) =>
          clip.categoryId === categoryId
            ? { ...clip, categoryId: 'others' }
            : clip,
        ),
      )
      // 選択中のカテゴリが削除された場合は「すべてのクリップ」に戻す
      if (selectedCategoryId === categoryId) {
        setSelectedCategoryId('all')
      }
    } catch (err) {
      console.error('カテゴリ削除失敗:', err)
    }
  }

  // ログアウト処理
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      // 状態をリセットする
      setClips(initialClips)
      setTrashClips([])
      setCategories(initialCategories)
      setSourceSites([])
      setSelectedCategoryId('all')
      setSearchQuery('')
    } catch (err) {
      console.error('ログアウト失敗:', err)
    }
  }

  // ドラッグ開始時の処理
  const handleDragStart = (clipId: number) => {
    setDraggingClipId(clipId)
  }

  // ドラッグ終了時の処理
  const handleDragEnd = () => {
    setDraggingClipId(null)
  }

  // 未認証時はログイン画面を表示する
  if (isAuthLoading) {
    return (
      <div className="app-layout auth-loading">
        <p>認証状態を確認中…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="app-layout auth-layout">
        <AuthPanel onAuthChange={() => fetchData(true)} />
      </div>
    )
  }

  return (
    <div className="app-layout">
      <Sidebar
        categories={categories}
        clips={clips}
        selectedCategoryId={selectedCategoryId}
        draggingClipId={draggingClipId}
        trashCount={trashClips.length}
        cleanupCount={cleanupCount}
        onSelectCategory={handleSelectCategory}
        onDropToCategory={handleDropToCategory}
        onAddCategory={handleAddCategory}
        onCollectClips={handleOpenCollectDialog}
        onCleanupClips={handleCleanupClips}
        onOpenSettings={handleOpenSettings}
        onRenameCategory={handleRenameCategory}
        onDeleteCategory={handleDeleteCategory}
      />

      <CollectDialog
        isOpen={isCollectDialogOpen}
        sourceSites={sourceSites}
        onClose={() => setIsCollectDialogOpen(false)}
        onCollect={handleCollectClips}
      />

      <SettingsDialog
        isOpen={isSettingsDialogOpen}
        sourceSites={sourceSites}
        aiSummarySettings={aiSummarySettings}
        apiKeys={apiKeys}
        isLoadingApiKeys={isLoadingApiKeys}
        apiKeyError={apiKeyError}
        newlyCreatedKey={newlyCreatedKey}
        onClose={() => setIsSettingsDialogOpen(false)}
        onAddSourceSite={handleAddSourceSite}
        onDeleteSourceSite={handleDeleteSourceSite}
        onSaveAiSummarySettings={handleSaveAiSummarySettings}
        onFetchApiKeys={fetchApiKeys}
        onCreateApiKey={handleCreateApiKey}
        onDeleteApiKey={handleDeleteApiKey}
        onClearNewlyCreatedKey={handleClearNewlyCreatedKey}
      />

      <main className="main-content">
        <Header
          title={selectedCategoryName}
          count={displayClips.length}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          sortMode={sortMode}
          onSortChange={handleSortChange}
        />

        <div className="clip-content">
          {isLoading && clips.length === 0 ? (
            <p className="empty-message">読み込み中…</p>
          ) : displayClips.length === 0 ? (
            <p className="empty-message">
              {selectedCategoryId === 'trash'
                ? 'ゴミ箱は空です。'
                : 'このカテゴリにはクリップがありません。'}
            </p>
          ) : sortMode === 'category' && selectedCategoryId !== 'trash' ? (
            // カテゴリ別モード：カテゴリごとにグループ化して表示
            categoryGroups.map(({ category, clips: groupClips }) => (
              <ClipGrid
                key={category.id}
                title={category.name}
                clips={groupClips}
                categories={categories}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onTogglePin={handleTogglePin}
                onToggleCheck={handleToggleCheck}
                onUpdateComment={handleUpdateComment}
              />
            ))
          ) : (
            <>
              <ClipGrid
                title="ピン留め"
                clips={pinnedClips}
                categories={categories}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onTogglePin={handleTogglePin}
                onToggleCheck={handleToggleCheck}
                onUpdateComment={handleUpdateComment}
              />
              <ClipGrid
                title={selectedCategoryId === 'trash' ? 'ゴミ箱' : 'クリップ'}
                clips={normalClips}
                categories={categories}
                isTrash={selectedCategoryId === 'trash'}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onTogglePin={handleTogglePin}
                onToggleCheck={handleToggleCheck}
                onUpdateComment={handleUpdateComment}
                onRestore={handleRestoreClip}
              />
            </>
          )}
        </div>

        {/* ログアウトボタン */}
        <div className="logout-area">
          <button type="button" className="button-secondary" onClick={handleLogout}>
            ログアウト
          </button>
        </div>
      </main>
    </div>
  )
}

export default App
