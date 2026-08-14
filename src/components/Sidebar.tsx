import { useState } from 'react'
import type { Category, Clip } from '../types'

// Sidebar コンポーネントのプロパティ
interface SidebarProps {
  categories: Category[]
  clips: Clip[]
  selectedCategoryId: string
  draggingClipId: number | null
  trashCount: number
  cleanupCount: number
  todayCount: number
  onSelectCategory: (categoryId: string) => void
  onDropToCategory: (categoryId: string) => void
  onAddCategory: () => void
  onCollectClips: () => void
  onCleanupClips: () => void
  onOpenSettings: () => void
  onRenameCategory?: (categoryId: string) => void
  onDeleteCategory?: (categoryId: string) => void
}

// アイコン名から SVG アイコン要素を生成する
function Icon({ name }: { name: string }) {
  // 各アイコンを path の d 属性で定義
  const paths: Record<string, string> = {
    inbox: 'M22 12h-6l-2 3h-6l-2-3H2v8h20v-8zM2 10V6h6l2-3h4l2 3h6v4H2z',
    palette:
      'M12 3a9 9 0 0 0 0 18 1.5 1.5 0 0 0 1.5-1.5c0-.39-.15-.74-.39-1.02-.23-.27-.36-.62-.36-1.02a1.5 1.5 0 0 1 1.5-1.5H16a5 5 0 0 0 5-5c0-4.42-4.03-8-9-8zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
    cpu: 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v12h12V6H6zm2 2h8v8H8V8z',
    'trending-up': 'M3 17h4l4-7 4 3 6-9v4h2V3h-8v2h4l-5 7-4-3L3 17z',
    briefcase:
      'M10 2h4a2 2 0 0 1 2 2v2h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3V4a2 2 0 0 1 2-2zm4 4V4h-4v2h4z',
    coffee:
      'M4 4h14v10a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V4zm16 2h-2v4h2a2 2 0 0 0 0-4zM6 20h12v2H6v-2z',
    'book-open':
      'M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z',
    globe:
      'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
    grid: 'M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z',
    settings:
      'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84a.484.484 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.488.488 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.27.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
    plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    pin: 'M16 12V4h1V2H7v2h1v8l-3 3v2h5v6h2v-6h5v-2l-3-3z',
    broom: 'M19.36 2.64l1.41 1.41-5.66 5.66c.56.83.89 1.83.89 2.9 0 1.38-.56 2.63-1.46 3.54l-1.42-1.42c.56-.56.89-1.33.89-2.12 0-.79-.32-1.56-.88-2.12L19.36 2.64M15.06 9.94l-7.07 7.07L5.64 15.71l7.07-7.07 2.35 2.3zm-6.36 9.36L3 22l-1-1 5.64-5.64 1.42 1.42-.36.36z',
    trash: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4h-3.5z',
  }

  const d = paths[name] || paths.inbox
  return (
    <svg className="sidebar-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

// 右クリックで表示するカテゴリ操作メニューコンポーネント
// all / others は操作対象外とする
function CategoryContextMenu({
  category,
  onRename,
  onDelete,
}: {
  category: Category
  onRename?: (categoryId: string) => void
  onDelete?: (categoryId: string) => void
}) {
  if (category.id === 'all' || category.id === 'others') return null
  if (!onRename && !onDelete) return null

  return (
    <ul className="category-context-menu" role="menu">
      {onRename && (
        <li role="none">
          <button
            type="button"
            className="category-context-menu-item"
            role="menuitem"
            onClick={() => onRename(category.id)}
          >
            名前を変更
          </button>
        </li>
      )}
      {onDelete && (
        <li role="none">
          <button
            type="button"
            className="category-context-menu-item delete"
            role="menuitem"
            onClick={() => onDelete(category.id)}
          >
            削除
          </button>
        </li>
      )}
    </ul>
  )
}

// サイドバーコンポーネント
export function Sidebar({
  categories,
  clips,
  selectedCategoryId,
  draggingClipId,
  trashCount,
  cleanupCount,
  todayCount,
  onSelectCategory,
  onDropToCategory,
  onAddCategory,
  onCollectClips,
  onCleanupClips,
  onOpenSettings,
  onRenameCategory,
  onDeleteCategory,
}: SidebarProps) {
  // カテゴリごとのクリップ件数をカウントする
  const getCount = (categoryId: string) => {
    if (categoryId === 'all') return clips.length
    return clips.filter((clip) => clip.categoryId === categoryId).length
  }

  // すべてのクリップ / ゴミ箱 / カテゴリを分離する
  // all / others は含まれていなくても必ず表示できるようデフォルト値を用意する
  const allCategory = categories.find((c) => c.id === 'all') ?? { id: 'all', name: 'すべてのクリップ', icon: 'inbox' }
  const normalCategories = categories.filter((c) => c.id !== 'all')

  // 表示中のコンテキストメニュー情報
  const [contextMenu, setContextMenu] = useState<{
    categoryId: string
    x: number
    y: number
  } | null>(null)

  // カテゴリアイテムで右クリックしたときの処理
  const handleContextMenu = (
    e: React.MouseEvent<HTMLButtonElement>,
    category: Category,
  ) => {
    // all / others や操作ハンドラがない場合はブラウザのデフォルトメニューを表示する
    if (
      category.id === 'all' ||
      category.id === 'others' ||
      (!onRenameCategory && !onDeleteCategory)
    ) {
      return
    }
    e.preventDefault()
    setContextMenu({ categoryId: category.id, x: e.clientX, y: e.clientY })
  }

  // メニューを閉じる処理
  const closeContextMenu = () => setContextMenu(null)

  const contextCategory = contextMenu
    ? categories.find((c) => c.id === contextMenu.categoryId)
    : undefined

  const isTrashActive = selectedCategoryId === 'trash'
  const isTrashDragTarget = draggingClipId !== null

  return (
    <aside className="sidebar" onClick={closeContextMenu}>
      {/* ロゴとタイトル */}
      <div className="sidebar-header">
        <svg className="sidebar-logo" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l4.59-4.58L18 11l-6 6z" />
        </svg>
        <h1 className="sidebar-title">ClipDesk</h1>
      </div>

      {/* クリップ収集ボタン */}
      <button type="button" className="add-clip-button" onClick={onCollectClips}>
        <Icon name="plus" />
        <span>クリップ収集</span>
      </button>

      {/* 掃除ボタン：チェック済み・ピン留めなしのクリップをゴミ箱へ移動する */}
      <button
        type="button"
        className="cleanup-button"
        onClick={onCleanupClips}
        disabled={cleanupCount === 0}
        title={cleanupCount === 0 ? '掃除対象のクリップがありません' : `${cleanupCount}件のクリップをゴミ箱に移動します`}
      >
        <Icon name="broom" />
        <span>掃除</span>
        {cleanupCount > 0 && <span className="cleanup-count">{cleanupCount}</span>}
      </button>

      {/* ナビゲーション */}
      <nav className="sidebar-nav" aria-label="カテゴリ">
        {/* すべてのクリップ */}
        {allCategory && (
          <ul className="category-list">
            <li>
              <button
                type="button"
                className={`category-item ${selectedCategoryId === 'all' ? 'active' : ''}`}
                onClick={() => onSelectCategory('all')}
              >
                <span className="category-icon">
                  <Icon name={allCategory.icon} />
                </span>
                <span className="category-name">{allCategory.name}</span>
                <span className="category-count">{clips.length}</span>
              </button>
            </li>
            {/* 新規クリップ：すべてのクリップの直下に配置 */}
            <li>
              <button
                type="button"
                className={`category-item ${selectedCategoryId === 'today' ? 'active' : ''}`}
                onClick={() => onSelectCategory('today')}
              >
                <span className="category-icon">
                  <Icon name="trending-up" />
                </span>
                <span className="category-name">新規クリップ</span>
                <span className="category-count">{todayCount}</span>
              </button>
            </li>
          </ul>
        )}

        {/* ゴミ箱 */}
        <button
          type="button"
          className={`category-item trash-item ${isTrashActive ? 'active' : ''} ${isTrashDragTarget ? 'droppable' : ''}`}
          onClick={() => onSelectCategory('trash')}
          onDragOver={(e) => {
            // ドロップを許可する
            e.preventDefault()
          }}
          onDrop={(e) => {
            e.preventDefault()
            onDropToCategory('trash')
          }}
        >
          <span className="category-icon">
            <Icon name="trash" />
          </span>
          <span className="category-name">ゴミ箱</span>
          <span className="category-count">{trashCount}</span>
        </button>

        {/* カテゴリ一覧 */}
        <div className="sidebar-section-label">カテゴリ</div>
        <ul className="category-list">
          {normalCategories.map((category) => {
            const isActive = category.id === selectedCategoryId
            const isDragOverTarget = draggingClipId !== null

            return (
              <li key={category.id}>
                <button
                  type="button"
                  className={`category-item ${isActive ? 'active' : ''} ${isDragOverTarget ? 'droppable' : ''}`}
                  onClick={() => onSelectCategory(category.id)}
                  onContextMenu={(e) => handleContextMenu(e, category)}
                  onDragOver={(e) => {
                    // ドロップを許可する（デフォルトは拒否される）
                    e.preventDefault()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    onDropToCategory(category.id)
                  }}
                >
                  <span className="category-icon">
                    <Icon name={category.icon} />
                  </span>
                  <span className="category-name">{category.name}</span>
                  <span className="category-count">{getCount(category.id)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* カテゴリ追加ボタン */}
      <button type="button" className="add-category-button" onClick={onAddCategory}>
        <Icon name="plus" />
        <span>カテゴリを追加</span>
      </button>

      {/* 設定 */}
      <button type="button" className="settings-button" onClick={onOpenSettings}>
        <Icon name="settings" />
        <span>設定</span>
      </button>

      {/* カテゴリ右クリックメニュー */}
      {contextMenu && contextCategory && (
        <div
          className="category-context-menu-wrapper"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <CategoryContextMenu
            category={contextCategory}
            onRename={onRenameCategory}
            onDelete={onDeleteCategory}
          />
        </div>
      )}
    </aside>
  )
}
