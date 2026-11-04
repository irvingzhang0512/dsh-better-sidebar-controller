# dsh-better-sidebar-controller 需求迁移索引

迁移日期：2026-10-22。本轮仅把既有开发需求整理为 OpenSpec，未授权待定功能实施。当前功能契约在 `openspec/specs/`；待定增量在 `openspec/changes/`，批准和完成前不合入主规格。原始需求、旧 `docs/SPEC.md` 和历史证据全文保留并冻结，不再双写活动需求。

本轮其他技术／使用文档、运行 Skill、源码、测试、配置、构建产物和个人资料全部保持原字节；它们并非永久冻结，未来已确认实现后仍应同步实际技术和使用说明。个人项目、会议、周报和业务样本不因软件规格转换而移动、重写或复制到新公共规格。

OpenSpec 校验只证明文档结构，不等于用户批准、产品实现或运行验证。新功能先维护 proposal／specs／design／tasks 和具体版 review，获确认后才改实现；已有预期不变的 Bug 可直接修复，不强制新提案，也不得改预期掩盖 Bug。纯文档不改包版本、依赖、运行锁或实装快照，不提交／推送。

## 当前能力与待定范围

主规格为 [文件树](specs/sidebar-file-tree/spec.md)、[文件状态](specs/sidebar-file-state/spec.md)、[权限与工具](specs/sidebar-access-and-tools/spec.md)、[办公成员交付](specs/office-member-delivery/spec.md)。当前接口细节见 [CONTRACTS](CONTRACTS.md)。

待定：[Desktop 工作台协作](changes/desktop-workbench-integration/proposal.md)（F014）；[早期未来能力](changes/controller-future-capabilities/proposal.md)（F008 与原始愿望）。两者均未取得本版实施确认，任务均未勾选。

## 状态和旧文档冲突的处理

- F001–F007、F009 已有实现；F010–F013 经 2026-10-11 增强版确认并实现；F015/F016 经 2026-10-18 名称／套件方案确认并实现。F008 是未来方向，F014 是待确认工作流。
- F004 早期仅工作区文件限制被 F010/F012 扩展为增强打开外部绝对路径、控制已知外部文件；兼容 open_file 与目录工具仍围栏内。不是把所有文件操作统一放宽。
- 旧 F006 的固定 11 工具／依赖缺失仍可用描述被 F011 的 0／2／9／12 工具和有效依赖门禁取代；旧 F009 客户端 settings 镜像不再是权威来源。默认隐藏项 true、上限 1000 以已确认增强行为为准。
- 旧 pushState 去重／初次连接不补推的观察已由 F012 处理；保留首次连接与强制补推场景，不把旧故障当现状。
- 20261011 未确认升级草案中的 wire 同步和旧接缝只作历史；20261017 已确认 Connection、实际会话与公开地址接缝优先。settings.yaml 逐节失败、base/user/未知字段完整性仍是升级安全约束，不能用启动成功证明数据完整。
- 原草案固定目标版本不因后来兼容成功自动换成已批准的新工作流。F014 的目标组合与多窗口规则仍待确认。

## 原始 requirements.txt 全章节去向

| 原章节 | 去向与状态 |
|---|---|
| §1 项目定位、目标；§2 设计原则；§3 系统组成 | 文件树／状态／权限主规格：复用界面、鼠标与 Agent 同态、host/client 分工；不新增文件树 |
| §4.1 状态、§4.2 当前文件、§4.3 切换 | F002/F004/F010/F012；§4.2 查找／创建愿望转 future change |
| §5 状态／显隐工具 | F002/F003/F005/F011；固定工具总数由后续增强规则取代 |
| §6 文件树、§7 文件操作 | F001/F003/F004/F010/F012，工作区围栏与增强打开区别保留 |
| §8 第一版不做文件维护 | future change，删除／移动／复制／改名及目录维护未实现未批准 |
| §9 Bridge、§16 状态一致性 | F005/F007/F012；确认、会话、重连、生命周期场景 |
| §10 Skill、§11 自然语言 | F006/F013；同版运行 Skill 与实际结果指引 |
| §12 语音、§13 模式 | 文本工具复用边界保留；独立引擎与命令前缀方案归 future change |
| §14 错误、§15 返回 | F005 与 CONTRACTS；原 success/error、FOLDER_NOT_FOUND 等是旧示意，当前 ok/code/message 为准；独立模糊查找归 future change |
| §17 项目结构 | 既有 host/client 技术说明与源码定位，非新业务要求 |
| §18 测试、§19 验收 1–12 | 下方场景覆盖状态、显隐、树、展开／折叠、打开／关闭／切换、Current File、鼠标同步、Skill、自然语言、说明和基础验证；模型／原生未验证范围保留 |
| §20 发布 | 主规格交付能力、README 安装说明与既有维护约束；不私改上游、最小公开接缝建议保留，不授权发布 |
| §21 后续规划 | F008/future change：Current File→Current Node，文档结构归文档插件；文件维护与语音另行确认 |
| §22 定义 | 当前能力 Purpose，非新增功能 |

## 原实现和验证依据

源码依据保留于原 SPEC 对应条目，现行领域可定位 src/host、src/client、src/shared 及 tests；本轮仅静态对照未运行产品测试。2026-10-11 增强交付 184 项／18 文件，真实 carrier 验证 12 工具，不含真实模型自然语言链和完整原生 Electron。2026-10-17 兼容为 188 项及目标 carrier；2026-10-18 为固定套件／原生显示与基础链路。三者均不补足 F014 尚缺全流程、双窗口和模型验收。

## 全部原文档分类

| 原文件 | 职责、迁移去向与状态 |
|---|---|
| [docs/DESKTOP-WORKFLOWS-20261014.md](../docs/DESKTOP-WORKFLOWS-20261014.md) | F014 原草案，待确认／待实现 → changes/desktop-workbench-integration。 |
| [AGENTS.md](../AGENTS.md) | 维护规则；仅切换文档路由，既有插件约束保留。 |
| [CHANGELOG.md](../CHANGELOG.md) | 版本历史与已有工作区改动；只读保留，验证状态不回填成新执行。 |
| [README.md](../README.md) | 产品入口；仅把当前规格／待定变更路由改为本索引与 change。 |
| [README.zh-CN.md](../README.zh-CN.md) | README 中文镜像；同步相同路由，不改产品说明。 |
| [docs/AGENT-SKILL-DRAFT.md](../docs/AGENT-SKILL-DRAFT.md) | sidebar-enhancement-20261011-v1 的确认／Skill 交付记录；对应 F006/F013 已实现，非新待定功能。 |
| [docs/DSH-UPGRADE-20261011.md](../docs/DSH-UPGRADE-20261011.md) | 早期未确认升级草案；业务边界归主规格，后续已确认兼容归 20261017；未完成协作归 F014，不假称原草案全批准。 |
| [docs/DSH-UPGRADE-20261017.md](../docs/DSH-UPGRADE-20261017.md) | 已批准兼容交付与 188 项历史验证；当前 Connection／冷会话等接缝优先于旧描述。 |
| [docs/SPEC.md](../docs/SPEC.md) | 旧现行＋历史＋待定规格 F001–F016；全文冻结，以下逐项映射。 |
| [docs/VERIFICATION-0.3.0.md](../docs/VERIFICATION-0.3.0.md) | 增强版交付证据（184 项／18 文件及真实 carrier）；不含真实模型或完整原生 Electron／工作台联合验收。 |
| [docs/VERIFICATION-OFFICE-20261018.md](../docs/VERIFICATION-OFFICE-20261018.md) | 188 项及固定包、原生展示／唯一组合、基础办公链路证据；不覆盖 F014 全量流程。 |
| [docs/architecture.md](../docs/architecture.md) | 技术契约，包含旧接缝和待定段；本轮字节保持，当前边界见 CONTRACTS，待定差异进 change design。 |
| [docs/tools.md](../docs/tools.md) | 现行 12 工具输入输出、权限和错误；本轮保留，主规格及 CONTRACTS 提取活动边界。 |
| [docs/usage.md](../docs/usage.md) | 操作、配置和排错说明；本轮保留，属于使用文档而非另一份需求权威。 |
| [requirements.txt](../requirements.txt) | 原始需求；§1–22 全量归类见下表，未来内容独立保留。 |
| [skills/sidebar-controller/SKILL.md](../skills/sidebar-controller/SKILL.md) | 随包运行指引，字节不改；F006/F013 当前说明来源，不是维护 OpenSpec Skill。 |

## 原 F 编号到 Requirement 与验收场景

下面使用精确 Requirement 标题和场景名；主规格为已落地行为契约，changes 仍待定。条目存在不等于本轮运行通过。

| 原编号／来源 | 规格与 Requirement | 验收场景 | 实现／验证归属 |
|---|---|---|---|
| F008 | [F008 结构节点职责分离](changes/controller-future-capabilities/specs/controller-future-capabilities/spec.md) | 评估节点协作 | 待确认／待实现，见该 change 的 review；无本轮产品验证 |
| 旧草案未来／建议 | [原需求 4.2 与 8 文件管理扩展](changes/controller-future-capabilities/specs/controller-future-capabilities/spec.md) | 请求扩展文件维护 | 待确认／待实现，见该 change 的 review；无本轮产品验证 |
| 旧草案未来／建议 | [原需求 14 模糊文件选择](changes/controller-future-capabilities/specs/controller-future-capabilities/spec.md) | 存在多个同名候选 | 待确认／待实现，见该 change 的 review；无本轮产品验证 |
| F008 | [F008 与原需求 12至13 语音范围](changes/controller-future-capabilities/specs/controller-future-capabilities/spec.md) | 讨论语音口令 | 待确认／待实现，见该 change 的 review；无本轮产品验证 |
| F014 | [F014 浏览状态不拥有文档绑定](changes/desktop-workbench-integration/specs/desktop-workbench-integration/spec.md) | 固定目标下连续浏览 | 待确认／待实现，见该 change 的 review；无本轮产品验证 |
| F014 | [F014 外部打开与工作区写入边界](changes/desktop-workbench-integration/specs/desktop-workbench-integration/spec.md) | 外部文件只作为浏览对象 | 待确认／待实现，见该 change 的 review；无本轮产品验证 |
| F014 | [F014 多连接断线状态](changes/desktop-workbench-integration/specs/desktop-workbench-integration/spec.md) | 两窗口关闭一个；全部断开后重连 | 待确认／待实现，见该 change 的 review；无本轮产品验证 |
| F014 | [F014 执行确认和门禁不降级](changes/desktop-workbench-integration/specs/desktop-workbench-integration/spec.md) | 队列与超时联合回归 | 待确认／待实现，见该 change 的 review；无本轮产品验证 |
| F014 | [F014 原生与底部联合验收](changes/desktop-workbench-integration/specs/desktop-workbench-integration/spec.md) | 两场景和双会话 | 待确认／待实现，见该 change 的 review；无本轮产品验证 |
| F015 | [F015 双语展示及身份保持](specs/office-member-delivery/spec.md) | 固定包展示 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F016 | [F016 完整修订与唯一组合](specs/office-member-delivery/spec.md) | 套件与独立来源 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F016 | [F016 启停与资料保留](specs/office-member-delivery/spec.md) | 总开关重开 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F011 | [F011 两开关及工具矩阵](specs/sidebar-access-and-tools/spec.md) | 四种权限组合；能力撤销 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F011 | [F011 权威配置与依赖门禁](specs/sidebar-access-and-tools/spec.md) | 缺依赖与初始无连接；动态权限复核 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F011 | [F011 增强设置卡与现有配置保留](specs/sidebar-access-and-tools/spec.md) | 显示与保存 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F005 | [F005 会话队列与确认结果](specs/sidebar-access-and-tools/spec.md) | 满队列与超时；后台会话操作 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F005 | [F005 结构化错误与信任边界](specs/sidebar-access-and-tools/spec.md) | 非法请求与不可用能力 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F006、F013 | [F006 与 F013 自然语言指南和技能](specs/sidebar-access-and-tools/spec.md) | 完整说明流程；指南可获取 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F010 | [F010 增强打开目标分类](specs/sidebar-file-state/spec.md) | 中文外部文件与去重；网页或文件夹窗口 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F004 | [F004 兼容打开与已知文件控制](specs/sidebar-file-state/spec.md) | 文件切换关闭与返回 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F002 | [F002 文件候选与状态字段](specs/sidebar-file-state/spec.md) | 关闭上一文件或切到网页 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F012 | [F012 原生与底部状态一致](specs/sidebar-file-state/spec.md) | 鼠标与工具共用状态 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F012 | [F012 首次连接与强制补推](specs/sidebar-file-state/spec.md) | 连接建立前状态已计算 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F007 | [F007 原生锚点及生命周期清理](specs/sidebar-file-state/spec.md) | 原生和底部锚点释放 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F001 | [F001 工作区列举与真实路径围栏](specs/sidebar-file-tree/spec.md) | 正常列举与越界拒绝 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F003 | [F003 显隐与目录控制复用现有界面](specs/sidebar-file-tree/spec.md) | 目录展开及刷新 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F009 | [F009 列举配置默认及取值归一](specs/sidebar-file-tree/spec.md) | 默认与异常上限 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |
| F009 | [F009 先过滤再截断并保持配置](specs/sidebar-file-tree/spec.md) | 隐藏项不占用配额；设置持久与下一次调用 | 已有行为；原范围与证据见上方状态说明及原 SPEC，不新增验证声明 |

## 本轮检查

新增内容仅在 openspec 内，允许的既有修改仅 AGENTS／README 文档路由。严格 CLI 校验与逐文件前置哈希核对另在迁移交付记录汇总；源码、运行 Skill、技术说明、原始需求、旧 SPEC、历史证据及个人资料不得变化。本轮不运行 typecheck／产品测试／构建，不执行安装、迁移、提交或推送。


## 2026-11-04 rc5升级增量

[adapt-dsh-021-rc5 v1](changes/adapt-dsh-021-rc5/proposal.md) 承接本次固定组合适配；具体文档待确认、实现待实施、验证另记。既有编号及历史证据保持，未确认前不合入主规格。
