// SPACE 信箱用的 TapeSend 打包入口：官方 @tapekit/send 模块 + TapeKit 内核 + 官方客户端的数据层（原样，不改）
export * as ts from './apps/tapesend/src/data/tapesend.ts';
export * as mod from './send/module/src/index.js';
export * as tchain from './send/module/src/chain.js';
export * as judgeKeys from './judge-key.js';
