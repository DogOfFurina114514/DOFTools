# 芙芙的狗工具箱 · DogOfFurina Toolbox

纯前端工具箱，支持中文 / EN、五个工具分类、八种主题与电脑端本地 AI。已提供十一个工具，包括格式转换、音频与 MIDI 转换、网盘链接解析、视频提取、图片转 PDF 和 ZIP 密码恢复。

当前正式版本：**26.0.6**。版本格式为「年份.大版本.小版本」，年份使用两位数字。

仓库：https://github.com/DogOfFurina114514/DOFTools

## 目录

| 路径             | 用途                                                              |
| ---------------- | ----------------------------------------------------------------- |
| `web/`           | 网页开发源码、依赖清单、构建配置与测试                            |
| `docs/`          | 已构建的网页、完整模型分块、字体与运行时，可直接用于 GitHub Pages |
| `documentation/` | 部署、工具接口、模型实测与视觉参考说明                            |

HTML、JS、CSS 都是网页源码。本项目日常维护 `web/` 中的 TypeScript、React 与样式，Vite 将其构建为 `docs/` 中浏览器能直接运行的 HTML、JS、CSS。后续客户端可以复用同一份网页，本次只包含网页项目。

## 开启 GitHub Pages

在仓库 **Settings → Pages** 选择 **Deploy from a branch → main → /docs** 并保存。

发布后的地址：https://toolbox.owo.lat

网页按 `toolbox.owo.lat` 的根目录部署，BrowserRouter 提供 `/settings`、`/category/image` 等无井号、无 `.html` 地址，404 回退支持直接打开与刷新子页面。已有 CNAME 会保留；顶栏在滚动时常驻。

## 本地开发

需要 Node.js 20.19+ 或 22.12+。

```sh
cd web
npm ci
npm run dev
```

开发地址：`http://127.0.0.1:5173`。完整 Qwen 和 Basic Pitch 模型已提交到 `web/public/models/`，克隆后无需额外下载模型。若本地资源缺失或损坏，运行 `npm run model:download`：优先从 `docs/models/` 修复并校验 SHA-256，仓库资源缺失时只从已发布的 GitHub Pages CDN 下载。

```sh
npm test
npm run build
npm run pages:check
npm run preview
```

构建只更新 `docs/`，不会清空 `web/` 中的开发文件。开发目录与发布目录均保存完整模型，三份权重共 42 块，每块最多 20 MiB。模型在独立 Worker 中使用共享的 4 路并发下载池，按清单顺序提供给运行时，下载进度来自实际接收字节，取消或失败会中止其余请求。准备运行时不会覆盖模型分块清单；构建直接校验已提交分块，无需未跟踪的原始大权重。

生产网页（包括阿里云备用网址）从 `https://toolbox.owo.lat/` 的 GitHub Pages CDN 获取 Qwen、Basic Pitch 与音频 / AI 运行时；github.io 地址会重定向到这个 CNAME，不请求 GitHub 原站或第三方模型仓库。开发环境使用本地资源。阿里云 ESA 使用 `npm --prefix web run build:esa`，静态资源目录为 `docs`；构建会先主动安装包含开发依赖的锁定版本，不依赖 ESA 在仓库根目录检测 `package.json`，随后移除超出 25 MB 的 WASM 副本，运行时从 Pages CDN 获取，并校验单文件大小、文件数、总大小和模型 SHA-256。详见 [ESA 部署说明](documentation/ALIYUN_ESA.md)。

发布时保留前三次构建的带哈希资源及其依赖，旧页面缓存或尚未关闭的标签页仍能加载音频转换等工具模块；连续构建相同资源不会提前淘汰旧文件。

浏览器检查：`npm run test:e2e`。Windows 安装 Edge 时可先设置 `$env:PLAYWRIGHT_CHANNEL = 'msedge'`。`npm run test:model` 使用真实权重检查 WebGPU，普通浏览器检查跳过此耗时项目。

## 已完成的框架

- 图片、视频、音频、文档、其他五个分类；统一控件、字段 schema、工作台、搜索和 AI 读取同一工具注册表。
- 概览顶部显示工具总数，各分类显示数量；中文 / English 模糊搜索支持“PNG 转 JPG”“PNG to JPG”等处理要求。
- 图片格式转换；视频格式转换、音频提取、帧提取；音频格式转换；PDF / DOCX / PPTX / Excel / TXT 文档转换；多张图片转 PDF；ZIP 密码恢复。实际格式、可编辑程度和大小限制见 [工具说明](documentation/TOOLS.md)。
- 音频转 MIDI：站内 Basic Pitch 模型在浏览器本地识别旋律与和弦；MIDI 转音频：本地合成为立体声音频，支持速度变化、力度、延音踏板和近似乐器音色。两种转换均支持 MP3、WAV、FLAC、M4A / AAC / ALAC、OGG、Opus、WebM、AIFF 和 WMA；位于“音频工具”分类。
- 网盘链接解析：参照 YunX 的使用方式，仅支持蓝奏云、蓝奏云优享版的免登录小文件分享，可浏览文件夹、获取和复制 ≤100 MiB 文件的直链、导出 JSON。使用内置公益解析服务，分享链接与提取码会发送到 `lz.qaiu.top`；无需网盘账号或配置地址，见 [工具说明](documentation/TOOLS.md#网盘链接解析)。
- 顶栏中文 / EN 切换，所有工具元数据、字段、结果与错误支持双语言。
- 浅色、深色、跟随系统；偏好持久化，切换有平滑过渡。
- 普通主题：默认、Material 3、Fluent Design、液态玻璃。八种主题通过共享 React / CSS 控件自绘下拉菜单、滑块、数字步进、复选框、开关、按钮、进度条和弹窗；支持键盘、触屏和深浅模式。
- 游戏主题：原神、绝区零、终末地、Minecraft；开屏接入真实资源准备进度，避免首屏露出内容。
- 首次设置语言、明暗和主题后逐页教学；设置可重开向导。手机导航、帮助和教学均不包含 AI。
- 页面切换效果、自绘滚动条、触屏适配和键盘操作；响应系统减少动态效果偏好。
- 自绘滚动条跟随页面、侧栏和弹窗动画更新位置；切换页面时清理旧区域，避免滚动条停在页面中间。
- AI 作为普通导航标签页；页内跳转保留模型、输入与附件，关闭后释放 Worker。
- Enter 发送、Shift+Enter 换行、Markdown / GFM 输出、IndexedDB 对话及文件保存；本地记录提示可永久关闭。
- 统一 AI 工具接口：只有文字需求时展示工具卡片，可前往使用；本次附带文件时调用注册工具并返回实际输出文件。

## 本地 AI

使用带视觉编码器的 Qwen3.5-0.8B ONNX 模型，在独立 Worker 中通过 WebGPU 运行。模型资源约 833 MiB，全部随站点发布，无云端推理和 API 密钥。桌面需要支持 WebGPU / shader-f16 的显卡及新版 Chrome 或 Edge；手机不提供 AI。

先前实机检查已验证文字、读图与直接函数调用；统一注册表的真实工具推荐也已显示卡片。新上传文件的完整实机输出检查曾在首个 token 前超时，仍需继续验证。模拟 Worker 的浏览器检查验证界面、参数绑定、执行、下载与持久化，不能代替真实模型检查。

## 开发说明与许可

- [统一工具与控件接口](documentation/TOOL_INTERFACE.md)
- [GitHub Pages 部署](documentation/GITHUB_PAGES.md)
- [模型说明与实机证据](documentation/MODEL_NOTES.md)
- [主题视觉参考](documentation/VISUAL_REFERENCES.md)
- [第三方许可核对](THIRD_PARTY_LICENSES.md)

自有代码采用 [Apache-2.0](LICENSE)，适用于网页与后续客户端代码。第三方代码、模型、字体与游戏图片保留各自许可和版权；浏览器构建随附第三方通知与模型、字体许可证。原神元素图片不包含在项目的 Apache-2.0 授权中。
