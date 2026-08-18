// ClipDesk の型定義ファイル

// クリップ1件を表す型
// 拡張機能から受信したWebページ情報を管理する
export interface Clip {
  id: number
  url: string
  title: string
  summary: string
  rawBody: string
  receivedAt: string
  categoryId: string
  isPinned: boolean
  // 確認済みチェックマーク（trueで確認済み）
  isChecked: boolean
  comment: string
  // ゴミ箱に移動した日時（null の場合は通常のクリップ）
  deletedAt?: string | null
  // 確認済みチェックマークをONにした日時（null の場合は未確認）
  checkedAt?: string | null
  // イベント・展示などの開始日時（null の場合はイベント情報なし）
  eventStartDate?: string | null
  // イベント・展示などの終了日時（null の場合は終了日時不明またはイベント情報なし）
  eventEndDate?: string | null
  // イベント・展示などの開催場所（null の場合は場所不明またはイベント情報なし）
  location?: string | null
  // AI 要約・日時・場所抽出の処理状態
  // pending: 要約待ち, processing: 処理中, completed: 完了, failed: 失敗
  aiEnrichmentStatus?: 'pending' | 'processing' | 'completed' | 'failed' | null
}

// カテゴリ1件を表す型
// サイドバーに表示され、クリップを分類するために使用する
export interface Category {
  id: string
  name: string
  icon: string
}

// クリップ収集元サイト1件を表す型
// タグに紐づくサイトURLと自動検出したRSS URLを管理する
export interface SourceSite {
  id: number
  tag: string
  siteUrl: string
  rssUrl: string | null
  createdAt: string
}

// クリップ一覧の並び替えモードを表す型
export type SortMode = 'newest' | 'oldest' | 'category'

// クリップ一覧の表示モードを表す型
export type ViewMode = 'grid' | 'list'

// サイト側（Webアプリ）のAI要約設定を表す型
// SQLite の app_settings テーブルに永続化される
export interface AiSummarySettings {
  // AI要約機能の有効/無効
  enabled: boolean
  // OpenCode Go API キー
  apiKey: string
  // 使用するモデル名
  model: string
  // 要約する言語
  language: string
}

// Chrome 拡張機能等で使用する API キー1件を表す型
export interface UserApiKey {
  id: number
  // ユーザーが判別しやすいラベル
  label: string
  // 作成日時
  createdAt: string
  // 最終使用日時（未使用の場合は null）
  lastUsedAt?: string | null
  // 発行直後のみ含まれる平文キー（以降は復元不可）
  rawKey?: string
}
