import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BrowserLocalAI } from './ai-client'
import type { AIWorkerEvent } from './ai'

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage?: (event: { data: AIWorkerEvent }) => void
  onerror?: () => void
  onmessageerror?: () => void
  terminate = vi.fn()
  postMessage = vi.fn()
  constructor() {
    FakeWorker.instances.push(this)
  }
  send(data: AIWorkerEvent) {
    this.onmessage?.({ data })
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('document', { baseURI: 'https://backup.example/' })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('reports a worker that never starts and permits a fresh retry', async () => {
  const client = new BrowserLocalAI()
  const failure = expect(client.load(vi.fn())).rejects.toThrow('启动超时')
  await vi.advanceTimersByTimeAsync(45_001)
  await failure
  expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce()
  const retry = client.load(vi.fn())
  FakeWorker.instances[1].send({ id: 2, type: 'loaded' })
  await retry
  await client.dispose()
  expect(vi.getTimerCount()).toBe(0)
})

it('delivers loading stages and leaves an active download running past startup timeout', async () => {
  const client = new BrowserLocalAI()
  const stage = vi.fn(),
    progress = vi.fn()
  const loading = client.load(progress, undefined, stage)
  const worker = FakeWorker.instances[0]
  worker.send({ id: 1, type: 'stage', stage: 'runtime' })
  worker.send({ id: 1, type: 'progress', progress: 0.02, file: 'runtime.wasm' })
  await vi.advanceTimersByTimeAsync(45_001)
  expect(worker.terminate).not.toHaveBeenCalled()
  expect(stage).toHaveBeenCalledWith('runtime')
  expect(progress).toHaveBeenCalledWith(0.02)
  worker.send({ id: 1, type: 'loaded' })
  await loading
  await client.dispose()
})

it('reports a worker failure as a load error and creates a new worker on retry', async () => {
  const client = new BrowserLocalAI()
  const loading = client.load(vi.fn())
  const failure = expect(loading).rejects.toThrow('运行环境加载失败')
  FakeWorker.instances[0].onerror?.()
  await failure
  const retry = client.load(vi.fn())
  FakeWorker.instances[1].send({ id: 2, type: 'loaded' })
  await retry
  await client.dispose()
})

it('cancels startup and clears its pending timer', async () => {
  const client = new BrowserLocalAI(),
    controller = new AbortController()
  const failure = expect(client.load(vi.fn(), controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  })
  controller.abort()
  await failure
  expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
