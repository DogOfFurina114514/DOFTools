# 媒体处理库对应源码

`mediabunny-v1.66.0.zip` 来自上游标签 `v1.66.0`（提交 `5d270321467df4d138bb30df731bb0af2780939a`），包含实际使用的主库 `src/`、`shared/`、MP3 / FLAC 编码扩展、C 桥接、构建脚本与配置。源文件未修改，未收录无关的示例媒体或其他编码扩展。完整上游仓库：https://github.com/Vanilagy/mediabunny/tree/v1.66.0。

`lame-3.100.tar.gz` 为 MP3 WASM 对应的未修改 LAME 3.100 源码。SHA-256：`ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e`。下载镜像：https://deb.debian.org/debian/pool/main/l/lame/lame_3.100.orig.tar.gz。

重建 LAME 与 JS 桥接的 Emscripten 命令见 ZIP 内 `packages/mp3-encoder/README.md`，该目录还保留了允许重新连接的 `build/libmp3lame.a`。FLAC 重建命令见 `packages/flac-encoder/README.md`。如使用上游的完整构建工作流，可克隆以上标签，再以本工具箱的 `web/package.json` 所列版本替换对应依赖或重建扩展。

构建时将两份归档复制到 `docs/licenses/`，与网页一同分发。Mediabunny 及扩展为 MPL-2.0，LAME 为 LGPL-2.0-or-later，libFLAC 为 Xiph.Org BSD。自有代码为 Apache-2.0。
