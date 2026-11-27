import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), UnoCSS()],
  build: {
    // dash.js 引擎独立 chunk 约 810KB，已按需懒加载，阈值上调以消除告警
    chunkSizeWarningLimit: 900,
  },
})
