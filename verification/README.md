# 公开验收记录

这里保存我在终端执行核验后留存的结果、截图材料及可重复检查的 JSON。历史验收与当前线上状态分开；当前状态需重新运行只读命令。本目录不包含 SQLite 数据库、私钥、未公开揭示备份或运营者配置。

| 文件 | 证明范围 |
| --- | --- |
| [v2 价格裁决](20261004-v2-mainnet-success.json) | 新 v2 承诺已完成主网揭示与裁决 |
| [计分后台就绪](20261004-scoring-v6-mainnet-readiness.json) | v6 部署、两资产历史缓存及接口就绪 |
| [链上站点核验](20261004-scoring-v6-site-mainnet-success.json) | 发布的八个站点文件经多个链节点字节核对 |
| [首笔背书计分](20261005-scoring-mainnet-success.json) | 及时回执、揭示/裁决/参数公开，未中结算 −178977 |
| [独立重建里程碑](20261005-scoring-independent-rebuild-success.json) | 公共链/历史来源核验、同分及同归属 |
| [历史重建输出](scoring-rebuild-1791175325462.sqlite.json) | asOf=1791173232，verified=true，unverified=[] |
| [Agent 真实读取](20261005-agent-live-read-success.json) | asOf=1791175801，真实记录被读取重算；没有交易或资源转移 |
| [参赛链上取证](20261005-hackathon-chain-evidence.json) | 工厂与晶体管关联、当前 0.06 OKB 单价、第 3 号电路流片时间；初始发行与正式截止仍待证 |
| [电路与容器截图记录](20261005-circuit-container-screenshots.json) | 判官/居民容器已创建，独立背书未开容器；截图不替代部署时发行证明 |
| [工厂创建交易取证](20261005-processor-creation-evidence.json) | 创建区块、发送钱包、工厂和处理器/晶体管关联日志；参数名称及初始供应待 ABI 核对 |
| [tapeout.space 访问数据](20261005-tapeout-space-traffic.json) | 我已有项目的后台汇总、CSV 指标与计算方法；原始导出见 traffic/ |
| [参赛要求核对](20261005-hackathon-requirements-review.json) | 要求与作者钱包声明来源、已知证据及待补项；未宣布完整资格通过 |
| [TAP-12 收录记录](20261004-tap-12-milestone.json) | 用户截图显示已编号并进入 main，状态 Draft |

JSON 里的 source、时间与验证范围说明凭证如何取得。早期凭证中的 pending 是当时的待办，后续里程碑按日期记录；不能将单个旧字段视为最新状态。重建文件名中的 sqlite.json 是 JSON 导出，不包含 SQLite 数据库。

来源材料由我提供，仓库内保存的 JSON 本身不是共识证明。评审可以检查原链交易，并用下列命令独立核验：

```sh
node tools/check-scoring-status.mjs --case 0x1831cb8dc71ab9f8e5f4509aee6ace0e4f3f303b54951f2d0899d219c63fbd98
node tools/rebuild-scoring.mjs
node examples/agent/run.mjs --case 0x1831cb8dc71ab9f8e5f4509aee6ace0e4f3f303b54951f2d0899d219c63fbd98
```

前两条如需代理，设置 `SCORE_DIAGNOSTIC_PROXY`；Agent 命令用 `--proxy`。这些命令只读，不签名、不广播。
