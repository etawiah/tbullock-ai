import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    // Same-origin /api like production; run `npm run worker:dev` (port 8787) alongside.
    proxy: {
      '/api': 'http://127.0.0.1:8787'
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild'
  }
})
