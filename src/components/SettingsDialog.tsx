import { useEffect, useState } from 'react'
import type { SourceSite } from '../types'

// 設定ダイアログのプロパティ
interface SettingsDialogProps {
  isOpen: boolean
  sourceSites: SourceSite[]
  onClose: () => void
  onAddSourceSite: (site: { tag: string; siteUrl: string }) => Promise<void>
  onDeleteSourceSite: (id: number) => Promise<void>
}

// 設定ダイアログ
// クリップ収集元サイト（タグ・サイトURL）の登録・削除を行う
export function SettingsDialog({
  isOpen,
  sourceSites,
  onClose,
  onAddSourceSite,
  onDeleteSourceSite,
}: SettingsDialogProps) {
  // 新規登録用のタグ
  const [tag, setTag] = useState<string>('')
  // 新規登録用のサイトURL
  const [siteUrl, setSiteUrl] = useState<string>('')
  // 登録中フラグ
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  // エラーメッセージ
  const [error, setError] = useState<string | null>(null)
  // 削除中のサイトID
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // ダイアログを開いたときに入力をリセットする
  useEffect(() => {
    if (isOpen) {
      setTag('')
      setSiteUrl('')
      setError(null)
      setIsSubmitting(false)
      setDeletingId(null)
    }
  }, [isOpen])

  // 背景クリックで閉じる処理
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  // サイト追加フォーム送信時の処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedTag = tag.trim()
    const trimmedUrl = siteUrl.trim()

    if (!trimmedTag || !trimmedUrl) {
      setError('タグとサイトURLを入力してください')
      return
    }

    // 簡易URLバリデーション
    try {
      new URL(trimmedUrl)
    } catch {
      setError('正しいURLを入力してください')
      return
    }

    setIsSubmitting(true)
    try {
      await onAddSourceSite({ tag: trimmedTag, siteUrl: trimmedUrl })
      setTag('')
      setSiteUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'サイトの追加に失敗しました')
    } finally {
      setIsSubmitting(false)
    }
  }

  // サイト削除ボタン押下時の処理
  const handleDelete = async (id: number) => {
    if (!window.confirm('この収集元サイトを削除しますか？')) return
    setDeletingId(id)
    try {
      await onDeleteSourceSite(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'サイトの削除に失敗しました')
    } finally {
      setDeletingId(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="dialog-backdrop" onClick={handleBackdropClick} role="presentation">
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
        <h2 id="settings-dialog-title" className="dialog-title">
          設定
        </h2>

        {/* 収集元サイト追加フォーム */}
        <section className="settings-section">
          <h3 className="settings-section-title">収集元サイトを追加</h3>
          <form onSubmit={handleSubmit} className="settings-form">
            <div className="form-group">
              <label htmlFor="settings-tag">タグ</label>
              <input
                id="settings-tag"
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="例：AI"
                disabled={isSubmitting}
              />
            </div>
            <div className="form-group">
              <label htmlFor="settings-url">サイトURL</label>
              <input
                id="settings-url"
                type="url"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://ledge.ai/"
                disabled={isSubmitting}
              />
            </div>
            <button type="submit" className="button-primary" disabled={isSubmitting}>
              {isSubmitting ? '追加中…' : '追加'}
            </button>
          </form>
          {error && <p className="dialog-error">{error}</p>}
        </section>

        {/* 登録済みサイト一覧 */}
        <section className="settings-section">
          <h3 className="settings-section-title">登録済みサイト</h3>
          {sourceSites.length === 0 ? (
            <p className="empty-message">まだサイトが登録されていません。</p>
          ) : (
            <ul className="source-site-list">
              {sourceSites.map((site) => (
                <li key={site.id} className="source-site-item">
                  <div className="source-site-info">
                    <span className="source-site-tag">{site.tag}</span>
                    <a
                      href={site.siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="source-site-url"
                    >
                      {site.siteUrl}
                    </a>
                    <span className={`source-site-rss ${site.rssUrl ? 'ok' : 'none'}`}>
                      {site.rssUrl ? 'RSS検出済み' : 'RSS未検出'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button-danger"
                    onClick={() => handleDelete(site.id)}
                    disabled={deletingId === site.id}
                  >
                    {deletingId === site.id ? '削除中…' : '削除'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 閉じるボタン */}
        <div className="dialog-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
