# 第三方来源与许可证

| 组件 | 用途 | 版本/来源 | 许可证 |
| --- | --- | --- | --- |
| TapeKit / TapeSend | 内核、身份、消息与加密 | vendored 源码及本地修改，见 [来源说明](vendor/TAPESEND_SOURCE.md) | [MIT / TapeOutProtocol](vendor/LICENSE-TapeKit) |
| ethers | 发布页与 Worker 交易编码、签名 | 6.13.4 预打包文件 | [MIT / Richard Moore](vendor/LICENSE-ethers) |
| @noble/ciphers | 加密 | 2.4.0 | [MIT / Paul Miller](vendor/licenses/noble-ciphers.txt) |
| @noble/curves | 曲线运算 | 2.4.0 | [MIT / Paul Miller](vendor/licenses/noble-curves.txt) |
| @noble/hashes | 摘要与派生 | 2.4.0 | [MIT / Paul Miller](vendor/licenses/noble-hashes.txt) |
| esbuild | 本地打包与压缩 | 0.28.1 | [MIT / Evan Wallace](vendor/licenses/esbuild.txt) |

依赖版本及发行包校验值固定在 package-lock.json。浏览器 TapeSend 包保留其内嵌许可说明。第三方协议文档的许可证与本项目代码许可证分别适用；TAP-12 提案标记为 CC0-1.0。
