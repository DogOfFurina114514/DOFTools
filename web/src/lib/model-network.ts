import { LocalizedError } from './locale'

// Bound connection and body stalls, rather than total download time. A slow
// connection can keep downloading as long as bytes continue to arrive.
export function createModelRequest(
  request: typeof fetch = fetch,
  timeoutMs = 30_000,
): typeof fetch {
  return async (input, init) => {
    const abort = new AbortController()
    const external = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', stop)
    }
    const stop = () => abort.abort(external?.reason)
    if (external?.aborted) stop()
    else external?.addEventListener('abort', stop, { once: true })
    const wait = async <T>(task: () => Promise<T>): Promise<T> => {
      abort.signal.throwIfAborted()
      let onAbort: () => void
      const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => reject(abort.signal.reason)
        abort.signal.addEventListener('abort', onAbort, { once: true })
      })
      timer = setTimeout(() => {
        const error = new LocalizedError(
          '模型下载连接超时，请检查网络后重新开启助手。',
          'The model download stalled. Check your connection and start the assistant again.',
        )
        error.name = 'TimeoutError'
        abort.abort(error)
      }, timeoutMs)
      try {
        return await Promise.race([task(), cancelled])
      } finally {
        clearTimeout(timer)
        abort.signal.removeEventListener('abort', onAbort!)
      }
    }
    try {
      abort.signal.throwIfAborted()
      const response = await wait(() => request(input, { ...init, signal: abort.signal }))
      if (!response.body) {
        cleanup()
        return response
      }
      const reader = response.body.getReader()
      const body = new ReadableStream<Uint8Array>(
        {
          async pull(controller) {
            try {
              const chunk = await wait(() => reader.read())
              if (chunk.done) {
                cleanup()
                reader.releaseLock()
                controller.close()
              } else controller.enqueue(chunk.value)
            } catch (error) {
              cleanup()
              abort.abort(error)
              controller.error(error)
              await reader.cancel(error).catch(() => {})
              reader.releaseLock()
            }
          },
          async cancel(reason) {
            cleanup()
            abort.abort(reason)
            await reader.cancel(reason).catch(() => {})
            reader.releaseLock()
          },
        },
        { highWaterMark: 0 },
      )
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    } catch (error) {
      cleanup()
      throw error
    }
  }
}
