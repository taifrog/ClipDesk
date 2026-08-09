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
  comment: string
  // ゴミ箱に移動した日時（null の場合は通常のクリップ）
  deletedAt?: string | null
}

// カテゴリ1件を表す型
// サイドバーに表示され、クリップを分類するために使用する
export interface Category {
  id: string
  name: string
  icon: string
}
