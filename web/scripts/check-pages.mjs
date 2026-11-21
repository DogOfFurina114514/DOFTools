import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'

const root = new URL('../../docs/', import.meta.url)
const esa = process.argv.includes('--esa')
let files = 0
const manifest = JSON.parse(
  await readFile(new URL('./model.manifest.json', import.meta.url), 'utf8'),
)
const modelRoot = new URL(`models/${manifest.directory}/`, root)
const assets = JSON.parse(await readFile(new URL('asset-manifest.json', modelRoot), 'utf8'))
async function size(directory) {
  let bytes = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Pages artifacts must not contain symbolic links')
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    if (entry.isDirectory()) bytes += await size(path)
    else {
      files++
      const fileBytes = (await stat(path)).size
      if (esa && fileBytes > 25_000_000)
        throw new Error(`File exceeds the ESA 25 MB file limit: ${path.pathname}`)
      if (fileBytes > 100 * 1024 * 1024)
        throw new Error(`File exceeds the GitHub Git file limit: ${path.pathname}`)
      bytes += fileBytes
    }
  }
  return bytes
}
for (const file of manifest.files) {
  const asset = assets.files[file.path]
  const parts = asset?.parts ?? [{ path: file.path, bytes: file.bytes }]
  if (
    asset &&
    (asset.bytes !== file.bytes || parts.reduce((sum, part) => sum + part.bytes, 0) !== file.bytes)
  )
    throw new Error(`Incorrect model part manifest: ${file.path}`)
  const digest = createHash('sha256')
  for (const part of parts) {
    const path = new URL(part.path, modelRoot)
    if ((await stat(path)).size !== part.bytes)
      throw new Error(`Incomplete model resource: ${part.path}`)
    for await (const chunk of createReadStream(path)) digest.update(chunk)
  }
  if (digest.digest('hex') !== file.sha256)
    throw new Error(`Model resource SHA-256 mismatch: ${file.path}`)
}
for (const file of [
  'index.html',
  '404.html',
  'CNAME',
  '.nojekyll',
  'favicon.svg',
  'models/basic-pitch/model.json',
  'models/basic-pitch/group1-shard1of1.bin',
  'models/basic-pitch/LICENSE',
  'runtime/tfjs/tfjs-backend-wasm.wasm',
  'runtime/ffmpeg/ffmpeg-core.js',
  'runtime/ffmpeg/ffmpeg-core.wasm',
  'licenses/FFmpeg-SOURCES.md',
  'licenses/FFmpeg-GPLv2.txt',
  'licenses/FFmpeg-GPLv3.txt',
  'runtime/tfjs/tfjs-backend-wasm-simd.wasm',
  'runtime/tfjs/tfjs-backend-wasm-threaded-simd.wasm',
  'runtime/ort-wasm-simd-threaded.asyncify.mjs',
  'runtime/ort-wasm-simd-threaded.asyncify.wasm',
  'runtime/pdf/cmaps/Adobe-GB1-UCS2.bcmap',
  'licenses/mediabunny-v1.66.0.zip',
  'licenses/lame-3.100.tar.gz',
  'licenses/lame/COPYING',
]) {
  if (
    esa &&
    ['runtime/ffmpeg/ffmpeg-core.wasm', 'runtime/ort-wasm-simd-threaded.asyncify.wasm'].includes(
      file,
    )
  )
    continue
  await stat(new URL(file, root))
}
const bytes = await size(root)
const offline = JSON.parse(await readFile(new URL('offline-manifest.json', root), 'utf8'))
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
if (offline.format !== 1 || offline.version !== version || !Array.isArray(offline.resources))
  throw new Error('Offline manifest version does not match the release')
const revision = createHash('sha256')
  .update(JSON.stringify({ version, resources: offline.resources }))
  .digest('hex')
if (offline.revision !== revision) throw new Error('Offline manifest revision mismatch')
await stat(new URL('sw.js', root))
const offlineFiles = new Map(offline.resources.map((resource) => [resource.path, resource]))
const indexResource = offlineFiles.get('index.html')
if (
  !indexResource ||
  indexResource.group !== 'site' ||
  indexResource.source !== 'site' ||
  indexResource.downloadPath !== `offline/index.${indexResource.hash}.bin` ||
  offlineFiles.has(indexResource.downloadPath)
)
  throw new Error('Offline homepage must use a separate immutable binary download')
const indexBytes = await readFile(new URL('index.html', root))
const offlineIndexBytes = await readFile(new URL(indexResource.downloadPath, root))
if (
  !indexBytes.equals(offlineIndexBytes) ||
  offlineIndexBytes.length !== indexResource.bytes ||
  createHash('sha256').update(offlineIndexBytes).digest('hex') !== indexResource.hash
)
  throw new Error('Offline homepage copy does not match the original HTML')
const currentAssets = JSON.parse(await readFile(new URL('asset-history.json', root), 'utf8'))
  .builds[0]
for (const path of [
  'index.html',
  'favicon.svg',
  ...currentAssets.map((file) => `assets/${file}`),
]) {
  if (!offlineFiles.has(path)) throw new Error(`Resource omitted from offline manifest: ${path}`)
}
for (const resource of offline.resources) {
  if (resource.downloadPath && resource !== indexResource)
    throw new Error(`Unexpected offline download alias: ${resource.path}`)
  if (resource.blocks.length !== Math.ceil(resource.bytes / (128 * 1024)))
    throw new Error(`Invalid offline block count: ${resource.path}`)
  if (resource.group !== (resource.path.startsWith('models/') ? 'model' : 'site'))
    throw new Error(`Offline site and model resources must be separate: ${resource.path}`)
  if (/^(models|runtime)\//.test(resource.path) && resource.source !== 'pages')
    throw new Error(`Model and runtime resources must use Pages CDN: ${resource.path}`)
  const omittedWasm =
    resource.path === 'runtime/ffmpeg/ffmpeg-core.wasm' ||
    resource.path === 'runtime/ort-wasm-simd-threaded.asyncify.wasm' ||
    /^assets\/ort-wasm-simd-threaded\.asyncify-[\w-]+\.wasm$/.test(resource.path)
  if (esa && omittedWasm) {
    if (resource.source !== 'pages')
      throw new Error(`ESA offline WASM must use Pages CDN: ${resource.path}`)
  } else if ((await stat(new URL(resource.path, root))).size !== resource.bytes)
    throw new Error(`Offline resource size mismatch: ${resource.path}`)
}
if (esa && files > 2000) throw new Error(`ESA site exceeds the 2000 file limit: ${files}`)
if (bytes >= 1_000_000_000)
  throw new Error(`Pages site exceeds the 1 GB published-site limit: ${bytes} bytes`)
console.log(
  `${esa ? 'ESA' : 'Pages'} artifact ready: ${(bytes / 1024 / 1024).toFixed(1)} MiB, ${files} files, below 1 GB${esa ? ', each file below 25 MB' : ', model and runtime included'}`,
)
