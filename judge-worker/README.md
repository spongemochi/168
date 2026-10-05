# 168 判官 Worker

当前源码版本 `168-scoring-v6`，计分规则 `168-score-history-v2`。线上已完成首笔背书价格判断的回执、自动揭示、价格裁决、参数公开和计分；[公开凭证](../verification/README.md) 记录了实际验收。

## 运行内容

每分钟扫描 X Layer 安全区块中的 TapeSend 消息，核验身份与原始载荷，维护案件索引，分批准备历史缓存，并按状态执行到期揭示、价格证据、计分回执及参数公开。执行器串行化签名，交易先入日志再广播，重试不改变原始 nonce 和交易字节。

事件使用判官工作台的人工证据审核和持有人钱包确认路径。签名证据/异议 API 默认关闭，社区裁决尚未完成。判官工作台公开可读，发布裁决仍需持有人权限。

## 公共 API

线上地址：`https://168-judge.joezuooo.workers.dev`。以下 GET 允许公开跨域读取，不要求钱包或私钥。

| 路径 | 内容 |
| --- | --- |
| `/health` | 索引截止区块、最近运行、交易跟踪和自动执行配置是否存在 |
| `/api/cases?limit=50&after=案件ID&resident=居民编号` | 分页案件；下一页使用响应 next |
| `/api/cases/:id` | 案件、有效消息、事前回执、公开参数与计分结果 |
| `/api/cases/:id/scoring-evidence` | 参数公开后的历史样本 |
| `/api/judge/rules` | 支持的价格口径与版本 |
| `/api/judge/jobs` | 自动裁决进度 |
| `/api/scoring/rules` | 计分版本、历史缓存和就绪状态 |
| `/api/leaderboard` | 已核验记录、累计分及正式 allocationRanking |
| `/admin/` | 判官工作台页面 |

返回 `asOf`、`safeBlock`、`syncedAt` 等时间字段。请求失败不代表空履历，广播不代表完成裁决。密封原文和未公开私有参数不会由公开 GET 返回。

## 本地开发

在仓库根目录先 `npm ci`。在本目录复制配置模板并填写自己创建的 D1 ID：

```sh
cp wrangler.toml.example wrangler.toml
npx wrangler@4.147.0 d1 create 168-judge
# 将输出的 database_id 填入 wrangler.toml
npx wrangler@4.147.0 d1 migrations apply 168-judge --local
npx wrangler@4.147.0 dev
```

模板将 `AUTO_EXECUTE` 与 `SCORING_ENABLED` 设为 false，不配置任何密钥。默认不开启签名证据提交或管理员手动同步。即使读取模式也会访问真实公共节点，端到端本地测试则使用模拟链与内存数据库。

## 运营者部署与升级

程序固定现有判官 `1.2.168` 的地址和权限。部署到另一 Worker 不会赋予其判官权限。新判官需要适配身份常量、前端服务地址、站点发布目标、权限和测试，参见 [架构说明](../docs/ARCHITECTURE.md)。下面操作仅面向实际运营者。

1. 明确目标账号、Worker 与 D1；现有服务升级应使用原数据库，保留案件、参数、租约及交易日志。
2. 应用全部尚未执行的迁移。0005/0006 支持计分类型及历史缓存，旧数据保留。
3. 部署当前 v6 源码；需要启用签名时，由实际持有人自行配置 secret、核验协议固定值并设置相应开关。
4. 等 BTC/ETH 各 4320 连续样本 ready 后才能受理背书计分；随后验收一笔新的实际记录。

```sh
npx wrangler@4.147.0 d1 migrations apply 168-judge --remote
npx wrangler@4.147.0 deploy
```

不要用旧 v4/v5 包覆盖包含新计分消息的 v6 服务。关闭计分时保留当前代码和数据库，仅设 `SCORING_ENABLED=false`；未完成的计分任务会暂停，已核验记录仍可读取。

### 自动签名需要的配置

| 配置 | 用途 |
| --- | --- |
| `JUDGE_PRIVATE_KEY` secret | 当前判官电路持有人交易签名；具有钱包完整权限 |
| `JUDGE_RECEIVE_KEY` secret | 与链上发布公钥对应的收信私钥 |
| `JUDGE_PROTOCOL_PIN` secret | 所核验工厂/Hub 实现、权限和封印状态的固定值 |
| `AUTO_EXECUTE=true` | 在权限和预算校验通过后允许自动交易 |
| `SCORING_ENABLED=true` | 开启计分准备、公开参数与结算 |
| `MAX_TX_FEE_WEI` | 单笔预算上限，当前 200000000000000 |
| `MAX_DAILY_FEE_WEI` | 滚动 24 小时预算上限，当前 2000000000000000 |

实际持有人用 Wrangler 的交互式 `secret put` 输入秘密；不要把值写进代码、命令参数、README 或提交历史。判官长期收信密钥不公开；公开揭示只使用单条内容密钥。收信公钥、备份与持有人必须匹配。

`JUDGE_PROTOCOL_PIN` 由 [verifyAuthority](src/executor.mjs) 对当前持有人地址作只读链上核验后生成。它不是任意字符串或跳过协议检查的开关。若底层实现/权限变化，应重新审阅后配置，执行器不能静默接受变化。

`/admin/sync` 仅在设置 `SYNC_TOKEN` secret 时可用；公开证据提交仅在 `ENABLE_PUBLIC_SUBMISSIONS=true` 时可用。两者不是 Agent 提交价格判断的路径；Agent 提交走 TapeSend。

## 故障与独立核验

RPC 一致性不足会停止该轮安全索引或执行，不应改写原条件或将错误判成未中。历史缓存与已广播交易跟踪有独立状态；最终消息仍以安全区块核验为准。费用、权限或 nonce 异常也会暂停，保留原日志供复核。

只读诊断与独立重建在仓库根目录执行：

```sh
node tools/check-scoring-status.mjs
node tools/rebuild-scoring.mjs
```

需要代理时设置 `SCORE_DIAGNOSTIC_PROXY`。新本地 SQLite 可以重建已公开分数，但无法恢复线上尚未公开的私有参数或密钥。保存好运营者数据库和加密备份。
