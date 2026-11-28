import { createHash } from 'node:crypto'
import { readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const MAX_BYTES = 1024 * 1024
const BETA_RESERVE = 3 * 1024 * 1024
async function size(directory, omitted = new Set()) {
  let bytes = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (omitted.has(entry.name)) continue
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    bytes += entry.isDirectory() ? await size(path) : (await stat(path)).size
  }
  return bytes
}

export async function packageOfflineBundles(root, resources) {
  const folder = new URL('offline/', root)
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Unexpected offline resource symbolic link')
    if (entry.isFile() && /^bundle\.[a-f0-9]{64}\.bin$/.test(entry.name))
      await unlink(new URL(entry.name, folder))
  }
  const candidates = []
  const files = [
    ...new Map(
      resources
        .filter((resource) => resource.group === 'site')
        .map((resource) => [resource.hash, resource]),
    ).values(),
  ]
  for (const source of ['site', 'pages']) {
    let chunks = [],
      members = [],
      length = 0
    const flush = () => {
      if (!length) return
      const decoded = Buffer.concat(chunks)
      const bytes = gzipSync(decoded, { level: 9 })
      const digest = hash(decoded)
      candidates.push({
        bytes,
        bundle: {
          path: `offline/bundle.${digest}.bin`,
          hash: digest,
          bytes: bytes.length,
          decodedBytes: length,
          source,
          members,
        },
      })
      chunks = []
      members = []
      length = 0
    }
    // Pack small files together, then use bounded independent chunks for large
    // runtimes. Each member contains complete normalized cache blocks.
    const ordered = files
      .filter((file) => file.source === source)
      .sort(
        (a, b) =>
          (a.bytes > MAX_BYTES) - (b.bytes > MAX_BYTES) || a.path.localeCompare(b.path, 'en'),
      )
    for (const file of ordered) {
      const data = await readFile(new URL(file.path, root))
      for (let start = 0; start < data.length; start += MAX_BYTES) {
        const chunk = data.subarray(start, start + MAX_BYTES)
        if (length + chunk.length > MAX_BYTES) flush()
        members.push({ path: file.path, start, offset: length, bytes: chunk.length })
        chunks.push(chunk)
        length += chunk.length
      }
    }
    flush()
  }
  // Keep original URLs and the previous builds intact. Only spend the remaining
  // Pages space on transport copies with the best savings and request reduction.
  // The manifest and embedded worker are written after these copies. Reserve
  // both copies of the maximum metadata plus worker code; do not double-count
  // their previous contents when packaging the same build again.
  const metadata = Buffer.byteLength(
    JSON.stringify({ resources, bundles: candidates.map(({ bundle }) => bundle) }),
  )
  let remaining = Math.max(
    0,
    1_000_000_000 -
      BETA_RESERVE -
      (await size(root, new Set(['offline-manifest.json', 'sw.js']))) -
      metadata * 2 -
      512 * 1024,
  )
  candidates.sort((a, b) => {
    const priority = ({ bundle }) =>
      Number(
        bundle.members.some(
          (member) => member.path === 'runtime/ort-wasm-simd-threaded.asyncify.wasm',
        ),
      )
    const score = ({ bytes, bundle }) =>
      (bundle.decodedBytes - bytes.length + bundle.members.length * 4096) / bytes.length
    return priority(b) - priority(a) || score(b) - score(a)
  })
  const bundles = []
  let saved = 0
  for (const { bytes, bundle } of candidates) {
    if (
      bytes.length > remaining ||
      (bytes.length >= bundle.decodedBytes && bundle.members.length === 1)
    )
      continue
    await writeFile(new URL(bundle.path, root), bytes)
    remaining -= bytes.length
    saved += bundle.decodedBytes - bytes.length
    bundles.push(bundle)
  }
  bundles.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  console.log(
    `Offline compressed transport: ${bundles.length} bundles, saves ${(saved / 1024 / 1024).toFixed(1)} MiB on a fresh download`,
  )
  return bundles
}
