import { describe, expect, it, vi } from 'vitest'
import { ToolRegistry, type ToolDefinition } from './registry'
import { bilingual, localize } from '../lib/locale'

const schema = {
  type: 'object',
  properties: { a: { type: 'number' }, b: { type: 'number' } },
  required: ['a', 'b'],
  additionalProperties: false,
}
const sample = (): ToolDefinition => ({
  id: 'test-sum',
  title: bilingual('测试加法', 'Test sum'),
  description: bilingual('测试工具', 'Fixture tool'),
  category: 'other',
  fields: [],
  initialValues: { a: 0, b: 0 },
  inputSchema: schema,
  execute: async (values) => ({
    summary: bilingual(
      String(Number(values.a) + Number(values.b)),
      String(Number(values.a) + Number(values.b)),
    ),
  }),
  ai: {
    name: 'test_sum',
    description: bilingual('测试加法', 'Fixture sum'),
    parameters: schema,
    execute: async (args) => ({ sum: Number(args.a) + Number(args.b) }),
  },
})
const context = () => ({
  locale: 'zh-CN' as const,
  signal: new AbortController().signal,
  onProgress: vi.fn(),
})

describe('shared tool registry', () => {
  it('uses the same registration for UI and AI and unregisters both', async () => {
    const registry = new ToolRegistry()
    const unregister = registry.register(sample())
    expect(
      localize('en', (await registry.run('test-sum', { a: 17, b: 25 }, context())).summary),
    ).toBe('42')
    expect(registry.definitions('en')[0].function.description).toBe('Fixture sum')
    expect(registry.definitions()[0].function.name).toBe('test_sum')
    expect(
      await registry.invoke({ id: '1', name: 'test_sum', arguments: { a: 17, b: 25 } }, context()),
    ).toEqual({ sum: 42 })
    unregister()
    expect(registry.list()).toEqual([])
    expect(registry.definitions()).toEqual([])
  })
  it('rejects unknown functions, invalid arguments and aborted operations before execution', async () => {
    const registry = new ToolRegistry()
    const tool = sample()
    const execute = vi.fn(tool.ai!.execute)
    tool.ai!.execute = execute
    registry.register(tool)
    await expect(
      registry.invoke({ id: '1', name: 'eval', arguments: {} }, context()),
    ).rejects.toThrow('未启用')
    await expect(
      registry.invoke({ id: '1', name: 'test_sum', arguments: { a: '17', b: 25 } }, context()),
    ).rejects.toThrow('参数')
    await expect(
      registry.invoke(
        { id: '1', name: 'test_sum', arguments: { a: 17, b: 25, extra: true } },
        context(),
      ),
    ).rejects.toThrow('参数')
    const cancelled = new AbortController()
    cancelled.abort()
    await expect(
      registry.invoke(
        { id: '1', name: 'test_sum', arguments: { a: 17, b: 25 } },
        { locale: 'en', signal: cancelled.signal, onProgress: vi.fn() },
      ),
    ).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
    expect(() => registry.register(sample())).toThrow('重复')
  })
  it('discards results when a running UI or AI tool ignores cancellation', async () => {
    for (const mode of ['ui', 'ai']) {
      const registry = new ToolRegistry()
      const tool = sample()
      const controller = new AbortController()
      const execute = async () => {
        controller.abort()
        return { summary: bilingual('过期结果', 'Late result') }
      }
      tool.execute = execute
      tool.ai!.execute = execute
      registry.register(tool)
      const context = { locale: 'zh-CN' as const, signal: controller.signal, onProgress: vi.fn() }
      await expect(
        mode === 'ui'
          ? registry.run(tool.id, { a: 17, b: 25 }, context)
          : registry.invoke({ id: '1', name: 'test_sum', arguments: { a: 17, b: 25 } }, context),
      ).rejects.toThrow()
    }
  })
  it('rejects tools with incomplete translations before registration', () => {
    const registry = new ToolRegistry()
    const tool = sample()
    tool.title.en = ''
    expect(() => registry.register(tool)).toThrow('中文与英文')
    expect(registry.list()).toEqual([])
    const fieldTool = sample()
    fieldTool.fields = [
      {
        type: 'select',
        name: 'choice',
        label: bilingual('选择', 'Choice'),
        options: [{ value: 'x', label: bilingual('选项', '') }],
      },
    ]
    expect(() => registry.register(fieldTool)).toThrow('中文与英文')
  })
})
