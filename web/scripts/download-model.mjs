import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { copyFile, mkdir, readFile, rename, stat, truncate } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { packageModel, readModelAssets, verifyModelFile } from './model-resources.mjs'

const manifest = JSON.parse(
  await readFile(new URL('./model.manifest.json', import.meta.url), 'utf8'),
)
const root = new URL(`../public/models/${manifest.directory}/`, import.meta.url)
const localAssets = await readModelAssets(root)
const publishedRoot = new URL(`../../docs/models/${manifest.directory}/`, import.meta.url)
const publishedAssets = await readFile(new URL('asset-manifest.json', publishedRoot), 'utf8')
  .then(JSON.parse)
  .catch(() => null)
// The github.io site redirects to this HTTPS Pages CNAME. Never repair model
// resources from the GitHub repository host or an upstream model hub.
const pagesRoot = new URL(`https://toolbox.owo.lat/models/${manifest.directory}/`)
let pagesAssets
async function remoteParts(file) {
  pagesAssets ??= fetch(new URL('asset-manifest.json', pagesRoot), {
    cache: 'no-store',
    signal: AbortSignal.timeout(60_000),
  }).then(async (response) => {
    if (!response.ok) throw new Error(`Pages model manifest: HTTP ${response.status}`)
    return response.json()
  })
  const assets = await pagesAssets
  const asset = assets.files?.[file.path]
  const parts = asset?.parts ?? [{ path: file.path, bytes: file.bytes }]
  if (
    assets.version !== 1 ||
    (asset && asset.bytes !== file.bytes) ||
    parts.some((entry) => !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) ||
    parts.reduce((sum, entry) => sum + entry.bytes, 0) !== file.bytes
  )
    throw new Error(`Invalid Pages model manifest: ${file.path}`)
  for (const entry of parts) {
    const url = new URL(entry.path, pagesRoot)
    if (url.origin !== pagesRoot.origin || !url.pathname.startsWith(pagesRoot.pathname))
      throw new Error('Invalid Pages model part location')
  }
  return parts
}
const size = async (file) => (await stat(file).catch(() => ({ size: 0 }))).size
const hash = async (file) => {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(file)) digest.update(chunk)
  return digest.digest('hex')
}

async function download(file) {
  const target = new URL(file.path, root)
  const part = fileURLToPath(target) + '.part'
  await mkdir(new URL('./', target), { recursive: true })
  try {
    await verifyModelFile(root, file, localAssets)
    console.log(`Verified ${file.path} from local model resources`)
    return
  } catch {
    // Repair missing or corrupt local resources from the published model first.
  }
  if ((await size(target)) === file.bytes && (await hash(target)) === file.sha256) {
    console.log(`Verified ${file.path}`)
    return
  }
  // A clone includes the complete model in docs/. Reuse those resources before
  // contacting the published Pages CDN, including for a future desktop build.
  if (publishedAssets) {
    try {
      const parts = publishedAssets.files[file.path]?.parts
      if (parts) {
        async function* chunks() {
          for (const entry of parts) {
            const path = new URL(entry.path, publishedRoot)
            if ((await size(path)) !== entry.bytes) throw new Error('Incomplete published part')
            yield* createReadStream(path)
          }
        }
        await pipeline(Readable.from(chunks()), createWriteStream(part))
      } else await copyFile(new URL(file.path, publishedRoot), part)
      if ((await size(part)) !== file.bytes || (await hash(part)) !== file.sha256)
        throw new Error('Published resource checksum mismatch')
      await rename(part, target)
      console.log(`Restored and verified ${file.path} from docs/`)
      return
    } catch (error) {
      console.warn(`Cannot restore ${file.path} from docs/: ${error.message}; using Pages CDN`)
      if (await size(part)) await truncate(part, 0)
    }
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      let offset = await size(part)
      if (offset > file.bytes) {
        await truncate(part, 0)
        offset = 0
      }
      if (offset < file.bytes) {
        const parts = await remoteParts(file)
        console.log(
          `Downloading ${file.path} from Pages CDN (${(file.bytes / 1024 / 1024).toFixed(1)} MiB)`,
        )
        async function* chunks() {
          let start = 0
          for (const entry of parts) {
            const skip = Math.max(0, offset - start)
            start += entry.bytes
            if (skip >= entry.bytes) continue
            const response = await fetch(new URL(entry.path, pagesRoot), {
              headers: skip ? { Range: `bytes=${skip}-` } : {},
              signal: AbortSignal.timeout(600_000),
            })
            if (!response.ok || !response.body)
              throw new Error(`HTTP ${response.status}: ${entry.path}`)
            let discard = response.status === 206 ? 0 : skip
            const expected = response.status === 206 ? entry.bytes - skip : entry.bytes
            let received = 0
            for await (const chunk of Readable.fromWeb(response.body)) {
              received += chunk.length
              if (received > expected) throw new Error(`Oversized Pages part: ${entry.path}`)
              const dropped = Math.min(discard, chunk.length)
              discard -= dropped
              if (dropped < chunk.length) yield chunk.subarray(dropped)
            }
            if (received !== expected) throw new Error(`Incomplete Pages part: ${entry.path}`)
          }
        }
        let received = offset
        let logged = offset
        const progress = new Transform({
          transform(chunk, _, done) {
            received += chunk.length
            if (received - logged >= 32 * 1024 * 1024) {
              console.log(`${file.path}: ${((received / file.bytes) * 100).toFixed(0)}%`)
              logged = received
            }
            done(null, chunk)
          },
        })
        await pipeline(
          Readable.from(chunks()),
          progress,
          createWriteStream(part, { flags: offset ? 'a' : 'w' }),
        )
      }
      if ((await size(part)) !== file.bytes || (await hash(part)) !== file.sha256) {
        await truncate(part, 0)
        throw new Error('File size or SHA-256 does not match the locked manifest')
      }
      await rename(part, target)
      console.log(`Verified ${file.path}`)
      return
    } catch (error) {
      console.error(`${file.path}, attempt ${attempt}: ${error.message}`)
      if (attempt === 3) throw error
    }
  }
}

console.log(`${manifest.model}, ${(manifest.bytes / 1024 / 1024).toFixed(1)} MiB, Pages CDN`)
// Independent files download two at a time; completed files are verified and reused.
const queue = [...manifest.files]
await Promise.all(
  Array.from({ length: 2 }, async () => {
    while (queue.length) await download(queue.shift())
  }),
)
await packageModel(root)
await import('./prepare-assets.mjs')
console.log('Model and runtime are ready for local browser inference.')
