import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/events':    'http://localhost:3001',
      '/sketches':  'http://localhost:3001',
      '/generated': 'http://localhost:3001',
      '/prompt':    'http://localhost:3001',
      '/sketch':    'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
