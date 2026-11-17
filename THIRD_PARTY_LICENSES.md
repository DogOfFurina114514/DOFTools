# 第三方许可核对

核对日期：2026-11-17。依据 `web/package-lock.json`、已安装包的 LICENSE、Transformers.js 浏览器入口与模型卡；没有直接复制游戏参考网站的整站源码。

## 主要代码与资源

| 上游                            | 许可                               | 当前用途                                                                          |
| ------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| React / React DOM、React Router | MIT                                | 网页与路由                                                                        |
| Fluent UI React v9              | MIT                                | 官方 Fluent Design 控件                                                           |
| Material Web                    | Apache-2.0                         | 官方 Material 3 控件                                                              |
| Transformers.js                 | Apache-2.0                         | 浏览器模型推理                                                                    |
| ONNX Runtime Web                | MIT                                | WebGPU / WASM 运行时                                                              |
| Qwen3.5-0.8B ONNX 权重          | Apache-2.0                         | 本地文字、图片与函数调用                                                          |
| Roboto、VT323 字体              | SIL OFL-1.1                        | 本地字体；字体本身保留 OFL，不要求整个网页采用 OFL                                |
| 原神七元素图片                  | HoYoverse 版权所有；未确认开源许可 | 游戏开屏；下载来源见 `web/public/assets/elements/SOURCE.md`，不归入自有代码许可证 |

代码依赖中没有查到 GPL 或 AGPL。模型原始许可证保存在 `documentation/third-party/Qwen3.5-LICENSE.txt`。生成网页的 `docs/licenses/` 包含第三方通知、模型与字体许可证。视觉参考链接不授予对应游戏素材的使用权。

## LGPL 依赖的范围

依赖链：`@huggingface/transformers → sharp → libvips`。sharp 的 JS 包使用 Apache-2.0；其原生平台包包含 LGPL-3.0-or-later 的 libvips。锁文件列出多种平台的可选原生包，Windows 的 `@img/sharp-win32-x64` 标注 Apache-2.0 AND LGPL-3.0-or-later。

这些原生库用于 Node.js 图像处理。Transformers.js 的浏览器导出为 `dist/transformers.web.js`，其中 sharp 被构建为忽略模块；当前浏览器使用自身图像处理能力，不包含或运行 libvips。`node_modules/` 不提交到仓库，Pages 仅发布 `docs/`。

LGPL 是弱 copyleft，主要约束 LGPL 库本身及其修改、分发和连接方式。分发该库时需履行相应许可证、库源码与允许替换库等义务；一般不要求应用的全部自有代码采用 LGPL。仅将当前网页套壳、加载 `docs/`，不会自动引入原生 libvips。以后若客户端使用 Node.js 推理或图像处理并打包这些原生库，需要按实际分发方式重新核对。

自有代码已选择 Apache-2.0，完整文本见根目录 `LICENSE`，项目版权通知见 `NOTICE`。这里列出的第三方许可证独立保留，不会因项目许可证选择而被重新许可。
