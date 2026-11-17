import { describe, expect, it, vi } from 'vitest'
import { ToolRegistry, type ToolDefinition } from '../tools/registry'
import { assistantDefinitions, executeAssistantCall } from './assistant-tools'
import { bilingual } from './locale'

function fixture() {
  const registry = new ToolRegistry()
  const execute = vi.fn(async (values: Record<string, unknown>) => ({
    summary: bilingual('处理完成', 'Finished'),
    files: [
      {
        name: 'output.txt',
        blob: new Blob([String((values.files as File[])[0].name)], { type: 'text/plain' }),
      },
    ],
  }))
  const definition: ToolDefinition = {
    id: 'file-fixture',
    title: bilingual('文件测试', 'File fixture'),
    description: bilingual('处理文本附件', 'Process text files'),
    category: 'document',
    fields: [
      {
        type: 'files',
        name: 'files',
        label: bilingual('文件', 'Files'),
        required: true,
        accept: '.txt',
      },
      {
        type: 'select',
        name: 'format',
        label: bilingual('格式', 'Format'),
        options: [{ value: 'text', label: bilingual('文本', 'Text') }],
      },
    ],
    initialValues: { files: [], format: 'text' },
    inputSchema: {
      type: 'object',
      properties: {
        files: { type: 'array', minItems: 1, maxItems: 1 },
        format: { type: 'string', enum: ['text'] },
      },
      required: ['files', 'format'],
      additionalProperties: false,
    },
    execute,
  }
  registry.register(definition)
  const context = {
    locale: 'en' as const,
    signal: new AbortController().signal,
    onProgress: vi.fn(),
  }
  const call = { id: '1', name: 'run_tool', arguments: { toolId: definition.id, parameters: {} } }
  return { registry, execute, definition, context, call }
}
describe('assistant file routing', () => {
  it('recommends a tool without executing even if a model returns an execution call for a text-only request', async () => {
    const { registry, execute, context, call } = fixture()
    expect(assistantDefinitions('en', [], registry).map((tool) => tool.function.name)).toEqual([
      'show_tools',
    ])
    const result = await executeAssistantCall(call, [], context, registry)
    expect(result.cards[0].id).toBe('file-fixture')
    expect(JSON.parse(result.content).executed).toBe(false)
    expect(execute).not.toHaveBeenCalled()
  })
  it('passes actual uploaded Files to the shared execution and returns downloadable Blobs', async () => {
    const { registry, execute, context, call } = fixture()
    const file = new File(['hello'], 'input.txt', { type: 'text/plain' })
    const result = await executeAssistantCall(call, [file], context, registry)
    expect(execute.mock.calls[0][0].files).toEqual([file])
    expect(await result.files![0].blob.text()).toBe('input.txt')
    expect(JSON.parse(result.content).files[0].name).toBe('output.txt')
    expect(JSON.parse(result.content).executed).toBe(true)
  })
  it('rejects invalid options, wrong file formats, made-up attachment IDs and cancelled requests before processing', async () => {
    const { registry, execute, context, call } = fixture()
    const file = new File(['hello'], 'input.txt', { type: 'text/plain' })
    await expect(
      executeAssistantCall(
        { ...call, arguments: { ...call.arguments, parameters: { format: 'invalid' } } },
        [file],
        context,
        registry,
      ),
    ).rejects.toThrow()
    await expect(
      executeAssistantCall(call, [new File([''], 'input.png')], context, registry),
    ).rejects.toThrow()
    await expect(
      executeAssistantCall(
        { ...call, arguments: { ...call.arguments, fileBindings: { files: ['file-99'] } } },
        [file],
        context,
        registry,
      ),
    ).rejects.toThrow()
    await expect(
      executeAssistantCall(call, [file], { ...context, signal: AbortSignal.abort() }, registry),
    ).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
  })
  it('normalizes real small-model file metadata and a single binding list, using only current uploads', async () => {
    const { registry, execute, context, call } = fixture()
    const file = new File(['hello'], 'input.txt', { type: 'text/plain' })
    await executeAssistantCall(
      {
        ...call,
        arguments: {
          toolId: 'file-fixture',
          parameters: { files: [{ name: 'input.txt' }] },
          fileBindings: ['file-1'],
        },
      },
      [file],
      context,
      registry,
    )
    expect(execute.mock.calls[0][0].files).toEqual([file])
    await expect(
      executeAssistantCall(
        { ...call, arguments: { toolId: 'file-fixture', fileBindings: ['file-99'] } },
        [file],
        context,
        registry,
      ),
    ).rejects.toThrow()
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
