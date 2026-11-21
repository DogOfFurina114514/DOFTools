// Fixed, bounded records avoid browser cache limits on large ONNX responses.
export const RESOURCE_BLOCK_BYTES = 128 * 1024
export const RESOURCE_DATABASE = 'fufu-resources-v1'
export interface OfflineResource {
  path: string
  downloadPath?: string
  bytes: number
  hash: string
  blocks: string[]
  source: 'site' | 'pages'
  group: 'site' | 'model'
  aiRequired?: boolean
  type: string
}
export interface OfflineManifest {
  format: 1
  version: string
  revision: string
  resources: OfflineResource[]
}
export interface ResourceControl {
  epoch: number
  modelEpoch?: number
  enabled: boolean
  modelBytes?: number
  latest?: OfflineManifest
  active?: OfflineManifest
}
interface BlockRecord {
  key: string
  group: OfflineResource['group']
  data: Uint8Array<ArrayBuffer>
}
let database: Promise<IDBDatabase> | undefined
function openDatabase() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(RESOURCE_DATABASE, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('control')
      request.result.createObjectStore('blocks', { keyPath: 'key' }).createIndex('group', 'group')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch((error) => {
    database = undefined
    throw error
  }))
}
function result<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
function completed(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('Resource storage aborted'))
    transaction.onerror = () => reject(transaction.error)
  })
}
async function readControl(store: IDBObjectStore, manifests: boolean): Promise<ResourceControl> {
  const [stored, latest, active] = await Promise.all([
    result<ResourceControl | undefined>(store.get('state')),
    manifests ? result<OfflineManifest | undefined>(store.get('latest')) : undefined,
    manifests ? result<OfflineManifest | undefined>(store.get('active')) : undefined,
  ])
  const state = stored ?? { epoch: 0, enabled: false }
  return manifests
    ? { ...state, latest: latest ?? state.latest, active: active ?? state.active }
    : state
}
function metadata(state: ResourceControl) {
  const { latest: _latest, active: _active, ...data } = state
  return data
}
export async function resourceControl(manifests = true): Promise<ResourceControl> {
  const db = await openDatabase()
  return readControl(db.transaction('control').objectStore('control'), manifests)
}
export async function changeResourceControl(change: (state: ResourceControl) => ResourceControl) {
  const db = await openDatabase()
  const transaction = db.transaction('control', 'readwrite')
  const done = completed(transaction)
  const store = transaction.objectStore('control')
  const state = change(await readControl(store, true))
  // Large immutable manifests have separate records. Every range updates only
  // the tiny epoch/counter record rather than cloning the full resource list.
  store.put(metadata(state), 'state')
  if (state.latest) store.put(state.latest, 'latest')
  else store.delete('latest')
  if (state.active) store.put(state.active, 'active')
  else store.delete('active')
  await done
  return state
}
const key = (resource: OfflineResource, index: number) =>
  `${resource.group}:${resource.hash}:${index}`
export async function readResourceBlocks(resource: OfflineResource, start: number, end: number) {
  const db = await openDatabase()
  const store = db.transaction('blocks').objectStore('blocks')
  const first = Math.floor(start / RESOURCE_BLOCK_BYTES)
  const last = Math.floor(end / RESOURCE_BLOCK_BYTES)
  const records = await Promise.all(
    Array.from({ length: last - first + 1 }, (_, offset) =>
      result<BlockRecord | undefined>(store.get(key(resource, first + offset))),
    ),
  )
  if (records.some((record) => !record)) return undefined
  return records.map((record, offset) => {
    const blockStart = (first + offset) * RESOURCE_BLOCK_BYTES
    return record!.data.subarray(
      Math.max(0, start - blockStart),
      Math.min(record!.data.length, end + 1 - blockStart),
    )
  })
}
export async function resourceCoverage(resource: OfflineResource) {
  return (await resourceCoverages([resource]))[0]
}
export async function resourceCoverages(resources: OfflineResource[]) {
  const db = await openDatabase()
  const store = db.transaction('blocks').objectStore('blocks')
  return Promise.all(
    resources.map((resource) =>
      Promise.all(resource.blocks.map((_, index) => result(store.count(key(resource, index))))),
    ),
  )
}
export async function saveResourceBytes(
  resource: OfflineResource,
  start: number,
  bytes: Uint8Array,
  epoch: number,
) {
  const blocks: BlockRecord[] = []
  // Store only complete normalized blocks, including the final short block.
  for (let offset = 0; offset < bytes.length;) {
    const position = start + offset
    const index = Math.floor(position / RESOURCE_BLOCK_BYTES)
    const length = Math.min(RESOURCE_BLOCK_BYTES, resource.bytes - position)
    if (position % RESOURCE_BLOCK_BYTES || offset + length > bytes.length) break
    const data = bytes.slice(offset, offset + length)
    blocks.push({ key: key(resource, index), group: resource.group, data })
    offset += length
  }
  // Avoid one serialized crypto round trip per block on mobile. Bound the
  // batch size and verify every block before starting a write transaction.
  for (let first = 0; first < blocks.length; first += 8)
    await Promise.all(
      blocks.slice(first, first + 8).map(async (block, offset) => {
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', block.data))]
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('')
        const index = Math.floor(start / RESOURCE_BLOCK_BYTES) + first + offset
        if (hash !== resource.blocks[index])
          throw new Error(`Resource checksum mismatch: ${resource.path}`)
      }),
    )
  const db = await openDatabase()
  const transaction = db.transaction(['control', 'blocks'], 'readwrite')
  const done = completed(transaction)
  try {
    const state: ResourceControl = (await result(
      transaction.objectStore('control').get('state'),
    )) ?? { epoch: 0, enabled: false }
    // Clearing increments the durable epoch in the same transaction as deletion.
    // Requests started in other tabs/workers cannot recreate cleared resources.
    if ((resource.group === 'model' ? (state.modelEpoch ?? 0) : state.epoch) === epoch) {
      const store = transaction.objectStore('blocks')
      for (const block of blocks) {
        if (block.group === 'model' && !(await result(store.count(block.key))))
          state.modelBytes = (state.modelBytes ?? 0) + block.data.byteLength
        store.put(block)
      }
      if (resource.group === 'model')
        transaction.objectStore('control').put(metadata(state), 'state')
    }
    await done
  } catch (error) {
    try {
      transaction.abort()
    } catch {
      /* It may already have aborted. */
    }
    await done.catch(() => {})
    throw error
  }
}
export async function clearResourceBytes(modelsOnly: boolean) {
  const db = await openDatabase()
  const transaction = db.transaction(['control', 'blocks'], 'readwrite')
  const done = completed(transaction)
  const control = transaction.objectStore('control')
  const state: ResourceControl = (await result(control.get('state'))) ?? {
    epoch: 0,
    enabled: false,
  }
  if (modelsOnly) {
    state.modelEpoch = (state.modelEpoch ?? 0) + 1
    state.modelBytes = 0
  } else {
    state.epoch++
    state.active = undefined
    state.enabled = false
  }
  control.put(metadata(state), 'state')
  if (!modelsOnly) control.delete('active')
  const blocks = transaction.objectStore('blocks')
  {
    const cursor = blocks.index('group').openCursor(IDBKeyRange.only(modelsOnly ? 'model' : 'site'))
    cursor.onsuccess = () => {
      if (cursor.result) {
        cursor.result.delete()
        cursor.result.continue()
      }
    }
  }
  await done
  return state
}
export async function savedModelBytes() {
  return (await resourceControl(false)).modelBytes ?? 0
}
