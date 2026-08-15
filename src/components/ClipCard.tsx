import { useState } from 'react'
import type { Category, Clip, ViewMode } from '../types'

// ClipCard コンポーネントのプロパティ
interface ClipCardProps {
  clip: Clip
  category: Category | undefined
  viewMode: ViewMode
  isTrash?: boolean
  onDragStart: (clipId: number) => void
  onDragEnd: () => void
  onTogglePin: (id: number) => void
  onToggleCheck: (id: number) => void
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

// チェックマークアイコンを表示するコンポーネント
// active: true の時はチェック済みマーク、false の時は空の四角を表示する
function CheckIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`check-icon ${active ? 'active' : ''}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {active ? (
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
      ) : (
        <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
      )}
    </svg>
  )
}

// クリップカードコンポーネント
export function ClipCard({
  clip,
  category,
  viewMode,
  isTrash = false,
  onDragStart,
  onDragEnd,
  onTogglePin,
  onToggleCheck,
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

  // チェックマーク切り替えボタンクリック時
  const handleCheckClick = () => {
    onToggleCheck(clip.id)
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
      className={`clip-card ${viewMode === 'list' ? 'clip-card-list' : ''}`}
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

      {/* コメント編集エリア：コメントがある場合、または編集モードの場合のみ表示する */}
      {isEditingComment ? (
        <div className={`clip-card-comment-edit ${viewMode === 'list' ? 'clip-card-comment-edit-list' : ''}`}>
          <textarea
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            placeholder="このクリップに関するメモやコメントを入力..."
            rows={viewMode === 'list' ? 2 : 3}
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
      ) : clip.comment ? (
        // コメントがある場合のみ、タイトル・要約の下に表示する
        <button
          type="button"
          className={`clip-card-comment-toggle ${viewMode === 'list' ? 'clip-card-comment-toggle-list' : ''}`}
          onClick={() => setIsEditingComment(true)}
          aria-label="コメントを編集"
        >
          <CommentIcon />
          <span>{clip.comment}</span>
        </button>
      ) : null}

      {/* カードフッター */}
      <div className={`clip-card-footer ${viewMode === 'list' ? 'clip-card-footer-list' : ''}`}>
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
          <div className="clip-card-actions">
            {/* コメント追加・編集ボタン：空の時は追加、既存の時は編集を示す */}
            <button
              type="button"
              className={`clip-card-comment-action ${clip.comment ? 'has-comment' : ''}`}
              aria-label={clip.comment ? 'コメントを編集' : 'コメントを追加'}
              onClick={() => setIsEditingComment(true)}
            >
              <CommentIcon />
            </button>
            <button
              type="button"
              className="clip-card-check"
              aria-label={clip.isChecked ? '確認済みを解除' : '確認済みにする'}
              onClick={handleCheckClick}
            >
              <CheckIcon active={clip.isChecked} />
            </button>
            <button
              type="button"
              className="clip-card-favorite"
              aria-label={clip.isPinned ? 'ピン留めを解除' : 'ピン留めする'}
              onClick={handlePinClick}
            >
              <StarIcon active={clip.isPinned} />
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
