import { toolRegistry, bilingual } from '../../src/tools'

export function registerModelFixture() {
  const schema = {
    type: 'object',
    properties: { a: { type: 'number' }, b: { type: 'number' } },
    required: ['a', 'b'],
    additionalProperties: false,
  }
  toolRegistry.register({
    id: 'test-sum',
    title: bilingual('测试加法', 'Test sum'),
    description: bilingual(
      '仅在真实模型测试中注册。',
      'Only registered during the real-model test.',
    ),
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
      description: bilingual(
        '计算两个数字之和。必须通过此工具获得结果。',
        'Add two numbers. You must use this tool to obtain the result.',
      ),
      parameters: schema,
      execute: async (args) => ({ sum: Number(args.a) + Number(args.b) }),
    },
  })
}
