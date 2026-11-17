import type { AIMessage } from './ai'

/** Preserve valid tool-call pairs when a reload or close interrupts a turn. */
export function settleAIHistory(messages: AIMessage[]): AIMessage[] {
  const results = new Set(
    messages.flatMap((message) => (message.role === 'tool' ? [message.toolCallId] : [])),
  )
  return messages.flatMap((message): AIMessage[] => [
    message,
    ...(message.role === 'assistant'
      ? (message.toolCalls ?? [])
          .filter((call) => !results.has(call.id))
          .map((call): AIMessage => ({
            role: 'tool',
            toolCallId: call.id,
            content: JSON.stringify({ cancelled: true }),
          }))
      : []),
  ])
}
