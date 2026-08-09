import { useState } from 'react'
import type { Category, Clip } from '../types'

// ClipCard コンポーネントのプロパティ
interface ClipCardProps {
  clip: Clip
  category: Category | undefined
  isTrash?: boolean
  onDragStart: (clipId: number) => void
  onDragEnd: () => void
  onTogglePin: (id: number) => void
  onUpdateComment: (id: number, comment: string) => void
  onRestore?: (id: number) => void
}

// 日付文字列を日本語の表示形式に変換する
function formatDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

// お気に入りアイコン（星）を表示するコンポーネント
function StarIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`star-icon ${active ? 'active' : ''}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  )
}

// コメントアイコンを表示するコンポーネント
function CommentIcon() {
  return (
    <svg className="comment-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
    </svg>
  )
}

// クリップカードコンポーネント
export function ClipCard({
  clip,
  category,
  isTrash = false,
  onDragStart,
  onDragEnd,
  onTogglePin,
  onUpdateComment,
  onRestore,
}: ClipCardProps) {
  // コメント編集モードの表示状態
  const [isEditingComment, setIsEditingComment] = useState(false)
  // 編集中のコメントテキスト
  const [commentDraft, setCommentDraft] = useState(clip.comment)

  // ピン切り替えボタンクリック時
  const handlePinClick = () => {
    onTogglePin(clip.id)
  }

  // コメント編集を確定する
  const handleCommentSave = () => {
    onUpdateComment(clip.id, commentDraft)
    setIsEditingComment(false)
  }

  // コメント編集をキャンセルする
  const handleCommentCancel = () => {
    setCommentDraft(clip.comment)
    setIsEditingComment(false)
  }

  return (
    <article
      className="clip-card"
      draggable
      onDragStart={() => onDragStart(clip.id)}
      onDragEnd={onDragEnd}
    >
      {/* カード本文 */}
      <div className="clip-card-body">
        <h3 className="clip-card-title">
          <a href={clip.url} target="_blank" rel="noreferrer">
            {clip.title}
          </a>
        </h3>
        <p className="clip-card-summary">{clip.summary}</p>
      </div>

      {/* コメント編集エリア */}
      {isEditingComment ? (
        <div className="clip-card-comment-edit">
          <textarea
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            placeholder="このクリップに関するメモやコメントを入力..."
            rows={3}
          />
          <div className="clip-card-comment-actions">
            <button type="button" className="comment-save" onClick={handleCommentSave}>
              保存
            </button>
            <button type="button" className="comment-cancel" onClick={handleCommentCancel}>
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="clip-card-comment-toggle"
          onClick={() => setIsEditingComment(true)}
          aria-label={clip.comment ? 'コメントを編集' : 'コメントを追加'}
        >
          <CommentIcon />
          <span>{clip.comment ? clip.comment : 'コメントを追加...'}</span>
        </button>
      )}

      {/* カードフッター */}
      <div className="clip-card-footer">
        <div className="clip-card-meta">
          {category && category.id !== 'all' && (
            <span className="clip-card-category">{category.name}</span>
          )}
          <span className="clip-card-date">{formatDate(clip.receivedAt)}</span>
        </div>
        {isTrash ? (
          <button
            type="button"
            className="clip-card-restore"
            aria-label="クリップを復元"
            onClick={() => onRestore?.(clip.id)}
          >
            復元
          </button>
        ) : (
          <button
            type="button"
            className="clip-card-favorite"
            aria-label={clip.isPinned ? 'ピン留めを解除' : 'ピン留めする'}
            onClick={handlePinClick}
          >
            <StarIcon active={clip.isPinned} />
          </button>
        )}
      </div>
    </article>
  )
}
