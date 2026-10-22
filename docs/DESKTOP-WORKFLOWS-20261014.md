# Desktop 工作台联调契约

文档版：`discussion-desktop-workflows-20261014-v1`；2026-10-14。本版具体联调文档待用户确认，新增 SPEC F014 验证未执行；已确认的 `sidebar-enhancement-20261011-v1`／0.3.0 行为与证据继续有效，不把本次计划记成已完成联调。

## 1. 保留现有控制器

- 目标组合为 Desktop `0.2.0-rc.2`、better-sidebar `0.25.0`，复用现有增强打开、原生标签与底部工作台文件镜像、每会话投递、两个工具门禁及 0／2／9／12 注册组合。
- `sidebarController.getState(sessionId)` 与 `subscribe(sessionId, listener)` 的现有公开 shape 保持：currentFile、fileCandidate、fileCandidateSource、workspaceRoot、connected 等仍表示浏览事实，不变成文档绑定所有者。
- 上游打开开关、本地管理开关及锚点描述符关闭的权限保持。只读浏览镜像继续服务工作台；工作台材料工具不会替用户开启控制器能力，也不绕过门禁控制外部文件／标签。
- 已有 controller 版本 0.3.0 保持；只有联调证明既有预期的实现缺陷才修复并提高 patch，若无缺陷则只增加证据和文档提交，不提高包版本。

## 2. 与固定文档的关系

- 工作台持有 structuredDocument 宿主 lease；controller 只发布原生当前／最近浏览候选。打开转写、项目 JSON、Excel、网页或目录不能设置／解除该 lease。
- 外部绝对路径仍可由已授权 controller 打开，但工作台材料、目标及输出继续受当前会话真实 cwd 围栏限制。UI 中越界候选说明不可登记，不能因为已打开而放宽边界。
- 重连、sync_state 和会话切换补推事实；current 与 recent 分开报告。没有客户端时 stale 状态不是新选择证据，多窗口断开不得误清另一个仍在线实例的状态。
- QUEUED／delivered／实际确认沿用既有语义。文档保存成功不代表 controller 已打开文件；确认超时不自动重复投递、不能跨会话补投。

## 3. 设置与清理

- 本版不新建开关、不移动上游 prefs、不复制配置。列举 includeHiddenEntries／maxListedEntries 与 agentControlTools 仍由既有所有者读取、保存与同步。
- 与工作台联调发现旧无效客户端 settings 消息或遗留引用时依现有升级契约核对，不恢复已移除权限镜像；未知有效设置保留。
- 仅销毁所属锚点、连接、订阅和计时器；不关闭用户其他文件、外部编辑器或系统浏览器。

## 4. 本版验收

1. 会议记录固定时，打开转写与图片；候选真实变化、目标不变；显式切到纪要后同样保持。
2. project 主文档固定时，打开 JSON／Excel／周报，文档内核不被浏览目标替换；工作区外文件可打开但不可加入工作台或设为目标。
3. 两会话交替、后台队列、两个窗口、初次连接／刷新／重连／sync_state 以及 native／底部标签的事实一致；不能把 A 的候选交 B。
4. 两门禁四组合、队列满、能力关闭、确认超时和锚点清理回归；工作台／视图自身动作不会越过控制器门禁。
5. 与三个完成本版的插件使用真实精确 peers carrier 和可见原生窗口联调；自然语言模型调用另有证据，不以直接工具调用代替。

本次未修改源码、测试实现、配置、日常安装或 lib 产物；原 `VERIFICATION-0.3.0.md` 的待验整套工作台项继续保留，待本版实际完成后补证据。
