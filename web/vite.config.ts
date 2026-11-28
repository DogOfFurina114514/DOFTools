import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { version } from './package.json'
import { retainAssets } from './scripts/retain-assets'

export default defineConfig(({ command, mode }) => {
  const beta = mode === 'beta'
  if (command === 'build' && beta !== version.endsWith('-beta'))
    throw new Error('Use build:beta for a Beta version and build for a stable version.')
  return {
    plugins: beta ? [react()] : [react(), retainAssets()],
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
      outDir: beta ? '../.site-build/beta-build' : '../docs',
      copyPublicDir: !beta,
      emptyOutDir: true,
    },
    worker: { format: 'es' },
  }
})
