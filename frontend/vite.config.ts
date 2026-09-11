import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 后端端口可经 ANT_TORRENT_PORT 覆盖（与 Go 后端读同一变量，缺省 8080）：
// ANT_TORRENT_PORT=8081 npm run dev 时代理目标随之切换
const backendPort = process.env.ANT_TORRENT_PORT || '8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5273,
    // 固定端口：避免与本机其他 Vite 项目（如 5173）混淆
    strictPort: true,
    proxy: {
      // 前端 /qbt-api/* → Go 后端 localhost:${backendPort}/api/*
      '/qbt-api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/qbt-api/, '/api'),
      },
    },
  },
})
