# GitHub Pages

仓库：[DogOfFurina114514/DOFTools](https://github.com/DogOfFurina114514/DOFTools)。网页开发源码位于 `web/`，已构建的发布文件位于 `docs/`，仓库说明与 Apache-2.0 许可证在根目录。本次不包含桌面端和手机端工程。

## 开启网站

1. 打开仓库 **Settings → Pages → Build and deployment**。
2. Source 选择 **Deploy from a branch**。
3. Branch 选择 **main**，目录选择 **/docs**，点击 **Save**。
4. GitHub 完成发布后访问 `https://toolbox.owo.lat`。

`docs/index.html` 是已构建入口，站点部署在自定义域名 `toolbox.owo.lat` 的根目录。BrowserRouter 使用 `/settings`、`/category/image` 等干净地址，`.nojekyll` 保留运行时文件。GitHub Pages 的 `404.html` 回退到入口并在页面渲染前恢复原地址，支持直接打开与刷新子页面。

已配置的 CNAME 保存在 `web/public/CNAME`，构建时复制到 `docs/CNAME`，更新网页不会移除域名设置。

## 模型随网页发布

模型、tokenizer 与配置总计 873,485,707 字节，完整网页约 941.2 MiB。模型文件按最多 20 MiB 分块，共 42 块，开发目录 `web/public/models/` 和发布目录 `docs/models/` 均包含完整资源，全部通过普通 Git 提交，不使用 Git LFS，也不需要外部模型服务。生产浏览器（包括 ESA 备用网址）从本站的 GitHub Pages CDN 使用共享 4 路并发池读取分块，按清单顺序、原始 Content-Length 提供给模型运行时，下载进度来自实际接收字节。开发环境从本地加载。关闭助手释放 Worker 和模型。

`npm run pages:check` 检查全部分块拼接后的 SHA-256、WASM、入口及站点大小。GitHub 普通 Git 推送的单文件限制为 100 MiB，Pages 站点上限为 1 GB，目前发布资源均符合要求。

## 更新与开发

在仓库根目录执行：

```sh
cd web
npm ci
npm test
npm run build
npm run pages:check
npm run preview
```

克隆后可以直接开发和构建，准备脚本保留已提交的模型分块清单，构建验证分块的完整字节数与 SHA-256。`npm run model:download` 用于校验和修复资源，优先从仓库内已发布的分块恢复，随后打包成相同的分块格式。开发 HTML 在 `web/index.html`，生成网页在 `docs/index.html`。构建只更新 `docs/`，开发源码不放入该发布目录。

同时提交 `web/` 中修改的源文件和重建后的 `docs/` 网页资源，然后推送 `main`。不要提交 `node_modules`、开发用的原始权重或测试输出。阿里云 ESA 的备用网址使用 `npm --prefix web run build:esa`，详见 [ESA 部署说明](ALIYUN_ESA.md)。

构建通过 `scripts/retain-assets.ts` 和 `docs/asset-history.json` 保留前三次构建的完整哈希资源列表及依赖。旧缓存入口仍能动态加载转换模块与 Worker，避免更新后出现 `Failed to fetch dynamically imported module`。重复构建相同资源不推进历史；`pages:check` 将保留资源一并计入站点大小。

后续客户端复用同一份网页，壳工程独立维护。移动端沿用无 AI 的导航与向导，可在打包时排除模型权重。

参考：[Pages 限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)、[普通 Git 大文件限制](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)。
