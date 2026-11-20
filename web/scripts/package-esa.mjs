import { readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'

const root = new URL('../../docs/', import.meta.url)
const excluded = new Set([
  'runtime/ffmpeg/ffmpeg-core.wasm',
  'runtime/ort-wasm-simd-threaded.asyncify.wasm',
])
// ORT also emits an unused fallback binary. Production explicitly loads the
// runtime from Pages, where the original binaries remain for older open tabs.
for (const file of await readdir(new URL('assets/', root))) {
  if (/^ort-wasm-simd-threaded\.asyncify-[\w-]+\.wasm$/.test(file)) excluded.add(`assets/${file}`)
}
const oversized = []
async function inspect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('ESA artifacts must not contain symbolic links')
    const relative = prefix + entry.name
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    if (entry.isDirectory()) await inspect(url, relative + '/')
    else if ((await stat(url)).size > 25_000_000) {
      if (!excluded.has(relative)) throw new Error(`ESA file exceeds 25 MB: ${relative}`)
      oversized.push(relative)
    }
  }
}
await inspect(root)
for (const relative of oversized) await unlink(new URL(relative, root))
const historyFile = new URL('asset-history.json', root)
const history = JSON.parse(await readFile(historyFile, 'utf8'))
history.builds = history.builds.map((files) =>
  files.filter((file) => !oversized.includes(`assets/${file}`)),
)
await writeFile(historyFile, JSON.stringify(history, null, 2) + '\n')
console.log(`ESA artifact prepared: ${oversized.length} large WASM files served from Pages CDN`)
