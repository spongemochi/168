# 社区反馈、协议里程碑及 README 采用说明

材料由项目作者于 2026 年 10 月 3 日提供，为三张点评截图。下文是对可见内容的概括，不将社区观点当作功能完成、用户增长、官方认可或安全审计的证明。截图不包含完整原帖链接，因此不补造引用链接或作者信息。

## 行为记录与身份的关系

[第一张截图](references/community-comment-identity.png)的作者未显示。点评认为，先承诺、到期揭示、结果留链之外，更值得观察的是 Agent 做过什么、承诺什么及其结果能否形成可查记录，进一步连接信誉和身份。

README 的回应：说明身份是记录的载体，而信誉来自连续行为；特别区分身份容器的当前持有人与历史行为的实际作者。身份电路本身不代表已经获得可信度。

## 信誉能否被复用

[AirDrop Research 的截图](references/airdrop-research-comment.png)显示账号为 `@Theairresearch`。点评关注不可改写的预言与承诺如何形成可验证履历，并把其他应用和 Agent 能否真正读取、用于资源分配视为关键检验。

README 的回应：新增第三方读取与验证流程。读取者应得到记录、判决、证据、规则版本和完整样本统计，能够重算或采用自己的评价规则；不能只提供一个不可解释的分数。预测盘接入和 Agent 协作列为路线图，不能声称已有第三方实际采用。

## 从承诺到可验证历史

[BruceBlue 的截图](references/bruceblue-comment.png)显示账号为 `@BruceBlue`。点评强调 Commit → Reveal → Adjudicate 可以为人与 Agent 留下长期可验证、不能由作者选择性删除的行为历史，并将其视为自主 Agent 信誉的潜在基础。

README 的回应：把承诺、揭示和裁决作为系统核心流程；区分“可验证的历史”与“必然正确的裁决”；说明失败、未揭示、异议和判官故障也应可见。无需将未来自主 Agent 的愿景写成现成功能。

## 新增的产品验证目标

下面是据点评提出的开发建议，不是点评作者作出的实现承诺：

1. 在关闭 168 索引服务的条件下，独立读取器仍能定位测试身份的链上记录并核对其来源。
2. 同一规则版本下，两个独立读取器对同一批输入产生相同统计；不同评价规则能说明差异来源。
3. 一个独立示例应用读取这份履历，并给出可解释的协作资格或展示结果；该示例明确标注为示例，不能冒充外部采用。
4. 修改服务端分数、漏掉失败记录或混入错误判官消息时，读取器能够检测到相应问题。

这些目标已写入 README 的集成与验收部分，尚未在本轮实现或验证。

## TAP-12 收录里程碑：未来 README 引用

记录日期：2026 年 10 月 4 日（北京时间）。用户提供了 [TAP-12 主仓库页面](https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-12.md)及[原始截图](references/tap-12-main-20261004.png)，并确认提案已通过。截图可见提案已进入 `TapeOutProtocol/TAPs` 的 `main` 分支，获编号 **TAP-12**；标题为 **Sealed Commitments and Verdicts over TapeSend**，作者为 **spongemochi (@spongemochi)**。

截图中的提交为 `201ee33`，提交作者 `TheCYPER`，提交说明为 `docs: assign TAP-12 to the sealed commitments draft`。提案元数据为 `status: Draft`、`type: Application`、`created: 2026-09-30`、`requires: TAP-10`、`license: CC0-1.0`。这些信息来自用户提供的截图；本次没有独立查询 GitHub 的实时状态。详细来源与截图 SHA-256 保存在 `verification/20261004-tap-12-milestone.json`。

未来 README 可采用：

> 168 的作者 spongemochi 提出的“密封承诺与裁决”记录格式已被 TapeOutProtocol/TAPs 主仓库收录，编号为 [TAP-12](https://github.com/TapeOutProtocol/TAPs/blob/main/TAPs/TAP-12.md)。该提案基于 TAP-10 消息描述封存、到期揭示与裁决，168 实现了相应的应用流程。

本次记录的“通过”指收录及编号这一里程碑。截图中的规范状态仍为 **Draft**；未来 README 应同时注明当前规范状态，待有新证据再更新为后续状态。这条贡献适合放在 README 的“开源与协议贡献”部分，当前 README 的“正式编号待确认”表述可在后续编辑时更新。

## 来源与使用范围

原截图按字节复制保存在 references 目录，原文件未改动。来源是用户提供的附件；截图中的相对时间不能用来推算精确发帖时间。截图及第三方文字的权利归各自权利人，不随项目 MIT 许可证重新授权。
