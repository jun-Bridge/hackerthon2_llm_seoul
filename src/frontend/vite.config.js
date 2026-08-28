import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8501'  // 로컬 dev 시 백엔드(8501) 프록시. 배포 시엔 같은 서버가 서빙해 프록시 불필요
    }
  }
})
