// ヘッダーコンポーネント
// メインエリア上部に表示されるタイトル、検索、ビュー切り替え、並び替えを提供する

import { useEffect, useRef, useState } from 'react'
import type { Category, SortMode, ViewMode } from '../types'

interface HeaderProps {
  title: string
  count: number
  searchQuery: string
  onSearchChange: (query: string) => void
  sortMode: SortMode
  onSortChange: (mode: SortMode) => void
  viewMode: ViewMode
  onViewChange: (mode: ViewMode) => void
  categories: Category[]
  selectedCategoryId: string
  onSelectCategory: (categoryId: string) => void
  isMobile: boolean
}

// 並び替えモードの表示ラベル
const SORT_LABELS: Record<SortMode, string> = {
  newest: '新しい順',
  oldest: '古い順',
  category: 'カテゴリ別',
}

// 並び替えの選択肢一覧
const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'newest', label: '新しい順' },
  { value: 'oldest', label: '古い順' },
  { value: 'category', label: 'カテゴリ別' },
]

// 小さなアイコンを SVG で定義
function SmallIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    search:
      'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    grid: 'M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z',
    list: 'M3 5h18v2H3V5zm0 6h18v2H3v-11zm0 6h18v2H3v-2z',
    chevron: 'M7 10l5 5 5-5H7z',
    check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z',
  }

  return (
    <svg className="header-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name] || paths.search} />
    </svg>
  )
}

export function Header({
  title,
  count,
  searchQuery,
  onSearchChange,
  sortMode,
  onSortChange,
  viewMode,
  onViewChange,
  categories,
  selectedCategoryId,
  onSelectCategory,
  isMobile,
}: HeaderProps) {
  // 並び替えドロップダウンの開閉状態
  const [isSortOpen, setIsSortOpen] = useState(false)
  // ドロップダウンのDOM参照（外側クリック判定用）
  const sortRef = useRef<HTMLDivElement>(null)

  // ドロップダウン外をクリックしたら閉じる
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
        setIsSortOpen(false)
      }
    }

    if (isSortOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isSortOpen])

  // 並び替えモードを変更する
  const handleSelectSort = (mode: SortMode) => {
    onSortChange(mode)
    setIsSortOpen(false)
  }

  // カテゴリ選択用の論理カテゴリも含めた選択肢を作成する
  const categoryOptions = [
    { id: 'today', name: '新規クリップ' },
    { id: 'others', name: '未分類' },
    ...categories.filter((cat) => cat.id !== 'others'),
    { id: 'trash', name: 'ゴミ箱' },
  ]

  return (
    <header className="main-header">
      <div className="header-title-area">
        {isMobile && (
          <div className="header-category-select">
            <select
              aria-label="カテゴリを選択"
              value={selectedCategoryId}
              onChange={(e) => onSelectCategory(e.target.value)}
            >
              {categoryOptions.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <h2 className="header-title">{title}</h2>
        <span className="header-count">{count}件のクリップ</span>
      </div>

      <div className="header-actions">
        {/* 検索欄 */}
        <div className="search-box">
          <SmallIcon name="search" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="クリップを検索..."
            aria-label="クリップを検索"
          />
        </div>

        {/* ビュー切り替え */}
        <div className="view-toggle">
          <button
            type="button"
            className={`view-button ${viewMode === 'grid' ? 'active' : ''}`}
            aria-label="グリッド表示"
            onClick={() => onViewChange('grid')}
          >
            <SmallIcon name="grid" />
          </button>
          <button
            type="button"
            className={`view-button ${viewMode === 'list' ? 'active' : ''}`}
            aria-label="リスト表示"
            onClick={() => onViewChange('list')}
          >
            <SmallIcon name="list" />
          </button>
        </div>

        {/* 並び替えドロップダウン */}
        <div className="sort-dropdown" ref={sortRef}>
          <button
            type="button"
            className="sort-dropdown-button"
            onClick={() => setIsSortOpen((prev) => !prev)}
            aria-haspopup="listbox"
            aria-expanded={isSortOpen}
            aria-label="並び替えを選択"
          >
            <span>{SORT_LABELS[sortMode]}</span>
            <SmallIcon name="chevron" />
          </button>

          {isSortOpen && (
            <ul className="sort-dropdown-menu" role="listbox" aria-label="並び替えオプション">
              {SORT_OPTIONS.map((option) => (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    className={`sort-dropdown-item ${sortMode === option.value ? 'active' : ''}`}
                    role="option"
                    aria-selected={sortMode === option.value}
                    onClick={() => handleSelectSort(option.value)}
                  >
                    <span className="sort-dropdown-item-label">{option.label}</span>
                    {sortMode === option.value && (
                      <span className="sort-dropdown-item-check">
                        <SmallIcon name="check" />
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </header>
  )
}
