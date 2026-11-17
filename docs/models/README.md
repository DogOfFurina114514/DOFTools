# 本地模型资源

`npm run model:download` 下载并校验 `scripts/model.manifest.json` 的固定资源，默认来自 ModelScope 的 ONNX Community 镜像。

目录：`public/models/qwen3.5-0.8b/`。包含 tokenizer、processor、模板，以及 Q4 词嵌入 / 解码器与 FP16 视觉编码器。总资源约 833 MiB；权重文件不提交到 Git，但在当前工作区已下载，并会随 `npm run build` 复制到 `dist/models/`。

Transformers.js 4.3.2 在 `src/lib/ai.worker.ts` 中加载站内资源，禁用远程模型请求。ONNX Runtime Web 所需的本地 WASM 由 `scripts/prepare-assets.mjs` 在运行 / 构建前准备。

Qwen3.5-0.8B / ONNX Community：Apache-2.0。模型证据、精度选择与实测见 `docs/MODEL_NOTES.md`。
