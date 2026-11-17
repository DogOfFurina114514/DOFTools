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

  it('rejects truncated parts before reading the next part', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1])))
    const response = await createModelFetch(root, manifest, request)(root + 'onnx/model.onnx_data')
    await expect(response.arrayBuffer()).rejects.toThrow('Incomplete model part')
    expect(request).toHaveBeenCalledTimes(1)
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
})
