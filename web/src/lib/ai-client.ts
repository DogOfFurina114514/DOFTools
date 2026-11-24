import {
  type AIResponse,
  type AIWorkerEvent,
  type AIWorkerRequest,
  type LocalAIAdapter,
  type AILoadStage,
} from './ai'
import { LocalizedError } from './locale'
import { modelDownloadThreads } from './download-preferences'
import { ensureResourceWorker, offlineAIAvailable } from './offline'

type Pending = {
  resolve: (value: AIResponse | undefined) => void
  reject: (error: Error) => void
  onProgress?: (progress: number) => void
  onToken?: (text: string) => void
  onStage?: (stage: AILoadStage) => void
  onStarted: () => void
}

export class BrowserLocalAI implements LocalAIAdapter {
  private worker: Worker | null = null
  private requests = new Map<number, Pending>()
  private sequence = 0
  private loadGeneration = 0
  private ensureWorker() {
    if (!this.worker) {
      this.worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = ({ data }: MessageEvent<AIWorkerEvent>) => {
        const pending = this.requests.get(data.id)
        if (!pending) return
        pending.onStarted()
        if (data.type === 'stage') pending.onStage?.(data.stage)
        else if (data.type === 'progress') pending.onProgress?.(data.progress)
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
      this.worker.onerror = () =>
        this.fail(
          new LocalizedError(
            '助手运行环境加载失败，请刷新网页后重试。',
            'The assistant runtime could not load. Refresh the page and try again.',
          ),
        )
      this.worker.onmessageerror = () =>
        this.fail(
          new LocalizedError(
            '无法读取助手返回的数据，请重新开启助手。',
            'The assistant response could not be read. Start the assistant again.',
          ),
        )
    }
    return this.worker
  }
  private request(
    data: AIWorkerRequest & { id: number },
    callbacks: Pick<Pending, 'onProgress' | 'onToken' | 'onStage'>,
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
      const startup =
        data.type === 'load'
          ? setTimeout(
              () =>
                this.fail(
                  new LocalizedError(
                    '助手启动超时，请检查网络并刷新网页后重试。',
                    'The assistant startup timed out. Check your connection, refresh the page and try again.',
                  ),
                ),
              45_000,
            )
          : undefined
      const cleanup = () => {
        clearTimeout(startup)
        signal?.removeEventListener('abort', abort)
      }
      this.requests.set(data.id, {
        ...callbacks,
        onStarted: () => clearTimeout(startup),
        resolve: (value) => {
          cleanup()
          resolve(value)
        },
        reject: (error) => {
          cleanup()
          reject(error)
        },
      })
      try {
        this.ensureWorker().postMessage(data)
      } catch (error) {
        this.requests.delete(data.id)
        cleanup()
        reject(error)
      }
    })
  }
  async load(
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
    onStage?: (stage: AILoadStage) => void,
  ) {
    const generation = ++this.loadGeneration
    if (!import.meta.env.DEV) {
      void navigator.storage?.persist?.().catch(() => false)
      await ensureResourceWorker().catch(() => undefined)
      if (!navigator.onLine && !(await offlineAIAvailable()))
        throw new LocalizedError(
          '当前处于离线状态，AI 模型尚未下载完整，无法使用 AI。请联网后在设置中下载模型资源。',
          'You are offline and the AI model has not been fully downloaded. AI is unavailable. Connect to the internet and download model resources in Settings.',
        )
    }
    if (generation !== this.loadGeneration) throw new DOMException('Cancelled', 'AbortError')
    signal?.throwIfAborted()
    const baseUrl = new URL(import.meta.env.BASE_URL, document.baseURI).href
    await this.request(
      { id: ++this.sequence, type: 'load', baseUrl, concurrency: modelDownloadThreads() },
      { onProgress, onStage },
      signal,
    )
  }
  async generate(request: Parameters<LocalAIAdapter['generate']>[0]) {
    const result = await this.request(
      {
        id: ++this.sequence,
        type: 'generate',
        messages: request.messages,
        tools: request.tools,
        maxTokens: request.maxTokens,
        thinkingLevel: request.thinkingLevel,
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
    this.fail(new DOMException('The model was unloaded or the task was cancelled.', 'AbortError'))
  }
  private fail(error: Error) {
    this.loadGeneration++
    this.worker?.terminate()
    this.worker = null
    this.requests.forEach((pending) => pending.reject(error))
    this.requests.clear()
  }
}
