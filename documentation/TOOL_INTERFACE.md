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

八种主题使用同一套 React / CSS 自绘控件，由主题 token 适配外观。Select 使用按钮 combobox 与 portal listbox，支持方向键、Home / End、字符搜索、Enter 确认、Escape 取消、Tab 离开，并随滚动、变换和移动视口调整位置。滑块支持拖动和键盘；数字框用文本编辑与自绘加减按钮，保留小数输入中间态，失焦按 min / max / step 归一。弹窗使用 portal 管理遮罩、背景 inert、焦点循环、嵌套弹窗及焦点恢复，不依赖 HTMLDialogElement.showModal。文本编辑和隐藏的文件 input 保留浏览器的基础能力；页面可见的选择按钮和文件列表均自绘。

## 添加一个工具

1. 在 `src/tools/` 新增定义，使用 `ToolDefinition`。
2. 在 `src/tools/index.ts` 导入定义并调用 `toolRegistry.register(definition)`。
3. `/tool/<id>` 自动提供 `ToolWorkspace`；标签筛选、搜索与固定入口自动读取注册表。

定义包含 `id`、`title`、`description`、`tags`、`fields`、`initialValues`、`inputSchema`、`execute`。`fields` 是区分联合类型，支持 text、textarea、number、slider、select、checkbox、switch、files。名称、说明、字段标签、帮助、占位符、选项标签及结果摘要均使用 `LocalizedText`：`{'zh-CN': string, en: string}`，可通过 `bilingual(中文, English)` 创建。注册时校验双语言完整性。

`icon` 可提供 `lucide-react` 的 `LucideIcon`，表示工具本身，独立于标签图标。内置工具在 `src/tools/icons.ts` 中分别指定不同图标，定义函数的 ID 类型保证新增内置工具时必须添加映射。`src/components/ToolIcon.tsx` 统一目录、首页、固定栏、工作台和 AI 推荐的显示；图标对辅助技术隐藏，链接和标题名称保留原文。外部定义未提供图标时使用扳手图标。

```ts
import { Wrench } from 'lucide-react'
import { bilingual, LocalizedError, type ToolDefinition } from '../tools'

const definition: ToolDefinition = {
  id: 'your-tool',
  icon: Wrench,
  title: bilingual('工具名称', 'Tool name'),
  description: bilingual('工具的用途', 'What this tool does'),
  tags: ['other'],
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

`ToolDefinition.ai` 与 `toolRegistry.invoke()` 保留给显式调用方，但助手推荐和上传处理使用上面的统一 UI 执行路径，无需为新工具重复实现 AI 版本。正式注册表有 17 个工具入口；测试工具仍只在测试页面按需注册。音频与 MIDI 工具可绑定上传文件直接执行；视频替换音频使用 videoFiles / audioFiles 两个文件字段，AI 调用需显式绑定对应附件；网盘和社交链接解析没有文件字段，助手只推荐前往工具页面使用。

聊天、上传的附件和结果文件通过 IndexedDB 结构化保存；刷新后可继续查看和下载，模型会回到未开启状态。清空对话清除持久记录，关闭助手保留历史。界面语言切换即时翻译工具卡片和结果摘要，文件名及生成的聊天原文不被改写。

Fluent 主题保留稳定的 FluentProvider 和调色板，共享自绘控件与所有主题复用同一个值状态与文件接口。单一文件字段允许将模型返回的附件 ID 列表规范为字段绑定；模型写入 parameters 的文件字段元数据会被忽略，实际输入只取本次上传的 File，未知附件 ID 仍拒绝。

`ToolRunContext.onStatus` 可选，接收双语处理阶段或尝试次数；`onProgress` 为实际处理进度。音视频转换和 ZIP 密码恢复在 Worker 中运行，取消或结束后终止 Worker。搜索别名位于 `src/lib/search.ts`，同一索引覆盖双语名称与格式关键词，并对短拼写错误作容错。

字段可用 `visibleWhen: { field, value }` 指定模式条件：共享工作台仅显示满足条件的字段，内置工具 schema 仅在条件成立时要求并校验这些字段，切换模式后被清空的隐藏参数不会阻止执行。AI 工具目录同时提供该条件元数据。`ToolResult.details` 可提供双语结果明细数组，注册表校验完整翻译，工作台逐项显示；支持 Worker 的结构化传递。

## 多标签与社交解析适配器

`tags` 为非空、不重复的 `ToolTagId[]`，取值来自 `web/src/data/tags.ts`：image、video、audio、document、parse、online、other。online 的中英文名称为“仅联网 / Online only”，表示需要调用外部 API；目前添加到 share-link 与 social-link，其余工具本地处理。所有工具页 `/tools` 的重复查询参数 `tag` 使用 AND 筛选，与 `q` 搜索共同生效。工具注册时校验标签；展示、搜索和固定入口共用注册表。固定偏好键为 `fufu:pinned-tools`，只保存在浏览器。旧 `/category/:id` 自动重定向，保留其他查询参数。侧栏导航 data-scroll-area 共用主题滚动条；导航直接子项与侧栏其他区域不收缩，固定项溢出时独立滚动。

26.2.2 的 `web/src/tools/processors/social-service.ts` 实现 `SocialResolver`：签名 `(link: SocialLink, context: ToolRunContext) => Promise<SocialResolution>`；输入含平台与规范化 HTTPS 链接，输出含可选标题和非空媒体数组。`SocialMedia` 含 kind（video / audio / image）、HTTP(S) url，以及可选 label、width、height、size、format、codec。平台识别和结果控件分别位于 social-parser.ts / social-links.tsx，19 个平台共用同一接口，解析由 API 服务完成，无需用户自备代理；用户可选择画质、音轨或图片，并打开 / 复制所选直链。

内置适配器使用 `GET https://openapi.dwo.cc/api/svparse`，仅发送经 URLSearchParams 编码的完整 `url` 参数，保留签名和分享查询参数。不得省略 url：服务会将空请求当作演示视频。请求使用 credentials: omit、referrerPolicy: no-referrer、cache: no-store，30 秒超时与 context.signal 合并；流式读取最多 2 MiB JSON，不缓存媒体直链。成功要求 code 为 200 或 "200"，再校验 data；HTTP 错误、服务错误、超时、网络 / 跨域失败均返回双语错误。

`normalizeSocialResponse` 将 data.url、urls、video_backup、audio_backup、images、live_photo、music.url 转为统一媒体列表，按 kind / url 去重，重复默认 URL 可补全画质元数据。仅接受不含凭据的 HTTP(S) 媒体链接，限制媒体数量为 100、标题 2000 字符，并校验可选元数据。`validateSocialResolution` 同时校验未来适配器的输出；不执行服务返回的 HTML，不主动下载媒体，不将独立视频和音轨自动合并。批量请求之间暂停 1.5 秒，可在等待时取消，不自动重试；部分失败逐卡展示，全部失败抛出错误，取消停止后续请求。

26.2.5 的 RouteTransition.tsx 在共享工作台之外管理已显示路由，按目标 pathname 预载 Dashboard / Settings / AI 的模块，再更新 Routes 的 location。过渡仅覆盖 route-page，路径不变时直接更新查询参数，工具字段与筛选状态保持原有生命周期；快速连续导航取消过期回调。切页动画偏好键为 fufu:page-motion，不影响 fufu:scene-motion；减少动态效果时立即导航。样式位于 page-transitions.css。

26.2.6 新增 AIThinkingLevel（off / low / medium / high），由 AISessionProvider 持久保存并经 BrowserLocalAI 传给 Worker；每轮调用固定同一次发送时的设置。ai-thinking.ts 定义思考预算，ai.worker.ts 的 ThinkingBudget logits processor 控制思考结束与重新开启。思考正文从流式显示及最终工具调用解析中移除，工具完成检测只接受思考结束后的调用。BookTurnMaterial.tsx 将折痕和投影作为独立局部快照层，由 RouteTransition 在过渡期间挂载和释放。

26.2.7 新增 RouteBook.tsx / handbook.css，所有路由使用稳定的公共书壳，主题改变不重挂载工作台；原神只翻内页，侧栏以书签装饰层呈现。TerminalScanMaterial.tsx 为终末地增加独立扫描网格与光带，RouteTransition 统一限制可见材质范围，避开顶栏并清理取消与结束的效果；不支持快照时使用入场，减少动态时跳过。
