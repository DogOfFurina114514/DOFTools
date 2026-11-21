import { afterEach, expect, it, vi } from 'vitest'
import { retryResource } from './resource-retry'
import { prepareToolResources } from './offline'
afterEach(() => vi.useRealTimers())

it('recovers a failed response body without rerunning file processing', async () => {
  vi.useFakeTimers()
  const response = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('Connection closed'))
    .mockResolvedValue(new Uint8Array([1, 2]))
  const progress = vi.fn()
  const task = retryResource(response, new AbortController().signal, progress)
  await vi.advanceTimersByTimeAsync(250)
  expect(await task).toEqual(new Uint8Array([1, 2]))
  expect(response).toHaveBeenCalledTimes(2)
  expect(progress).toHaveBeenCalledOnce()
})
it('limits retries and does not retry invalid content', async () => {
  vi.useFakeTimers()
  const response = vi.fn().mockRejectedValue(new TypeError('Unavailable'))
  const failure = expect(retryResource(response, new AbortController().signal)).rejects.toThrow(
    'Unavailable',
  )
  await vi.advanceTimersByTimeAsync(1000)
  await failure
  expect(response).toHaveBeenCalledTimes(3)
  const invalid = vi.fn().mockRejectedValue(new Error('Resource checksum mismatch'))
  await expect(retryResource(invalid, new AbortController().signal)).rejects.toThrow('checksum')
  expect(invalid).toHaveBeenCalledOnce()
})
it('cancels backoff immediately and sends no further requests', async () => {
  vi.useFakeTimers()
  const abort = new AbortController()
  const response = vi.fn().mockRejectedValue(new TypeError('Unavailable'))
  const failure = expect(retryResource(response, abort.signal)).rejects.toThrow('Cancelled')
  await vi.advanceTimersByTimeAsync(1)
  abort.abort(new DOMException('Cancelled', 'AbortError'))
  await failure
  await vi.advanceTimersByTimeAsync(1000)
  expect(response).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
it('waits for the shared resource worker before the first tool import', async () => {
  let finish!: () => void
  const ready = () =>
    new Promise<void>((resolve) => {
      finish = resolve
    })
  const execute = vi.fn()
  const task = prepareToolResources(new AbortController().signal, ready).then(execute)
  await Promise.resolve()
  expect(execute).not.toHaveBeenCalled()
  finish()
  await task
  expect(execute).toHaveBeenCalledOnce()
})
it('cancels preparation while allowing shared registration and later tools to complete', async () => {
  let finish!: () => void
  const registration = new Promise<void>((resolve) => {
    finish = resolve
  })
  const abort = new AbortController()
  const first = expect(prepareToolResources(abort.signal, () => registration)).rejects.toThrow(
    'Cancelled',
  )
  const next = prepareToolResources(new AbortController().signal, () => registration)
  abort.abort(new DOMException('Cancelled', 'AbortError'))
  await first
  finish()
  await next
  await expect(
    prepareToolResources(new AbortController().signal, () =>
      Promise.reject(new Error('Unsupported browser')),
    ),
  ).resolves.toBeUndefined()
})
