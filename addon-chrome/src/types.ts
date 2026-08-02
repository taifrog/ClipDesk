// 拡張機能全体で共有する型定義

// コンテンツスクリプトから取得するページ情報
export interface PageInfo {
  url: string;      // ページURL
  title: string;    // ページタイトル
  body: string;     // ページ本文のプレーンテキスト
}

// ポップアップ/オプションとのメッセージ種別
export interface ExtensionMessage {
  type: string;
  payload?: unknown;
}

// ClipDesk ローカルサイトへの投稿ペイロード
export interface ClipPayload {
  url: string;
  title: string;
  summary: string;
  rawBody: string;
}

// ストレージに保存する設定
export interface ExtensionSettings {
  apiKey: string;         // OpenCode Go APIキー
  localSiteUrl: string;     // 投稿先ClipDeskローカルサイトURL
  model: string;            // 使用するモデル名
  language: string;         // 要約の出力言語
}

// OpenCode Go /chat/completions リクエスト
export interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

// OpenCode Go /chat/completions レスポンス（最低限）
export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}
