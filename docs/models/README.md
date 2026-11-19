# 本地模型资源

`npm run model:download` 下载并校验 `scripts/model.manifest.json` 的固定资源，默认来自 ModelScope 的 ONNX Community 镜像。

开发目录：`web/public/models/qwen3.5-0.8b/`。包含 tokenizer、processor、模板，以及 Q4 词嵌入 / 解码器与 FP16 视觉编码器，总资源约 833 MiB。开发权重不提交到 Git；完整发布分块保存在 `docs/models/`，`model:download` 优先从这些分块恢复。`npm run build` 将完整模型复制并重新打包到 `docs/models/`。

Transformers.js 4.3.2 在 `src/lib/ai.worker.ts` 中加载站内资源，禁用远程模型请求。ONNX Runtime Web 所需的本地 WASM 由 `scripts/prepare-assets.mjs` 在运行 / 构建前准备。

音频转 MIDI 使用 `basic-pitch/` 中的 Spotify Basic Pitch 1.0.1 模型（约 0.9 MiB）。模型与 LICENSE 从固定 npm 包自动准备，并随站点发布；WASM 推理运行时位于 `runtime/tfjs/`，所有音频处理在本地 Worker 内完成。

Qwen3.5-0.8B / ONNX Community 与 Basic Pitch 均为 Apache-2.0。模型证据、精度选择与实测见 `documentation/MODEL_NOTES.md`，音频与 MIDI 说明见 `documentation/TOOLS.md`。
