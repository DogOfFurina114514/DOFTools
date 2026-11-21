export function transientResourceFailure(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof Error && ['TimeoutError', 'IncompleteResourceError'].includes(error.name))
  )
}

// Retry the complete response operation, including body reads. Failed bytes
// are discarded before another attempt; user file processing is never rerun.
export async function retryResource<T>(
  task: () => Promise<T>,
  signal: AbortSignal,
  onFailure?: (error: unknown) => void,
) {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted()
    try {
      return await task()
    } catch (error) {
      signal.throwIfAborted()
      if (attempt >= 2 || !transientResourceFailure(error)) throw error
      onFailure?.(error)
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer)
          signal.removeEventListener('abort', abort)
          reject(signal.reason)
        }
        const timer = setTimeout(
          () => {
            signal.removeEventListener('abort', abort)
            resolve()
          },
          250 * 2 ** attempt,
        )
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      })
    }
  }
}
