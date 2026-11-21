import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { decodeBundle, validBundles } from './offline-bundles'
import type { OfflineBundle, OfflineResource } from './resource-cache'

const data = new TextEncoder().encode('<html><body>Offline original</body></html>')
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const resource: OfflineResource = {
  path: 'index.html',
  bytes: data.length,
  hash: hash(data),
  blocks: [hash(data)],
  type: 'text/html',
  source: 'site',
  group: 'site',
}
const compressed = gzipSync(data)
const bundle: OfflineBundle = {
  path: `offline/bundle.${hash(data)}.bin`,
  hash: hash(data),
  bytes: compressed.length,
  decodedBytes: data.length,
  source: 'site',
  members: [{ path: 'index.html', start: 0, offset: 0, bytes: data.length }],
}
const signal = new AbortController().signal

it('verifies original bytes from gzip, independently of the compressor encoding', async () => {
  expect(validBundles([bundle], [resource])).toBe(true)
  for (const level of [1, 9]) {
    const bytes = new Uint8Array(gzipSync(data, { level }))
    expect(await decodeBundle(bytes, bundle, signal)).toEqual(data)
  }
})
it('rejects corruption and output beyond the declared size', async () => {
  const broken = new Uint8Array(compressed)
  broken[broken.length - 1] ^= 1
  await expect(decodeBundle(broken, bundle, signal)).rejects.toThrow(
    'Offline bundle verification failed: index.html',
  )
  await expect(
    decodeBundle(new Uint8Array(gzipSync(new Uint8Array(2 * 1024 * 1024))), bundle, signal),
  ).rejects.toThrow('Offline bundle verification failed')
})
it('rejects model inclusion, duplicate blocks and invalid member bounds', () => {
  expect(validBundles([bundle], [{ ...resource, group: 'model' }])).toBe(false)
  expect(validBundles([bundle, bundle], [resource])).toBe(false)
  expect(
    validBundles([{ ...bundle, members: [{ ...bundle.members[0], start: 1 }] }], [resource]),
  ).toBe(false)
  expect(validBundles([{ ...bundle, path: '../bundle.bin' }], [resource])).toBe(false)
})
