import { toolRegistry, bilingual } from '../../src/tools'

export function registerAssistantFixture() {
  if (toolRegistry.get('file-fixture')) return
  Object.assign(window, { fileExecutions: 0 })
  toolRegistry.register({
    id: 'file-fixture',
    title: bilingual('文件处理测试', 'File processing fixture'),
    description: bilingual('将文本转为大写', 'Convert text to uppercase'),
    category: 'document',
    fields: [
      {
        type: 'files',
        name: 'files',
        label: bilingual('文本文件', 'Text files'),
        accept: '.txt',
        required: true,
        multiple: true,
      },
    ],
    initialValues: { files: [] },
    inputSchema: {
      type: 'object',
      properties: { files: { type: 'array', minItems: 1 } },
      required: ['files'],
      additionalProperties: false,
    },
    execute: async (values, context) => {
      const state = window as unknown as { fileExecutions: number; holdTool?: boolean }
      state.fileExecutions++
      context.onProgress(0.25)
      if (state.holdTool) await new Promise((resolve) => setTimeout(resolve, 800))
      context.signal.throwIfAborted()
      const text = await (values.files as File[])[0].text()
      context.onProgress(1)
      return {
        summary: bilingual('文件已处理', 'File processed'),
        files: [
          { name: 'output.txt', blob: new Blob([text.toUpperCase()], { type: 'text/plain' }) },
        ],
      }
    },
  })
}
