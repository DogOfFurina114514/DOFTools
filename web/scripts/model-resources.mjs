import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'

export const modelManifest = JSON.parse(
  await readFile(new URL('./model.manifest.json', import.meta.url), 'utf8'),
)
export const maxPartBytes = 48 * 1024 * 1024

export async function readModelAssets(root) {
  try {
    const assets = JSON.parse(await readFile(new URL('asset-manifest.json', root), 'utf8'))
    if (assets.version !== 1 || !assets.files || typeof assets.files !== 'object')
      throw new Error('Invalid model asset manifest')
    return assets
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, files: {} }
    throw error
  }
}

export function modelParts(file) {
  const parts = []
  for (let start = 0; start < file.bytes; start += maxPartBytes) {
    parts.push({
      path: `${file.path}.part-${String(parts.length).padStart(3, '0')}`,
      bytes: Math.min(maxPartBytes, file.bytes - start),
    })
  }
  return parts
}

export async function verifyModelFile(root, file, assets, checksum = true) {
  const asset = assets.files[file.path]
  const parts = asset?.parts ?? [{ path: file.path, bytes: file.bytes }]
  if (
    asset &&
    (asset.bytes !== file.bytes || JSON.stringify(parts) !== JSON.stringify(modelParts(file)))
  )
    throw new Error(`Incorrect model part manifest: ${file.path}`)
  const digest = checksum ? createHash('sha256') : null
  for (const part of parts) {
    if ((await stat(new URL(part.path, root))).size !== part.bytes)
      throw new Error(`Missing or incomplete model resource: ${part.path}`)
    if (digest)
      for await (const chunk of createReadStream(new URL(part.path, root))) digest.update(chunk)
  }
  if (digest && digest.digest('hex') !== file.sha256)
    throw new Error(`Model resource SHA-256 mismatch: ${file.path}`)
}

// Both development and Pages use the same complete, GitHub-safe representation.
// Accept existing parts so a fresh clone can build without untracked raw weights.
export async function packageModel(root) {
  const existing = await readModelAssets(root)
  const assets = { version: 1, files: {} }
  for (const file of modelManifest.files) {
    const target = new URL(file.path, root)
    const rawExists = await stat(target).then(
      () => true,
      (error) => {
        if (error.code === 'ENOENT') return false
        throw error
      },
    )
    await verifyModelFile(root, file, rawExists ? { files: {} } : existing)
    if (file.bytes <= maxPartBytes) continue
    const parts = modelParts(file)
    if (rawExists) {
      let start = 0
      for (const part of parts) {
        await pipeline(
          createReadStream(target, { start, end: start + part.bytes - 1 }),
          createWriteStream(new URL(part.path, root)),
        )
        start += part.bytes
      }
    }
    assets.files[file.path] = { bytes: file.bytes, parts }
  }
  // Publish the matching manifest before removing raw copies.
  await writeFile(new URL('asset-manifest.json', root), JSON.stringify(assets, null, 2) + '\n')
  for (const path of Object.keys(assets.files)) {
    await unlink(new URL(path, root)).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
  console.log(
    `Complete model verified: ${Object.values(assets.files).reduce((sum, asset) => sum + asset.parts.length, 0)} parts, at most 48 MiB each`,
  )
  return assets
}
