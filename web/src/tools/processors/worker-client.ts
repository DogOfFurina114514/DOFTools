import { LocalizedError, type LocalizedText } from '../../lib/locale'
import type { ToolResult, ToolRunContext, ToolValues } from '../registry'

export type ProcessorMessage =
  | { type: 'progress'; value: number }
  | { type: 'status'; value: LocalizedText }
  | { type: 'result'; value: ToolResult }
  | { type: 'error'; value: LocalizedText }
export function runWorker(worker: Worker, values: ToolValues, context: ToolRunContext) {
  return new Promise<ToolResult>((resolve, reject) => {
    const cleanup = () => {
      worker.terminate()
      context.signal.removeEventListener('abort', abort)
    }
    const abort = () => {
      cleanup()
      reject(context.signal.reason ?? new DOMException('Cancelled', 'AbortError'))
    }
    context.signal.addEventListener('abort', abort, { once: true })
    if (context.signal.aborted) {
      abort()
      return
    }
    worker.onerror = () => {
      cleanup()
      reject(
        new LocalizedError(
          '处理线程无法启动，请刷新后重试。',
          'The processing worker failed. Refresh and try again.',
        ),
      )
    }
    worker.onmessage = ({ data }: MessageEvent<ProcessorMessage>) => {
      if (data.type === 'progress') context.onProgress(data.value)
      else if (data.type === 'status') context.onStatus?.(data.value)
      else if (data.type === 'error') {
        cleanup()
        reject(new LocalizedError(data.value['zh-CN'], data.value.en))
      } else {
        cleanup()
        resolve(data.value)
      }
    }
    worker.postMessage({ values, locale: context.locale })
  })
}
