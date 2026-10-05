# 黑客松提交材料与录屏脚本

## 项目介绍

**一句话：** 168 把人和 Agent 的事前判断，变成可核验、可重建、可积累的履历。

**简介：** 我构建了 168，一个建立在 TapeOut 与 X Layer 上的预言和承诺档案。用户在结果出现前封存原话、条件和规则，到期自动揭示，价格判断按固定历史数据裁决。申请计分的记录通过 NAND 电路背书，基准参数先承诺哈希再公开，结果能够由公开链数据和历史行情重新计算。已有真实主网记录完成整个流程，独立重建得到相同分数，Agent 示例已成功读取并重算真实履历。我希望进一步把这些记录用于任务协作和资源分配。

**English:** I built 168 to turn judgments from humans and agents into verifiable track records on TapeOut and X Layer. Claims and rules are committed before the outcome, revealed on schedule, and settled against historical price evidence. Endorsed records bind their scoring baseline with a prior on-chain receipt. A real mainnet record has completed the full lifecycle, its score has been independently rebuilt, and an Agent consumer has recomputed the public evidence. My next step is to use qualified histories for cooperation and resource allocation.

## 我希望展示的重点

1. **TapeOut 的原生使用。** 居民身份、独立背书电路、容器与 TapeSend；没有新增业务合约，网站也在容器中发布。
2. **记录完整性。** 原话和规则在结果之前固定，命中与未中都留存；示范一条真实未中记录。
3. **计分可以重建。** 事前参数回执、公开参数、历史摘要和规则支持独立核验，不仅展示一个后台数字。
4. **Agent 接入。** 已有公开读取/重算客户端和密文/未签名交易适配器；提交适配器由调用方接入钱包签名器。
5. **协议贡献。** 我提出的记录格式已收录为 TAP-12，所保存截图状态为 Draft。

## 我的已有项目与增长入口

我此前运营的 [tapeout.space](https://tapeout.space) 已有访问基础：站点后台显示 **7.88K 独立访客、28,597 次页面浏览**，导出 CSV 累计 **130,653 次请求**。我计划从这个入口引导访客阅读 168 的真实案例、创建身份并留下第一条判断，再通过履历与榜单促成持续参与。数据区间、来源和计算方法见[访问数据说明](TRACTION.md)。

## 宣传片与操作演示

我已完成两支视频，并保留原始画质和音轨：

- [产品宣传片](https://github.com/spongemochi/168/releases/download/videos-2026-10-05/168-promo-v2.mp4)：50 秒，介绍 168 的产品价值。
- [操作演示](https://github.com/spongemochi/168/releases/download/videos-2026-10-05/168-product-demo.mp4)：约 1 分 31 秒，展示产品使用过程。

可从 [GitHub 视频发布页](https://github.com/spongemochi/168/releases/tag/videos-2026-10-05)下载原片。文件摘要见[视频记录](../verification/20261005-video-release.json)。

## 可直接给评审的入口

- [主网网站](https://1-2-168.tapekit.org/)
- [真实案件 API](https://168-judge.joezuooo.workers.dev/api/cases/0x1831cb8dc71ab9f8e5f4509aee6ace0e4f3f303b54951f2d0899d219c63fbd98)
- [源码与完整 README](../README.md)
- [计分规则](SCORING_V2.md) · [Agent 示例](../examples/agent/README.md)
- [主网/重建/Agent 公开凭证](../verification/README.md)
- [TAP-12 提案](https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-12.md)

提交时可使用[公开仓库](https://github.com/spongemochi/168)、上述视频链接和本页产品入口。当前没有十条真实正式榜样本；真实资源分配、社区事件裁决与守约分仍是后续计划。展示时不要用模拟榜单代替真实参与者。

## 参赛要求核对

我已将五项参赛要求对应到部署、发行参数、真实流片、应用场景和产品入口，详见[参赛实现与评审证据](HACKATHON_REQUIREMENTS.md)。
