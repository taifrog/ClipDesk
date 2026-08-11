import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 公開用のベースパス（リポジトリ名と一致）
  base: '/ClipDesk/',
  // ビルド成果物を docs/ に出力（GitHub Pages の公開フォルダ）
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
  plugins: [react()],
  server: {
    // IPv4（127.0.0.1）でListenする（localhostがIPv6に解決される環境対策）
    host: '127.0.0.1',
    // API サーバーへプロキシする
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // ローカル開発時に Supabase Edge Functions へプロキシする
      '/functions/v1': {
        target: 'http://localhost:54321',
        changeOrigin: true,
      },
    },
  },
})
