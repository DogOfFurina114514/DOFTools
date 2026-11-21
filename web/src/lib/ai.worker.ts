import {
  env,
  AutoProcessor,
  Qwen3_5ForConditionalGeneration,
  RawImage,
  TextStreamer,
  InterruptableStoppingCriteria,
  StoppingCriteria,
  Tensor,
} from '@huggingface/transformers'
import {
  LOCAL_MODEL,
  type AIWorkerEvent,
  type AIWorkerRequest,
  type AIMessage,
  type AILoadStage,
} from './ai'
import { parseToolCalls, visibleAIText } from './ai-output'
import { bilingual, errorMessage, LocalizedError } from './locale'
import {
  createDownloadPool,
  createModelFetch,
  MODEL_DOWNLOAD_CONCURRENCY,
  type ModelAssetManifest,
} from './model-assets'
import { resourceBase } from './site-resources'
import { createModelRequest } from './model-network'

let model: Qwen3_5ForConditionalGeneration | null = null
let processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null
const stopping = new InterruptableStoppingCriteria()
let busy = false
const send = (event: AIWorkerEvent) => self.postMessage(event)
class CompleteToolCall extends StoppingCriteria {
  constructor(private complete: (ids: number[]) => boolean) {
    super()
  }
  _call(inputIds: number[][]) {
    return inputIds.map(this.complete)
  }
}

async function prepareMessages(messages: AIMessage[]) {
  const images: RawImage[] = []
  const chat = []
  for (const message of messages) {
    if (message.role === 'user' && Array.isArray(message.content)) {
      const content = []
      for (const part of message.content) {
        if (part.type === 'image') {
          // Decode and resize on the worker, never upload the image.
          let image = (await RawImage.fromBlob(part.image)).rgb()
          const scale = Math.min(1, 512 / Math.max(image.width, image.height))
          if (scale < 1)
            image = await image.resize(
              Math.max(32, Math.round(image.width * scale)),
              Math.max(32, Math.round(image.height * scale)),
            )
          images.push(image)
          content.push({ type: 'image' })
        } else content.push(part)
      }
      chat.push({ role: message.role, content })
    } else if (message.role === 'assistant') {
      chat.push({
        role: message.role,
        content: message.content,
        tool_calls: message.toolCalls?.map((call) => ({
          type: 'function',
          function: { name: call.name, arguments: call.arguments },
        })),
      })
    } else chat.push({ role: message.role, content: message.content })
  }
  return { chat, images }
}

self.onmessage = async ({ data }: MessageEvent<AIWorkerRequest>) => {
  if (data.type === 'interrupt') {
    stopping.interrupt()
    return
  }
  const id = data.id
  if (busy) {
    send({
      id,
      type: 'error',
      message: bilingual(
        '模型正在处理上一项任务。',
        'The model is still processing the previous task.',
      ),
    })
    return
  }
  busy = true
  const tensors = new Set<Tensor>()
  try {
    if (data.type === 'load') {
      if (!model) {
        let stage: AILoadStage | undefined
        const reportStage = (value: AILoadStage) => {
          if (stage !== value) {
            stage = value
            send({ id, type: 'stage', stage: value })
          }
        }
        reportStage('gpu')
        const gpu = (
          self.navigator as Navigator & {
            gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> }
          }
        ).gpu
        let gpuTimer: ReturnType<typeof setTimeout> | undefined
        const adapter = await Promise.race([
          gpu?.requestAdapter(),
          new Promise<never>((_, reject) => {
            gpuTimer = setTimeout(
              () =>
                reject(
                  new LocalizedError(
                    '显卡检测超时，请开启硬件加速并重新启动浏览器。',
                    'GPU detection timed out. Enable hardware acceleration and restart your browser.',
                  ),
                ),
              20_000,
            )
          }),
        ]).finally(() => clearTimeout(gpuTimer))
        if (!adapter)
          throw new LocalizedError(
            '未找到可用的 WebGPU 显卡。请开启浏览器硬件加速，并更新 Chrome 或 Edge。',
            'No WebGPU adapter found. Enable hardware acceleration and update Chrome or Edge.',
          )
        if (!adapter.features.has('shader-f16'))
          throw new LocalizedError(
            '显卡未提供半精度运算，无法运行当前本地模型。',
            'This GPU does not support the half-precision operations required by the model.',
          )
        env.allowRemoteModels = false
        env.allowLocalModels = true
        const assetsBase = resourceBase(data.baseUrl)
        // Metadata discovery requires a local pathname. The fetch adapter maps
        // that pathname to Pages, also when the UI runs on another origin.
        env.localModelPath = new URL('models/', data.baseUrl).pathname
        // The resource worker persists bounded blocks instead of giant ONNX
        // responses; Transformers' whole-response browser cache stays disabled.
        env.useBrowserCache = false
        reportStage('connecting')
        const network = createModelRequest()
        const request: typeof fetch = async (input, init) => {
          const response = await network(input, init)
          const url = input instanceof Request ? input.url : String(input)
          if (response.headers.get('x-fufu-resource-source') === 'local') reportStage('cache')
          else if (/\.wasm(?:$|\?)/.test(url)) reportStage('runtime')
          else if (/tokenizer|vocab/.test(url)) reportStage('tokenizer')
          else if (/\.onnx(?:_data)?(?:\.|$)/.test(url)) reportStage('weights')
          return response
        }
        const modelRoot = new URL(`models/${LOCAL_MODEL.localId}/`, assetsBase)
        const assetsResponse = await request(new URL('asset-manifest.json', modelRoot), {
          cache: 'no-store',
        })
        if (!assetsResponse.ok)
          throw new LocalizedError('模型资源清单缺失。', 'The model resource manifest is missing.')
        const assets = (await assetsResponse.json()) as ModelAssetManifest
        const concurrency = [32, 64, 128].includes(data.concurrency ?? 0)
          ? data.concurrency!
          : MODEL_DOWNLOAD_CONCURRENCY
        const pool = createDownloadPool(concurrency)
        const downloadSizes = new Map(
          Object.entries(assets.files).map(([name, asset]) => [name, asset.bytes]),
        )
        downloadSizes.set(LOCAL_MODEL.runtimeFile, LOCAL_MODEL.runtimeBytes)
        const downloadBytes = [...downloadSizes.values()].reduce((sum, bytes) => sum + bytes, 0)
        const downloaded = new Map<string, number>()
        const reportProgress = (file: string, loaded: number) => {
          const size = downloadSizes.get(file)
          if (size === undefined) return
          downloaded.set(file, Math.min(size, Math.max(loaded, downloaded.get(file) ?? 0)))
          if (
            Object.entries(assets.files).every(
              ([name, asset]) => (downloaded.get(name) ?? 0) >= asset.bytes,
            )
          )
            reportStage('initializing')
          send({
            id,
            type: 'progress',
            progress: Math.min(
              1,
              [...downloaded.values()].reduce((a, b) => a + b, 0) / downloadBytes,
            ),
            file,
          })
        }
        env.fetch = createModelFetch(modelRoot.href, assets, request, {
          concurrency,
          pool,
          onProgress: reportProgress,
          localRoot: new URL(`models/${LOCAL_MODEL.localId}/`, data.baseUrl).href,
        })
        env.backends.onnx.wasm!.wasmPaths = new URL('runtime/', assetsBase).href
        env.backends.onnx.wasm!.numThreads = 1
        env.backends.onnx.wasm!.initTimeout = 60_000
        reportStage('runtime')
        const runtimeRoot = new URL('runtime/', assetsBase)
        const runtime = LOCAL_MODEL.runtimeFile
        const fetchRuntime = createModelFetch(
          runtimeRoot.href,
          {
            version: 1,
            files: {
              [runtime]: {
                bytes: LOCAL_MODEL.runtimeBytes,
                parts: [{ path: runtime, bytes: LOCAL_MODEL.runtimeBytes }],
              },
            },
          },
          request,
          { pool, concurrency, onProgress: reportProgress },
        )
        env.backends.onnx.wasm!.wasmBinary = await (
          await fetchRuntime(new URL(runtime, runtimeRoot))
        ).arrayBuffer()
        reportStage('config')
        const configResponse = await request(
          new URL(`models/${LOCAL_MODEL.localId}/config.json`, assetsBase),
        )
        if (!configResponse.ok || !configResponse.headers.get('content-type')?.includes('json'))
          throw new LocalizedError(
            '模型资源缺失，请使用包含模型文件的完整工具箱。',
            'Model resources are missing. Use the complete toolbox with model files included.',
          )
        const progress_callback = (event: {
          status: string
          file?: string
          loaded?: number
          total?: number
        }) => {
          if (event.file && ['progress', 'done'].includes(event.status))
            reportProgress(
              event.file,
              event.loaded ?? event.total ?? downloaded.get(event.file) ?? 0,
            )
        }
        reportStage('tokenizer')
        processor = await AutoProcessor.from_pretrained(LOCAL_MODEL.localId, {
          local_files_only: true,
          progress_callback,
        })
        reportStage('weights')
        model = (await Qwen3_5ForConditionalGeneration.from_pretrained(LOCAL_MODEL.localId, {
          device: 'webgpu',
          dtype: LOCAL_MODEL.dtype,
          local_files_only: true,
          progress_callback,
        })) as Qwen3_5ForConditionalGeneration
      }
      send({ id, type: 'loaded' })
    } else {
      if (!model || !processor)
        throw new LocalizedError('请先加载本地模型。', 'Load the local model first.')
      stopping.reset()
      const started = performance.now()
      const { chat, images } = await prepareMessages(data.messages)
      const tokenizer = processor.tokenizer
      if (!tokenizer)
        throw new LocalizedError('模型 tokenizer 未加载。', 'The model tokenizer is not loaded.')
      const templateOptions = {
        tokenize: false,
        add_generation_prompt: true,
        enable_thinking: false,
        tools: data.tools.length ? data.tools : undefined,
      }
      const text = processor.apply_chat_template(chat, templateOptions) as string
      const inputs = await processor(text, images.length ? images : undefined)
      for (const value of Object.values(inputs)) if (value instanceof Tensor) tensors.add(value)
      if (stopping.interrupted) {
        send({
          id,
          type: 'result',
          response: {
            text: '',
            toolCalls: [],
            interrupted: true,
            tokens: 0,
            elapsed: performance.now() - started,
          },
        })
        return
      }
      if (inputs.input_ids.dims[1] > 4096)
        throw new LocalizedError(
          '这段对话过长，请清空对话或缩短内容后重试。',
          'This conversation is too long. Clear the chat or shorten your message and retry.',
        )
      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: false,
        callback_function: (text) => send({ id, type: 'token', text }),
      })
      const promptLength = inputs.input_ids.dims[1]
      const toolComplete = new CompleteToolCall(
        (ids) =>
          data.tools.length > 0 &&
          ids.length > promptLength &&
          tokenizer
            .decode(ids.slice(Math.max(promptLength, ids.length - 64)), {
              skip_special_tokens: false,
            })
            .includes('</tool_call>'),
      )
      const output = (await model.generate({
        ...inputs,
        max_new_tokens: Math.min(data.maxTokens ?? 384, 512),
        do_sample: false,
        repetition_penalty: 1.08,
        streamer,
        stopping_criteria: [stopping, toolComplete],
      })) as Tensor
      tensors.add(output)
      const generated = output.slice(null, [inputs.input_ids.dims[1], null])
      tensors.add(generated)
      const raw = tokenizer.batch_decode(generated, { skip_special_tokens: false })[0]
      send({
        id,
        type: 'result',
        response: {
          text: visibleAIText(raw),
          toolCalls: stopping.interrupted ? [] : parseToolCalls(raw),
          interrupted: stopping.interrupted,
          tokens: generated.dims[1],
          elapsed: performance.now() - started,
        },
      })
    }
  } catch (error) {
    console.error('Local AI:', error)
    send({ id, type: 'error', message: errorMessage(error) })
  } finally {
    for (const tensor of tensors) {
      try {
        tensor.dispose()
      } catch (error) {
        console.warn('Local AI tensor cleanup:', error)
      }
    }
    busy = false
  }
}
