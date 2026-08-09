import { useEffect, useMemo, useState } from 'react'
import type { SourceSite } from '../types'

// クリップ収集ダイアログのプロパティ
interface CollectDialogProps {
  isOpen: boolean
  sourceSites: SourceSite[]
  onClose: () => void
  onCollect: (params: { tag?: string; keyword?: string; count: number }) => Promise<void>
}

// プリセットタグ一覧（設定にないタグも選択可能にするため）
const PRESET_TAGS = ['AI', 'エンタメ', 'スポーツ', 'テクノロジー', 'ビジネス', 'ニュース', 'ライフスタイル']

// クリップ収集ダイアログ
// タグ選択・キーワード入力・取得件数を指定してクリップを収集する
export function CollectDialog({ isOpen, sourceSites, onClose, onCollect }: CollectDialogProps) {
  // 選択中のタグ（未選択時は空文字）
  const [selectedTag, setSelectedTag] = useState<string>('')
  // 自由入力キーワード
  const [keyword, setKeyword] = useState<string>('')
  // 取得件数（デフォルト5件）
  const [count, setCount] = useState<number>(5)
  // 収集中フラグ
  const [isCollecting, setIsCollecting] = useState<boolean>(false)
  // エラーメッセージ
  const [error, setError] = useState<string | null>(null)

  // 設定済みサイトのタグとプリセットを統合した選択肢を作成する
  const tagOptions = useMemo(() => {
    const registeredTags = sourceSites.map((site) => site.tag)
    const allTags = Array.from(new Set([...registeredTags, ...PRESET_TAGS]))
    return allTags.sort()
  }, [sourceSites])

  // ダイアログを開いたときに状態をリセットする
  useEffect(() => {
    if (isOpen) {
      setSelectedTag('')
      setKeyword('')
      setCount(5)
      setError(null)
      setIsCollecting(false)
    }
  }, [isOpen])

  // 背景クリックで閉じる処理
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  // 収集ボタン押下時の処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // タグもキーワードも未入力の場合はエラー
    if (!selectedTag.trim() && !keyword.trim()) {
      setError('タグまたはキーワードを入力してください')
      return
    }

    setIsCollecting(true)
    try {
      await onCollect({
        tag: selectedTag.trim() || undefined,
        keyword: keyword.trim() || undefined,
        count,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'クリップの収集に失敗しました')
    } finally {
      setIsCollecting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="dialog-backdrop" onClick={handleBackdropClick} role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="collect-dialog-title">
        <h2 id="collect-dialog-title" className="dialog-title">
          クリップ収集
        </h2>
        <p className="dialog-description">
          タグまたはキーワードを指定して、登録済みのサイトから最新記事を収集します。
        </p>

        <form onSubmit={handleSubmit} className="collect-form">
          {/* タグ選択 */}
          <div className="form-group">
            <label htmlFor="collect-tag">タグ</label>
            <select
              id="collect-tag"
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              disabled={isCollecting}
            >
              <option value="">選択してください</option>
              {tagOptions.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>

          {/* またはキーワード入力 */}
          <div className="form-group">
            <label htmlFor="collect-keyword">
              キーワード<span className="optional">（タグとどちらかを入力）</span>
            </label>
            <input
              id="collect-keyword"
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="例：生成AI"
              disabled={isCollecting}
            />
          </div>

          {/* 取得件数 */}
          <div className="form-group">
            <label htmlFor="collect-count">取得件数</label>
            <input
              id="collect-count"
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              disabled={isCollecting}
            />
          </div>

          {/* エラーメッセージ */}
          {error && <p className="dialog-error">{error}</p>}

          {/* ボタン */}
          <div className="dialog-actions">
            <button type="button" className="button-secondary" onClick={onClose} disabled={isCollecting}>
              キャンセル
            </button>
            <button type="submit" className="button-primary" disabled={isCollecting}>
              {isCollecting ? '収集中…' : '収集開始'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
