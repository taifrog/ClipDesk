import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 拡張機能からの POST をテスト用 API サーバーへプロキシする
    proxy: {
      '/api/clip': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
