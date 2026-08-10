// オプション画面
// 投稿先URLなどの設定を管理する

import { useEffect, useState } from 'react';
import { loadSettings, saveSettings } from './storage';
import type { ExtensionSettings } from './types';

// オプション画面のメインコンポーネント
function Options() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>('');

  // 保存済みの設定を読み込む
  useEffect(() => {
    loadSettings()
      .then(setSettings)
      .catch((err) => setError(err.message || '設定を読み込めませんでした'));
  }, []);

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

  if (!settings) {
    return <p style={{ padding: 24 }}>読み込み中…</p>;
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>ClipDesk 設定</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
            投稿先 ClipDesk URL
          </label>
          <input
            type="url"
            value={settings.localSiteUrl}
            onChange={(e) => handleChange('localSiteUrl', e.target.value)}
            style={{ width: '100%', padding: 8, fontSize: 14 }}
            placeholder="http://localhost:3001/api/clip"
          />
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
            要約は ClipDesk サイト側の設定で行われます。
          </p>
        </div>

        <button type="submit" style={{ padding: '10px 20px', fontSize: 14, cursor: 'pointer' }}>
          保存
        </button>

        {saved && <p style={{ color: '#2a7', marginTop: 12 }}>保存しました</p>}
        {error && <p style={{ color: '#c33', marginTop: 12 }}>{error}</p>}
      </form>
    </div>
  );
}

export default Options;
