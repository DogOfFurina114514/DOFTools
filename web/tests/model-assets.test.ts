import { describe, expect, it, vi } from 'vitest'
import {
  createDownloadPool,
  createModelFetch,
  type ModelAssetManifest,
} from '../src/lib/model-assets'

const root = 'https://example.test/DOFTools/models/qwen3.5-0.8b/'
const manifest: ModelAssetManifest = {
  version: 1,
  files: {
    'onnx/model.onnx_data': {
      bytes: 5,
      parts: [
        { path: 'onnx/model.onnx_data.part-000', bytes: 3 },
        { path: 'onnx/model.onnx_data.part-001', bytes: 2 },
      ],
    },
  },
}

describe('static Pages model transport', () => {
  it('keeps downloading when isolated connection failures occur between successful ranges', async () => {
    const bytes = new Uint8Array(512 * 1024 + 17).fill(42)
    let failed = false
    const request = vi.fn<typeof fetch>().mockImplementation(async (_, init) => {
      if (!failed) {
        failed = true
        throw new TypeError('Temporary connection failure')
      }
      failed = false
      const range = new Headers(init?.headers).get('Range')!.match(/^bytes=(\d+)-(\d+)$/)!
      return new Response(bytes.slice(Number(range[1]), Number(range[2]) + 1), { status: 206 })
    })
    const response = await createModelFetch(
      root,
      {
        version: 1,
        files: {
          weight: { bytes: bytes.length, parts: [{ path: 'weight', bytes: bytes.length }] },
        },
      },
      request,
      { concurrency: 1 },
    )(root + 'weight')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    expect(request.mock.calls.length).toBeGreaterThan(6)
    const ranges = request.mock.calls
      .slice(2)
      .map(([, init]) => new Headers(init?.headers).get('Range')!)
    expect(
      ranges.every((range) => {
        const [start, end] = range.replace('bytes=', '').split('-').map(Number)
        return end - start + 1 <= 128 * 1024
      }),
    ).toBe(true)
  })

  it('retries an interrupted range without duplicating bytes or final progress', async () => {
    let first = true
    const request = vi.fn<typeof fetch>().mockImplementation(async (_, init) => {
      if (first) {
        first = false
        let sent = false
        return new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              if (!sent) {
                sent = true
                controller.enqueue(new Uint8Array([1]))
              } else controller.error(new TypeError('Failed to fetch'))
            },
          }),
          { status: 206 },
        )
      }
      const range = new Headers(init?.headers).get('Range')!.match(/^bytes=(\d+)-(\d+)$/)!
      return new Response(
        new Uint8Array([1, 2, 3, 4]).slice(Number(range[1]), Number(range[2]) + 1),
        { status: 206 },
      )
    })
    const progress = vi.fn()
    const response = await createModelFetch(
      root,
      { version: 1, files: { weight: { bytes: 4, parts: [{ path: 'weight', bytes: 4 }] } } },
      request,
      { rangeBytes: 2, onProgress: progress },
    )(root + 'weight')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3, 4])
    expect(progress.mock.calls.at(-1)).toEqual(['weight', 4])
    expect(Math.max(...progress.mock.calls.map(([, bytes]) => bytes))).toBe(4)
  })

  it('assembles byte ranges and decodes JSON correctly across UTF-8 boundaries', async () => {
    const value = { vocabulary: ['你好', '芙芙', 'hello'] }
    const bytes = new TextEncoder().encode(JSON.stringify(value))
    const request = vi.fn<typeof fetch>().mockImplementation(async (_, init) => {
      const range = new Headers(init?.headers).get('Range')!.match(/^bytes=(\d+)-(\d+)$/)!
      const start = Number(range[1]),
        end = Number(range[2])
      await new Promise((resolve) => setTimeout(resolve, start === 0 ? 20 : 1))
      return new Response(bytes.slice(start, end + 1), { status: 206 })
    })
    const asset = { bytes: bytes.length, parts: [{ path: 'tokenizer.json', bytes: bytes.length }] }
    const transport = createModelFetch(
      root,
      { version: 1, files: { 'tokenizer.json': asset } },
      request,
      { rangeBytes: 8 },
    )
    const response = await transport(root + 'tokenizer.json')
    expect(request).not.toHaveBeenCalled()
    expect(await response.json()).toEqual(value)
    expect(response.headers.get('content-length')).toBe(String(bytes.length))
    expect(request.mock.calls.every(([, init]) => new Headers(init?.headers).has('Range'))).toBe(
      true,
    )
  })

  it('rejects a server that ignores byte ranges instead of accepting corrupted data', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])))
    const response = await createModelFetch(root, manifest, request, { rangeBytes: 1 })(
      root + 'onnx/model.onnx_data',
    )
    await expect(response.arrayBuffer()).rejects.toThrow('requested byte range')
    expect(request.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true)
  })

  it('streams ordered parts at a repository subpath and retains actual download length', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])))
      .mockResolvedValueOnce(new Response(new Uint8Array([4, 5])))
    const fetchModel = createModelFetch(root, manifest, request)
    const response = await fetchModel('/DOFTools/models/qwen3.5-0.8b/onnx/model.onnx_data')
    expect(response.headers.get('content-length')).toBe('5')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3, 4, 5])
    expect(request.mock.calls.map(([input]) => String(input))).toEqual([
      root + 'onnx/model.onnx_data.part-000',
      root + 'onnx/model.onnx_data.part-001',
    ])
    expect(request.mock.calls.every(([, init]) => init?.cache === 'no-store')).toBe(true)
  })

  it('rejects a missing part instead of providing corrupted weights', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])))
      .mockResolvedValueOnce(new Response('Not found', { status: 404 }))
    const response = await createModelFetch(root, manifest, request)(root + 'onnx/model.onnx_data')
    await expect(response.arrayBuffer()).rejects.toThrow('HTTP 404')
  })

  it('rejects truncated parts and cancels their prefetched siblings', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(new Uint8Array([1])))
    const response = await createModelFetch(root, manifest, request)(root + 'onnx/model.onnx_data')
    await expect(response.arrayBuffer()).rejects.toThrow('Incomplete model part')
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true)
  })

  it('honors cancellation and avoids fetching the remaining weights', async () => {
    const request = vi.fn<typeof fetch>()
    const controller = new AbortController()
    controller.abort()
    const response = await createModelFetch(
      root,
      manifest,
      request,
    )(root + 'onnx/model.onnx_data', {
      signal: controller.signal,
    })
    await expect(response.arrayBuffer()).rejects.toThrow()
    expect(request).not.toHaveBeenCalled()
  })

  it('keeps small files and unchunked development weights on their original URLs', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response('resource'))
    const fetchModel = createModelFetch(root, { version: 1, files: {} }, request)
    await fetchModel(root + 'config.json')
    await fetchModel(root + 'onnx/model.onnx_data')
    expect(request.mock.calls[0]).toEqual([root + 'config.json', undefined])
    expect(request.mock.calls[1]).toEqual([root + 'onnx/model.onnx_data', { cache: 'no-store' }])
  })

  it('shares 32 active body downloads across fetch adapters and preserves out-of-order bytes', async () => {
    const expected = Array.from({ length: 40 }, (_, index) => index + 1)
    const files = Object.fromEntries(
      ['a', 'b'].map((name) => [
        name,
        {
          bytes: 40,
          parts: Array.from({ length: 40 }, (_, index) => ({ path: `${name}.${index}`, bytes: 1 })),
        },
      ]),
    )
    const bodies = new Map<string, ReadableStreamDefaultController<Uint8Array>>()
    let active = 0
    let maximum = 0
    const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      active++
      maximum = Math.max(maximum, active)
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            bodies.set(String(input), controller)
          },
        }),
      )
    })
    const progress = vi.fn()
    const pool = createDownloadPool(32)
    const transport = createModelFetch(root, { version: 1, files }, request, {
      onProgress: progress,
      pool,
    })
    const runtimeTransport = createModelFetch(root, { version: 1, files }, request, {
      onProgress: progress,
      pool,
    })
    const a = await transport(root + 'a')
    const b = await runtimeTransport(root + 'b')
    const result = Promise.all([a.arrayBuffer(), b.arrayBuffer()])
    await vi.waitFor(() => expect(bodies.size).toBe(32))
    expect(request).toHaveBeenCalledTimes(32)
    let completed = 0
    while (completed < 80) {
      await vi.waitFor(() => expect(bodies.size).toBeGreaterThan(0))
      for (const [url, controller] of [...bodies].reverse()) {
        bodies.delete(url)
        controller.enqueue(new Uint8Array([Number(url.split('.').pop()) + 1]))
        controller.close()
        active--
        completed++
      }
    }
    const buffers = await result
    expect(buffers.map((buffer) => [...new Uint8Array(buffer)])).toEqual([expected, expected])
    expect(maximum).toBe(32)
    for (const file of ['a', 'b'])
      expect(
        progress.mock.calls.filter(([name]) => name === file).map(([, bytes]) => bytes),
      ).toEqual(expected)
  })

  it.each([undefined, 32, 64, 128])(
    'refills the selected pool (%s) even when the first range is stalled',
    async (concurrency) => {
      const limit = concurrency ?? 64
      const asset = {
        bytes: limit + 8,
        parts: Array.from({ length: limit + 8 }, (_, index) => ({ path: `p${index}`, bytes: 1 })),
      }
      const bodies = new Map<string, ReadableStreamDefaultController<Uint8Array>>()
      let active = 0
      let maximum = 0
      const request = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
        active++
        maximum = Math.max(maximum, active)
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              bodies.set(String(input), controller)
              init!.signal!.addEventListener(
                'abort',
                () => controller.error(init!.signal!.reason),
                {
                  once: true,
                },
              )
            },
          }),
        )
      })
      const response = await createModelFetch(
        root,
        { version: 1, files: { weights: asset } },
        request,
        { concurrency },
      )(root + 'weights')
      const reader = response.body!.getReader()
      let emitted = false
      const reading = reader.read().then((chunk) => {
        emitted = true
        return chunk
      })
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(limit))
      for (const index of [1, 2]) {
        const body = bodies.get(root + `p${index}`)!
        body.enqueue(new Uint8Array([index]))
        body.close()
        active--
        await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(limit + index))
        expect(bodies.has(root + `p${limit - 1 + index}`)).toBe(true)
        expect(active).toBe(limit)
        expect(emitted).toBe(false)
      }
      expect(maximum).toBe(limit)
      await reader.cancel()
      await reading
      expect(request.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true)
    },
  )

  it('aborts active and queued downloads when the consumer cancels', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(
      async (_, init) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              init!.signal!.addEventListener(
                'abort',
                () => controller.error(init!.signal!.reason),
                { once: true },
              )
            },
          }),
        ),
    )
    const asset = {
      bytes: 40,
      parts: Array.from({ length: 40 }, (_, index) => ({ path: `p${index}`, bytes: 1 })),
    }
    const response = await createModelFetch(
      root,
      { version: 1, files: { weights: asset } },
      request,
      { concurrency: 32 },
    )(root + 'weights')
    const reader = response.body!.getReader()
    const reading = reader.read()
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(32))
    await reader.cancel('cancelled')
    await reading
    expect(request.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true)
    expect(request).toHaveBeenCalledTimes(32)
  })

  it('fails immediately if a later part is missing while the first is stalled', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      if (String(input).endsWith('001')) return new Response('Not found', { status: 404 })
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            init!.signal!.addEventListener('abort', () => controller.error(init!.signal!.reason), {
              once: true,
            })
          },
        }),
      )
    })
    const response = await createModelFetch(root, manifest, request)(root + 'onnx/model.onnx_data')
    await expect(response.arrayBuffer()).rejects.toThrow('HTTP 404')
    expect(request.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true)
  })

  it('rejects part URLs outside the Pages model directory before any download', async () => {
    const request = vi.fn<typeof fetch>()
    const asset = {
      bytes: 1,
      parts: [{ path: 'https://raw.githubusercontent.com/weights', bytes: 1 }],
    }
    await expect(
      createModelFetch(root, { version: 1, files: { weights: asset } }, request)(root + 'weights'),
    ).rejects.toThrow('Invalid model part location')
    expect(request).not.toHaveBeenCalled()
  })

  it('maps local metadata and weights from an ESA repository base path to Pages', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('000')) return new Response(new Uint8Array([1, 2, 3]))
      if (url.endsWith('001')) return new Response(new Uint8Array([4, 5]))
      return new Response('{}')
    })
    const localRoot = 'https://backup.example/toolbox/models/qwen3.5-0.8b/'
    const transport = createModelFetch(root, manifest, request, { localRoot })
    await transport('/toolbox/models/qwen3.5-0.8b/tokenizer_config.json')
    const response = await transport(new Request(localRoot + 'onnx/model.onnx_data'))
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3, 4, 5])
    expect(request.mock.calls.map(([input]) => String(input))).toEqual([
      root + 'tokenizer_config.json',
      root + 'onnx/model.onnx_data.part-000',
      root + 'onnx/model.onnx_data.part-001',
    ])
  })

  it('returns weight metadata without downloading any parts until the body is consumed', async () => {
    const request = vi.fn<typeof fetch>()
    const response = await createModelFetch(root, manifest, request)(root + 'onnx/model.onnx_data')
    expect(response.headers.get('content-length')).toBe('5')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(request).not.toHaveBeenCalled()
    await response.body!.cancel()
  })
})
