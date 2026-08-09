import { useEffect, useState } from 'react'
import type { AiSummarySettings, SourceSite } from '../types'

// 設定ダイアログのプロパティ
interface SettingsDialogProps {
  isOpen: boolean
  sourceSites: SourceSite[]
  aiSummarySettings: AiSummarySettings
  onClose: () => void
  onAddSourceSite: (site: { tag: string; siteUrl: string }) => Promise<void>
  onDeleteSourceSite: (id: number) => Promise<void>
  onSaveAiSummarySettings: (settings: AiSummarySettings) => Promise<void>
}

// AI要約のデフォルト設定値
const DEFAULT_AI_SUMMARY_SETTINGS: AiSummarySettings = {
  enabled: true,
  apiKey: '',
  model: 'gpt-4o-mini',
  language: 'ja',
}

// 設定ダイアログ
// クリップ収集元サイト（タグ・サイトURL）の登録・削除と、AI要約設定を行う
export function SettingsDialog({
  isOpen,
  sourceSites,
  aiSummarySettings,
  onClose,
  onAddSourceSite,
  onDeleteSourceSite,
  onSaveAiSummarySettings,
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

  // AI要約設定のローカル編集用状態
  const [localAiSettings, setLocalAiSettings] = useState<AiSummarySettings>(DEFAULT_AI_SUMMARY_SETTINGS)
  // AI要約設定保存中フラグ
  const [isSavingAiSettings, setIsSavingAiSettings] = useState<boolean>(false)
  // AI要約設定保存完了メッセージ
  const [aiSettingsSavedMessage, setAiSettingsSavedMessage] = useState<string | null>(null)

  // ダイアログを開いたときに入力をリセットする
  useEffect(() => {
    if (isOpen) {
      setTag('')
      setSiteUrl('')
      setError(null)
      setIsSubmitting(false)
      setDeletingId(null)
      setAiSettingsSavedMessage(null)
      // 親から受け取った設定をローカル状態に反映する
      setLocalAiSettings({
        enabled: aiSummarySettings.enabled,
        apiKey: aiSummarySettings.apiKey,
        model: aiSummarySettings.model || DEFAULT_AI_SUMMARY_SETTINGS.model,
        language: aiSummarySettings.language || DEFAULT_AI_SUMMARY_SETTINGS.language,
      })
    }
  }, [isOpen, aiSummarySettings])

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

  // AI要約設定の入力値変更時の処理
  const handleAiSettingsChange = (updates: Partial<AiSummarySettings>) => {
    setLocalAiSettings((prev) => ({ ...prev, ...updates }))
    // 入力が変わったら保存済みメッセージを消す
    setAiSettingsSavedMessage(null)
  }

  // AI要約設定保存ボタン押下時の処理
  const handleSaveAiSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingAiSettings(true)
    setError(null)
    try {
      await onSaveAiSummarySettings({
        enabled: localAiSettings.enabled,
        apiKey: localAiSettings.apiKey.trim(),
        model: localAiSettings.model.trim() || DEFAULT_AI_SUMMARY_SETTINGS.model,
        language: localAiSettings.language.trim() || DEFAULT_AI_SUMMARY_SETTINGS.language,
      })
      setAiSettingsSavedMessage('AI要約設定を保存しました')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI要約設定の保存に失敗しました')
    } finally {
      setIsSavingAiSettings(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="dialog-backdrop" onClick={handleBackdropClick} role="presentation">
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
        <h2 id="settings-dialog-title" className="dialog-title">
          設定
        </h2>

        {/* AI要約設定 */}
        <section className="settings-section">
          <h3 className="settings-section-title">AI要約設定</h3>
          <p className="dialog-description">
            クリップ収集時に記事を要約するための設定です。Webサイト側の設定として保存されます。
          </p>
          <form onSubmit={handleSaveAiSettings} className="settings-form settings-form-vertical">
            <div className="form-group form-group-inline">
              <label htmlFor="ai-summary-enabled">
                <input
                  id="ai-summary-enabled"
                  type="checkbox"
                  checked={localAiSettings.enabled}
                  onChange={(e) => handleAiSettingsChange({ enabled: e.target.checked })}
                  disabled={isSavingAiSettings}
                />
                クリップ収集時にAI要約を実行する
              </label>
            </div>

            <div className="form-group">
              <label htmlFor="ai-summary-api-key">OpenCode Go API キー</label>
              <input
                id="ai-summary-api-key"
                type="password"
                value={localAiSettings.apiKey}
                onChange={(e) => handleAiSettingsChange({ apiKey: e.target.value })}
                placeholder="sk-..."
                disabled={isSavingAiSettings}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="ai-summary-model">モデル</label>
                <input
                  id="ai-summary-model"
                  type="text"
                  value={localAiSettings.model}
                  onChange={(e) => handleAiSettingsChange({ model: e.target.value })}
                  placeholder="gpt-4o-mini"
                  disabled={isSavingAiSettings}
                />
              </div>

              <div className="form-group">
                <label htmlFor="ai-summary-language">要約言語</label>
                <input
                  id="ai-summary-language"
                  type="text"
                  value={localAiSettings.language}
                  onChange={(e) => handleAiSettingsChange({ language: e.target.value })}
                  placeholder="ja"
                  disabled={isSavingAiSettings}
                />
              </div>
            </div>

            <div className="settings-form-actions">
              <button type="submit" className="button-primary" disabled={isSavingAiSettings}>
                {isSavingAiSettings ? '保存中…' : 'AI要約設定を保存'}
              </button>
              {aiSettingsSavedMessage && <span className="save-success-message">{aiSettingsSavedMessage}</span>}
            </div>
          </form>
        </section>

        <hr className="settings-divider" />

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

        {/* エラーメッセージ */}
        {error && <p className="dialog-error">{error}</p>}

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
