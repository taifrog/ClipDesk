import type { Category, Clip, ViewMode } from '../types'
import { ClipCard } from './ClipCard'

// ClipGrid コンポーネントのプロパティ
interface ClipGridProps {
  title: string
  clips: Clip[]
  categories: Category[]
  viewMode: ViewMode
  isTrash?: boolean
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
    </section>
  )
}
