export interface ModelAssetManifest {
  version: 1
  files: Record<string, { bytes: number; parts: { path: string; bytes: number }[] }>
}

interface ModelFetchOptions {
  concurrency?: number
  onProgress?: (file: string, loaded: number) => void
  localRoot?: string
}

// Share slots across all logical weights, including simultaneous runtime
// requests. A slot stays occupied until the body has finished downloading.
function downloadPool(limit: number) {
  let active = 0
  const queue: (() => void)[] = []
  return async <T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> => {
    signal.throwIfAborted()
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        const index = queue.indexOf(start)
        if (index >= 0) queue.splice(index, 1)
        reject(signal.reason)
      }
      const start = () => {
        signal.removeEventListener('abort', abort)
        active++
        resolve()
      }
      if (active < limit) start()
      else {
        queue.push(start)
        signal.addEventListener('abort', abort, { once: true })
      }
    })
    try {
      signal.throwIfAborted()
      return await task()
    } finally {
      active--
      queue.shift()?.()
    }
  }
}

// Prefetch a bounded window in parallel, then emit in manifest order. Only this
// window is buffered in addition to the runtime's final weight buffer.
export function createModelFetch(
  modelRoot: string,
  manifest: ModelAssetManifest,
  request: typeof fetch = fetch,
  options: ModelFetchOptions = {},
): typeof fetch {
  const root = new URL(modelRoot)
  const localRoot = new URL(options.localRoot ?? root.href)
  const concurrency = options.concurrency ?? 4
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new Error('Model download concurrency must be between 1 and 8')
  const download = downloadPool(concurrency)

  return async (input, init) => {
    let url = new URL(input instanceof Request ? input.url : String(input), localRoot)
    if (url.href.startsWith(localRoot.href))
      url = new URL(url.pathname.slice(localRoot.pathname.length) + url.search, root)
    if (!url.href.startsWith(root.href))
      throw new Error('Model request outside the Pages resource directory')
    const target = input instanceof Request ? new Request(url.href, input) : url.href
    const relative = url.href.startsWith(root.href) ? url.pathname.slice(root.pathname.length) : ''
    const asset = manifest.files[relative]
    if (!asset)
      return request(
        target,
        /\.onnx(?:_data)?(?:$|\?)/.test(url.href) ? { ...init, cache: 'no-store' } : init,
      )

    if (
      !asset.parts.length ||
      asset.parts.some((part) => !Number.isSafeInteger(part.bytes) || part.bytes <= 0) ||
      asset.parts.reduce((sum, part) => sum + part.bytes, 0) !== asset.bytes
    )
      throw new Error('Invalid model part manifest')
    const locations = asset.parts.map((part) => {
      const location = new URL(part.path, root)
      if (location.origin !== root.origin || !location.pathname.startsWith(root.pathname))
        throw new Error('Invalid model part location')
      return location
    })
    const externalSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    const abort = new AbortController()
    const stop = () => abort.abort(externalSignal?.reason)
    if (externalSignal?.aborted) stop()
    else externalSignal?.addEventListener('abort', stop, { once: true })
    const cleanup = () => externalSignal?.removeEventListener('abort', stop)
    const pending = new Map<number, Promise<Uint8Array>>()
    let scheduled = 0
    let index = 0
    let received = 0
    let failure: unknown
    let failed = false
    let finished = false
    let streamController: ReadableStreamDefaultController<Uint8Array>

    const fail = (error: unknown) => {
      if (finished || failed) return
      failed = true
      failure = error
      abort.abort(error)
      pending.clear()
      cleanup()
      streamController.error(error)
    }
    const prefetch = () => {
      while (scheduled < asset.parts.length && scheduled < index + concurrency) {
        const partIndex = scheduled++
        const part = asset.parts[partIndex]
        const task = download(abort.signal, async () => {
          const response = await request(locations[partIndex], {
            ...init,
            signal: abort.signal,
            cache: 'no-store',
          })
          if (!response.ok || !response.body)
            throw new Error(`Model part unavailable: ${part.path} (HTTP ${response.status})`)
          const reader = response.body.getReader()
          const bytes = new Uint8Array(part.bytes)
          let offset = 0
          try {
            while (true) {
              abort.signal.throwIfAborted()
              const chunk = await reader.read()
              if (chunk.done) break
              if (offset + chunk.value.byteLength > part.bytes)
                throw new Error(`Invalid model part size: ${part.path}`)
              bytes.set(chunk.value, offset)
              offset += chunk.value.byteLength
              received += chunk.value.byteLength
              options.onProgress?.(relative, received)
            }
            if (offset !== part.bytes) throw new Error(`Incomplete model part: ${part.path}`)
            return bytes
          } catch (error) {
            await reader.cancel(error).catch(() => {})
            throw error
          } finally {
            reader.releaseLock()
          }
        })
        pending.set(partIndex, task)
        // Observe prefetch failures immediately, including later parts that
        // finish before a slow earlier part.
        void task.catch(fail)
      }
    }
    const body = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          streamController = controller
        },
        async pull(controller) {
          try {
            if (failed) throw failure
            abort.signal.throwIfAborted()
            prefetch()
            const bytes = await pending.get(index)!
            if (failed) return
            pending.delete(index++)
            controller.enqueue(bytes)
            if (index === asset.parts.length) {
              finished = true
              cleanup()
              controller.close()
            }
          } catch (error) {
            fail(error)
          }
        },
        cancel(reason) {
          finished = true
          abort.abort(reason)
          pending.clear()
          cleanup()
        },
      },
      { highWaterMark: 0 },
    )
    return new Response(body, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(asset.bytes),
      },
    })
  }
}
