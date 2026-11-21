# 本地多模态模型接入

核对日期：2026-11-21。

网页源码与开发脚本位于 `web/`，以下源码路径均相对于该目录。发布模型位于 `docs/models/`，权重按最多 20 MiB 分块，词表按最多 2 MiB 分块；浏览器默认通过共享 64 路池读取字节范围，设置可选 32 / 64 / 128，再按顺序拼接，原始 SHA-256 在构建与 Pages 检查时验证。

## 26.1.0 本地资源与整站离线

`resource-cache.ts` 使用 IndexedDB 保存经过 SHA-256 校验的 128 KiB 记录，避免巨型 ONNX 响应进入浏览器整文件缓存。`offline.worker.ts` 拦截同站与 Pages CDN 资源请求，重建完整响应和 206 字节范围响应。资源身份取决于内容哈希，应用更新复用未变的模型块；清除资源和代次更新在同一数据库事务内完成，旧请求无法重新写回。

构建生成完整资源清单及 Service Worker。设置开启离线使用后，后台按所选并发保存当前版本中模型以外的全部资源，全部验证存在才更新完整离线快照并通知用户。启动或恢复联网时检查更新，未完成的新版本保留旧快照用于断网访问。模型另有下载、清除和独立进度，正常使用工具时也会自动保存模型。关闭离线开关仅清除网站资源，清除模型仅中止模型下载并移除模型，二者的代次分别保存，互不影响。离线且模型不完整时，AI 助手在启动 Worker 前显示明确提示。页面状态区分检查、下载保存、就绪、清除与失败，AI 读取缓存时显示本地资源读取阶段。ESA 产物移除的 WASM 在清单中继续指向 Pages CDN。

Windows / Edge 生产构建实测完整模型保存了 873,431,815 字节；关闭浏览器后，以相同本地配置断网重新加载模型并对算术问题实际回答「2」。测试通过 Pages HTTPS 地址返回仓库内的完整资源，未模拟模型或回答。整站离线保存约 72.3 MiB，模型请求为零；另验证更新失败保留旧副本、资源清除相互独立、下载中清除和存储配额错误。普通主题色与玻璃双色背景使用自绘控件，在桌面和手机尺寸验证保存及布局。

## 26.0.8 下载并发

AI 模型、词表和推理 WASM 统一使用共享 32 路下载池。每个槽位覆盖响应正文的完整下载，一段完成就立即分配下一段，不等待前面慢分段的消费顺序；多份资源同时加载时合计最多 32 个下载请求。完成的数据暂存后按清单顺序输出，取消或失败中止后续分配。下载并发由 `src/lib/model-assets.ts` 中的 `MODEL_DOWNLOAD_CONCURRENCY` 统一设置。

22 项下载相关检查通过，包括首段卡住时自动分配后续段、跨资源共享上限、乱序拼接与取消。Windows / Edge 生产构建通过 Pages HTTPS 地址读取仓库内完整资源，实测 52 个分块、1,718 个字节范围请求，并发峰值 32；完整模型加载为「已就绪」，真实模型对简单算术提问返回「2」，没有页面错误或站外资源请求。

## 26.0.7 加载修复

线上复现了约 19 MB 的 tokenizer 请求长时间没有响应，界面因此停在准备 0%。词表改为 10 个最多 2 MiB 的物理分块，保留 42 个完整权重分块；解码器图文件大小也记录在资源清单中。词表、权重和推理 WASM 使用共享四路下载池，默认请求 512 KiB 字节范围；连接中断后改用最多 128 KiB 的范围重试，成功接收数据后重新计算连续失败次数。重试不重复拼接字节，也不虚增最终进度。推理 WASM 下载完成后通过 `wasmBinary` 交给 ORT，避免再次发起整文件下载。

连接或正文停滞 30 秒会报错，Worker 启动和显卡检测也有超时限制。界面与顶部状态同步显示助手启动、显卡检测、资源连接、配置读取、运行环境下载、词表下载、权重下载与模型初始化。下载阶段显示总下载进度，百分比保留两位小数；检测与初始化阶段使用不定进度动画，不显示虚假的百分比。模型、词表和运行环境继续从 `https://toolbox.owo.lat/` 的 Pages CDN 获取。

## 已接入：Qwen3.5-0.8B

- [官方模型卡](https://huggingface.co/Qwen/Qwen3.5-0.8B)
- [官方 ModelScope 镜像](https://modelscope.cn/models/Qwen/Qwen3.5-0.8B)
- [官方聊天模板](https://modelscope.cn/models/Qwen/Qwen3.5-0.8B/resolve/master/chat_template.jinja)
- [Qwen 官方仓库](https://github.com/QwenLM/Qwen3.5)
- [实际使用的 ONNX 权重](https://huggingface.co/onnx-community/Qwen3.5-0.8B-ONNX)
- [ONNX Community 的 ModelScope 镜像](https://modelscope.cn/models/onnx-community/Qwen3.5-0.8B-ONNX)

已核对官方模型卡与聊天模板：

1. `pipeline_tag: image-text-to-text`，模型类型是带视觉编码器的语言模型，并提供视觉理解评测。
2. 模板接受图片，输出视觉起止与图片占位 token；不能把图片当普通文本 URL 直接塞给文本 tokenizer。
3. 模板接受 `tools`，使用 `<tool_call><function=...><parameter=...>...</parameter></function></tool_call>` 输出调用，并接受 `tool` 消息和工具结果。
4. 模型卡语言部分列有 BFCL-V4 和 TAU2-Bench；0.8B 的 BFCL-V4 为 25.3，说明能力确实存在，但小模型的调用可靠性有限，应先验证本工具箱的中文场景。
5. Apache-2.0 许可。官方说明它适合原型、任务专用微调和研究开发。

这不是原先的 0.5B 纯文本模型。模型卡把语言部分列为 0.8B；视觉编码器、tokenizer、量化与推理内存还需另外计算。不将参数数目直接当作下载体积或显存需求。

## 浏览器条件

- [Transformers.js 的 Qwen3.5 模型实现](https://github.com/huggingface/transformers.js/blob/main/packages/transformers/src/models/qwen3_5/modeling_qwen3_5.js)
- [上游图片与文本生成测试](https://github.com/huggingface/transformers.js/blob/main/packages/transformers/tests/models/qwen3_5/test_modeling_qwen3_5.js)

上游源码已提供 `Qwen3_5ForConditionalGeneration`，测试覆盖文字加图片生成；部分 KV cache 测试明确指出 CPU 执行器缺少 RotaryEmbedding 更新支持，当前需 WebGPU。

项目现使用 **Transformers.js 4.3.2**，对应 ONNX Runtime Web 版本由锁文件固定。实际 ONNX 权重与配置已经下载并逐个校验 SHA-256，清单见 `scripts/model.manifest.json`。Hugging Face 仓库版本为 `8fe9dbe3fb39fe902e18df9be84b6a0ac77ae0f6`，ModelScope 文件分别固定其提交 revision 与内容哈希。

按实际 ONNX 模型卡的 JS 示例，使用 `embed_tokens: q4`、`decoder_model_merged: q4`、`vision_encoder: fp16`。资源总计 **873,485,707 字节（约 833 MiB）**，包含 tokenizer 与配置，不包含约 26 MiB 的 WASM 运行时。语言模型为 0.8B，视觉编码器仍额外计算。

图像在 Worker 内解码为 RGB，并等比例限制最长边为 512 像素；视觉 processor 生成真实 pixel_values 与图像位置张量。聊天模板使用原生图片 token 与工具 schema，关闭 thinking。每轮最多生成 384 token，输入超过 4096 token 提示清空或缩短内容。

生产环境的 `/models/` 和 `/runtime/` 来自 `https://toolbox.owo.lat/` 的 GitHub Pages CDN，阿里云备用网址使用相同地址；开发环境使用本地资源。Hub 远程模型发现关闭；关闭模型 CacheStorage，并使用 `env.fetch` 对 ONNX 权重发送 `cache: no-store`，避免实测出现的大文件 `ERR_CACHE_WRITE_FAILURE`。模型在当前 Worker 会话中保留，卸载或刷新后需重新读取站内权重；配置与普通界面资源仍使用浏览器 HTTP 缓存。移动设备不加载 Worker；桌面加载时实际检查 WebGPU adapter 与 shader-f16。

Transformers.js 4.3.2 的 tokenizer 文件发现逻辑需要本地 pathname。项目保留包含部署子目录的 pathname，再由 `env.fetch` 将本地元数据与权重路径映射到 Pages CDN，兼容备用网址跨域加载。asyncify WASM/MJS 来自锁定的 npm 包，在 GitHub Pages 发布；ESA 构建移除超出 25 MB 的 WASM 副本，继续从 Pages CDN 加载。

## 会话与工具执行

`BrowserLocalAI` 已实现 `LocalAIAdapter`。UI 有实际准备进度、流式对话、文件输入、停止生成、取消准备和关闭助手。整个站内导航过程保留模型、草稿和附件；关闭助手释放模型并取消任务。聊天、图片和输出文件通过 IndexedDB 保存，刷新后恢复记录，清空聊天移除记录；Blob 不进入 localStorage。

停止先请求模型中断；若 GPU 正在处理长输入、两秒内不能返回，则终止 Worker 并释放模型，此时界面恢复为可加载状态。重新加载后可继续对话。

工具通过统一 `toolRegistry` 注册。助手读取当前语言的工具目录：无附件时只有 `show_tools` 用于推荐；本次上传附件时额外提供 `run_tool`，实际 File 通过 `file-1` 等引用绑定到工具字段，参数经过同一工作台的 Ajv schema 校验，再调用 `toolRegistry.run()`。下载 Blob 保存在 UI 和 IndexedDB，模型只收到实际摘要及文件元数据。无附件的执行请求降级为推荐，未知工具、错误参数、错误文件类型、取消状态与调用轮数上限都受控，不使用 eval。成功调用后直接展示工具返回的卡片或文件并结束当前消息，避免重复执行与额外一次模型推理；仅失败调用继续有限重试。关闭或刷新时为未完成调用补充取消结果，避免恢复后留下不成对的 tool-call 消息。

当前注册表提供工具说明列出的十一个工具；测试还通过临时注册表验证调用，不在产品中增加测试工具。

## 实机证据与边界

26.0.5 将三份权重改为 42 个 20 MiB 分块，拼接 SHA-256 与锁定清单完全一致。独立 Worker 共享 4 路下载池，乱序完成后按清单顺序输出；真实接收字节驱动进度。响应流使用零预读缓冲，文件大小探测只读取响应头，开始消费权重时才下载，避免元数据探测重复下载首批分块。

最终 ESA 产物约 859.2 MiB、394 个文件，每个文件低于 25 MB。Windows / Edge 用生产构建加载真实权重，42 块各请求一次并显示「已就绪」，没有页面错误。测试在 Pages 的 HTTPS 资源地址下返回仓库内完整资源，验证备用网址的跨域路径映射与加载；在线 CDN 的完整下载耗时受网络影响。相同生产构建实际完成 MP3、Opus、WMA 导出，以及 WMA 转 MIDI，识别到 60、64、67 三个和弦音高。Qwen、Basic Pitch、TFJS、FFmpeg 与 ORT 的生产请求地址均指向 `toolbox.owo.lat` 的 Pages CDN。

26.0.4 将完整 Qwen 和 Basic Pitch 模型提交到 `web/public/models/`，Qwen 的三份大权重使用 19 个分块。开发准备脚本保留分块清单，构建可以直接使用已提交的分块并校验 SHA-256，无需原始大权重或额外下载。Windows / Edge 实测开发服务器读取全部分块后显示「已就绪」，没有外部模型请求或网络错误。

模型加载后的短问题实测还发现，所有工具的完整字段和 schema 会使第一次提问超过上下文限制。目录现只包含推荐所需的名称与说明；本轮附件匹配的工具才附带参数名、可选值和默认值，执行仍由共享注册表校验。修复后在真实模型和完整工具注册表下提问“1 加 1 等于几”，实际返回“1+1=2”，没有外部请求或页面错误。首次推理在本机需要较长准备时间。

以下算术、读图和 `test_sum` 为先前实测。当前统一注册表的工具推荐也已用真实模型成功显示卡片；新上传文件场景在本机冷启动时出现首个 token 前超时，尚未完成实机输出文件验证。普通浏览器测试使用模拟 Worker 验证文件绑定、执行与下载，不能代替这一实机测试。

本次在 Windows / Edge / NVIDIA Turing WebGPU adapter 上使用真实权重测试，未使用 mock 回答：

- 中文算术提问“1 加 1 等于几”：返回“1 加 1 等于 2。”。
- 本地生成红底白圆的图片，模型实际识别到中央白色圆形；英文完整描述把红色背景称为 pink。读图链路已工作，但颜色识别在这个样本中仍有误差，不能把成功加载当作准确率验证。
- 传入 `test_sum` 的真实 JSON schema 与参数 17、25，模型输出可解析的函数调用；真实函数返回 `{"sum":42}`，模型收到工具结果后回答“42”。完整调用、返回值回传、停止和卸载流程由 `npm run test:model` 实测通过。
- 最终生产构建使用站内权重实际回答“2”；加载和推理没有外部请求或网络错误。切换原生 Material 3 并返回 AI 页面后，已加载模型与对话仍保留。
- 本次提交的 `docs/` 以 `/DOFTools/` 子目录实测：浏览器从站内读取全部 19 个模型分块，实际加载为「已就绪」，对算术问题返回「1+1=2」；没有外部资源请求或页面错误。构建后的分块按原始清单校验 SHA-256，开发权重也已从仓库内分块实际恢复并校验。

耗时取决于显卡、浏览器和输入长度。该模型适合轻量用途，OCR、复杂图片和长工具链尚需更多样本验证。官方 BFCL-V4 指标为 25.3，不将“有调用能力”表述为高可靠自动执行。
