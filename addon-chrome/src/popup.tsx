// ポップアップUI
// ツールバーアイコンをクリックしたときに開く画面
// 現在のページ情報を表示し、クリップ作成を依頼する

import { useEffect, useState } from 'react';
import type { PageInfo } from './types';

// ポップアップのメインコンポーネント
function Popup() {
  const [page, setPage] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>('');

  // ポップアップを開いたときに現在のページ情報を取得する
  useEffect(() => {
    chrome.runtime
      .sendMessage({ type: 'GET_CURRENT_PAGE' })
      .then((response) => {
        if (response.ok) {
          setPage(response.info as PageInfo);
        } else {
          setMessage(response.error || 'ページ情報を取得できませんでした');
        }
      })
      .catch((err) => setMessage(err.message || 'エラーが発生しました'));
  }, []);

  // クリップ作成ボタンを押したときの処理
  async function handleCreateClip() {
    setLoading(true);
    setMessage('');
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CREATE_CLIP' });
      if (response.ok) {
        setMessage('クリップを投稿しました');
      } else {
        setMessage(response.error || '投稿に失敗しました');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '投稿に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ width: 320, padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 18 }}>ClipDesk</h1>

      {page ? (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 'bold' }}>{page.title}</p>
          <p style={{ margin: 0, fontSize: 12, color: '#555', wordBreak: 'break-all' }}>{page.url}</p>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: '#888' }}>読み込み中…</p>
      )}

      <div style={{ marginBottom: 12 }}>
        <button
          onClick={handleCreateClip}
          disabled={loading || !page}
          style={{ width: '100%', padding: '8px 12px', fontSize: 14, cursor: 'pointer' }}
        >
          {loading ? '投稿中…' : 'クリップを作成'}
        </button>
      </div>

      {message && (
        <p style={{ margin: 0, fontSize: 12, color: message.startsWith('クリップ') ? '#2a7' : '#c33' }}>
          {message}
        </p>
      )}
    </div>
  );
}

export default Popup;
