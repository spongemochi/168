# Agent 接入：留下判断，读取履历

Agent 与人使用同一套居民身份、TapeSend 消息、TAP-12 / SCV1 记录和判断计分规则。Agent 可以调用自己的模型生成判断；本示例负责把判断接入可核验的记录流程。它不内置模型、不代签。真实已结算案件的读取与重算已通过；Agent 自主提交一条新主网判断仍待验收。

需要 Node.js 22.13+；运行位置为仓库根目录。没有额外 npm 依赖。以下终端脚本不读取钱包私钥、不签名、不广播交易。只读请求失败会退出，无法读取不等于零分。

## 1. 读取实际履历，建议合作对象

```sh
node examples/agent/run.mjs
```

本机需要代理时加 `--proxy http://127.0.0.1:15236`；其他机器默认使用原生 fetch。`--case 承诺ID` 先打印目标的揭示、回执及计分状态，随后检查榜单。

读取路径：榜单 → 每条已结算案件 → 已公开的历史样本 → 重新计算。检查事前十分钟回执窗口、公开参数哈希、4320 根连续小时数据及其摘要、历史命中率 p、固定价格规则、单笔整数分、累计分、正式榜门槛与排序；拒绝重复 case、背书复用、过期快照和不完整读取。

输出包含 `ruleVersion`、`asOf`、`checked`、`candidates` 和 `suggestedContact`。只有至少十条有效结算的居民进入候选。没有候选时返回 `awaiting-qualified-history`；一条记录就能展示分数，但不够进入正式榜。建议联系排名第一的居民只是示例策略，不是资源发放规则，也不发送 TapeSend 邀请或转账。

**信任边界：** API 模式标记为 `indexed-evidence-recomputed`。本客户端重算公开材料；链上消息真实性、判官权限、背书日志与历史取价真实性由索引器核验。它没有独立向链节点核对这些依据。需要脱离线上 D1 时，先运行 `node tools/rebuild-scoring.mjs`，从公开链数据及价格来源建立新的本地数据库，再用 `node examples/agent/run.mjs --rebuild verification/scoring-rebuild-时间戳.sqlite.json` 检查其输出。该模式拒绝有未核验记录的结果；文件本身的可信来源仍由运行重建程序的一方负责。

默认快照最长 900 秒；读取完再次检查新鲜度。节点延迟时返回错误，等待恢复后重试。历史文件如需研究，可明确设置 `--max-age 秒数`，不应将旧结果冒充当前资格。

## 2. 让 Agent 准备一条密封价格判断

复制 `draft.example.json` 到 `examples/agent/private/draft.json`，填真实居民编号、当前持有人钱包、BTC/USD 或 ETH/USD、严格比较符号、十进制阈值字符串和整分钟 Unix 开舱时间。模板故意没有可直接发送的默认值；未来开舱时间用带时区时间生成，例如 `Math.floor(Date.parse('2026-10-06T12:00:00+08:00')/1000)`。

```sh
node examples/agent/run.mjs --draft examples/agent/private/draft.json --out examples/agent/private/prepared-001
```

输出目录必须不存在。工具核验安全区块的新鲜度、居民持有人、168 处理器、判官收信公钥和链支持，使用 `mod.seal` 加密原文，再用 `encodeSend` 生成真实调用数据。它创建权限为 0700 的目录与 0600 的文件：

- `unsigned-transaction.json`：链 196、发送钱包、TapeSend Hub、calldata 和 value；供调用方钱包审阅并签名。
- `reveal-private.json`：单条内容密钥、加密载荷、ref 与开舱时间；作为作者揭示备份，保管在私有目录，不上传公开仓库或发给 Agent 的其他参与者。

普通判断不计分。要申请计分，在 draft 加 `slot`：

```json
{
  "chainId": 196,
  "processor": "0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282",
  "circuitId": "真实背书电路编号",
  "tapeoutTx": "真实流片交易哈希"
}
```

背书须由同一持有人在封存前创建，与居民电路不同，一枚只支持一条判断；开舱间隔为 1 小时至 7 天，建议留两小时。准备工具只检查 slot 格式及计分服务就绪，不创建或支付背书，也不能预先保证后台收录；后台会检查真实铸造、晶体管销毁、历史所有权、封存发送钱包、复用和事前窗口。

接入方可直接 import `prepareForecast(draft, {readRules})`，把 `prepared.transaction` 交给自己的 EIP-1193 钱包：签名前重新核验链号、持有人、公钥和 gas 预算。签名后必须解析并核验安全区块中的实际 TapeSend 消息取得承诺 ID，不能把交易哈希当作承诺 ID。准备密文或广播交易都不等于已经上链、已获事前回执或已计分。现有前端的 `Tape168.verifyReceipt` 展示了该核验路径（源码 `tools/tape-runtime.js`）。

先保存揭示备份，再确认签名。判官随后到期揭示和价格裁决；计分还需及时回执、参数公开和独立核验。不需要一个专门的 `/api/agent/predict` 写接口；提交走现有 TapeSend 合约，读取走公共 GET 接口。

## 公共读取接口

基础地址：`https://168-judge.joezuooo.workers.dev`。

| GET 路径 | 用途 |
| --- | --- |
| `/api/scoring/rules` | 当前版本、历史缓存与计分就绪状态 |
| `/api/cases?resident=居民编号&limit=50&after=案件ID` | 按居民分页读取；下一页使用响应的 next |
| `/api/cases/承诺ID` | 原文公开后的条件、裁决、回执、参数与结算分 |
| `/api/cases/承诺ID/scoring-evidence` | 参数公开后的历史样本 |
| `/api/leaderboard` | 逐笔记录、样本数、累计分与 allocationRanking |
| `/health` | 索引截止时间及最近任务状态 |

归属由提交时钱包和居民编号共同确定；转让身份不会转移旧分。密封期间不能读取原文，查询客户端不应该用 Agent 标签伪造身份归属。

## 本地验证

```sh
node --test examples/agent/client.test.mjs
```

测试使用明确标注的合成数据，覆盖真实加密/解密、普通与背书消息、未签名调用数据、参数及历史篡改、错配钱包、晚回执、空榜、十条门槛和读取失败。真实读取的凭证见 [2026-10-05 Agent 验收](../../verification/20261005-agent-live-read-success.json)。Agent 主网提交与正式榜候选仍需用实际钱包、背书和结算记录验收。
