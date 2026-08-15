import type { Category, Clip, ViewMode } from '../types'
import { ClipCard } from './ClipCard'

// ClipGrid コンポーネントのプロパティ
interface ClipGridProps {
  title: string
  clips: Clip[]
  categories: Category[]
  viewMode: ViewMode
  isTrash?: boolean
  // ページネーション関連（省略時はページング UI を表示しない）
  currentPage?: number
  totalPages?: number
  onPageChange?: (page: number) => void
  onDragStart: (clipId: number) => void
  onDragEnd: () => void
  onTogglePin: (id: number) => void
  onToggleCheck: (id: number) => void
  onUpdateComment: (id: number, comment: string) => void
  onRestore?: (id: number) => void
}

// カテゴリIDからカテゴリ情報を取得する
function findCategory(categories: Category[], categoryId: string): Category | undefined {
  return categories.find((cat) => cat.id === categoryId)
}

// クリップグリッドコンポーネント
export function ClipGrid({
  title,
  clips,
  categories,
  viewMode,
  isTrash = false,
  currentPage,
  totalPages,
  onPageChange,
  onDragStart,
  onDragEnd,
  onTogglePin,
  onToggleCheck,
  onUpdateComment,
  onRestore,
}: ClipGridProps) {
  if (clips.length === 0) {
    return null
  }

  // 前のページへ移動する
  const handlePrev = () => {
    if (currentPage && totalPages && onPageChange && currentPage > 1) {
      onPageChange(currentPage - 1)
    }
  }

  // 次のページへ移動する
  const handleNext = () => {
    if (currentPage && totalPages && onPageChange && currentPage < totalPages) {
      onPageChange(currentPage + 1)
    }
  }

  const hasPagination = currentPage !== undefined && totalPages !== undefined && totalPages > 1

  return (
    <section className="clip-grid-section">
      <h3 className="clip-grid-title">{title}</h3>
      <div className={`clip-grid ${viewMode === 'list' ? 'clip-grid-list' : ''}`}>
        {clips.map((clip) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            category={findCategory(categories, clip.categoryId)}
            viewMode={viewMode}
            isTrash={isTrash}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onTogglePin={onTogglePin}
            onToggleCheck={onToggleCheck}
            onUpdateComment={onUpdateComment}
            onRestore={onRestore}
          />
        ))}
      </div>

      {/* ページネーション */}
      {hasPagination && (
        <div className="clip-grid-pagination">
          <button
            type="button"
            className="pagination-button"
            onClick={handlePrev}
            disabled={currentPage <= 1}
            aria-label="前のページ"
          >
            前へ
          </button>
          <span className="pagination-info">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            className="pagination-button"
            onClick={handleNext}
            disabled={currentPage >= totalPages}
            aria-label="次のページ"
          >
            次へ
          </button>
        </div>
      )}
    </section>
  )
}
