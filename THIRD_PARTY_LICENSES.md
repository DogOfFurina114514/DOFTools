# 第三方许可核对

核对日期：2026-11-19。依据 `web/package-lock.json`、已安装包的 LICENSE、Transformers.js 浏览器入口与模型卡；没有直接复制游戏参考网站的整站源码。

## 主要代码与资源

| 上游                                              | 许可                               | 当前用途                                                                          |
| ------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| React / React DOM、React Router                   | MIT                                | 网页与路由                                                                        |
| Fluent UI React v9                                | MIT                                | 官方 Fluent Design 控件                                                           |
| Material Web                                      | Apache-2.0                         | 官方 Material 3 控件                                                              |
| Transformers.js                                   | Apache-2.0                         | 浏览器模型推理                                                                    |
| ONNX Runtime Web                                  | MIT                                | WebGPU / WASM 运行时                                                              |
| Qwen3.5-0.8B ONNX 权重                            | Apache-2.0                         | 本地文字、图片与函数调用                                                          |
| Roboto、VT323 字体                                | SIL OFL-1.1                        | 本地字体；字体本身保留 OFL，不要求整个网页采用 OFL                                |
| 原神七元素图片                                    | HoYoverse 版权所有；未确认开源许可 | 游戏开屏；下载来源见 `web/public/assets/elements/SOURCE.md`，不归入自有代码许可证 |
| Mediabunny、MP3 / FLAC 扩展                       | MPL-2.0                            | 浏览器音视频转换，原始库源码随网页提供                                            |
| LAME 3.100                                        | LGPL-2.0-or-later                  | MP3 编码的独立 WASM 库；对应源码、许可证与重建步骤随项目提供                      |
| libFLAC                                           | Xiph.Org BSD                       | FLAC 编码；保留上游版权与许可                                                     |
| PDF.js、docx、docx-preview、SheetJS（@e965/xlsx） | Apache-2.0                         | 文档解析、排版与生成                                                              |
| pdf-lib、PptxGenJS、html2canvas                   | MIT                                | PDF / PPT 生成和页面绘制                                                          |
| zip.js                                            | BSD-3-Clause                       | ZIP 读取、密码验证、解密与打包                                                    |
| Spotify Basic Pitch 1.0.1 与随包模型              | Apache-2.0                         | 浏览器本地音频转 MIDI，模型从同一站点加载                                         |
| TensorFlow.js 3.21.0 与 WASM 后端                 | Apache-2.0                         | Basic Pitch 的本地 WASM / WebGL / CPU 推理运行时                                  |
| @tonejs/midi 2.0.28、midi-file                    | MIT                                | MIDI 读取、时间换算与生成                                                         |
| @ffmpeg/core 0.12.10 与所链接编解码库             | GPL-2.0-or-later                   | MIDI 工具的独立单线程音频编解码运行时，保留完整对应源码和上游许可                 |

自有工具箱代码采用 Apache-2.0；独立 FFmpeg WASM 运行时保留 GPL-2.0-or-later 及其组成库的许可，详见 [源码与重建说明](documentation/third-party/FFmpeg-SOURCES.md)。模型原始许可证保存在 `documentation/third-party/Qwen3.5-LICENSE.txt`。生成网页的 `docs/licenses/` 包含第三方通知、模型与字体许可证。视觉参考链接不授予对应游戏素材的使用权。

网盘解析的交互和支持格式参考 [CYQawa/YunX](https://github.com/CYQawa/YunX)（AGPL-3.0），没有复制或移植其代码。链接识别、服务接口和页面操作由本项目独立实现；YunX 不作为运行时依赖或分发内容。网盘取链通过 [qaiu/netdisk-fast-download](https://github.com/qaiu/netdisk-fast-download) 的公益接口 `lz.qaiu.top`，服务端代码不包含在本项目中。Basic Pitch 模型与上游 LICENSE 由 `prepare-assets.mjs` 从固定 npm 包复制到 `docs/models/basic-pitch/`，TensorFlow.js 与 MIDI 库的通知由现有第三方清单生成流程保留。

## LGPL 依赖的范围

PDF.js 同时携带 Foxit 标准字体（MIT）和旧版 Liberation Sans 字体（GPL-2.0，含字体嵌入例外）。这些字体与各自许可原样发布在 `docs/runtime/pdf/standard_fonts/`；字体例外明确说明，使用或嵌入未修改字体不会单独使输出文档受 GPL 约束，自有工具箱代码仍采用 Apache-2.0。OpenJPEG、qcms 等 PDF 运行时的上游许可也保留在对应资源目录。

### 网页中实际分发的 MP3 编码库

`@mediabunny/mp3-encoder` 的 TypeScript 包装代码使用 MPL-2.0，其内置 LAME 3.100 WASM 使用 LGPL-2.0-or-later。本次浏览器 MP3 转换会实际运行这份 LAME，不能与下面仅供 Node 使用的 libvips 混为一谈。

LAME 原始源码为 `documentation/third-party/lame-3.100.tar.gz`（SHA-256：`ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e`），构建时复制到 `docs/licenses/`。完整 Mediabunny 上游源码归档、C 桥接代码及 Emscripten 重建命令也位于同一目录；重建说明见归档中的 `packages/mp3-encoder/README.md`。LAME 许可与通知位于 `docs/licenses/lame/`，主页：https://lame.sourceforge.io/。

该库及其桥接代码没有修改。使用者可以按上述源码重建或替换 MP3 编码扩展；本项目源码与构建配置完整公开，不施加禁止为调试库修改而进行逆向工程的限制。自有应用代码保持 Apache-2.0；LAME 与 Mediabunny 的各自授权独立保留。

### 仅供 Node 使用的原生依赖

依赖链：`@huggingface/transformers → sharp → libvips`。sharp 的 JS 包使用 Apache-2.0；其原生平台包包含 LGPL-3.0-or-later 的 libvips。锁文件列出多种平台的可选原生包，Windows 的 `@img/sharp-win32-x64` 标注 Apache-2.0 AND LGPL-3.0-or-later。

这些原生库用于 Node.js 图像处理。Transformers.js 的浏览器导出为 `dist/transformers.web.js`，其中 sharp 被构建为忽略模块；当前浏览器使用自身图像处理能力，不包含或运行 libvips。`node_modules/` 不提交到仓库，Pages 仅发布 `docs/`。

LGPL 是弱 copyleft，主要约束 LGPL 库本身及其修改、分发和连接方式。分发该库时需履行相应许可证、库源码与允许替换库等义务；一般不要求应用的全部自有代码采用 LGPL。仅将当前网页套壳、加载 `docs/`，不会自动引入原生 libvips。以后若客户端使用 Node.js 推理或图像处理并打包这些原生库，需要按实际分发方式重新核对。

自有代码已选择 Apache-2.0，完整文本见根目录 `LICENSE`，项目版权通知见 `NOTICE`。这里列出的第三方许可证独立保留，不会因项目许可证选择而被重新许可。

## MPL-2.0 的范围

Mediabunny 1.66.0 及 MP3 / FLAC 扩展使用文件级弱 copyleft 的 MPL-2.0。分发其可执行形式时需要让接收者能够取得对应源码；修改这些库的 MPL 文件时，修改后的文件仍须按 MPL 提供。它不会要求整个工具箱的自有文件改用 MPL。完整上游源码归档为 `documentation/third-party/mediabunny-v1.66.0.zip`，也会随网页发布至 `docs/licenses/`；库的 MPL 文本同时保留在第三方通知中。
源码归档对应上游标签 `v1.66.0`，提交 `5d270321467df4d138bb30df731bb0af2780939a`。归档包含实际使用的主库、共享模块、MP3 / FLAC 扩展、构建脚本与配置，未改写上游文件。完整上游仓库可在 https://github.com/Vanilagy/mediabunny/tree/v1.66.0 获取。
