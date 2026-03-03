import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/math-word-correction/' : '/',
  plugins: [react()],
  server: {
    proxy: {
      '/qwen-api': {
        target: 'https://dashscope.aliyuncs.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/qwen-api/, '')
      }
    }
  }
})
