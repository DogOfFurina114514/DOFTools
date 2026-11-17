import { bilingual, LocalizedError, toolRegistry } from '../../src/tools'

// Browser test fixture only; production still registers no tools.
export function registerLocaleFixture() {
  toolRegistry.register({
    id: 'locale-fixture',
    title: bilingual('双语测试工具', 'Bilingual fixture'),
    description: bilingual('验证工具的语言与输入状态。', 'Checks tool language and input state.'),
    category: 'other',
    fields: [
      {
        type: 'text',
        name: 'text',
        label: bilingual('输入内容', 'Input text'),
        placeholder: bilingual('输入一些文字', 'Enter some text'),
        help: bilingual('切换语言不会清空内容。', 'Language changes keep this input.'),
        required: true,
      },
      {
        type: 'select',
        name: 'format',
        label: bilingual('输出格式', 'Output format'),
        options: [
          { value: 'small', label: bilingual('小尺寸', 'Small') },
          { value: 'large', label: bilingual('大尺寸', 'Large') },
        ],
      },
      { type: 'checkbox', name: 'keep', label: bilingual('保留元数据', 'Keep metadata') },
      {
        type: 'files',
        name: 'files',
        label: bilingual('选择文件', 'Choose files'),
        multiple: true,
      },
    ],
    initialValues: { text: '', format: 'small', keep: false, files: [] },
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1 },
        format: { type: 'string', enum: ['small', 'large'] },
        keep: { type: 'boolean' },
        files: { type: 'array' },
      },
      required: ['text', 'format', 'keep', 'files'],
      additionalProperties: false,
    },
    async execute(values, { locale }) {
      if (values.text === 'error')
        throw new LocalizedError('测试处理失败', 'Fixture processing failed')
      return {
        summary: bilingual(`处理完成：${values.text}`, `Finished: ${values.text}`),
        files: [{ name: `${locale}-result.txt`, blob: new Blob([String(values.text)]) }],
      }
    },
  })
}
