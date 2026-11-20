import { LocalizedError } from './locale'

export interface ModelAssetManifest {
  version: 1
  files: Record<string, { bytes: number; parts: { path: string; bytes: number }[] }>
}

interface ModelFetchOptions {
  concurrency?: number
  onProgress?: (file: string, loaded: number) => void
  localRoot?: string
  rangeBytes?: number
  pool?: ReturnType<typeof createDownloadPool>
}

// Share slots across all logical weights, including simultaneous runtime
// requests. A slot stays occupied until the body has finished downloading.
export function createDownloadPool(limit: number) {
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
  const rangeBytes = options.rangeBytes ?? 512 * 1024
  if (!Number.isSafeInteger(rangeBytes) || rangeBytes < 1)
    throw new Error('Invalid model range size')
  const download = options.pool ?? createDownloadPool(concurrency)
  let currentRangeBytes = rangeBytes

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
    // Bound each HTTP response while keeping the physical files and original
    // output ordering. Range is a CORS-safelisted header for a single range.
    const slices = asset.parts.flatMap<{ location: URL; bytes: number; range?: string }>(
      (part, partIndex) => {
        if (part.bytes <= rangeBytes)
          return [{ location: locations[partIndex], bytes: part.bytes, range: undefined }]
        const result = []
        for (let start = 0; start < part.bytes; start += rangeBytes) {
          const end = Math.min(part.bytes, start + rangeBytes) - 1
          result.push({
            location: locations[partIndex],
            bytes: end - start + 1,
            range: `bytes=${start}-${end}`,
          })
        }
        return result
      },
    )
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
      while (scheduled < slices.length && scheduled < index + concurrency) {
        const partIndex = scheduled++
        const part = slices[partIndex]
        const task = download(abort.signal, async () => {
          const bytes = new Uint8Array(part.bytes)
          let offset = 0
          let retries = 0
          let requestBytes = Math.min(part.bytes, currentRangeBytes)
          const start = Number(part.range?.match(/^bytes=(\d+)-/)?.[1] ?? 0)
          while (offset < part.bytes) {
            abort.signal.throwIfAborted()
            requestBytes = Math.min(requestBytes, currentRangeBytes)
            const length = Math.min(requestBytes, part.bytes - offset)
            const ranged = !!part.range || retries > 0 || length < part.bytes || offset > 0
            const headers = new Headers(
              init?.headers ?? (input instanceof Request ? input.headers : undefined),
            )
            if (ranged)
              headers.set('Range', `bytes=${start + offset}-${start + offset + length - 1}`)
            let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
            let read = 0
            try {
              const response = await request(part.location, {
                ...init,
                ...(ranged ? { headers } : {}),
                signal: abort.signal,
                cache: 'no-store',
              })
              if (response.status >= 500 || response.status === 429)
                throw new TypeError(`Model CDN temporarily unavailable: HTTP ${response.status}`)
              if (!response.ok || !response.body)
                throw new Error(
                  `Model part unavailable: ${part.location.pathname} (HTTP ${response.status})`,
                )
              if (ranged && response.status !== 206)
                throw new Error('The model CDN did not return the requested byte range')
              reader = response.body.getReader()
              while (true) {
                abort.signal.throwIfAborted()
                const chunk = await reader.read()
                if (chunk.done) break
                if (read + chunk.value.byteLength > length)
                  throw new Error(`Invalid model part size: ${part.location.pathname}`)
                bytes.set(chunk.value, offset + read)
                read += chunk.value.byteLength
                received += chunk.value.byteLength
                options.onProgress?.(relative, received)
              }
              if (read !== length)
                throw new Error(`Incomplete model part: ${part.location.pathname}`)
              offset += read
              retries = 0
            } catch (error) {
              await reader?.cancel(error).catch(() => {})
              received -= read
              if (
                !abort.signal.aborted &&
                (error instanceof TypeError ||
                  (error instanceof Error && error.name === 'TimeoutError'))
              ) {
                if (++retries >= 3)
                  throw new LocalizedError(
                    '模型分段下载失败，请检查网络后重新开启助手。',
                    'The model download failed after retries. Check your connection and start the assistant again.',
                  )
                requestBytes = Math.min(requestBytes, 128 * 1024)
                currentRangeBytes = Math.min(currentRangeBytes, requestBytes)
                await new Promise((resolve) => setTimeout(resolve, 250 * retries))
              } else throw error
            } finally {
              reader?.releaseLock()
            }
          }
          return bytes
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
            if (index === slices.length) {
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
        'content-type': relative.endsWith('.json')
          ? 'application/json'
          : relative.endsWith('.wasm')
            ? 'application/wasm'
            : 'application/octet-stream',
        'content-length': String(asset.bytes),
      },
    })
  }
}
