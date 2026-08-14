import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 本番環境のみ Service Worker を登録する
// Web Share Target からの POST リクエストをアプリ内で処理するために必要
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/ClipDesk/sw.js')
      .then((registration) => {
        console.log('[SW] 登録成功:', registration.scope)
      })
      .catch((error) => {
        console.error('[SW] 登録失敗:', error)
      })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
