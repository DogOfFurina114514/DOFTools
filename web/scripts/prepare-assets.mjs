import { copyFile, cp, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
await mkdir(new URL('public/runtime/', root), { recursive: true })
await mkdir(new URL('public/models/qwen3.5-0.8b/', root), { recursive: true })
await writeFile(
  new URL('public/models/qwen3.5-0.8b/asset-manifest.json', root),
  JSON.stringify({ version: 1, files: {} }) + '\n',
)
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
  await copyFile(
    new URL(`node_modules/@fontsource/${font}/LICENSE`, root),
    new URL(`public/licenses/${font}.txt`, root),
  )
}
await copyFile(
  new URL('../documentation/third-party/Qwen3.5-LICENSE.txt', root),
  new URL('public/licenses/Qwen3.5.txt', root),
)
for (const file of ['LICENSE', 'NOTICE']) {
  await copyFile(new URL(`../${file}`, root), new URL(`public/licenses/PROJECT-${file}.txt`, root))
}
await import('./license-notices.mjs')
console.log(`Local WebGPU runtime prepared: ${fileURLToPath(new URL('public/runtime/', root))}`)
