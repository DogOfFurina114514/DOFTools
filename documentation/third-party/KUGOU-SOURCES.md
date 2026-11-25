# 酷狗解密的第三方来源

本项目将以下 MIT 实现移植到 TypeScript，使用本地 Worker 解密用户提供的文件，不调用外部解析服务。

- [Aaron-gx/KGG-Decryptor](https://github.com/Aaron-gx/KGG-Decryptor)：`tauri-app/src-tauri/src/formats.rs` 中的 KGM v3、`lib.rs` 中的 KGG v5 / QMC 密钥派生、Map / RC4、Tencent TEA、加密 SQLite 与 Android MMKV 读取。许可见 `KGG-Decryptor-MIT.txt`。
- [huangbao/MyKgmWasm](https://github.com/huangbao/MyKgmWasm)：`KgmCodec.cpp`（blob `65f8f5919095f03a756a3847c32fdf370d8dcc32`）与 `KgmUtils.h`（blob `2ac7a0a68d45d3912041f4122b340474e9547573`）的旧版 KGM / KGMA / VPR 字节算法、table1 / table2 / MaskV2PreDef / VprMaskDiff，共 833 字节查表数据。26.2.11 移植为 `kugou-v2.ts`，按块缓存，无原生指针和大掩码请求。许可见 `MyKgmWasm-MIT.txt`，构建发布到 `/licenses/`。
- [Executor-Cheng/KugouDecryption](https://github.com/Executor-Cheng/KugouDecryption)：26.2.8–26.2.10 的旧版字节算法与 gzip 掩码来源。26.2.11 已移除原静态掩码，保留 `KugouDecryption-MIT.txt` 供历史资产的许可说明。
- [sql.js](https://github.com/sql-js/sql.js)：MIT，本地 SQLite / WASM 数据库读取；构建将包内 `LICENSE` 保存为 `/licenses/sql.js-LICENSE.txt`，WASM 通过 Vite 的 URL 资源打包并包含在离线清单中。

也对照用户提供的 [nailong-hub/OpenConverter](https://github.com/nailong-hub/OpenConverter) 的 KGM 行为与公开查表实现，生产查表与算法直接移植自上面的 MIT MyKgmWasm 来源。

部署后的对应许可和此说明均位于 `/licenses/`。正常音频按原始字节导出，解密音频不转码。扩展名用于选择文件，真正识别依据魔数、版本和解出的音频头：v2 / v3 / v4 / v5；未知版本与无法识别的解密结果报错。v5 的每份文件必须具有匹配 audio hash 的 ekey，浏览器不会自动访问酷狗客户端目录。MP3 声明长度可用于提示截断文件，解密无法补齐缺失数据。
