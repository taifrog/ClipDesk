import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipGrid } from './components/ClipGrid'
import { CollectDialog } from './components/CollectDialog'
import { Header } from './components/Header'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { initialCategories, initialClips } from './data/mock'
import type { AiSummarySettings, Category, Clip, SourceSite } from './types'
import './App.css'

// AI要約設定のデフォルト値
const DEFAULT_AI_SUMMARY_SETTINGS: AiSummarySettings = {
  enabled: true,
  apiKey: '',
  model: 'gpt-4o-mini',
  language: 'ja',
}

// APIから返されるクリップの生データをアプリ内のClip型に正規化する
// categoryId / isPinned / comment がサーバー側で管理されているため、そのまま利用する
function normalizeApiClip(raw: {
  id: number
  url: string
  title: string
  summary: string
  rawBody?: string
  categoryId?: string
  isPinned?: boolean | number
  isChecked?: boolean | number
  comment?: string
  receivedAt: string
  deletedAt?: string | null
  checkedAt?: string | null
}): Clip {
  return {
    id: raw.id,
    url: raw.url,
    title: raw.title,
    summary: raw.summary,
    rawBody: raw.rawBody ?? '',
    categoryId: raw.categoryId ?? 'others',
    isPinned: typeof raw.isPinned === 'boolean' ? raw.isPinned : raw.isPinned === 1,
    isChecked: typeof raw.isChecked === 'boolean' ? raw.isChecked : raw.isChecked === 1,
    comment: raw.comment ?? '',
    receivedAt: raw.receivedAt,
    deletedAt: raw.deletedAt ?? null,
    checkedAt: raw.checkedAt ?? null,
  }
}

// APIから返されるカテゴリの生データをアプリ内のCategory型に正規化する
function normalizeApiCategory(raw: {
  id: string
  name: string
  icon?: string
}): Category {
  return {
    id: raw.id,
    name: raw.name,
    icon: raw.icon ?? 'grid',
  }
}

function App() {
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
  // 収集元サイト一覧の状態
  const [sourceSites, setSourceSites] = useState<SourceSite[]>([])
  // AI要約設定の状態
  const [aiSummarySettings, setAiSummarySettings] = useState<AiSummarySettings>(DEFAULT_AI_SUMMARY_SETTINGS)
  // クリップ収集ダイアログの表示状態
  const [isCollectDialogOpen, setIsCollectDialogOpen] = useState<boolean>(false)
  // 設定ダイアログの表示状態
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState<boolean>(false)

  // 収集元サイト一覧を取得する
  const fetchSourceSites = useCallback(async () => {
    try {
      const response = await fetch('/api/source-site')
      if (!response.ok) {
        throw new Error(`収集元サイトの取得に失敗しました: ${response.status}`)
      }
      const data = await response.json()
      setSourceSites(data.sites || [])
    } catch (err) {
      console.error('収集元サイト取得失敗:', err)
    }
  }, [])

  // AI要約設定を取得する
  const fetchAiSummarySettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings')
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
  }, [])

  // API からカテゴリとクリップを取得する
  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true)
    try {
      // AI要約設定も合わせて取得する
      await fetchAiSummarySettings()

      // カテゴリを取得する
      const categoryResponse = await fetch('/api/category')
      if (!categoryResponse.ok) {
        throw new Error(`カテゴリの取得に失敗しました: ${categoryResponse.status}`)
      }
      const categoryData = await categoryResponse.json()
      const apiCategories: Category[] = (categoryData.categories || []).map(normalizeApiCategory)
      setCategories(apiCategories)

      // クリップを取得する
      const clipResponse = await fetch('/api/clip')
      if (!clipResponse.ok) {
        throw new Error(`クリップの取得に失敗しました: ${clipResponse.status}`)
      }
      const clipData = await clipResponse.json()
      const apiClips: Clip[] = (clipData.clips || []).map(normalizeApiClip)
      setClips(apiClips)

      // ゴミ箱のクリップを取得する
      const trashResponse = await fetch('/api/clip/trash')
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
  }, [fetchSourceSites, fetchAiSummarySettings])

  // 初回表示時にデータを取得する
  useEffect(() => {
    fetchData(true)
  }, [fetchData])

  // 定期的に最新のクリップ一覧を取得する（拡張機能からの投稿を反映するため）
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      fetchData(false)
    }, 5000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [fetchData])

  // 選択中カテゴリの名称を取得
  const selectedCategoryName = useMemo(() => {
    if (selectedCategoryId === 'trash') return 'ゴミ箱'
    const found = categories.find((cat) => cat.id === selectedCategoryId)
    return found?.name ?? 'すべてのクリップ'
  }, [categories, selectedCategoryId])

  // 表示対象のクリップ一覧（通常 or ゴミ箱）
  const displayClips = useMemo(() => {
    if (selectedCategoryId === 'trash') return trashClips

    let filtered = clips
    if (selectedCategoryId !== 'all') {
      filtered = clips.filter((clip) => clip.categoryId === selectedCategoryId)
    }

    if (!searchQuery.trim()) return filtered
    const query = searchQuery.toLowerCase()
    return filtered.filter(
      (clip) =>
        clip.title.toLowerCase().includes(query) ||
        clip.summary.toLowerCase().includes(query),
    )
  }, [clips, trashClips, selectedCategoryId, searchQuery])

  // 上段に表示するピン留めクリップ（最大4件）
  const pinnedClips = useMemo(() => {
    return displayClips.filter((clip) => clip.isPinned).slice(0, 4)
  }, [displayClips])

  // 下段に表示する通常クリップ（最大16件）
  const normalClips = useMemo(() => {
    return displayClips.filter((clip) => !clip.isPinned).slice(0, 16)
  }, [displayClips])

  // カテゴリ選択時の処理
  const handleSelectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId)
  }

  // 検索クエリ変更時の処理
  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
  }

  // クリップ情報を API 経由で更新する
  // 成功したらローカル状態も同期する
  const updateClip = async (id: number, updates: Partial<Pick<Clip, 'categoryId' | 'isPinned' | 'isChecked' | 'comment'>>) => {
    try {
      const response = await fetch(`/api/clip/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!response.ok) {
        throw new Error('クリップの更新に失敗しました')
      }
      const data = await response.json()
      const updatedClip = normalizeApiClip(data.clip)
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
        const response = await fetch(`/api/clip/${draggingClipId}/trash`, {
          method: 'PATCH',
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
      const response = await fetch(`/api/clip/${id}/restore`, {
        method: 'PATCH',
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
      const response = await fetch('/api/category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCategory),
      })
      if (!response.ok) {
        throw new Error('カテゴリの追加に失敗しました')
      }
      const data = await response.json()
      setCategories((prev) => [...prev, normalizeApiCategory(data.category)])
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
      const response = await fetch(`/api/category/${categoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      })
      if (!response.ok) {
        throw new Error('カテゴリ名の変更に失敗しました')
      }
      const data = await response.json()
      const updatedCategory = normalizeApiCategory(data.category)
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
    const response = await fetch('/api/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
          fetch(`/api/clip/${clip.id}/trash`, { method: 'PATCH' }),
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
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const response = await fetch('/api/source-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const response = await fetch(`/api/source-site/${id}`, { method: 'DELETE' })
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
      const response = await fetch(`/api/category/${categoryId}`, {
        method: 'DELETE',
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

  // ドラッグ開始時の処理
  const handleDragStart = (clipId: number) => {
    setDraggingClipId(clipId)
  }

  // ドラッグ終了時の処理
  const handleDragEnd = () => {
    setDraggingClipId(null)
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
        onClose={() => setIsSettingsDialogOpen(false)}
        onAddSourceSite={handleAddSourceSite}
        onDeleteSourceSite={handleDeleteSourceSite}
        onSaveAiSummarySettings={handleSaveAiSummarySettings}
      />

      <main className="main-content">
        <Header
          title={selectedCategoryName}
          count={displayClips.length}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
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
      </main>
    </div>
  )
}

export default App
