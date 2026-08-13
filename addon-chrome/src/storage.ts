// 拡張機能の設定を chrome.storage.local から取得・保存するモジュール

import type { ExtensionSettings } from './types';

// ビルド時に Vite の define 経由で注入される Supabase URL
// 未設定の場合はローカル開発用の Supabase ローカルエンドポイントを使用する
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DEFAULT_SUPABASE_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) || 'http://127.0.0.1:54321';

// 設定のデフォルト値
const DEFAULT_SETTINGS: ExtensionSettings = {
  // ClipDesk Web アプリの URL（GitHub Pages 公開 URL）
  siteUrl: 'https://taifrog.github.io/ClipDesk/',
  // Supabase プロジェクトの URL（ビルド時に環境変数から注入、未設定時はローカル開発用）
  supabaseUrl: DEFAULT_SUPABASE_URL,
  // API key は未設定状態で初期化（ユーザーが設定画面で入力する）
  apiKey: '',
};

// ストレージキー
const STORAGE_KEY = 'clipdesk-settings';

// 保存されている設定を取得する
// 未設定の場合はデフォルト値を返す
export async function loadSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as Partial<ExtensionSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

// 設定を保存する
export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

// デフォルト設定を取得する（テストやUI表示用）
export function getDefaultSettings(): ExtensionSettings {
  return { ...DEFAULT_SETTINGS };
}
