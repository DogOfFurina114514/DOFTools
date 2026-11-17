import { expect, it } from 'vitest'
import { settleAIHistory } from './ai-history'
import type { AIMessage } from './ai'

it('closes only interrupted tool calls and retains completed outputs', () => {
  const messages: AIMessage[] = [
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        { id: 'done', name: 'run_tool', arguments: {} },
        { id: 'pending', name: 'run_tool', arguments: {} },
      ],
    },
    { role: 'tool', toolCallId: 'done', content: 'actual output' },
  ]
  const result = settleAIHistory(messages)
  expect(result.filter((item) => item.role === 'tool' && item.toolCallId === 'done')).toEqual([
    messages[1],
  ])
  expect(
    result.filter((item) => item.role === 'tool' && item.toolCallId === 'pending'),
  ).toHaveLength(1)
  expect(settleAIHistory(result)).toEqual(result)
})
