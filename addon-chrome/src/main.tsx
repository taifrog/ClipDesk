// React エントリーポイントの共通処理
// popup.tsx / options.tsx をそれぞれのHTMLにマウントする

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Popup from './popup';
import Options from './options';

// マウント対象のルート要素を取得する
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('root element not found');
}

// 現在のHTMLファイル名に応じて、PopupまたはOptionsをレンダリングする
const path = window.location.pathname;
const Component = path.includes('options') ? Options : Popup;

// React アプリケーションをマウントする
createRoot(rootElement).render(
  <StrictMode>
    <Component />
  </StrictMode>
);
