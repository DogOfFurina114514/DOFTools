import type { AIToolCall, AIToolDefinition } from './ai'
import { bilingual, localize, LocalizedError, type Locale, type LocalizedText } from './locale'
import {
  toolRegistry,
  type ToolRegistry,
  type ToolRunContext,
  type ToolValues,
} from '../tools/registry'

export interface AssistantToolCard {
  id: string
  title: LocalizedText
  description: LocalizedText
}
export interface AssistantToolOutput {
  cards: AssistantToolCard[]
  summary: LocalizedText
  files?: { name: string; blob: Blob }[]
  content: string
}
export const attachmentId = (index: number) => `file-${index + 1}`

export function assistantCatalog(
  locale: Locale,
  registry: ToolRegistry = toolRegistry,
  files: File[] = [],
) {
  return registry.list().map((tool) => {
    const summary = {
      id: tool.id,
      title: localize(locale, tool.title),
      description: localize(locale, tool.description),
    }
    // Recommendations need only the catalog. Include processing options only
    // for tools that can handle this turn's files; UI text and duplicate JSON
    // schemas used to exhaust the context before even a one-line question.
    const relevant = tool.fields.some(
      (field) => field.type === 'files' && files.some((file) => acceptsFile(file, field.accept)),
    )
    if (!relevant) return summary
    return {
      ...summary,
      fields: tool.fields.map((field) => ({
        name: field.name,
        type: field.type,
        ...(field.visibleWhen ? { visibleWhen: field.visibleWhen } : {}),
        ...('options' in field ? { options: field.options.map((option) => option.value) } : {}),
        ...('min' in field ? { min: field.min } : {}),
        ...('max' in field ? { max: field.max } : {}),
        ...('accept' in field ? { accept: field.accept } : {}),
        ...(!Array.isArray(tool.initialValues[field.name])
          ? { default: tool.initialValues[field.name] }
          : {}),
      })),
    }
  })
}
export function assistantDefinitions(
  locale: Locale,
  files: File[],
  registry: ToolRegistry = toolRegistry,
): AIToolDefinition[] {
  const ids = registry.list().map((tool) => tool.id)
  if (!ids.length) return []
  const definitions: AIToolDefinition[] = [
    {
      type: 'function',
      function: {
        name: 'show_tools',
        description: localize(
          locale,
          bilingual(
            '展示适合用户要求的工具卡片，用户可以前往工具页面。不执行工具。',
            'Show suitable tool cards with links to their pages. Does not execute tools.',
          ),
        ),
        parameters: {
          type: 'object',
          properties: {
            toolIds: {
              type: 'array',
              items: { type: 'string', enum: ids },
              minItems: 1,
              maxItems: 6,
              uniqueItems: true,
            },
          },
          required: ['toolIds'],
          additionalProperties: false,
        },
      },
    },
  ]
  if (files.length)
    definitions.push({
      type: 'function',
      function: {
        name: 'run_tool',
        description: localize(
          locale,
          bilingual(
            '直接处理本次上传的文件。parameters 只放文字、数字、开关等处理选项，无选项时留空对象 {}，绝不包含文件。单一文件字段自动绑定附件，可省略 fileBindings。',
            'Process current uploaded files. parameters contains only scalar processing options, never files; use {} or omit when no options are needed. A single file field binds uploads automatically, so omit fileBindings.',
          ),
        ),
        parameters: {
          type: 'object',
          properties: {
            toolId: { type: 'string', enum: ids },
            parameters: {
              type: 'object',
              additionalProperties: { type: ['string', 'number', 'boolean'] },
            },
            fileBindings: {
              type: 'object',
              additionalProperties: {
                type: 'array',
                items: { type: 'string', enum: files.map((_, index) => attachmentId(index)) },
                minItems: 1,
              },
            },
          },
          required: ['toolId'],
          additionalProperties: false,
        },
      },
    })
  return definitions
}
export function acceptsFile(file: File, accept?: string) {
  return (
    !accept ||
    accept.split(',').some((raw) => {
      const type = raw.trim().toLowerCase()
      return type.startsWith('.')
        ? file.name.toLowerCase().endsWith(type)
        : type.endsWith('/*')
          ? file.type.toLowerCase().startsWith(type.slice(0, -1))
          : file.type.toLowerCase() === type
    })
  )
}
export async function executeAssistantCall(
  call: AIToolCall,
  files: File[],
  context: ToolRunContext,
  registry: ToolRegistry = toolRegistry,
): Promise<AssistantToolOutput> {
  context.signal.throwIfAborted()
  const card = (id: string): AssistantToolCard => {
    const tool = registry.get(id)
    if (!tool) throw new LocalizedError('这个工具暂不可用。', 'This tool is currently unavailable.')
    return { id: tool.id, title: tool.title, description: tool.description }
  }
  if (call.name === 'show_tools') {
    const ids = call.arguments.toolIds
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 6 ||
      ids.some((id) => typeof id !== 'string')
    )
      throw new LocalizedError('没有找到合适的工具。', 'No suitable tool was found.')
    const cards = [...new Set(ids as string[])].map(card)
    return {
      cards,
      summary: bilingual('可以使用这些工具。', 'These tools can help.'),
      content: JSON.stringify({
        recommended: cards.map((item) => ({
          id: item.id,
          title: localize(context.locale, item.title),
        })),
        executed: false,
      }),
    }
  }
  if (call.name !== 'run_tool')
    throw new LocalizedError('这个操作暂不支持。', 'This action is unavailable.')
  const id = call.arguments.toolId
  if (typeof id !== 'string')
    throw new LocalizedError('请选择可用的工具。', 'Choose an available tool.')
  const tool = registry.get(id)
  const cards = [card(id)]
  // A text-only request always recommends. Even a mistaken model call cannot execute.
  if (!files.length)
    return {
      cards,
      summary: bilingual('前往工具页面即可使用。', 'Open the tool page to get started.'),
      content: JSON.stringify({ recommended: id, executed: false }),
    }
  const rawParameters = call.arguments.parameters ?? {}
  const fileFields = tool!.fields.filter((field) => field.type === 'files')
  // Small models sometimes repeat file metadata as parameters. File values always
  // come from the current uploads; metadata never becomes an executable input.
  const parameters =
    rawParameters && typeof rawParameters === 'object' && !Array.isArray(rawParameters)
      ? Object.fromEntries(
          Object.entries(rawParameters).filter(
            ([key]) => !fileFields.some((field) => field.name === key),
          ),
        )
      : rawParameters
  if (
    !parameters ||
    typeof parameters !== 'object' ||
    Array.isArray(parameters) ||
    Object.values(parameters).some(
      (value) => !['string', 'number', 'boolean'].includes(typeof value),
    )
  )
    throw new LocalizedError(
      '工具参数不完整，请补充处理要求。',
      'Please complete the processing instructions.',
    )
  const values: ToolValues = { ...tool!.initialValues }
  if (!fileFields.length)
    throw new LocalizedError(
      '这个工具无法处理附件，请前往工具页面使用。',
      'This tool cannot process attachments. Open its page to use it.',
    )
  const rawBindings = call.arguments.fileBindings ?? {}
  const bindings =
    Array.isArray(rawBindings) && fileFields.length === 1
      ? { [fileFields[0].name]: rawBindings }
      : rawBindings
  if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings))
    throw new LocalizedError('请重新选择待处理的文件。', 'Please select the files again.')
  for (const [key, value] of Object.entries(parameters)) {
    if (
      fileFields.some((field) => field.name === key) ||
      ['__proto__', 'constructor', 'prototype'].includes(key)
    )
      throw new LocalizedError(
        '文件参数必须来自上传的附件。',
        'File inputs must come from uploaded attachments.',
      )
    values[key] = value as string | number | boolean
  }
  for (const key of Object.keys(bindings))
    if (!fileFields.some((field) => field.name === key))
      throw new LocalizedError(
        '文件输入不符合工具要求。',
        'The file inputs do not match this tool.',
      )
  for (const field of fileFields) {
    const refs = (bindings as Record<string, unknown>)[field.name]
    let chosen: File[]
    if (refs !== undefined) {
      if (
        !Array.isArray(refs) ||
        refs.some(
          (ref) =>
            typeof ref !== 'string' || !files.some((_, index) => attachmentId(index) === ref),
        )
      )
        throw new LocalizedError('找不到待处理的附件。', 'An attachment could not be found.')
      chosen = [...new Set(refs as string[])].map(
        (ref) => files[files.findIndex((_, index) => attachmentId(index) === ref)],
      )
      if (chosen.some((file) => !acceptsFile(file, field.accept)))
        throw new LocalizedError(
          '文件格式不符合工具要求。',
          'The file format is not supported by this tool.',
        )
    } else
      chosen =
        fileFields.length === 1 ? files.filter((file) => acceptsFile(file, field.accept)) : []
    if ((!field.multiple && chosen.length > 1) || (field.required && !chosen.length))
      throw new LocalizedError(
        '请明确每个文件的处理方式。',
        'Please specify how each file should be processed.',
      )
    values[field.name] = chosen
  }
  const result = await registry.run(id, values, context)
  return {
    cards,
    summary: result.summary,
    files: result.files,
    content: JSON.stringify({
      tool: id,
      summary: localize(context.locale, result.summary),
      files: result.files?.map((file) => ({
        name: file.name,
        type: file.blob.type,
        bytes: file.blob.size,
      })),
      executed: true,
    }),
  }
}
