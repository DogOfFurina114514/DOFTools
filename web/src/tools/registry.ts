import Ajv, { type ValidateFunction } from 'ajv'
import type { ReactNode } from 'react'
import type { AIToolCall, AIToolDefinition } from '../lib/ai'
import { LOCALES, localize, LocalizedError, type Locale, type LocalizedText } from '../lib/locale'
export interface ToolOption {
  value: string
  label: LocalizedText
}

interface BaseField {
  name: string
  label: LocalizedText
  help?: LocalizedText
  required?: boolean
}
export type ToolField = BaseField &
  (
    | { type: 'text' | 'textarea'; placeholder?: LocalizedText }
    | { type: 'number' | 'slider'; min?: number; max?: number; step?: number }
    | { type: 'select'; options: readonly ToolOption[] }
    | { type: 'checkbox' | 'switch' }
    | { type: 'files'; accept?: string; multiple?: boolean }
  )
export type ToolValues = Record<string, string | number | boolean | File[]>
export interface ToolResult {
  summary: LocalizedText
  files?: { name: string; blob: Blob }[]
  preview?: ReactNode
}
export interface ToolRunContext {
  locale: Locale
  signal: AbortSignal
  onProgress: (value: number) => void
  onStatus?: (value: LocalizedText) => void
}
export interface ToolDefinition {
  id: string
  title: LocalizedText
  description: LocalizedText
  category: 'image' | 'video' | 'audio' | 'document' | 'other'
  fields: readonly ToolField[]
  initialValues: ToolValues
  inputSchema: Record<string, unknown>
  execute: (values: ToolValues, context: ToolRunContext) => Promise<ToolResult>
  /** Only explicitly listed AI functions can be invoked by the model. */
  ai?: {
    name: string
    description: LocalizedText
    parameters: Record<string, unknown>
    execute: (args: Record<string, unknown>, context: ToolRunContext) => Promise<unknown>
  }
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()
  private validators = new Map<string, ValidateFunction>()
  private aiValidators = new Map<string, ValidateFunction>()
  private ajv = new Ajv({ allErrors: true, strict: true, ownProperties: true })
  register(tool: ToolDefinition) {
    assertLocalized(tool.title)
    assertLocalized(tool.description)
    for (const field of tool.fields) {
      assertLocalized(field.label)
      if (field.help) assertLocalized(field.help)
      if ('placeholder' in field && field.placeholder) assertLocalized(field.placeholder)
      if (field.type === 'select') for (const option of field.options) assertLocalized(option.label)
    }
    if (tool.ai) assertLocalized(tool.ai.description)
    if (!/^[a-z][a-z0-9-]*$/.test(tool.id) || this.tools.has(tool.id))
      throw new LocalizedError(
        `工具 ID 重复或无效：${tool.id}`,
        `Duplicate or invalid tool ID: ${tool.id}`,
      )
    const validator = this.ajv.compile(tool.inputSchema)
    if (tool.ai) {
      if (
        !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(tool.ai.name) ||
        this.list().some((item) => item.ai?.name === tool.ai?.name)
      )
        throw new LocalizedError(
          'AI 工具名称重复或无效。',
          'Duplicate or invalid AI function name.',
        )
      this.aiValidators.set(tool.id, this.ajv.compile(tool.ai.parameters))
    }
    this.validators.set(tool.id, validator)
    this.tools.set(tool.id, tool)
    return () => {
      this.tools.delete(tool.id)
      this.validators.delete(tool.id)
      this.aiValidators.delete(tool.id)
    }
  }
  list() {
    return [...this.tools.values()]
  }
  get(id: string) {
    return this.tools.get(id)
  }
  definitions(locale: Locale = 'zh-CN'): AIToolDefinition[] {
    return this.list().flatMap((tool) =>
      tool.ai
        ? [
            {
              type: 'function' as const,
              function: {
                name: tool.ai.name,
                description: localize(locale, tool.ai.description),
                parameters: tool.ai.parameters,
              },
            },
          ]
        : [],
    )
  }
  async run(id: string, values: ToolValues, context: ToolRunContext) {
    context.signal.throwIfAborted()
    const tool = this.tools.get(id)
    if (!tool) throw new LocalizedError('工具尚未注册。', 'This tool is not registered.')
    const validate = this.validators.get(id)!
    if (!validate(values))
      throw new LocalizedError(
        '输入不符合工具要求，请检查必填项和数值范围。',
        'Check the required inputs and allowed value ranges.',
      )
    const result = await tool.execute(values, context)
    context.signal.throwIfAborted()
    assertLocalized(result.summary)
    return result
  }
  async invoke(call: AIToolCall, context: ToolRunContext) {
    context.signal.throwIfAborted()
    const tool = this.list().find((tool) => tool.ai?.name === call.name)
    if (!tool?.ai)
      throw new LocalizedError(`工具“${call.name}”未启用。`, `Tool "${call.name}" is not enabled.`)
    const validate = this.aiValidators.get(tool.id)!
    if (!validate(call.arguments))
      throw new LocalizedError(
        '模型返回的工具参数不符合要求。',
        'The model returned invalid tool arguments.',
      )
    const result = await tool.ai.execute(call.arguments, context)
    context.signal.throwIfAborted()
    return result
  }
}

function assertLocalized(value: LocalizedText) {
  if (
    !value ||
    typeof value !== 'object' ||
    LOCALES.some((locale) => typeof value[locale] !== 'string' || !value[locale].trim())
  )
    throw new LocalizedError(
      '工具文案必须同时提供完整的中文与英文。',
      'Tool text must provide complete Chinese and English translations.',
    )
}

// UI, search and AI share this registry.
export const toolRegistry = new ToolRegistry()
