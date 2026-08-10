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

// ClipDesk への投稿ペイロード
// 要約はサイト側で行うため、アドオンからは summary を空で送信する
export interface ClipPayload {
  url: string;
  title: string;
  summary: string;
  rawBody: string;
}

// ストレージに保存する設定
export interface ExtensionSettings {
  // 投稿先 ClipDesk URL
  // ローカル開発時: http://localhost:54321/functions/v1/clip
  // Supabase Hosting 時: https://<project>.supabase.co/functions/v1/clip
  siteUrl: string;
  // Supabase Edge Functions 呼び出し用 API key
  // Web アプリの設定画面で発行した key を設定する
  apiKey: string;
}
