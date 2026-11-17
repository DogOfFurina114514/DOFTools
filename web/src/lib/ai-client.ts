import {
  type AIResponse,
  type AIWorkerEvent,
  type AIWorkerRequest,
  type LocalAIAdapter,
} from './ai'
import { LocalizedError } from './locale'

type Pending = {
  resolve: (value: AIResponse | undefined) => void
  reject: (error: Error) => void
  onProgress?: (progress: number) => void
  onToken?: (text: string) => void
}

export class BrowserLocalAI implements LocalAIAdapter {
  private worker: Worker | null = null
  private requests = new Map<number, Pending>()
  private sequence = 0
  private ensureWorker() {
    if (!this.worker) {
      this.worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = ({ data }: MessageEvent<AIWorkerEvent>) => {
        const pending = this.requests.get(data.id)
        if (!pending) return
        if (data.type === 'progress') pending.onProgress?.(data.progress)
        else if (data.type === 'token') pending.onToken?.(data.text)
        else {
          this.requests.delete(data.id)
          if (data.type === 'error')
            pending.reject(
              typeof data.message === 'string'
                ? new Error(data.message)
                : new LocalizedError(data.message['zh-CN'], data.message.en),
            )
          else pending.resolve(data.type === 'result' ? data.response : undefined)
        }
      }
      this.worker.onerror = () => {
        void this.dispose()
      }
    }
    return this.worker
  }
  private request(
    data: AIWorkerRequest & { id: number },
    callbacks: Pick<Pending, 'onProgress' | 'onToken'>,
    signal?: AbortSignal,
  ) {
    return new Promise<AIResponse | undefined>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Cancelled', 'AbortError'))
        return
      }
      const abort = () => {
        void this.dispose()
      }
      signal?.addEventListener('abort', abort, { once: true })
      const cleanup = () => signal?.removeEventListener('abort', abort)
      this.requests.set(data.id, {
        ...callbacks,
        resolve: (value) => {
          cleanup()
          resolve(value)
        },
        reject: (error) => {
          cleanup()
          reject(error)
        },
      })
      this.ensureWorker().postMessage(data)
    })
  }
  async load(onProgress: (progress: number) => void, signal?: AbortSignal) {
    const baseUrl = new URL(import.meta.env.BASE_URL, document.baseURI).href
    await this.request({ id: ++this.sequence, type: 'load', baseUrl }, { onProgress }, signal)
  }
  async generate(request: Parameters<LocalAIAdapter['generate']>[0]) {
    const result = await this.request(
      {
        id: ++this.sequence,
        type: 'generate',
        messages: request.messages,
        tools: request.tools,
        maxTokens: request.maxTokens,
      },
      { onToken: request.onToken },
      request.signal,
    )
    if (!result)
      throw new LocalizedError('模型未返回生成结果。', 'The model did not return a result.')
    result.toolCalls.forEach(request.onToolCall)
    return result
  }
  interrupt() {
    this.worker?.postMessage({ type: 'interrupt' } satisfies AIWorkerRequest)
  }
  async dispose() {
    this.worker?.terminate()
    this.worker = null
    this.requests.forEach((pending) =>
      pending.reject(
        new DOMException('The model was unloaded or the task was cancelled.', 'AbortError'),
      ),
    )
    this.requests.clear()
  }
}
