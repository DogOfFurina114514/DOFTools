export interface ModelAssetManifest {
  version: 1
  files: Record<string, { bytes: number; parts: { path: string; bytes: number }[] }>
}

// Serve a logical ONNX file from sequential same-origin parts without buffering
// a second copy of the full weights. Transformers.js sees a normal byte stream
// with the original Content-Length, so its download progress remains accurate.
export function createModelFetch(
  modelRoot: string,
  manifest: ModelAssetManifest,
  request: typeof fetch = fetch,
): typeof fetch {
  const root = new URL(modelRoot)
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), root)
    const relative = url.href.startsWith(root.href) ? url.pathname.slice(root.pathname.length) : ''
    const asset = manifest.files[relative]
    if (!asset)
      return request(
        input,
        /\.onnx(?:_data)?(?:$|\?)/.test(url.href) ? { ...init, cache: 'no-store' } : init,
      )

    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    let index = 0
    let partBytes = 0
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          signal?.throwIfAborted()
          while (true) {
            if (!reader) {
              const part = asset.parts[index]
              if (!part) {
                controller.close()
                return
              }
              const partUrl = new URL(part.path, root)
              if (partUrl.origin !== root.origin || !partUrl.pathname.startsWith(root.pathname))
                throw new Error('Invalid model part location')
              const response = await request(partUrl, { ...init, signal, cache: 'no-store' })
              if (!response.ok || !response.body)
                throw new Error(`Model part unavailable: ${part.path} (HTTP ${response.status})`)
              reader = response.body.getReader()
              partBytes = 0
            }
            const chunk = await reader.read()
            if (chunk.done) {
              reader.releaseLock()
              reader = undefined
              if (partBytes !== asset.parts[index].bytes)
                throw new Error(`Incomplete model part: ${asset.parts[index].path}`)
              index++
              continue
            }
            partBytes += chunk.value.byteLength
            if (partBytes > asset.parts[index].bytes)
              throw new Error(`Invalid model part size: ${asset.parts[index].path}`)
            controller.enqueue(chunk.value)
            return
          }
        } catch (error) {
          await reader?.cancel(error).catch(() => {})
          controller.error(error)
        }
      },
      async cancel(reason) {
        await reader?.cancel(reason)
      },
    })
    return new Response(body, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(asset.bytes),
      },
    })
  }
}
