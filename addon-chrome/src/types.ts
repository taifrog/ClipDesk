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
  // ClipDesk Web アプリの URL
  // GitHub Pages 公開時: https://taifrog.github.io/ClipDesk/
  // ローカル開発時: http://localhost:5173/
  siteUrl: string;
  // Supabase プロジェクトの URL
  // GitHub Pages 運用時はビルド時に VITE_SUPABASE_URL から注入される
  // ローカル開発時: http://127.0.0.1:54321
  supabaseUrl: string;
  // Chrome 拡張機能等で使用する API キー
  // Web アプリの設定画面で発行した key を設定する
  apiKey: string;
}
