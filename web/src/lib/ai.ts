import type { DisplayText } from './locale'
export const LOCAL_MODEL = {
  name: 'Qwen3.5-0.8B',
  id: 'Qwen/Qwen3.5-0.8B',
  parameters: '0.8B',
  precision: 'Q4 + FP16 vision',
  dtype: { embed_tokens: 'q4', vision_encoder: 'fp16', decoder_model_merged: 'q4' },
  bytes: 873485707,
  localId: 'qwen3.5-0.8b',
  directory: `${import.meta.env.BASE_URL}models/qwen3.5-0.8b/`,
  runtime: 'WebGPU',
  capabilities: { vision: true, toolCalling: true },
  status: 'integrated',
  modelCard: 'https://huggingface.co/Qwen/Qwen3.5-0.8B',
  mirrorCard: 'https://modelscope.cn/models/Qwen/Qwen3.5-0.8B',
} as const

export interface AICapability {
  desktop: boolean
  webgpu: boolean
  secure: boolean
}
export function detectAICapability(): AICapability {
  const mobile =
    (navigator as Navigator & { userAgentData?: { mobile: boolean } }).userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return { desktop: !mobile, webgpu: 'gpu' in navigator, secure: window.isSecureContext }
}

export type AIContentPart = { type: 'text'; text: string } | { type: 'image'; image: Blob }
export interface AIToolDefinition {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}
export interface AIToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}
export type AIMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | AIContentPart[] }
  | { role: 'assistant'; content: string; toolCalls?: AIToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string }

// All tool execution must resolve through an explicit local registry. No tools are enabled yet.
export const AVAILABLE_AI_TOOLS: AIToolDefinition[] = []
export interface LocalAIAdapter {
  load(onProgress: (progress: number) => void, signal?: AbortSignal): Promise<void>
  generate(request: {
    messages: AIMessage[]
    tools: AIToolDefinition[]
    onToken: (token: string) => void
    onToolCall: (call: AIToolCall) => void
    signal?: AbortSignal
    maxTokens?: number
  }): Promise<AIResponse>
  interrupt(): void
  dispose(): Promise<void>
}

export interface AIResponse {
  text: string
  toolCalls: AIToolCall[]
  interrupted: boolean
  tokens: number
  elapsed: number
}

export type AIWorkerRequest =
  | { id: number; type: 'load'; baseUrl: string }
  | {
      id: number
      type: 'generate'
      messages: AIMessage[]
      tools: AIToolDefinition[]
      maxTokens?: number
    }
  | { type: 'interrupt' }

export type AIWorkerEvent =
  | { id: number; type: 'progress'; progress: number; file: string }
  | { id: number; type: 'loaded' }
  | { id: number; type: 'token'; text: string }
  | { id: number; type: 'result'; response: AIResponse }
  | { id: number; type: 'error'; message: DisplayText }
