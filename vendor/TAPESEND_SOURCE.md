# SPACE 信箱用的 TapeSend 打包

来源：TapeOutProtocol/TapeKit（MIT），vendored 源码基于 commit 489956e；2026-10-04 对照上游 `main` commit 4c0fdfab 检查了 `send` 的发布公钥接口与合约权限。保留原始结构，为 168 增加以下本地功能：

- `send/module`：官方 @tapekit/send（钥匙推导、加密、多节点严格读链、交易编码）
- `kernel`：TapeKit 内核（身份解析、多节点一致读取）
- `apps/tapesend/src/data/tapesend.ts`：官方 TapeSend 客户端的数据层（登录、解锁、收件箱、发送、公钥变更提醒、陌生人限流）

重新打包（仓库根目录；依赖锁定为 @noble 2.4.0、esbuild 0.28.1）：

```sh
npm ci
npm run bundle:tapesend
```

已在浏览器里用官方测试向量核对：签名文字、公钥推导逐字节一致；加密解密往返正确；错误钥匙会被拒绝。

168 的本地构建保留一份上述来源源码于 `tapesend-src/`。`send/module/src/payload.js` 在调用 `seal({…, returnKey: true})` 时，同时返回该条消息随机生成的 32 字节内容密钥，供 SCV1 到期揭示；默认 `seal` 行为不变。另增 `judge-key.js`，使用相同的 X25519 曲线在本机生成独立判官密钥。其私钥通过 Web Crypto 加密后下载，公开密钥通过官方 `encodePublishKey` 发送到 X Layer。独立判官密钥无法由官方 TapeSend 的钱包签名重新派生；加密备份及密码必须保管好。`tapesend.bundle.mjs` 是从这份源码重新打包的浏览器模块。依赖版本为 `@noble/ciphers`、`@noble/curves`、`@noble/hashes` 的 2.4.0；`node_modules/` 不提交。

判官索引器另增加 `openWithContentKey()`：公众提供单条内容密钥时，它先检查 `SHA-256("TAP-10/commit/v2" ‖ K)`，再按原消息上下文解密和认证。它不接触判官长期私钥。此次改动已重新打包进 `tapesend.bundle.mjs`，并有有效/错误密钥测试。
