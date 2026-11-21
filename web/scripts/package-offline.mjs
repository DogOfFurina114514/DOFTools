import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { packageOfflineBundles } from './package-offline-bundles.mjs'

const root = new URL('../../docs/', import.meta.url)
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const currentAssets = new Set(
  JSON.parse(await readFile(new URL('asset-history.json', root), 'utf8')).builds[0],
)
const skipped = new Set([
  'CNAME',
  '.nojekyll',
  '404.html',
  'asset-history.json',
  'offline-manifest.json',
  'sw.js',
])
const types = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
  wasm: 'application/wasm',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
// HTML may be rewritten by a hosting platform or an HTTP proxy. Download an
// immutable binary copy for offline navigation, retaining the original hashes
// and serving the verified bytes as HTML from the resource cache.
const index = await readFile(new URL('index.html', root))
const indexDownloadPath = `offline/index.${hash(index)}.bin`
await mkdir(new URL('offline/', root), { recursive: true })
await writeFile(new URL(indexDownloadPath, root), index)
const resources = []
async function inspect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name
    if (path === 'offline') continue
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link: ${path}`)
    if (entry.isDirectory()) await inspect(new URL(entry.name + '/', directory), path + '/')
    else {
      if (skipped.has(path) || (prefix === 'assets/' && !currentAssets.has(entry.name))) continue
      const bytes = await readFile(new URL(entry.name, directory))
      const blocks = []
      for (let offset = 0; offset < bytes.length; offset += 128 * 1024)
        blocks.push(hash(bytes.subarray(offset, offset + 128 * 1024)))
      resources.push({
        path,
        ...(path === 'index.html' ? { downloadPath: indexDownloadPath } : {}),
        bytes: bytes.length,
        hash: hash(bytes),
        blocks,
        source:
          /^(models|runtime)\//.test(path) || /ort-wasm.*\.wasm$/.test(path) ? 'pages' : 'site',
        group: /^models\//.test(path) ? 'model' : 'site',
        aiRequired:
          /^models\/qwen3\.5-0\.8b\//.test(path) &&
          // Transformers uses preprocessor_config.json; processor_config.json
          // is optional metadata and is not fetched when the model loads.
          !/(?:README\.md|chat_template\.jinja|LICENSE|processor_config\.json)$/.test(path),
        type: types[path.split('.').pop()] ?? 'application/octet-stream',
      })
    }
  }
}
await inspect(root)
resources.sort((a, b) => a.path.localeCompare(b.path, 'en'))
const bundles = await packageOfflineBundles(root, resources)
const manifest = {
  format: 1,
  version,
  revision: hash(JSON.stringify({ version, resources, bundles })),
  resources,
  bundles,
}
await writeFile(new URL('offline-manifest.json', root), JSON.stringify(manifest) + '\n')
await build({
  entryPoints: [fileURLToPath(new URL('../src/offline.worker.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('sw.js', root)),
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2022',
  define: { __OFFLINE_MANIFEST__: JSON.stringify(manifest), 'import.meta.env.DEV': 'false' },
})
console.log(`Offline resources packaged: ${resources.length} files, version ${version}`)
