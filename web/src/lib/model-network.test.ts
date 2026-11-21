import { afterEach, expect, it, vi } from 'vitest'
import { createModelRequest, createResourceRequest } from './model-network'

afterEach(() => vi.useRealTimers())

it('allows queued site connections a longer budget but bounds body stalls separately', async () => {
  vi.useFakeTimers()
  const cancel = vi.fn()
  const request = vi
    .fn<typeof fetch>()
    .mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(new Response(new ReadableStream({ cancel }))), 90),
        ),
    )
  const connecting = createResourceRequest(
    'runtime/site.wasm',
    request,
    30,
    120,
  )('https://example.test/runtime/site.wasm')
  await vi.advanceTimersByTimeAsync(91)
  const response = await connecting
  expect(request.mock.calls[0][1]?.signal?.aborted).toBe(false)
  const failure = expect(response.arrayBuffer()).rejects.toThrow(
    'Resource download timed out: runtime/site.wasm',
  )
  await vi.advanceTimersByTimeAsync(31)
  await failure
  expect(cancel).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('still times out site connections that exceed the separate connection budget', async () => {
  vi.useFakeTimers()
  const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}))
  const failure = expect(
    createResourceRequest(
      'runtime/site.wasm',
      request,
      30,
      120,
    )('https://example.test/runtime/site.wasm'),
  ).rejects.toThrow('Resource download timed out: runtime/site.wasm')
  await vi.advanceTimersByTimeAsync(31)
  expect(request.mock.calls[0][1]?.signal?.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(90)
  await failure
  expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['connection', 'body'])(
  'identifies a stalled site %s by resource rather than as a model failure',
  async (stage) => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        stage === 'connection'
          ? new Promise(() => {})
          : Promise.resolve(new Response(new ReadableStream({ cancel }))),
      )
    const network = createResourceRequest('index.html', request, 30)
    const task =
      stage === 'connection'
        ? network('https://example.test/offline/index.bin')
        : (await network('https://example.test/offline/index.bin')).arrayBuffer()
    const failure = expect(task).rejects.toThrow('Resource download timed out: index.html')
    await vi.advanceTimersByTimeAsync(31)
    await failure
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true)
    if (stage === 'body') expect(cancel).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  },
)

it('rejects a stalled connection and aborts the underlying request', async () => {
  vi.useFakeTimers()
  const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}))
  const failure = expect(
    createModelRequest(request, 30)('https://example.test/model'),
  ).rejects.toThrow('连接超时')
  await vi.advanceTimersByTimeAsync(31)
  await failure
  expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it('rejects a stalled response body and releases the connection', async () => {
  vi.useFakeTimers()
  const cancel = vi.fn()
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(new ReadableStream({ cancel })))
  const response = await createModelRequest(request, 30)('https://example.test/model')
  const failure = expect(response.arrayBuffer()).rejects.toThrow('连接超时')
  await vi.advanceTimersByTimeAsync(31)
  await failure
  expect(cancel).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('allows a slow download while data keeps arriving and retains response metadata', async () => {
  vi.useFakeTimers()
  let body!: ReadableStreamDefaultController<Uint8Array>
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          body = controller
        },
      }),
      {
        status: 206,
        headers: { 'content-length': '4', 'content-type': 'application/octet-stream' },
      },
    ),
  )
  const response = await createModelRequest(request, 10)('https://example.test/model')
  const result = response.arrayBuffer()
  for (let i = 1; i <= 4; i++)
    setTimeout(() => {
      body.enqueue(new Uint8Array([i]))
      if (i === 4) body.close()
    }, i * 9)
  await vi.advanceTimersByTimeAsync(40)
  expect([...new Uint8Array(await result)]).toEqual([1, 2, 3, 4])
  expect(response.status).toBe(206)
  expect(response.headers.get('content-length')).toBe('4')
  expect(vi.getTimerCount()).toBe(0)
})

it('honors cancellation without starting another request', async () => {
  const controller = new AbortController()
  controller.abort(new DOMException('Cancelled', 'AbortError'))
  const request = vi.fn<typeof fetch>()
  await expect(
    createModelRequest(request)('https://example.test/model', { signal: controller.signal }),
  ).rejects.toThrow('Cancelled')
  expect(request).not.toHaveBeenCalled()
})
