# 统一工具与控件接口

统一入口：`web/src/tools/index.ts`，以下源码路径均相对于 `web/`。具体工具不需要读取风格 ID，也不需要分别实现八套 UI。

```tsx
import { useState } from 'react'
import { ToolUI, useToolLocale } from '../tools'

// 自定义布局也可以直接消费统一控件。
function OutputName() {
  const [name, setName] = useState('')
  const { t } = useToolLocale()
  return (
    <ToolUI.TextField
      label={t('输出名称', 'Output name')}
      value={name}
      onValueChange={setName}
      help={t('请输入名称', 'Enter a name')}
    />
  )
}
```

## 控件约定

所有值控件使用 `label`、`value`、`onValueChange`，同时接受 `disabled`、`required`、`name`、`help`、`error`（适用时）。字符串值不会因为切换主题而重置。

| 控件                 | value                | 附加属性                                |
| -------------------- | -------------------- | --------------------------------------- |
| TextField / TextArea | string               | placeholder                             |
| NumberField          | number 或空字符串    | min、max、step                          |
| Select               | string               | options: { value, label }[]             |
| Slider               | number               | min、max、step                          |
| Checkbox / Switch    | boolean              | —                                       |
| FilePicker           | File[]               | accept、multiple                        |
| Progress             | 0 到 1，省略则不确定 | label                                   |
| Tabs                 | string               | options，支持方向键 / Home / End        |
| Button               | —                    | variant、原生 button 属性               |
| Panel                | —                    | title、actions、children                |
| Dialog               | —                    | open、title、onClose、actions、children |

默认与三种游戏风格由 CSS token 适配；Material 3 使用实际 Material Web 输入框、选择框、滑块、开关、复选框、进度条与按钮。弹窗使用原生 HTML dialog，以保持跨风格一致的焦点管理、Escape 关闭和遮罩行为。

## 添加一个工具

1. 在 `src/tools/` 新增定义，使用 `ToolDefinition`。
2. 在 `src/tools/index.ts` 导入定义并调用 `toolRegistry.register(definition)`。
3. `/tool/<id>` 自动提供 `ToolWorkspace`；对应分类与搜索自动读取注册表。

定义包含 `id`、`title`、`description`、`category`、`fields`、`initialValues`、`inputSchema`、`execute`。`fields` 是区分联合类型，支持 text、textarea、number、slider、select、checkbox、switch、files。名称、说明、字段标签、帮助、占位符、选项标签及结果摘要均使用 `LocalizedText`：`{'zh-CN': string, en: string}`，可通过 `bilingual(中文, English)` 创建。注册时校验双语言完整性。

```ts
import { bilingual, LocalizedError, type ToolDefinition } from '../tools'

const definition: ToolDefinition = {
  id: 'your-tool',
  title: bilingual('工具名称', 'Tool name'),
  description: bilingual('工具的用途', 'What this tool does'),
  category: 'other',
  fields: [
    {
      type: 'text',
      name: 'text',
      label: bilingual('输入内容', 'Input text'),
      placeholder: bilingual('请输入文字', 'Enter text'),
      required: true,
    },
  ],
  initialValues: { text: '' },
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string', minLength: 1 } },
    required: ['text'],
    additionalProperties: false,
  },
  async execute(values, { signal, onProgress, locale }) {
    signal.throwIfAborted()
    // 在这里实现真实的本地处理；长任务需定期检查 signal。
    onProgress(1)
    return { summary: bilingual('处理完成', 'Finished'), files: [] }
  },
}
```

这个示例仅存在于文档。正式工具定义位于 `src/tools/builtins.ts`，由统一入口注册。

工作台负责值状态、禁用、进度、取消、错误、结果与 Blob 下载。执行前由 Ajv 校验 `inputSchema`。文件字段对应的 schema 可使用 `type: array`；额外的文件类型和大小约束应在执行函数内检查。

工作台在显示时解析双语文案，所以切换语言不会重置输入、选项、文件或已完成的结果。自定义预览组件使用 `useToolLocale()`；`t(中文, English)` 用于内联标签，`resolve(双语对象)` 用于定义中的文案。处理函数接收开始运行时的 `locale`，可用于输出文件语言；文件名和字段标识保持原值。用户可见错误使用 `throw new LocalizedError(中文, English)`，当前错误会随语言切换更新。历史草稿不能直接启用，须转换为完整双语 `ToolDefinition` 后注册。

## AI 推荐与文件处理

所有已注册工具自动进入 AI 工具目录，目录使用当前界面语言，包含工具 ID、双语名称与说明、字段、选项、默认值及输入 schema。

- 纯文字请求只提供 `show_tools({toolIds})`，聊天展示卡片并通过 BrowserRouter 前往 `/tool/<id>`。执行层也拒绝对纯文字请求执行，即使模型错误返回 `run_tool`。
- 本次上传文件时额外提供 `run_tool({toolId, parameters, fileBindings?})`。`parameters` 为标量参数，与 `initialValues` 合并；`fileBindings` 为文件字段名到附件 ID 数组的映射，如 `{files: ['file-1']}`。只有一个文件字段时，可按 `accept` 自动绑定当前附件。
- 附件 ID 只引用本次消息中的真实 File，不接受路径、URL 或模型生成的文件数据。模型参数经工具的 `inputSchema` 校验，再通过同一 `toolRegistry.run()` 执行。必填字段、数量、格式、未知文件引用或取消信号错误都会停止执行。
- `ToolResult.summary` 用于聊天说明，`files` 中的 Blob 用于预览和下载；只将摘要、文件名、类型和大小送回模型，不序列化 Blob 或预览 ReactNode。需要视觉处理的工具可读取文件字段中的真实图片。
- 成功调用后直接展示实际卡片或文件结果，立即完成当前消息，避免第二轮生成复述输出。错误参数可由模型重试，每条消息最多四轮生成；同一成功调用及参数在单次消息内复用结果，避免重复执行。长任务使用 `signal` 和 `onProgress`，页内导航期间继续执行；关闭助手取消任务并释放模型。

`ToolDefinition.ai` 与 `toolRegistry.invoke()` 保留给显式调用方，但助手推荐和上传处理使用上面的统一 UI 执行路径，无需为新工具重复实现 AI 版本。正式注册表已有十一个工具；测试工具仍只在测试页面按需注册。音频与 MIDI 工具可绑定上传文件直接执行；网盘链接解析没有文件字段，助手只推荐前往工具页面使用。

聊天、上传的附件和结果文件通过 IndexedDB 结构化保存；刷新后可继续查看和下载，模型会回到未开启状态。清空对话清除持久记录，关闭助手保留历史。界面语言切换即时翻译工具卡片和结果摘要，文件名及生成的聊天原文不被改写。

共享控件还支持官方 Fluent UI React v9；与原生 Material 控件复用同一个值状态与文件接口。单一文件字段允许将模型返回的附件 ID 列表规范为字段绑定；模型写入 parameters 的文件字段元数据会被忽略，实际输入只取本次上传的 File，未知附件 ID 仍拒绝。

`ToolRunContext.onStatus` 可选，接收双语处理阶段或尝试次数；`onProgress` 为实际处理进度。音视频转换和 ZIP 密码恢复在 Worker 中运行，取消或结束后终止 Worker。搜索别名位于 `src/lib/search.ts`，同一索引覆盖双语名称与格式关键词，并对短拼写错误作容错。
