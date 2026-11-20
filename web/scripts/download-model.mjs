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
const source = process.env.FUFU_MODEL_SOURCE === 'huggingface' ? 'huggingface' : 'modelscope'
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
  // contacting an external mirror, including for a future desktop build.
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
      console.warn(`Cannot restore ${file.path} from docs/: ${error.message}; using ${source}`)
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
        const url =
          source === 'huggingface'
            ? `https://huggingface.co/${manifest.model}/resolve/${manifest.huggingFaceRevision}/${file.path}`
            : `https://modelscope.cn/models/${manifest.model}/resolve/${file.revision}/${file.path}`
        console.log(`Downloading ${file.path} (${(file.bytes / 1024 / 1024).toFixed(1)} MiB)`)
        const response = await fetch(url, {
          headers: offset ? { Range: `bytes=${offset}-` } : {},
          signal: AbortSignal.timeout(600_000),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        if (offset && response.status !== 206) {
          await truncate(part, 0)
          offset = 0
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
          Readable.fromWeb(response.body),
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

console.log(`${manifest.model}, ${(manifest.bytes / 1024 / 1024).toFixed(1)} MiB, ${source}`)
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
