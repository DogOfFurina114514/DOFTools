# 本地多模态模型接入

核对日期：2026-11-17。

网页源码与开发脚本位于 `web/`，以下源码路径均相对于该目录。发布模型位于 `docs/models/`，超过 48 MiB 的文件使用分块；浏览器顺序拼接成真实权重流，原始 SHA-256 在构建与 Pages 检查时验证。

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

运行时仅请求当前站点的 `/models/` 和 `/runtime/`。远程模型请求关闭；关闭模型 CacheStorage，并使用 `env.fetch` 对 ONNX 权重发送 `cache: no-store`，避免实测出现的大文件 `ERR_CACHE_WRITE_FAILURE`。模型在当前 Worker 会话中保留，卸载或刷新后需重新读取站内权重；配置与普通界面资源仍使用浏览器 HTTP 缓存。移动设备不加载 Worker；桌面加载时实际检查 WebGPU adapter 与 shader-f16。

Transformers.js 4.3.2 的 tokenizer 文件发现逻辑需要本地 URL 路径，项目使用包含部署子目录的 pathname，而非完整 URL。运行时的 asyncify WASM/MJS 均由 npm 包复制到站内资源目录，不依赖 CDN。

## 会话与工具执行

`BrowserLocalAI` 已实现 `LocalAIAdapter`。UI 有实际准备进度、流式对话、文件输入、停止生成、取消准备和关闭助手。整个站内导航过程保留模型、草稿和附件；关闭助手释放模型并取消任务。聊天、图片和输出文件通过 IndexedDB 保存，刷新后恢复记录，清空聊天移除记录；Blob 不进入 localStorage。

停止先请求模型中断；若 GPU 正在处理长输入、两秒内不能返回，则终止 Worker 并释放模型，此时界面恢复为可加载状态。重新加载后可继续对话。

工具通过统一 `toolRegistry` 注册。助手读取当前语言的工具目录：无附件时只有 `show_tools` 用于推荐；本次上传附件时额外提供 `run_tool`，实际 File 通过 `file-1` 等引用绑定到工具字段，参数经过同一工作台的 Ajv schema 校验，再调用 `toolRegistry.run()`。下载 Blob 保存在 UI 和 IndexedDB，模型只收到实际摘要及文件元数据。无附件的执行请求降级为推荐，未知工具、错误参数、错误文件类型、取消状态与调用轮数上限都受控，不使用 eval。成功调用后直接展示工具返回的卡片或文件并结束当前消息，避免重复执行与额外一次模型推理；仅失败调用继续有限重试。关闭或刷新时为未完成调用补充取消结果，避免恢复后留下不成对的 tool-call 消息。

当前注册表为空，具体工具暂不开放。测试通过临时注册表验证调用，不在产品中增加测试工具。

## 实机证据与边界

以下算术、读图和 `test_sum` 为先前实测。当前统一注册表的工具推荐也已用真实模型成功显示卡片；新上传文件场景在本机冷启动时出现首个 token 前超时，尚未完成实机输出文件验证。普通浏览器测试使用模拟 Worker 验证文件绑定、执行与下载，不能代替这一实机测试。

本次在 Windows / Edge / NVIDIA Turing WebGPU adapter 上使用真实权重测试，未使用 mock 回答：

- 中文算术提问“1 加 1 等于几”：返回“1 加 1 等于 2。”。
- 本地生成红底白圆的图片，模型实际识别到中央白色圆形；英文完整描述把红色背景称为 pink。读图链路已工作，但颜色识别在这个样本中仍有误差，不能把成功加载当作准确率验证。
- 传入 `test_sum` 的真实 JSON schema 与参数 17、25，模型输出可解析的函数调用；真实函数返回 `{"sum":42}`，模型收到工具结果后回答“42”。完整调用、返回值回传、停止和卸载流程由 `npm run test:model` 实测通过。
- 最终生产构建使用站内权重实际回答“2”；加载和推理没有外部请求或网络错误。切换原生 Material 3 并返回 AI 页面后，已加载模型与对话仍保留。
- 本次提交的 `docs/` 以 `/DOFTools/` 子目录实测：浏览器从站内读取全部 19 个模型分块，实际加载为「已就绪」，对算术问题返回「1+1=2」；没有外部资源请求或页面错误。构建后的分块按原始清单校验 SHA-256，开发权重也已从仓库内分块实际恢复并校验。

耗时取决于显卡、浏览器和输入长度。该模型适合轻量用途，OCR、复杂图片和长工具链尚需更多样本验证。官方 BFCL-V4 指标为 25.3，不将“有调用能力”表述为高可靠自动执行。
