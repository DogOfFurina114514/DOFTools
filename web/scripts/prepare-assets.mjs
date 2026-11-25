import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { modelManifest, readModelAssets, verifyModelFile } from './model-resources.mjs'

const root = new URL('../', import.meta.url)
const modelRoot = new URL(`public/models/${modelManifest.directory}/`, root)
// Preserve the committed part manifest. Replacing it with an empty object makes
// Transformers.js request raw weights that do not exist in a fresh checkout.
const modelAssets = await readModelAssets(modelRoot)
for (const file of modelManifest.files) {
  try {
    await verifyModelFile(modelRoot, file, modelAssets, false)
  } catch (error) {
    throw new Error(
      `Local model is incomplete (${file.path}). Run npm run model:download to repair it.`,
      { cause: error },
    )
  }
}
// Generated assets are marked -text in Git; normalize copied text explicitly
// so a Windows checkout produces the same license bytes as other platforms.
async function copyText(source, target) {
  await writeFile(target, (await readFile(source, 'utf8')).replace(/\r\n/g, '\n'))
}
await mkdir(new URL('public/runtime/', root), { recursive: true })
await mkdir(new URL('public/runtime/ffmpeg/', root), { recursive: true })
for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  await copyFile(
    new URL(`node_modules/@ffmpeg/core/dist/esm/${file}`, root),
    new URL(`public/runtime/ffmpeg/${file}`, root),
  )
}
await mkdir(new URL('public/models/qwen3.5-0.8b/', root), { recursive: true })
await cp(
  new URL('node_modules/@spotify/basic-pitch/model/', root),
  new URL('public/models/basic-pitch/', root),
  { recursive: true },
)
await copyText(
  new URL('node_modules/@spotify/basic-pitch/LICENSE', root),
  new URL('public/models/basic-pitch/LICENSE', root),
)
await mkdir(new URL('public/runtime/tfjs/', root), { recursive: true })
for (const file of [
  'tfjs-backend-wasm.wasm',
  'tfjs-backend-wasm-simd.wasm',
  'tfjs-backend-wasm-threaded-simd.wasm',
]) {
  await copyFile(
    new URL(`node_modules/@tensorflow/tfjs-backend-wasm/dist/${file}`, root),
    new URL(`public/runtime/tfjs/${file}`, root),
  )
}
for (const file of [
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
]) {
  await copyFile(
    new URL(`node_modules/onnxruntime-web/dist/${file}`, root),
    new URL(`public/runtime/${file}`, root),
  )
}
await mkdir(new URL('public/licenses/', root), { recursive: true })
for (const file of ['KGG-Decryptor-MIT.txt', 'KugouDecryption-MIT.txt', 'MyKgmWasm-MIT.txt', 'KUGOU-SOURCES.md']) {
  await copyText(new URL(`../documentation/third-party/${file}`, root), new URL(`public/licenses/${file}`, root))
}
await copyText(new URL('node_modules/sql.js/LICENSE', root), new URL('public/licenses/sql.js-LICENSE.txt', root))
await copyText(
  new URL('../documentation/third-party/FFmpeg-SOURCES.md', root),
  new URL('public/licenses/FFmpeg-SOURCES.md', root),
)
await copyText(
  new URL('../documentation/third-party/FFmpeg-GPLv2.txt', root),
  new URL('public/licenses/FFmpeg-GPLv2.txt', root),
)
await copyText(
  new URL('../documentation/third-party/FFmpeg-GPLv3.txt', root),
  new URL('public/licenses/FFmpeg-GPLv3.txt', root),
)
for (const source of ['mediabunny-v1.66.0.zip', 'lame-3.100.tar.gz']) {
  await copyFile(
    new URL(`../documentation/third-party/${source}`, root),
    new URL(`public/licenses/${source}`, root),
  )
}
await cp(
  new URL('node_modules/@mediabunny/mp3-encoder/licenses/lame/', root),
  new URL('public/licenses/lame/', root),
  { recursive: true },
)
await cp(
  new URL('node_modules/@mediabunny/flac-encoder/licenses/libflac/', root),
  new URL('public/licenses/libflac/', root),
  { recursive: true },
)
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(
    new URL(`node_modules/pdfjs-dist/${directory}/`, root),
    new URL(`public/runtime/pdf/${directory}/`, root),
    { recursive: true },
  )
}
for (const font of ['roboto', 'vt323']) {
  await copyText(
    new URL(`node_modules/@fontsource/${font}/LICENSE`, root),
    new URL(`public/licenses/${font}.txt`, root),
  )
}
await copyText(
  new URL('../documentation/third-party/Qwen3.5-LICENSE.txt', root),
  new URL('public/licenses/Qwen3.5.txt', root),
)
for (const file of ['LICENSE', 'NOTICE']) {
  await copyText(new URL(`../${file}`, root), new URL(`public/licenses/PROJECT-${file}.txt`, root))
}
await import('./license-notices.mjs')
console.log(`Local WebGPU runtime prepared: ${fileURLToPath(new URL('public/runtime/', root))}`)
