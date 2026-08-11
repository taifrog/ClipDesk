import { useEffect, useState } from 'react'
import type { AiSummarySettings, SourceSite, UserApiKey } from '../types'

// 設定ダイアログのプロパティ
interface SettingsDialogProps {
  isOpen: boolean
  sourceSites: SourceSite[]
  aiSummarySettings: AiSummarySettings
  apiKeys: UserApiKey[]
  isLoadingApiKeys: boolean
  apiKeyError: string | null
  newlyCreatedKey: string | null
  onClose: () => void
  onAddSourceSite: (site: { tag: string; siteUrl: string }) => Promise<void>
  onDeleteSourceSite: (id: number) => Promise<void>
  onSaveAiSummarySettings: (settings: AiSummarySettings) => Promise<void>
  onFetchApiKeys: () => Promise<void>
  onCreateApiKey: (label: string) => Promise<void>
  onDeleteApiKey: (id: number) => Promise<void>
  onClearNewlyCreatedKey: () => void
}

// AI要約のデフォルト設定値
const DEFAULT_AI_SUMMARY_SETTINGS: AiSummarySettings = {
  enabled: true,
  apiKey: '',
  model: 'gpt-4o-mini',
  language: 'ja',
}

// 設定ダイアログ
// クリップ収集元サイト（タグ・サイトURL）の登録・削除と、AI要約設定、API キー管理を行う
export function SettingsDialog({
  isOpen,
  sourceSites,
  aiSummarySettings,
  apiKeys,
  isLoadingApiKeys,
  apiKeyError,
  newlyCreatedKey,
  onClose,
  onAddSourceSite,
  onDeleteSourceSite,
  onSaveAiSummarySettings,
  onFetchApiKeys,
  onCreateApiKey,
  onDeleteApiKey,
  onClearNewlyCreatedKey,
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

  // API キー新規発行用のラベル
  const [apiKeyLabel, setApiKeyLabel] = useState<string>('')
  // API キー発行中フラグ
  const [isCreatingApiKey, setIsCreatingApiKey] = useState<boolean>(false)
  // API キー削除中のID
  const [deletingApiKeyId, setDeletingApiKeyId] = useState<number | null>(null)

  // ダイアログを開いたときに入力をリセットし、API キー一覧を取得する
  useEffect(() => {
    if (isOpen) {
      setTag('')
      setSiteUrl('')
      setError(null)
      setIsSubmitting(false)
      setDeletingId(null)
      setAiSettingsSavedMessage(null)
      setApiKeyLabel('')
      setIsCreatingApiKey(false)
      setDeletingApiKeyId(null)
      // 親から受け取った設定をローカル状態に反映する
      setLocalAiSettings({
        enabled: aiSummarySettings.enabled,
        apiKey: aiSummarySettings.apiKey,
        model: aiSummarySettings.model || DEFAULT_AI_SUMMARY_SETTINGS.model,
        language: aiSummarySettings.language || DEFAULT_AI_SUMMARY_SETTINGS.language,
      })
      // API キー一覧を取得する
      onFetchApiKeys().catch((err) => console.error('API キー一覧取得失敗:', err))
    }
  }, [isOpen, aiSummarySettings, onFetchApiKeys])

  // ダイアログを閉じるときに新規発行キー表示をクリアする
  const handleClose = () => {
    onClearNewlyCreatedKey()
    onClose()
  }

  // 背景クリックで閉じる処理
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  // API キー新規発行時の処理
  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsCreatingApiKey(true)
    try {
      await onCreateApiKey(apiKeyLabel.trim())
      setApiKeyLabel('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API キーの発行に失敗しました')
    } finally {
      setIsCreatingApiKey(false)
    }
  }

  // API キー削除時の処理
  const handleDeleteApiKey = async (id: number) => {
    if (!window.confirm('この API キーを削除しますか？削除すると、拡張機能からの投稿に使用できなくなります。')) return
    setDeletingApiKeyId(id)
    try {
      await onDeleteApiKey(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API キーの削除に失敗しました')
    } finally {
      setDeletingApiKeyId(null)
    }
  }

  // 新規発行キーをクリップボードにコピーする
  const handleCopyNewKey = async () => {
    if (!newlyCreatedKey) return
    try {
      await navigator.clipboard.writeText(newlyCreatedKey)
    } catch (err) {
      console.error('コピー失敗:', err)
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
      let message = err instanceof Error ? err.message : 'サイトの追加に失敗しました'
      // API から返却されたエラーコードに応じて、より分かりやすいメッセージに置き換える
      if (err instanceof Error && err.message.includes('DUPLICATE_SITE_URL')) {
        message = '同じURLのサイトは既に登録されています'
      } else if (err instanceof Error && err.message.includes('TAG_LIMIT_EXCEEDED')) {
        message = '同じタグには最大5件までしか登録できません'
      }
      setError(message)
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

        {/* API キー管理 */}
        <hr className="settings-divider" />
        <section className="settings-section">
          <h3 className="settings-section-title">Chrome 拡張機能用 API キー</h3>
          <p className="dialog-description">
            Chrome 拡張機能からクリップを投稿する際に使用する API キーを管理します。発行時にのみ平文が表示されるため、必ずコピーしてください。
          </p>

          <form onSubmit={handleCreateApiKey} className="settings-form">
            <div className="form-group">
              <label htmlFor="api-key-label">ラベル（任意）</label>
              <input
                id="api-key-label"
                type="text"
                value={apiKeyLabel}
                onChange={(e) => setApiKeyLabel(e.target.value)}
                placeholder="例：MacBook Chrome"
                disabled={isCreatingApiKey}
              />
            </div>
            <button type="submit" className="button-primary" disabled={isCreatingApiKey}>
              {isCreatingApiKey ? '発行中…' : 'API キーを発行'}
            </button>
          </form>

          {newlyCreatedKey && (
            <div className="api-key-new">
              <p className="api-key-new-title">発行された API キー（再表示できません）</p>
              <div className="api-key-new-value">
                <code>{newlyCreatedKey}</code>
                <button type="button" className="button-secondary" onClick={handleCopyNewKey}>
                  コピー
                </button>
              </div>
            </div>
          )}

          {isLoadingApiKeys ? (
            <p className="empty-message">読み込み中…</p>
          ) : apiKeyError ? (
            <p className="dialog-error">{apiKeyError}</p>
          ) : apiKeys.length === 0 ? (
            <p className="empty-message">まだ API キーが発行されていません。</p>
          ) : (
            <ul className="source-site-list">
              {apiKeys.map((key) => (
                <li key={key.id} className="source-site-item">
                  <div className="source-site-info">
                    <span className="source-site-tag">{key.label || '（ラベルなし）'}</span>
                    <span className="source-site-url">
                      作成: {new Date(key.createdAt).toLocaleString('ja-JP')}
                    </span>
                    <span className={`source-site-rss ${key.lastUsedAt ? 'ok' : 'none'}`}>
                      {key.lastUsedAt ? `最終使用: ${new Date(key.lastUsedAt).toLocaleString('ja-JP')}` : '未使用'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button-danger"
                    onClick={() => handleDeleteApiKey(key.id)}
                    disabled={deletingApiKeyId === key.id}
                  >
                    {deletingApiKeyId === key.id ? '削除中…' : '削除'}
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
          <button type="button" className="button-secondary" onClick={handleClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
