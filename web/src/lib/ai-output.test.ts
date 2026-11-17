import { describe, expect, it } from 'vitest'
import { parseToolCalls, visibleAIText } from './ai-output'

describe('Qwen tool output', () => {
  it('parses actual function/parameter format with typed arguments', () => {
    const calls = parseToolCalls(
      '<tool_call>\n<function=test_sum>\n<parameter=a>17</parameter>\n<parameter=label>hello</parameter><parameter=options>{"enabled":true}</parameter>\n</function>\n</tool_call>',
    )
    expect(calls[0].name).toBe('test_sum')
    expect({ ...calls[0].arguments }).toEqual({ a: 17, label: 'hello', options: { enabled: true } })
  })
  it('accepts JSON calls and rejects incomplete, duplicate or unsafe parameters', () => {
    expect(
      parseToolCalls('<tool_call>{"name":"test_sum","arguments":{"a":2}}</tool_call>')[0].arguments,
    ).toEqual({ a: 2 })
    expect(() =>
      parseToolCalls(
        '<tool_call><function=x><parameter=a>1</parameter><parameter=a>2</parameter></function></tool_call>',
      ),
    ).toThrow()
    expect(() =>
      parseToolCalls(
        '<tool_call><function=x><parameter=constructor>1</parameter></function></tool_call>',
      ),
    ).toThrow()
    expect(() => parseToolCalls('<tool_call><function=x>')).toThrow()
    expect(() =>
      parseToolCalls('<tool_call>{"name":"x","arguments":{}}</tool_call><tool_call><function=x>'),
    ).toThrow()
  })
  it('keeps reasoning and partial tool calls out of displayed messages', () => {
    expect(visibleAIText('<think>private</think>你好<tool_call><function=x>')).toBe('你好')
    expect(visibleAIText('<think>partial')).toBe('')
  })
})
