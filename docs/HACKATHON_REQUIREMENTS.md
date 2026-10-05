# 我的参赛实现与评审证据

我是 [spongemochi](https://x.com/spongemochi)。我把 168 的部署、发行、真实流片、产品流程和公开记录整理在这里，供评审按参赛要求逐项查看。材料记录日期为 2026-10-05。

## 五项参赛要求

| 参赛要求 | 我完成的实现 | 对应凭证 |
| --- | --- | --- |
| 处理器通过 TapeOut 工厂部署在 X Layer | 我已通过工厂部署 #168 处理器；创建交易的钱包、工厂目录与处理器地址已交叉核对 | [创建交易及日志](../verification/20261005-processor-creation-evidence.json) |
| 部署时设定并公开供应量、单价与上限 | 我设置初始供应量及上限为 100,000，供应量不可修改，铸造单价 0.06 OKB；创建输入与事件公开保存对应数值，README 和处理器页面列出发行信息 | [创建参数记录](../verification/20261005-processor-creation-evidence.json) · [处理器页面](references/168-processor-circuits-20261005.png) |
| 窗口关闭前至少完成一次电路流片 | 我已完成三个电路流片；用于首笔计分的第 3 号电路在 2026-10-04 23:55:33（北京时间）完成，区块 72360297 | [流片回执与区块时间](../verification/20261005-hackathon-chain-evidence.json) |
| 清晰的应用场景 | 我让人和 Agent 事前封存判断，到期公开结果，并将符合条件的价格判断结算为可重建的履历，长期可直接链接资源分配 | [真实主网案例](https://1-2-168.tapekit.org/#/chain/0x1831cb8dc71ab9f8e5f4509aee6ace0e4f3f303b54951f2d0899d219c63fbd98) |
| 处理器地址、部署钱包、产品演示与项目说明 | 我在下表提供合约和钱包，在主网提供可访问产品，在仓库提供完整说明、运行代码与验收记录 | [产品演示](https://1-2-168.tapekit.org/) · [README](../README.md) · [项目介绍](HACKATHON.md) |

## 部署与发行信息

| 字段 | 值 |
| --- | --- |
| 网络 | X Layer，chain ID 196 |
| TapeOut 工厂 | `0x1f09daefa827f02cbb40967cc91b259763760761` |
| 168 处理器 | `0x0b4a0ba288b4d2a87fc07db5f4c929f87dfda282` |
| 晶体管 | `0xf367088b1547cb3b1c4529c2f8ab7e7fa295a6f7` |
| 我的部署钱包 | `0x5F829a59f88c13264b408Ab5Cb732CD3b5BBE3B2` |
| 创建时间 | 2026-09-22 15:33:35（北京时间），区块 71293379 |
| 创建交易 | [0x52107449…cd40af4](https://www.oklink.com/xlayer/tx/0x52107449595f976e2134799ab83e411a6a453d2503e1b97a310674d02cd40af4) |
| 初始供应量 / 上限 | **100,000；部署时固定，不可修改** |
| 铸造单价 | **0.06 OKB** |

供应设置由我作为部署者确认；创建输入与工厂事件含 `100000` 和 `60000000000000000`，当前单价也已通过多节点读取核对。公开记录保留原始输入、日志、区块时间与核验范围。

## 七个评审维度

| 评审维度 | 我希望展示的内容 | 查看依据 |
| --- | --- | --- |
| 应用创新性 | 将事前判断、公开结果和历史基准连接成可重建的履历，让人和 Agent 使用同一套记录规则，未来可进行资源；并且适合ai代理信任 担保 身份  | [主网计分案例](../verification/20261005-scoring-mainnet-success.json) · [TAP-12](https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-12.md) |
| TapeOut 生态集成深度 | 工厂处理器、身份电路、独立 NAND 背书、容器信箱、TapeSend 和链上站点共同参与产品流程 | [架构说明](ARCHITECTURE.md) · [电路与容器记录](../verification/20261005-circuit-container-screenshots.json) |
| 产品完成度与用户体验 | 可访问的网站与判官工作台；真实封存、事前回执、自动揭示、裁决、参数公开和分数结算；提供逐条证据查看 | [主网产品](https://1-2-168.tapekit.org/) · [完整案例](../README.md#真实主网案例一次未中也完整留下来) |
| 资产发行设计 | 固定供应参数；晶体管用于身份及逐笔判断背书，计分由行为结果产生，普通记录与背书计分分开 | [部署与发行](../README.md#部署与发行) · [计分规则](SCORING_V2.md) |
| X Layer 集成质量 | 真实主网交易、安全区块与历史身份核验、费用预算和重试；链上站点文件经多节点字节核对 | [链上站点校验](../verification/20261004-scoring-v6-site-mainnet-success.json) · [独立重建](../verification/20261005-scoring-independent-rebuild-success.json) |
| 用户增长潜力 | 我已有 tapeout.space 的访问入口：后台显示 7.88K 独立访客、28,597 次页面浏览；导出数据累计 130,653 次请求。我计划将这个入口连接到 168 的真实案例、教程与参与流程 | [访问数据与推广路径](TRACTION.md) |
| 合约安全性与经济模型 | 复用协议合约，绑定历史归属、唯一背书和事前参数；公开材料支持复算，并设置交易费用预算 | [运行边界](../README.md#可核验范围与运行边界) · [计分实现](../judge-worker/src/scoring.mjs) |

## 三个电路的实际用途

| 电路 | 我的用途 | 容器 |
| --- | --- | --- |
| `1.2.168` | 判官身份 | 已创建 |
| `2.2.168` | 提交首笔计分判断的居民身份 | 已创建 |
| `3.2.168` | 该判断的独立 NAND 背书 | 无需创建容器 |

我保存了[处理器电路列表](references/168-processor-circuits-20261005.png)和[容器状态](references/168-container-status-20261005.png)。三个电路由我的同一钱包持有，各自承担不同功能。判断通过居民身份容器发送，背书核验流片、NAND 消耗、历史所有权与单次使用。

## 可重复核验

我保留了运行代码和原始输出，便于读取者沿着相同路径复查：

```sh
node tools/check-hackathon-evidence.mjs --proxy http://127.0.0.1:15236
node tools/find-processor-creation.mjs --proxy http://127.0.0.1:15236
node tools/rebuild-scoring.mjs
```

前两条读取工厂、创建交易、价格及流片时间；第三条从公开链数据与历史行情重新构建分数。原始验收的时间和范围见[公开凭证目录](../verification/README.md)。
