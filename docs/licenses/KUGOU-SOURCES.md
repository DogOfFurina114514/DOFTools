# 酷狗解密的第三方来源

本项目将以下 MIT 实现移植到 TypeScript，使用本地 Worker 解密用户提供的文件，不调用外部解析服务。

- [Aaron-gx/KGG-Decryptor](https://github.com/Aaron-gx/KGG-Decryptor)：`tauri-app/src-tauri/src/formats.rs` 中的 KGM v3、`lib.rs` 中的 KGG v5 / QMC 密钥派生、Map / RC4、Tencent TEA、加密 SQLite 与 Android MMKV 读取。许可见 `KGG-Decryptor-MIT.txt`。
- [Executor-Cheng/KugouDecryption](https://github.com/Executor-Cheng/KugouDecryption)：`KugouDecryption/KgmaDecoder.cs` 中的旧版 KGM / KGMA / VPR v2、`kgm.v2.xz` 静态掩码。许可见 `KugouDecryption-MIT.txt`。本项目将原始掩码前 16,777,217 字节重新 gzip 为 `web/src/tools/processors/kgm-v2-mask.bin.gz`，满足输入音乐总大小 256 MiB 的范围；未使用参考实现的原生指针操作。
- [sql.js](https://github.com/sql-js/sql.js)：MIT，本地 SQLite / WASM 数据库读取；构建将包内 `LICENSE` 保存为 `/licenses/sql.js-LICENSE.txt`，WASM 通过 Vite 的 URL 资源打包并包含在离线清单中。

部署后的对应许可和此说明均位于 `/licenses/`。正常音频按原始字节导出，解密音频不转码。扩展名用于选择文件，真正识别依据魔数和加密版本：v2 / v3 / v5；未知版本与无法识别的解密结果报错。v5 的每份文件必须具有匹配 audio hash 的 ekey，浏览器不会自动访问酷狗客户端目录。
