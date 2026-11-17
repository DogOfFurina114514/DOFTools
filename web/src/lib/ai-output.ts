import type { AIToolCall } from './ai'
import { LocalizedError } from './locale'

export function visibleAIText(raw: string) {
  return raw
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '')
    .replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/g, '')
    .replace(/<\|[^>]+\|>/g, '')
    .replace(/<\/?think>/g, '')
    .trim()
}

export function parseToolCalls(raw: string): AIToolCall[] {
  const remainder = raw.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
  if (/<\/?tool_call>/.test(remainder))
    throw new LocalizedError(
      '工具调用输出未完成，请重试。',
      'The tool call output was incomplete. Please retry.',
    )
  const calls: AIToolCall[] = []
  for (const match of raw.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g)) {
    const body = match[1]
    const fn = body.match(/^<function=([a-zA-Z][a-zA-Z0-9_]*)>\s*([\s\S]*?)\s*<\/function>$/)
    let name: string
    let args: Record<string, unknown>
    if (fn) {
      name = fn[1]
      args = Object.create(null) as Record<string, unknown>
      for (const parameter of fn[2].matchAll(
        /<parameter=([a-zA-Z][a-zA-Z0-9_]*)>\s*([\s\S]*?)\s*<\/parameter>/g,
      )) {
        const key = parameter[1]
        if (['__proto__', 'prototype', 'constructor'].includes(key) || key in args)
          throw new LocalizedError(
            '模型返回了无效的工具参数。',
            'The model returned invalid tool arguments.',
          )
        try {
          args[key] = JSON.parse(parameter[2])
        } catch {
          args[key] = parameter[2]
        }
      }
      const remainder = fn[2]
        .replace(/<parameter=[a-zA-Z][a-zA-Z0-9_]*>[\s\S]*?<\/parameter>/g, '')
        .trim()
      if (remainder)
        throw new LocalizedError(
          '模型返回了不完整的工具参数。',
          'The model returned incomplete tool arguments.',
        )
    } else {
      const json = JSON.parse(body) as { name?: unknown; arguments?: unknown }
      if (
        typeof json.name !== 'string' ||
        !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(json.name) ||
        !json.arguments ||
        typeof json.arguments !== 'object' ||
        Array.isArray(json.arguments)
      )
        throw new LocalizedError(
          '模型返回了无效的工具调用。',
          'The model returned an invalid tool call.',
        )
      name = json.name
      args = json.arguments as Record<string, unknown>
    }
    calls.push({ id: crypto.randomUUID(), name, arguments: args })
  }
  if (raw.includes('<tool_call>') && !calls.length)
    throw new LocalizedError(
      '工具调用输出未完成，请重试。',
      'The tool call output was incomplete. Please retry.',
    )
  return calls
}
