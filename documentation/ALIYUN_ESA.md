# 阿里云 ESA 备用网址

保持纯静态网页架构，无需函数或 API 密钥。在 ESA 的「函数和 Pages」中导入同一个 GitHub 仓库，填写：

| 字段             | 值                               |
| ---------------- | -------------------------------- |
| 分支             | `main`                           |
| 根目录           | `/`                              |
| 安装命令         | 留空，由构建命令安装             |
| 构建命令         | `npm --prefix web run build:esa` |
| 静态资源目录     | `docs`                           |
| Node.js          | 22.x（至少 22.12）               |
| 函数入口         | 留空                             |
| 环境变量         | 无需填写                         |
| 未找到资源的策略 | `singlePageApplication`          |

`build:esa` 在 `web/` 中先执行 `npm ci --include=dev --prefer-offline --no-audit --no-fund`，再构建网页并验证完整模型 SHA-256，随后从 `docs/` 移除 FFmpeg、ORT 的三个超限 WASM 副本，最后验证每个文件 ≤25,000,000 字节、总文件数 ≤2000、产物 <1 GB。安装失败会立即停止构建。模型保持完整，三份大权重共 42 块，每块最多 20 MiB，词表另有 10 个最多 2 MiB 的分块。AI 通过默认共享 64 路池（设置可选 32 / 64 / 128）读取 512 KiB 字节范围，运行环境、词表和权重均从 Pages CDN 获取。不要用普通 `build` 部署 ESA：GitHub Pages 为旧缓存页面保留原始 WASM，单个文件超过 ESA 上限。

ESA 会在仓库根目录查找 `package.json`。本项目的依赖清单位于 `web/`，平台可能因此跳过自动安装并记录根目录 `package.json` 不存在。26.0.6 起由 `prebuild:esa` 生命周期主动安装依赖（包含 Vite、TypeScript 等开发依赖），所以保留上述根目录和构建命令即可。若出现 `web/node_modules/@ffmpeg/core/...` 缺失，先确认本次构建已拉取最新 `main`，并在日志中查看 `prebuild:esa` 与 `npm ci` 是否成功。

生产站和备用网址的模型、tokenizer、Basic Pitch 与音频 / AI 运行时均从 `https://toolbox.owo.lat/` 获取。这是 `https://dogoffurina114514.github.io/DOFTools/` 配置 CNAME 后的 GitHub Pages CDN 地址；直接使用 HTTPS 可避免 github.io 的 HTTP 重定向。Pages 已提供跨域响应头。不会从 github.com、raw.githubusercontent.com、Hugging Face 或 ModelScope 下载运行时模型。推理和音频处理仍在浏览器内完成。

模型加载使用独立 Worker 和默认共享 64 路并发下载池（设置可选 32 / 64 / 128）；分块完成顺序不影响权重顺序，进度按接收到的字节计算，取消或失败会中止其余下载。备用网址的模型加载依赖 Pages CDN；仅界面与普通静态资源由 ESA 提供。

GitHub Pages 继续使用 `main` 的 `/docs` 发布。本地普通 `npm run build` 会重新生成完整 Pages 产物，ESA 的构建只影响该次构建目录，无需提交 ESA 删除后的产物。

官方限制：[ESA 函数和 Pages](https://help.aliyun.com/zh/edge-security-acceleration/esa/user-guide/what-is-functions-and-pages/)。

26.1.0 构建包含 `sw.js` 与 `offline-manifest.json`，需按原路径一并发布，Service Worker 通过 HTTPS 在站点根目录注册。离线开关后台保存模型以外的所有资源，每次联网启动检查并完整更新快照；关闭开关仅清除网站离线资源。模型独立按块保存、下载与清除，离线且模型不完整时提示 AI 无法使用。ESA 删除的大型 WASM 仍通过清单从 Pages CDN 保存，缓存按当前浏览器的站点域名独立管理。
