import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
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
    },
  },
})
