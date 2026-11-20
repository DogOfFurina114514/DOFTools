import { describe, expect, it, vi } from 'vitest'
import { createModelFetch, type ModelAssetManifest } from '../src/lib/model-assets'

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

  it('shares four active body downloads across weights and preserves out-of-order bytes', async () => {
    const files = Object.fromEntries(
      ['a', 'b'].map((name) => [
        name,
        {
          bytes: 6,
          parts: Array.from({ length: 6 }, (_, index) => ({ path: `${name}.${index}`, bytes: 1 })),
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
    const transport = createModelFetch(root, { version: 1, files }, request, {
      onProgress: progress,
    })
    const a = await transport(root + 'a')
    const b = await transport(root + 'b')
    const result = Promise.all([a.arrayBuffer(), b.arrayBuffer()])
    await vi.waitFor(() => expect(bodies.size).toBe(4))
    expect(request).toHaveBeenCalledTimes(4)
    let completed = 0
    while (completed < 12) {
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
    expect(buffers.map((buffer) => [...new Uint8Array(buffer)])).toEqual([
      [1, 2, 3, 4, 5, 6],
      [1, 2, 3, 4, 5, 6],
    ])
    expect(maximum).toBe(4)
    for (const file of ['a', 'b'])
      expect(
        progress.mock.calls.filter(([name]) => name === file).map(([, bytes]) => bytes),
      ).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('bounds prefetch even when a response is not being consumed', async () => {
    const asset = {
      bytes: 10,
      parts: Array.from({ length: 10 }, (_, index) => ({ path: `p${index}`, bytes: 1 })),
    }
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(new Uint8Array([1])))
    const response = await createModelFetch(
      root,
      { version: 1, files: { weights: asset } },
      request,
    )(root + 'weights')
    const reader = response.body!.getReader()
    await reader.read()
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(4))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(request).toHaveBeenCalledTimes(4)
    await reader.cancel()
    expect(request.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true)
  })

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
      bytes: 8,
      parts: Array.from({ length: 8 }, (_, index) => ({ path: `p${index}`, bytes: 1 })),
    }
    const response = await createModelFetch(
      root,
      { version: 1, files: { weights: asset } },
      request,
    )(root + 'weights')
    const reader = response.body!.getReader()
    const reading = reader.read()
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(4))
    await reader.cancel('cancelled')
    await reading
    expect(request.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true)
    expect(request).toHaveBeenCalledTimes(4)
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
