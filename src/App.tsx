import { useEffect, useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'

// 拡張機能から受信したクリップ情報
interface Clip {
  id: number
  url: string
  title: string
  summary: string
  receivedAt: string
}

function App() {
  const [count, setCount] = useState(0)
  const [clips, setClips] = useState<Clip[]>([])

  // クリップ一覧を API サーバーから取得する
  const fetchClips = async () => {
    try {
      const response = await fetch('/api/clip')
      const data = await response.json()
      setClips(data.clips || [])
    } catch (err) {
      console.error('クリップ取得失敗:', err)
    }
  }

  // 初回表示時と 5 秒ごとに最新のクリップを取得する
  useEffect(() => {
    fetchClips()
    const interval = setInterval(fetchClips, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      <section id="center">
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>
        <div>
          <h1>ClipDesk</h1>
          <p>
            Edit <code>src/App.tsx</code> and save to test <code>HMR</code>
          </p>
        </div>
        <button
          type="button"
          className="counter"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count}
        </button>
      </section>

      <div className="ticks"></div>

      {/* 拡張機能から投稿されたクリップを表示するエリア */}
      <section id="clips">
        <h2>受信したクリップ（テスト表示）</h2>
        <button type="button" onClick={fetchClips}>
          更新
        </button>
        {clips.length === 0 ? (
          <p>まだクリップが届いていません。</p>
        ) : (
          <ul className="clip-list">
            {clips.map((clip) => (
              <li key={clip.id} className="clip-item">
                <div className="clip-title">
                  <a href={clip.url} target="_blank" rel="noreferrer">
                    {clip.title}
                  </a>
                </div>
                <div className="clip-meta">{clip.receivedAt}</div>
                <div className="clip-summary">{clip.summary}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="ticks"></div>

      <section id="next-steps">
        <div id="docs">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#documentation-icon"></use>
          </svg>
          <h2>Documentation</h2>
          <p>Your questions, answered</p>
          <ul>
            <li>
              <a href="https://vite.dev/" target="_blank">
                <img className="logo" src={viteLogo} alt="" />
                Explore Vite
              </a>
            </li>
            <li>
              <a href="https://react.dev/" target="_blank">
                <img className="button-icon" src={reactLogo} alt="" />
                Learn more
              </a>
            </li>
          </ul>
        </div>
        <div id="social">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#social-icon"></use>
          </svg>
          <h2>Connect with us</h2>
          <p>Join the Vite community</p>
          <ul>
            <li>
              <a href="https://github.com/vitejs/vite" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#github-icon"></use>
                </svg>
                GitHub
              </a>
            </li>
            <li>
              <a href="https://chat.vite.dev/" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#discord-icon"></use>
                </svg>
                Discord
              </a>
            </li>
            <li>
              <a href="https://x.com/vite_js" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#x-icon"></use>
                </svg>
                X.com
              </a>
            </li>
            <li>
              <a href="https://bsky.app/profile/vite.dev" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#bluesky-icon"></use>
                </svg>
                Bluesky
              </a>
            </li>
          </ul>
        </div>
      </section>

      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

export default App
