import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'

const manifest = JSON.parse(
  await readFile(new URL('./model.manifest.json', import.meta.url), 'utf8'),
)
const root = new URL(`../../docs/models/${manifest.directory}/`, import.meta.url)
const maxPartBytes = 48 * 1024 * 1024
const assets = { version: 1, files: {} }

for (const file of manifest.files) {
  const target = new URL(file.path, root)
  if ((await stat(target)).size !== file.bytes)
    throw new Error(`Missing or incomplete model resource: ${file.path}`)
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(target)) digest.update(chunk)
  if (digest.digest('hex') !== file.sha256)
    throw new Error(`Model resource SHA-256 mismatch: ${file.path}`)
  if (file.bytes <= maxPartBytes) continue

  const parts = []
  for (let start = 0; start < file.bytes; start += maxPartBytes) {
    const path = `${file.path}.part-${String(parts.length).padStart(3, '0')}`
    const bytes = Math.min(maxPartBytes, file.bytes - start)
    await pipeline(
      createReadStream(target, { start, end: start + bytes - 1 }),
      createWriteStream(new URL(path, root)),
    )
    parts.push({ path, bytes })
  }
  assets.files[file.path] = { bytes: file.bytes, parts }
  await unlink(target)
  console.log(`Packaged ${file.path}: ${parts.length} parts, at most 48 MiB each`)
}
await writeFile(new URL('asset-manifest.json', root), JSON.stringify(assets, null, 2) + '\n')
console.log('Complete model packaged for the committed docs/ website.')
