import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const docs = new URL('../../docs/', import.meta.url)
const build = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2]) + sep)
  : new URL('../../.site-build/beta-build/', import.meta.url)
const { version } = JSON.parse(await readFile(new URL('build.json', build), 'utf8'))
if (typeof version !== 'string' || !/^\d+\.\d+\.\d+ Beta$/.test(version))
  throw new Error('Invalid Beta version')

const page = (await readFile(new URL('index.html', build), 'utf8')).replace(/\r+\n/g, '\n')
if (!page.includes("'/beta/'") || !page.includes('/assets/'))
  throw new Error('Invalid Beta entry paths')

const assets = (await readdir(new URL('assets/', build))).sort()
const missing = []
let addedBytes = Buffer.byteLength(page)
for (const name of assets) {
  if (!/^[\w.-]+$/.test(name) || name.startsWith('.')) throw new Error('Invalid asset path')
  const source = new URL(`assets/${name}`, build)
  const target = new URL(`assets/${name}`, docs)
  const existing = await readFile(target).catch((error) => {
    if (error.code !== 'ENOENT') throw error
  })
  if (existing) {
    if (!existing.equals(await readFile(source))) throw new Error(`Asset conflict: ${name}`)
  } else {
    missing.push(name)
    addedBytes += (await stat(source)).size
  }
}

async function size(directory) {
  let bytes = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Unexpected symbolic link in Pages')
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    bytes += entry.isDirectory() ? await size(path) : (await stat(path)).size
  }
  return bytes
}

const manifest = JSON.stringify({ version, assets }) + '\n'
if ((await size(docs)) + addedBytes + Buffer.byteLength(manifest) >= 1_000_000_000)
  throw new Error('Combined Stable and Beta site exceeds the Pages size limit')
for (const name of missing)
  await copyFile(new URL(`assets/${name}`, build), new URL(`assets/${name}`, docs))
await mkdir(new URL('beta/', docs), { recursive: true })
await writeFile(new URL('beta/index.html', docs), page)
await writeFile(new URL('beta/channel.json', docs), manifest)
console.log(`${version}: ${missing.length} new files, ${assets.length - missing.length} shared`)
