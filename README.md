# 芙芙的狗工具箱 · DogOfFurina Toolbox

纯前端工具箱框架，支持中文 / EN、五个工具分类、八种主题与电脑端本地 AI。当前只完成框架，尚未启用具体工具。

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

发布后的地址：https://dogoffurina114514.github.io/DOFTools/

网页已使用相对资源路径、HashRouter 与 `.nojekyll`，支持仓库子目录。上传仓库不会自动开启 Pages。

## 本地开发

需要 Node.js 20.19+ 或 22.12+。

```sh
cd web
npm ci
npm run model:download
npm run dev
```

开发地址：`http://127.0.0.1:5173`。`model:download` 优先从 `docs/models/` 恢复已经提交的完整模型，校验 SHA-256；仅在资源缺失时联网下载。

```sh
npm test
npm run build
npm run pages:check
npm run preview
```

构建只更新 `docs/`，不会清空 `web/` 中的开发文件。模型按最多 48 MiB 分块，浏览器从同一站点顺序读取，保持真实字节下载进度。提交更新时一并提交开发源码和重建后的网页。

浏览器检查：`npm run test:e2e`。Windows 安装 Edge 时可先设置 `$env:PLAYWRIGHT_CHANNEL = 'msedge'`。`npm run test:model` 使用真实权重检查 WebGPU，普通浏览器检查跳过此耗时项目。

## 已完成的框架

- 图片、视频、音频、文档、其他五个分类；保留统一控件、字段 schema、工作台与工具注册接口，生产注册表为空。
- 顶栏中文 / EN 切换，所有工具元数据、字段、结果与错误支持双语言。
- 浅色、深色、跟随系统；偏好持久化，切换有平滑过渡。
- 普通主题：默认、官方 Material Web 的 Material 3、官方 Fluent UI React 的 Fluent Design、液态玻璃。
- 游戏主题：原神、绝区零、终末地、Minecraft；开屏接入真实资源准备进度，避免首屏露出内容。
- 首次设置语言、明暗和主题后逐页教学；设置可重开向导。手机导航、帮助和教学均不包含 AI。
- 页面切换效果、自绘滚动条、触屏适配和键盘操作；响应系统减少动态效果偏好。
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
