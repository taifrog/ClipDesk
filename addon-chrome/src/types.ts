// 拡張機能全体で共有する型定義

// コンテンツスクリプトから取得するページ情報
export interface PageInfo {
  url: string;    // ページURL
  title: string;  // ページタイトル
  body: string;   // ページ本文のプレーンテキスト
}

// ポップアップ/オプションとのメッセージ種別
export interface ExtensionMessage {
  type: string;
  payload?: unknown;
}

// ClipDesk ローカルサイトへの投稿ペイロード
// 要約はサイト側で行うため、アドオンからは summary を空で送信する
export interface ClipPayload {
  url: string;
  title: string;
  summary: string;
  rawBody: string;
}

// ストレージに保存する設定
export interface ExtensionSettings {
  localSiteUrl: string; // 投稿先ClipDeskローカルサイトURL
}
