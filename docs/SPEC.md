# dsh-better-sidebar-controller 当前功能规格

基线日期：2026-10-03；包版本：0.1.0；核对的源码提交：`24aba717c5e2a1abe2f39820e88836c61a0bdbef`。此提交是首次整理前的实现基线，后续文档提交不提高包版本。

本规格可编辑，功能任务先改预期与验收再实现；Bug 按已有预期直接定位源码。流程见 [根文档驱动开发规范](../../docs/DOC-DRIVEN-DEVELOPMENT.md)。原始需求保持只读，技术文档保留现有名称。

依据与技术入口：[../requirements.txt](../requirements.txt)、[architecture.md](architecture.md)、[tools.md](tools.md)、[usage.md](usage.md)。

实现状态与验证状态分别记录。“已实现”表示有当前源码依据，不表示本次已通过运行测试。下面的测试链接是核对过的现有验证入口；2026-10-03 本次只静态核对源码、测试与文档，没有运行产品测试、构建、GUI 或外部服务验证。具体遗漏见条目与末尾待办。

## F001 文件树列举与路径边界

- 实现状态：已实现。
- 场景与预期：列举工作区文件／目录，目录优先排序，支持隐藏项和递归控制，为用户与工具定位文件。
- 边界与异常：路径经过工作区与真实路径校验，含符号链接及 WSL 映射处理；越界、缺失与不可读路径返回错误。
- 验收条件：目录排序稳定；隐藏策略一致；外部路径及越界链接拒绝；合法工作区文件可列。
- 实现依据：[../src/host/fs-tree.ts](../src/host/fs-tree.ts)、[../src/host/paths.ts](../src/host/paths.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/host/fs-tree.spec.ts](../tests/host/fs-tree.spec.ts)、[../tests/host/paths.spec.ts](../tests/host/paths.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F002 状态与文件候选

- 实现状态：已实现。
- 场景与预期：读取 currentFile、previousFile、openedFiles、expandedFolders、sidebarVisible 与 connected；候选优先当前文件，否则使用仍打开的上一文件。
- 边界与异常：首页／目录页不作为当前文档；无候选返回空，不能伪造上次文件；有客户端时读取状态先请求同步。
- 验收条件：关闭上一文件后不再成为候选；切换标签能更新当前／上一文件；断开状态明确可读。
- 实现依据：[../src/host/controller-state.ts](../src/host/controller-state.ts)、[../src/shared/derive.ts](../src/shared/derive.ts)、[../src/shared/types.ts](../src/shared/types.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/host/controller-state.spec.ts](../tests/host/controller-state.spec.ts)、[../tests/shared/derive.spec.ts](../tests/shared/derive.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F003 侧边栏与目录控制

- 实现状态：已实现。
- 场景与预期：工具可显示／隐藏侧边栏、展开／折叠目录、刷新文件树；复用实际 better-sidebar 文件树。
- 边界与异常：全局可见性和目录展开作用于当前可见侧边栏；不承诺每个会话有独立原生侧边栏，也不创建结构化文档节点树。
- 验收条件：指令确认后状态与可见文件树对应；相同展开指令幂等；无客户端按队列规则反馈。
- 实现依据：[../src/client/index.ts](../src/client/index.ts)、[../src/host/tools.ts](../src/host/tools.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/host/tools.spec.ts](../tests/host/tools.spec.ts)、[../tests/host/bridge.spec.ts](../tests/host/bridge.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F004 文件标签控制

- 实现状态：已实现。
- 场景与预期：打开、关闭、激活文件及重新打开上一文件；维护每个会话的文件状态镜像。
- 边界与异常：文件需在工作区内；当前／上一文件指针遵循状态推导；只有确认的客户端反馈代表执行完成。
- 验收条件：打开 A/B 后激活、关闭和重开得到正确标签与 currentFile；非法路径拒绝。
- 实现依据：[../src/client/index.ts](../src/client/index.ts)、[../src/host/controller-state.ts](../src/host/controller-state.ts)、[../src/host/tools.ts](../src/host/tools.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/host/controller-state.spec.ts](../tests/host/controller-state.spec.ts)、[../tests/host/tools.spec.ts](../tests/host/tools.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F005 桥接、排队与确认

- 实现状态：已实现。
- 场景与预期：宿主通过 WebSocket 发送命令，客户端 hello 后同步状态、接收排队命令并 ack；断线可重连。
- 边界与异常：无客户端最多排队 64 条，返回 QUEUED 而非已完成；等待确认超时与客户端断开明确返回；写入口有信任校验。
- 验收条件：hello 后排队命令重放；ack 能对应请求；无连接和超时有可区分结果；跨站请求拒绝。
- 实现依据：[../src/host/bridge-server.ts](../src/host/bridge-server.ts)、[../src/host/bridge-socket.ts](../src/host/bridge-socket.ts)、[../src/host/trust-fence.ts](../src/host/trust-fence.ts)、[../src/shared/wire.ts](../src/shared/wire.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/host/bridge.integration.spec.ts](../tests/host/bridge.integration.spec.ts)、[../tests/host/bridge.spec.ts](../tests/host/bridge.spec.ts)、[../tests/shared/wire.spec.ts](../tests/shared/wire.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F006 工具与技能入口

- 实现状态：已实现。
- 场景与预期：11 个工具提供文件列举、状态、侧边栏与文件操作；捆绑中文 Skill 指导自然语言调用。
- 边界与异常：工具单一职责；Skill 不复制文件系统业务；better-sidebar 缺失时宿主可注册，界面能力取决于客户端接入。
- 验收条件：11 个工具注册并输出约定结构；Skill 可安装／查找；缺客户端反馈明确。
- 实现依据：[../src/index.ts](../src/index.ts)、[../src/host/tools.ts](../src/host/tools.ts)、[../src/host/skill-registration.ts](../src/host/skill-registration.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/register.spec.ts](../tests/register.spec.ts)、[../tests/skill.spec.ts](../tests/skill.spec.ts)、[../tests/host/skill-registration.spec.ts](../tests/host/skill-registration.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F007 原生侧边栏适配

- 实现状态：已实现。
- 场景与预期：客户端获取原生 sidebar store 并控制实际树和标签；必要时短暂使用隐藏锚点标签获取 store，再清理与恢复。
- 边界与异常：适配依赖原生 UI 生命周期；宿主测试通过不等于所有布局／标签切换兼容。
- 验收条件：获取 store 后清理锚点；会话切换状态正确；用户原有标签、草稿与布局不被破坏。
- 实现依据：[../src/client/index.ts](../src/client/index.ts)。
- 验证记录：2026-10-03 静态核对；无对应专项自动测试，需补宿主／页面或真实环境验证。

## F008 结构化节点树与语音引擎

- 实现状态：待实现。
- 历史场景：历史设计中的结构化内容节点树和独立语音识别引擎不属于当前控制器实现；现有自然语言工具不等于语音采集。
- 边界与异常：仅保留历史规划来源，不代表已承诺本次开发；尚无对应完整运行实现。
- 验收条件：实施前需确定与文档／视图／语音插件的分工，再补接口和真实交互验收。
- 来源依据：[../requirements.txt](../requirements.txt)。
- 验证记录：未实现，暂无运行验证；实际开发时先拆分规格并明确异常反馈。

## 差异与验证待办

- 新补 AGENTS.md，保留实际 master 分支；lib/ 在本仓库是已跟踪产物，文档任务不运行构建去改写它。
- 原生 sidebar store、隐藏锚点及多会话 UI 本次仅核对源码，未做 GUI 回归。

## 规格变更记录

- 2026-10-03：首次从现行文档、实现和现有测试建立功能基线；仅修改维护文档，未变更 API、存储或运行逻辑。
