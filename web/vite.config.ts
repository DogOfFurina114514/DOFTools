import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { retainAssets } from './scripts/retain-assets'

export default defineConfig({
  plugins: [react(), retainAssets()],
  base: '/',
  optimizeDeps: {
    include: [
      'mediabunny',
      '@mediabunny/mp3-encoder',
      '@mediabunny/flac-encoder',
      'pdfjs-dist',
      'pdf-lib',
      'docx',
      'docx-preview',
      'pptxgenjs',
      '@e965/xlsx',
      '@zip.js/zip.js',
      'html2canvas',
      '@tonejs/midi',
      '@spotify/basic-pitch',
      '@tensorflow/tfjs',
      '@tensorflow/tfjs-backend-wasm',
    ],
  },
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  },
  worker: { format: 'es' },
})
