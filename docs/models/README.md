# 本地模型资源

完整模型已随仓库提交，克隆后可以直接运行 `npm run dev` 或 `npm run build`，无需另行下载。

开发目录：`web/public/models/qwen3.5-0.8b/`。包含 tokenizer、processor、模板，以及 Q4 词嵌入 / 解码器与 FP16 视觉编码器，总资源约 833 MiB。三份大权重按最多 48 MiB 拆成 19 个分块，与 `asset-manifest.json` 一起提交；开发和发布均从同站分块加载。`npm run build` 将完整模型复制到 `docs/models/` 并按锁定清单校验，准备运行时保留已有分块清单。

`npm run model:download` 校验本地资源；缺失或损坏时优先从 `docs/models/` 修复，再重新打包。仅在仓库内资源也缺失时从 ModelScope 的 ONNX Community 镜像下载 `scripts/model.manifest.json` 锁定的文件。完整原始 `.onnx_data` 与临时下载文件被 Git 忽略，避免超过 GitHub 单文件限制或重复发布权重。

Transformers.js 4.3.2 在 `src/lib/ai.worker.ts` 中加载站内资源，禁用远程模型请求。ONNX Runtime Web 所需的本地 WASM 由 `scripts/prepare-assets.mjs` 在运行 / 构建前准备。

音频转 MIDI 使用 `basic-pitch/` 中的 Spotify Basic Pitch 1.0.1 模型（约 0.9 MiB）。模型与 LICENSE 从固定 npm 包自动准备，并随站点发布；WASM 推理运行时位于 `runtime/tfjs/`，所有音频处理在本地 Worker 内完成。

Qwen3.5-0.8B / ONNX Community 与 Basic Pitch 均为 Apache-2.0。模型证据、精度选择与实测见 `documentation/MODEL_NOTES.md`，音频与 MIDI 说明见 `documentation/TOOLS.md`。
