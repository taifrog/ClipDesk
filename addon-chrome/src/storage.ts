// 拡張機能の設定を chrome.storage.local から取得・保存するモジュール

import type { ExtensionSettings } from './types';

// 設定のデフォルト値
const DEFAULT_SETTINGS: ExtensionSettings = {
  apiKey: '',
  // テスト用簡易APIサーバーへの投稿先
  localSiteUrl: 'http://localhost:3001/api/clip',
  model: 'gpt-4o-mini',
  language: 'ja',
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
