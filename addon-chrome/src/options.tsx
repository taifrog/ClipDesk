// オプション画面
// 投稿先URL・Supabase URL・API key などの設定を管理する

import { useEffect, useState } from 'react';
import { loadSettings, saveSettings, getDefaultSettings } from './storage';
import type { ExtensionSettings } from './types';

// オプション画面のメインコンポーネント
function Options() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>('');
  // 拡張機能 ID のコピー完了表示
  const [extensionIdCopied, setExtensionIdCopied] = useState(false);
  // 現在の拡張機能 ID（chrome.runtime.id が利用可能な場合のみ）
  const [extensionId, setExtensionId] = useState<string>('');

  // 保存済みの設定を読み込む
  useEffect(() => {
    loadSettings()
      .then(setSettings)
      .catch((err) => setError(err.message || '設定を読み込めませんでした'));

    // 拡張機能 ID を取得して表示する
    // chrome.runtime.id は拡張機能内からのみ参照可能
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      setExtensionId(chrome.runtime.id);
    }
  }, []);

  // 拡張機能 ID をクリップボードにコピーする
  async function handleCopyExtensionId() {
    if (!extensionId) return;
    try {
      await navigator.clipboard.writeText(extensionId);
      setExtensionIdCopied(true);
      // 3秒後にコピー完了表示を消す
      window.setTimeout(() => setExtensionIdCopied(false), 3000);
    } catch (err) {
      console.error('拡張機能 ID のコピー失敗:', err);
      setError('拡張機能 ID のコピーに失敗しました');
    }
  }

  // 入力値をローカル状態に反映する
  function handleChange(field: keyof ExtensionSettings, value: string) {
    setSettings((prev) => (prev ? { ...prev, [field]: value } : prev));
    setSaved(false);
  }

  // 設定を保存する
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    try {
      await saveSettings(settings);
      setSaved(true);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    }
  }

  // デフォルト値に戻す
  function handleReset() {
    setSettings(getDefaultSettings());
    setSaved(false);
  }

  if (!settings) {
    return <p style={{ padding: 24 }}>読み込み中…</p>;
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>ClipDesk 設定</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
            ClipDesk サイト URL
          </label>
          <input
            type="url"
            value={settings.siteUrl}
            onChange={(e) => handleChange('siteUrl', e.target.value)}
            style={{ width: '100%', padding: 8, fontSize: 14 }}
            placeholder="https://taifrog.github.io/ClipDesk/"
          />
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
            GitHub Pages で公開している ClipDesk の URL を指定してください。
            ローカル開発時は http://localhost:5173/ です。
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
            Supabase URL
          </label>
          <input
            type="url"
            value={settings.supabaseUrl}
            onChange={(e) => handleChange('supabaseUrl', e.target.value)}
            style={{ width: '100%', padding: 8, fontSize: 14 }}
            placeholder="https://<project>.supabase.co"
          />
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
            Supabase プロジェクトの URL を指定してください。
            ローカル開発時は http://127.0.0.1:54321 です。
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
            API キー
          </label>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(e) => handleChange('apiKey', e.target.value)}
            style={{ width: '100%', padding: 8, fontSize: 14 }}
            placeholder="Webアプリの設定画面で発行した API キー"
          />
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
            Web アプリの設定画面で発行した API キーを入力してください。未設定の場合は投稿できません。
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit" style={{ padding: '10px 20px', fontSize: 14, cursor: 'pointer' }}>
            保存
          </button>
          <button
            type="button"
            onClick={handleReset}
            style={{ padding: '10px 20px', fontSize: 14, cursor: 'pointer' }}
          >
            既定値に戻す
          </button>
        </div>

        <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #ddd' }} />

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
            拡張機能 ID
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={extensionId}
              readOnly
              style={{ flex: 1, padding: 8, fontSize: 14, backgroundColor: '#f5f5f5' }}
              placeholder="拡張機能 ID を取得できません"
            />
            <button
              type="button"
              onClick={handleCopyExtensionId}
              disabled={!extensionId || extensionIdCopied}
              style={{ padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}
            >
              {extensionIdCopied ? 'コピーしました' : 'コピー'}
            </button>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
            Web アプリの設定画面で Chrome 拡張機能 ID 欄に貼り付けてください。
          </p>
        </div>

        {saved && <p style={{ color: '#2a7', marginTop: 12 }}>保存しました</p>}
        {error && <p style={{ color: '#c33', marginTop: 12 }}>{error}</p>}
      </form>
    </div>
  );
}

export default Options;
