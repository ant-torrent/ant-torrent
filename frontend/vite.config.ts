import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
      // 前端 /qbt-api/* → Go 后端 localhost:8080/api/*
      '/qbt-api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/qbt-api/, '/api'),
      },
    },
  },
})
