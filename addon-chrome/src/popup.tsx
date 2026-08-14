// ポップアップUI
// ツールバーアイコンをクリックしたときに開く画面
// 現在のページ情報を表示し、クリップ作成を依頼する

import { useEffect, useMemo, useState } from 'react';
import type { Category, PageInfo } from './types';

// 新規カテゴリIDを生成する
// @param name カテゴリ名
// @returns ASCII英数字とハイフンのみを含むID。日本語等の場合はUUID風にフォールバック
function generateCategoryId(name: string): string {
  // 前後の空白を除去
  const trimmed = name.trim();
  if (!trimmed) {
    return '';
  }

  // ASCII英数字・ハイフン・アンダースコア以外をハイフンに置換
  let slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // 日本語などで英数字が含まれない場合は空になってしまうため、ランダムIDを生成する
  if (!slug) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const random = Array.from({ length: 8 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
    slug = `category-${random}`;
  }

  return slug;
}

// ポップアップのメインコンポーネント
function Popup() {
  const [page, setPage] = useState<PageInfo | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>('');

  // ポップアップを開いたときに現在のページ情報とカテゴリ一覧を取得する
  useEffect(() => {
    // 現在のページ情報を取得する
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

    // カテゴリ一覧を取得する
    chrome.runtime
      .sendMessage({ type: 'GET_CATEGORIES' })
      .then((response) => {
        if (response.ok) {
          const list = (response.categories as Category[]) || [];
          setCategories(list);
          // デフォルトは空欄（サーバー側で 'others' が適用される）
          setSelectedCategoryId('');
        } else {
          // カテゴリ取得失敗はクリップ作成の妨げにならないため、メッセージには控えめに表示
          console.warn('カテゴリ一覧取得失敗:', response.error);
        }
      })
      .catch((err) => console.warn('カテゴリ一覧取得失敗:', err));
  }, []);

  // 新規カテゴリが入力されているかどうか
  const isCreatingNewCategory = newCategoryName.trim().length > 0;

  // 送信時に使用するカテゴリIDを決定する
  const resolvedCategoryId = useMemo(() => {
    if (isCreatingNewCategory) {
      return generateCategoryId(newCategoryName);
    }
    return selectedCategoryId || undefined;
  }, [isCreatingNewCategory, newCategoryName, selectedCategoryId]);

  // クリップ作成ボタンを押したときの処理
  async function handleCreateClip() {
    setLoading(true);
    setMessage('');
    try {
      // 新規カテゴリを作成する必要がある場合は先に作成する
      let categoryId = resolvedCategoryId;
      if (isCreatingNewCategory && categoryId) {
        const createResponse = await chrome.runtime.sendMessage({
          type: 'CREATE_CATEGORY',
          payload: { id: categoryId, name: newCategoryName.trim() },
        });
        if (!createResponse.ok) {
          // 既に存在する場合は、そのIDをそのまま使用してクリップ作成を続行する
          if (createResponse.error && createResponse.error.includes('23505')) {
            // 衝突時は生成したIDをそのまま使う（サーバー側で409が返る）
          } else {
            setMessage(createResponse.error || 'カテゴリ作成に失敗しました');
            setLoading(false);
            return;
          }
        } else {
          categoryId = createResponse.category.id;
        }
      }

      const response = await chrome.runtime.sendMessage({
        type: 'CREATE_CLIP',
        payload: { categoryId, comment: comment.trim() || undefined },
      });
      if (response.ok) {
        setMessage('クリップを投稿しました');
        setNewCategoryName('');
        setComment('');
        setSelectedCategoryId('');
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

      {/* カテゴリ選択 */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 'bold' }}>カテゴリ</label>
        <select
          value={selectedCategoryId}
          onChange={(e) => setSelectedCategoryId(e.target.value)}
          disabled={loading || isCreatingNewCategory || categories.length === 0}
          style={{ width: '100%', padding: 6, fontSize: 13 }}
        >
          <option value="">指定なし（others）</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* 新規カテゴリ入力 */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 'bold' }}>新規カテゴリ</label>
        <input
          type="text"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          disabled={loading}
          placeholder="新しいカテゴリ名"
          style={{ width: '100%', padding: 6, fontSize: 13, boxSizing: 'border-box' }}
        />
        {isCreatingNewCategory && (
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#666' }}>
            ID: {generateCategoryId(newCategoryName)}
          </p>
        )}
      </div>

      {/* コメント入力 */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 'bold' }}>コメント</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={loading}
          placeholder="コメントを入力（任意）"
          rows={3}
          style={{ width: '100%', padding: 6, fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <button
          onClick={handleCreateClip}
          disabled={loading || !page || resolvedCategoryId === ''}
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
