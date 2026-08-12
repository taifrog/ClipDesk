import { useEffect, useMemo, useState } from 'react'
import type { SourceSite } from '../types'

// クリップ収集ダイアログのプロパティ
interface CollectDialogProps {
  isOpen: boolean
  sourceSites: SourceSite[]
  onClose: () => void
  onCollect: (params: {
    tag?: string
    keyword?: string
    count: number
  }) => Promise<{ count: number; message?: string; diagnostics?: Record<string, unknown> }>
}

// 診断情報のうち、サイト別の結果1件の型
interface SiteDiagnostic {
  id?: number
  url?: string
  tag?: string
  matched?: boolean
  rss_url?: string | null
  article_count?: number
  sample_titles?: string[]
  error?: string
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
  // 収集結果の情報メッセージ（0件時の診断など）
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  // 収集結果の診断情報（0件時に詳細を表示するため）
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null)

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
      setInfoMessage(null)
      setDiagnostics(null)
      setIsCollecting(false)
    }
  }, [isOpen])

  // 背景クリックで閉じる処理
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  // 診断情報を人が読める形式でレンダリングする
  const renderDiagnostics = () => {
    if (!diagnostics) return null

    const matchedSites = diagnostics.matched_sites as number | undefined
    const requestedCount = diagnostics.requested_count as number | undefined
    const categoryId = diagnostics.category_id as number | null | undefined
    const skipped = diagnostics.skipped as number | undefined
    const siteList = (diagnostics.matched_site_list as SiteDiagnostic[] | undefined) || []
    const perSiteResults = diagnostics.per_site_results as Record<string, SiteDiagnostic> | undefined

    return (
      <div className="collect-diagnostics">
        <h4 className="collect-diagnostics-title">収集診断情報</h4>
        <ul className="collect-diagnostics-summary">
          <li>マッチしたサイト数: {matchedSites ?? '不明'}</li>
          <li>要求件数: {requestedCount ?? '不明'}</li>
          <li>スキップ件数: {skipped ?? 0}</li>
          <li>カテゴリID: {categoryId === null || categoryId === undefined ? '未指定' : categoryId}</li>
        </ul>
        {siteList.length > 0 && (
          <div className="collect-diagnostics-sites">
            <p className="collect-diagnostics-sites-title">サイト別の確認結果:</p>
            <ul className="collect-diagnostics-site-list">
              {siteList.map((site) => {
                const detail = perSiteResults?.[String(site.id)]
                return (
                  <li key={site.id ?? site.url} className="collect-diagnostics-site-item">
                    <div className="collect-diagnostics-site-header">
                      <span className="collect-diagnostics-site-tag">{site.tag || '不明'}</span>
                      <span className={`collect-diagnostics-site-status ${site.matched ? 'ok' : 'ng'}`}>
                        {site.matched ? '対象' : '非対象'}
                      </span>
                    </div>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="collect-diagnostics-site-url"
                    >
                      {site.url}
                    </a>
                    <div className="collect-diagnostics-site-detail">
                      <span>RSS: {site.rss_url ? '設定済み' : '未設定'}</span>
                      <span>記事数: {site.article_count ?? (detail?.article_count ?? '取得不可')}</span>
                    </div>
                    {site.error && (
                      <p className="collect-diagnostics-site-error">エラー: {site.error}</p>
                    )}
                    {site.sample_titles && site.sample_titles.length > 0 && (
                      <details className="collect-diagnostics-site-samples">
                        <summary>取得サンプル（{site.sample_titles.length}件）</summary>
                        <ul>
                          {site.sample_titles.map((title, idx) => (
                            <li key={idx}>{title}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    )
  }

  // 収集ボタン押下時の処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfoMessage(null)

    // タグもキーワードも未入力の場合はエラー
    if (!selectedTag.trim() && !keyword.trim()) {
      setError('タグまたはキーワードを入力してください')
      return
    }

    setIsCollecting(true)
    try {
      const result = await onCollect({
        tag: selectedTag.trim() || undefined,
        keyword: keyword.trim() || undefined,
        count,
      })
      // 0件の場合は診断メッセージを表示してダイアログは閉じない
      if (result.count === 0) {
        setInfoMessage(result.message || '新しいクリップは見つかりませんでした。')
        setDiagnostics(result.diagnostics || null)
      } else {
        onClose()
      }
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

          {/* エラー・情報メッセージ */}
          {error && <p className="dialog-error">{error}</p>}
          {infoMessage && <p className="dialog-info">{infoMessage}</p>}

          {/* 0件時の診断情報 */}
          {renderDiagnostics()}

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
