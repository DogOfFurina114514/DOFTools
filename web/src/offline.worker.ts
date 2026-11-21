/// <reference lib="webworker" />
import {
  RESOURCE_BLOCK_BYTES,
  changeResourceControl,
  clearResourceBytes,
  readResourceBlocks,
  resourceControl,
  resourceCoverage,
  savedModelBytes,
  saveResourceBytes,
  type OfflineManifest,
  type OfflineResource,
} from './lib/resource-cache'
import { createDownloadPool } from './lib/model-assets'
import { createModelRequest } from './lib/model-network'
import { PAGES_RESOURCE_BASE } from './lib/site-resources'

declare const __OFFLINE_MANIFEST__: OfflineManifest
const sw = self as unknown as ServiceWorkerGlobalScope
const embedded = __OFFLINE_MANIFEST__
const siteBase = new URL(sw.registration.scope)
let manifest = embedded
let previous: OfflineManifest | undefined
let threads = 64
const pool = createDownloadPool(threads)
let saving: AbortController | undefined
let modelSaving: AbortController | undefined
let commandQueue = Promise.resolve()
let state = {
  enabled: false,
  phase: 'idle',
  loaded: 0,
  total: 0,
  file: '',
  error: '',
  modelsBytes: 0,
  modelPhase: 'idle',
  modelLoaded: 0,
  modelTotal: 0,
  modelFile: '',
  modelError: '',
  aiReady: false,
  version: embedded.version,
}
// A worker can be stopped and restarted independently of install/activate.
const hydrated = resourceControl()
  .then((control) => {
    manifest = control.latest ?? embedded
    previous = control.active
    state.enabled = control.enabled
  })
  .catch(() => {})
async function broadcast(message: unknown) {
  for (const client of await sw.clients.matchAll({ includeUncontrolled: true, type: 'window' }))
    client.postMessage(message)
}
async function report(update: Partial<typeof state> = {}) {
  state = { ...state, ...update }
  await broadcast({ type: 'resource-status', state })
}
function resourceUrl(resource: OfflineResource) {
  return new URL(resource.path, resource.source === 'pages' ? PAGES_RESOURCE_BASE : siteBase).href
}
function findResource(url: string, target = manifest) {
  const location = new URL(url)
  const root = location.origin === siteBase.origin ? siteBase : new URL(PAGES_RESOURCE_BASE)
  if (location.origin !== root.origin || !location.pathname.startsWith(root.pathname))
    return undefined
  const path = decodeURI(location.pathname.slice(root.pathname.length))
  return target.resources.find((resource) => resource.path === path)
}
function byteRange(request: Request, size: number): [number, number] | undefined {
  const range = request.headers.get('range')
  if (!range) return [0, size - 1]
  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (!match || (!match[1] && !match[2])) return undefined
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end
    ? [start, end]
    : undefined
}
async function cached(resource: OfflineResource, request: Request) {
  const range = byteRange(request, resource.bytes)
  if (!range)
    return new Response(null, {
      status: 416,
      headers: { 'content-range': `bytes */${resource.bytes}` },
    })
  const [start, end] = range
  const bytes = await readResourceBlocks(resource, start, end)
  if (!bytes) return undefined
  let index = 0
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < bytes.length) controller.enqueue(bytes[index++])
        else controller.close()
      },
    }),
    {
      status: request.headers.has('range') ? 206 : 200,
      headers: {
        'content-type': resource.type,
        'content-length': String(end - start + 1),
        'accept-ranges': 'bytes',
        'x-fufu-resource-source': 'local',
        ...(request.headers.has('range')
          ? { 'content-range': `bytes ${start}-${end}/${resource.bytes}` }
          : {}),
      },
    },
  )
}
async function download(
  resource: OfflineResource,
  request: Request,
  signal: AbortSignal,
  mustSave: boolean,
) {
  const control = await resourceControl(false)
  return pool(signal, async () => {
    const headers = new Headers()
    const range = request.headers.get('range')
    if (range) headers.set('range', range)
    const response = await createModelRequest()(resourceUrl(resource), {
      headers,
      signal,
      cache: 'no-store',
      credentials: 'omit',
      mode: 'cors',
    })
    if (!response.ok) {
      if (!mustSave) return response
      throw new TypeError(`HTTP ${response.status}: ${resource.path}`)
    }
    const limits = byteRange(request, resource.bytes)
    if (!limits || (range && response.status !== 206))
      throw new Error(`Invalid resource range: ${resource.path}`)
    // Pages permits CORS but does not expose Content-Range across origins.
    // The normalized block hashes verify the bytes even when it is hidden.
    const contentRange = response.headers.get('content-range')
    if (
      range &&
      contentRange &&
      contentRange !== `bytes ${limits[0]}-${limits[1]}/${resource.bytes}`
    )
      throw new Error(`Incorrect resource range: ${resource.path}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    signal.throwIfAborted()
    if (bytes.length !== limits[1] - limits[0] + 1)
      throw new Error(`Incomplete resource: ${resource.path}`)
    if (mustSave || resource.group === 'model' || control.enabled) {
      try {
        await saveResourceBytes(
          resource,
          limits[0],
          bytes,
          resource.group === 'model' ? (control.modelEpoch ?? 0) : control.epoch,
        )
      } catch (error) {
        await report(
          resource.group === 'model'
            ? { modelError: storageError(error) }
            : { error: storageError(error) },
        )
        if (mustSave) throw error
      }
    }
    return new Response(bytes, { status: response.status, headers: response.headers })
  })
}
function storageError(error: unknown) {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return 'quota'
  return error instanceof Error ? error.message : String(error)
}
function validManifest(value: unknown): value is OfflineManifest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as OfflineManifest
  return (
    candidate.format === 1 &&
    typeof candidate.version === 'string' &&
    /^[a-f0-9]{64}$/.test(candidate.revision) &&
    Array.isArray(candidate.resources) &&
    candidate.resources.every(
      (resource) =>
        typeof resource.path === 'string' &&
        /^[\w./@-]+$/.test(resource.path) &&
        !resource.path.startsWith('/') &&
        !resource.path.split('/').includes('..') &&
        Number.isSafeInteger(resource.bytes) &&
        resource.bytes >= 0 &&
        /^[a-f0-9]{64}$/.test(resource.hash) &&
        Array.isArray(resource.blocks) &&
        resource.blocks.length === Math.ceil(resource.bytes / RESOURCE_BLOCK_BYTES) &&
        resource.blocks.every((hash) => /^[a-f0-9]{64}$/.test(hash)) &&
        ['site', 'pages'].includes(resource.source) &&
        ['site', 'model'].includes(resource.group) &&
        typeof resource.type === 'string',
    )
  )
}
async function checkManifest(signal: AbortSignal) {
  const response = await createModelRequest(fetch, 15_000)(
    new URL('offline-manifest.json', siteBase),
    { cache: 'no-store', signal },
  )
  if (!response.ok) throw new Error(`Offline manifest: HTTP ${response.status}`)
  const next: unknown = await response.json()
  if (!validManifest(next)) throw new Error('Invalid offline resource manifest')
  manifest = next
  await changeResourceControl((control) => ({ ...control, latest: manifest }))
}
async function aiResourcesReady() {
  const required = manifest.resources.filter((resource) => resource.aiRequired)
  if (!required.length) return false
  for (const resource of required)
    if ((await resourceCoverage(resource)).some((present) => !present)) return false
  return true
}
async function saveResources(
  resources: OfflineResource[],
  signal: AbortSignal,
  progress: (loaded: number, total: number, file: string) => Promise<void>,
) {
  resources = [
    ...new Map(
      resources.map((resource) => [`${resource.group}:${resource.hash}`, resource]),
    ).values(),
  ]
  let loaded = 0
  const total = resources.reduce((sum, resource) => sum + resource.bytes, 0)
  const tasks: { resource: OfflineResource; start: number; end: number }[] = []
  for (const resource of resources) {
    signal.throwIfAborted()
    const coverage = await resourceCoverage(resource)
    coverage.forEach((present, index) => {
      if (present)
        loaded += Math.min(RESOURCE_BLOCK_BYTES, resource.bytes - index * RESOURCE_BLOCK_BYTES)
    })
    for (let index = 0; index < coverage.length;) {
      if (coverage[index]) {
        index++
        continue
      }
      const first = index++
      while (index < Math.min(first + 4, coverage.length) && !coverage[index]) index++
      tasks.push({
        resource,
        start: first * RESOURCE_BLOCK_BYTES,
        end: Math.min(resource.bytes, index * RESOURCE_BLOCK_BYTES) - 1,
      })
    }
  }
  await progress(loaded, total, '')
  let next = 0
  let lastReport = 0
  const work = async () => {
    while (next < tasks.length) {
      signal.throwIfAborted()
      const task = tasks[next++]
      const full = task.start === 0 && task.end === task.resource.bytes - 1
      const request = new Request(resourceUrl(task.resource), {
        headers: full ? {} : { range: `bytes=${task.start}-${task.end}` },
      })
      for (let attempt = 0; ; attempt++) {
        try {
          await download(task.resource, request, signal, true)
          break
        } catch (error) {
          signal.throwIfAborted()
          if (
            attempt >= 2 ||
            !(
              error instanceof TypeError ||
              (error instanceof Error && error.name === 'TimeoutError')
            )
          )
            throw error
        }
      }
      signal.throwIfAborted()
      loaded += task.end - task.start + 1
      if (Date.now() - lastReport > 250) {
        lastReport = Date.now()
        await progress(loaded, total, task.resource.path)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(threads, tasks.length) }, work))
  signal.throwIfAborted()
  for (const resource of resources) {
    signal.throwIfAborted()
    if ((await resourceCoverage(resource)).some((present) => !present))
      throw new Error(`Resource not saved: ${resource.path}`)
  }
  return total
}
async function saveModels(controller: AbortController) {
  try {
    await report({ modelPhase: 'checking', modelError: '', modelFile: '' })
    const epoch = (await resourceControl(false)).modelEpoch ?? 0
    const total = await saveResources(
      manifest.resources.filter((resource) => resource.group === 'model'),
      controller.signal,
      (loaded, total, file) => {
        controller.signal.throwIfAborted()
        return report({
          modelPhase: 'saving',
          modelLoaded: loaded,
          modelTotal: total,
          modelFile: file,
        })
      },
    )
    controller.signal.throwIfAborted()
    if (((await resourceControl(false)).modelEpoch ?? 0) !== epoch) return
    await report({
      modelPhase: 'ready',
      modelLoaded: total,
      modelTotal: total,
      modelFile: '',
      modelsBytes: await savedModelBytes(),
      aiReady: await aiResourcesReady(),
    })
    await broadcast({ type: 'models-ready' })
  } catch (error) {
    const cancelled = controller.signal.aborted
    controller.abort(error)
    if (!cancelled) await report({ modelPhase: 'error', modelError: storageError(error) })
  } finally {
    if (modelSaving === controller) modelSaving = undefined
  }
}
async function saveOffline(controller: AbortController, checkUpdates: boolean) {
  const signal = controller.signal
  try {
    await report({ enabled: true, phase: 'checking', file: '', error: '' })
    if (checkUpdates) {
      try {
        await checkManifest(signal)
      } catch (error) {
        signal.throwIfAborted()
        const control = await resourceControl()
        if (control.active) {
          previous = control.active
          await report({
            phase: 'ready',
            version: control.active.version,
            modelsBytes: await savedModelBytes(),
          })
          return
        }
        throw error
      }
    }
    signal.throwIfAborted()
    const target = manifest
    const control = await resourceControl()
    const epoch = control.epoch
    const total = await saveResources(
      target.resources.filter((resource) => resource.group === 'site'),
      signal,
      (loaded, total, file) => {
        signal.throwIfAborted()
        return report({ phase: 'saving', loaded, total, file, version: target.version })
      },
    )
    signal.throwIfAborted()
    const updated = control.active?.revision !== target.revision
    const final = await changeResourceControl((current) =>
      current.epoch === epoch && current.enabled
        ? { ...current, active: target, latest: target }
        : current,
    )
    if (!final.enabled || final.epoch !== epoch) return
    previous = target
    await report({
      phase: 'ready',
      loaded: total,
      total,
      file: '',
      modelsBytes: await savedModelBytes(),
    })
    if (updated) await broadcast({ type: 'offline-ready', version: target.version })
  } catch (error) {
    const cancelled = signal.aborted
    controller.abort(error)
    if (!cancelled) await report({ phase: 'error', error: storageError(error) })
  } finally {
    if (saving === controller) saving = undefined
  }
}
sw.addEventListener('install', (event) => event.waitUntil(sw.skipWaiting()))
sw.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      await hydrated
      const control = await changeResourceControl((current) => ({ ...current, latest: embedded }))
      manifest = embedded
      previous = control.active
      state.enabled = control.enabled
      await sw.clients.claim()
    })(),
  ),
)
sw.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (
    request.mode === 'navigate' &&
    url.origin === siteBase.origin &&
    url.pathname.startsWith(siteBase.pathname)
  ) {
    event.respondWith(
      (async () => {
        await hydrated
        const physical =
          findResource(request.url) ?? (previous && findResource(request.url, previous))
        if (physical && physical.path !== 'index.html')
          return (
            (await cached(physical, request)) ?? download(physical, request, request.signal, false)
          )
        try {
          const response = await createModelRequest(fetch, 5000)(new URL('index.html', siteBase), {
            cache: 'no-store',
            signal: request.signal,
          })
          if (response.ok) return response
        } catch {
          /* Use the last complete snapshot when the network is unavailable. */
        }
        const control = await resourceControl()
        const resource = control.enabled
          ? control.active?.resources.find((item) => item.path === 'index.html')
          : undefined
        return (
          (resource && (await cached(resource, new Request(new URL('index.html', siteBase))))) ||
          new Response('Offline resources are not ready.', { status: 503 })
        )
      })(),
    )
    return
  }
  if (![siteBase.origin, new URL(PAGES_RESOURCE_BASE).origin].includes(url.origin)) return
  event.respondWith(
    (async () => {
      await hydrated
      const resource =
        findResource(request.url) ?? (previous && findResource(request.url, previous))
      if (!resource) return fetch(request)
      try {
        const response = await cached(resource, request)
        if (response) return response
      } catch {
        /* A storage failure must still allow an online tool to load. */
      }
      try {
        return await download(resource, request, request.signal, false)
      } catch (error) {
        const old = previous && findResource(request.url, previous)
        if (old && old.hash !== resource.hash) {
          const response = await cached(old, request)
          if (response) return response
        }
        throw error
      }
    })(),
  )
})
sw.addEventListener('message', (event) => {
  const message = event.data as { type: string; enabled?: boolean; threads?: number }
  const reply = (value: unknown) => event.ports[0]?.postMessage(value)
  // Cancellation is immediate; control/database mutations stay in command order.
  if (['disable', 'enable', 'startup', 'retry'].includes(message.type)) saving?.abort()
  if (['clear-models', 'download-models'].includes(message.type)) modelSaving?.abort()
  commandQueue = commandQueue
    .catch(() => {})
    .then(async () => {
      await hydrated
      if ([32, 64, 128].includes(message.threads ?? 0)) {
        threads = message.threads!
        pool.setLimit(threads)
      }
      if (message.type === 'disable') {
        await report({ phase: 'clearing', error: '' })
        const control = await clearResourceBytes(false)
        previous = undefined
        await report({
          enabled: control.enabled,
          phase: 'idle',
          loaded: 0,
          total: 0,
          file: '',
          modelsBytes: await savedModelBytes(),
        })
      } else if (message.type === 'clear-models') {
        await report({ modelPhase: 'clearing', modelError: '' })
        await broadcast({ type: 'models-clearing' })
        await clearResourceBytes(true)
        await report({
          modelPhase: 'idle',
          modelLoaded: 0,
          modelTotal: 0,
          modelFile: '',
          modelsBytes: 0,
          aiReady: false,
        })
      } else if (message.type === 'download-models') {
        modelSaving = new AbortController()
        event.waitUntil(saveModels(modelSaving))
      } else if (message.type === 'ai-status') {
        reply({ ok: true, aiReady: await aiResourcesReady() })
        return
      } else if (['startup', 'enable', 'retry'].includes(message.type)) {
        const enabled = message.type === 'startup' ? message.enabled === true : true
        const control = await changeResourceControl((current) => ({ ...current, enabled }))
        manifest = control.latest ?? embedded
        previous = control.active
        await report({
          enabled,
          phase: control.active && enabled ? 'ready' : 'idle',
          modelsBytes: await savedModelBytes(),
        })
        if (enabled) {
          saving = new AbortController()
          const task = saveOffline(saving, true)
          event.waitUntil(task)
        } else {
          // Keep model identities fresh even when full offline mode is disabled.
          event.waitUntil(checkManifest(new AbortController().signal).catch(() => {}))
        }
      } else if (message.type === 'status') {
        const aiReady = await aiResourcesReady()
        await report({
          modelsBytes: await savedModelBytes(),
          aiReady,
          ...(!modelSaving && (aiReady || state.modelPhase === 'ready')
            ? { modelPhase: aiReady ? 'ready' : 'idle' }
            : {}),
        })
      }
      reply({ ok: true, state })
    })
    .catch(async (error) => {
      await report(
        message.type.includes('model')
          ? { modelPhase: 'error', modelError: storageError(error) }
          : { phase: 'error', error: storageError(error) },
      )
      reply({ ok: false, error: storageError(error) })
    })
  event.waitUntil(commandQueue)
})
