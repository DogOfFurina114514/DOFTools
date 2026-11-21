import { useSyncExternalStore } from 'react'
import {
  modelDownloadThreads,
  saveDownloadThreads,
  type DownloadThreads,
} from './download-preferences'
import { readStorage, writeStorage } from './storage'

export interface OfflineStatus {
  enabled: boolean
  phase: 'idle' | 'checking' | 'saving' | 'ready' | 'error' | 'clearing'
  loaded: number
  total: number
  downloadLoaded?: number
  downloadTotal?: number
  reusedBytes?: number
  updating?: boolean
  file: string
  error: string
  modelsBytes: number
  modelPhase: 'idle' | 'checking' | 'saving' | 'ready' | 'error' | 'clearing'
  modelLoaded: number
  modelTotal: number
  modelFile: string
  modelError: string
  aiReady: boolean
  version: string
}
let state: OfflineStatus = {
  enabled: readStorage(
    'offline-enabled',
    false,
    (value): value is boolean => typeof value === 'boolean',
  ),
  phase: 'idle',
  loaded: 0,
  total: 0,
  downloadLoaded: 0,
  downloadTotal: 0,
  reusedBytes: 0,
  updating: false,
  file: '',
  error: '',
  modelsBytes: 0,
  version: '',
  modelPhase: 'idle',
  modelLoaded: 0,
  modelTotal: 0,
  modelFile: '',
  modelError: '',
  aiReady: false,
}
const listeners = new Set<() => void>()
function update(next: OfflineStatus) {
  state = next
  writeStorage('offline-enabled', next.enabled)
  listeners.forEach((listener) => listener())
}
let registration: Promise<ServiceWorkerRegistration | undefined> | undefined
export function ensureResourceWorker() {
  if (import.meta.env.DEV || typeof navigator === 'undefined' || !('serviceWorker' in navigator))
    return Promise.resolve(undefined)
  return (registration ??= (async () => {
    navigator.serviceWorker.addEventListener('message', ({ data }) => {
      if (data?.type === 'resource-status') update(data.state)
      else if (data?.type === 'offline-ready')
        window.dispatchEvent(new CustomEvent('offline-ready', { detail: data.version }))
      else if (data?.type === 'models-ready') window.dispatchEvent(new Event('models-ready'))
      else if (data?.type === 'models-clearing')
        window.dispatchEvent(new Event('model-resources-clearing'))
    })
    const base = new URL(import.meta.env.BASE_URL, document.baseURI)
    const result = await navigator.serviceWorker.register(new URL('sw.js', base), {
      scope: base.pathname,
      updateViaCache: 'none',
    })
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          navigator.serviceWorker.removeEventListener('controllerchange', ready)
          reject(new Error('Resource worker startup timed out'))
        }, 20_000)
        const ready = () => {
          if (!navigator.serviceWorker.controller) return
          clearTimeout(timer)
          navigator.serviceWorker.removeEventListener('controllerchange', ready)
          resolve()
        }
        navigator.serviceWorker.addEventListener('controllerchange', ready)
        ready()
      })
    }
    return result
  })().catch((error) => {
    registration = undefined
    update({
      ...state,
      phase: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }))
}
// Wait for the shared resource controller before a first tool import. Cancelling
// a tool only stops this wait; the site's shared registration continues.
export async function prepareToolResources(
  signal: AbortSignal,
  ready: () => Promise<unknown> = ensureResourceWorker,
) {
  signal.throwIfAborted()
  const loading = ready().catch(() => undefined)
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    void loading.then(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    })
    if (signal.aborted) abort()
  })
  signal.throwIfAborted()
}
async function command(type: string, enabled?: boolean, threads = modelDownloadThreads()) {
  const fail = (error: string) =>
    update(
      type.includes('model')
        ? { ...state, modelPhase: 'error', modelError: error }
        : { ...state, phase: 'error', error },
    )
  const worker = await ensureResourceWorker().catch(() => undefined)
  if (!worker || !navigator.serviceWorker.controller) {
    fail('unsupported')
    return
  }
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => {
      channel.port1.close()
      reject(new Error('Resource worker did not respond'))
    }, 30_000)
    channel.port1.onmessage = ({ data }) => {
      clearTimeout(timer)
      channel.port1.close()
      if (data.state) update(data.state)
      if (data.ok) resolve()
      else reject(new Error(data.error))
    }
    navigator.serviceWorker.controller!.postMessage({ type, enabled, threads }, [channel.port2])
  }).catch((error) => fail(error instanceof Error ? error.message : String(error)))
}
let started = false
export function startResourceUpdates() {
  if (started) return
  started = true
  const check = () => {
    void ensureResourceWorker()
      .then((worker) => {
        void worker?.update().catch(() => {})
        return command('startup', state.enabled)
      })
      .catch(() => {})
  }
  check()
  window.addEventListener('online', check)
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    void command('startup', state.enabled).catch(() => {})
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void command('status').catch(() => {})
  })
}
export async function setOfflineEnabled(enabled: boolean) {
  update({ ...state, enabled, phase: enabled ? 'checking' : 'clearing', error: '' })
  if (enabled) await navigator.storage?.persist?.().catch(() => false)
  await command(enabled ? 'enable' : 'disable')
}
export async function clearModelResources() {
  window.dispatchEvent(new Event('model-resources-clearing'))
  update({ ...state, modelPhase: 'clearing', modelError: '' })
  await command('clear-models')
}
export async function downloadModelResources() {
  if (!navigator.onLine) {
    update({ ...state, modelPhase: 'error', modelError: 'offline' })
    return
  }
  update({ ...state, modelPhase: 'checking', modelError: '' })
  await navigator.storage?.persist?.().catch(() => false)
  await command('download-models')
}
export async function offlineAIAvailable() {
  const worker = await ensureResourceWorker().catch(() => undefined)
  if (!worker || !navigator.serviceWorker.controller) return false
  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => {
      channel.port1.close()
      resolve(false)
    }, 15_000)
    channel.port1.onmessage = ({ data }) => {
      clearTimeout(timer)
      channel.port1.close()
      resolve(data.aiReady === true)
    }
    navigator.serviceWorker.controller!.postMessage({ type: 'ai-status' }, [channel.port2])
  })
}
export async function retryOfflineSave() {
  await command('retry')
}
export function setModelDownloadThreads(threads: DownloadThreads) {
  saveDownloadThreads(threads)
  void command('threads', undefined, threads).catch(() => {})
}
export function refreshResourceStatus() {
  void command('status').catch(() => {})
}
export function useOfflineStatus() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => state,
  )
}
