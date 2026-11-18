import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
    ],
  },
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  },
  worker: { format: 'es' },
})
