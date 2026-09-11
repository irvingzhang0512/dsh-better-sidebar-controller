# 架构说明（Architecture）

`dsh-better-sidebar-controller` 是 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)
的 **Agent 控制层**：它不重新实现文件树、标签页或编辑器 UI，而是把 better-sidebar 的既有能力
以「一组稳定的工具 + 一份 Skill」暴露给 DSH Agent，让用户用自然语言控制侧边栏文件工作区。

```
用户自然语言
   │
   ▼
DSH Agent ──加载──► Controller Skill (skills/sidebar-controller/SKILL.md)
   │                    （自然语言 → 工具调用 的映射）
   ▼
Controller Tools（11 个，host 半，src/host/tools.ts）
   │                    （结构化结果 + 错误码；路径校验与工作区围栏）
   ▼
Bridge（host 半 src/host/bridge-server.ts ↔ client 半 src/client/index.ts）
   │                    （WebSocket + 命令队列/重放 + 状态回推）
   ▼
better-sidebar 服务（ctx.betterSidebar：openFile / closeTab / activateTab / registerTab…）
   │                    （用户鼠标操作与 Agent 操作共用同一份状态）
   ▼
文件树 / 标签页 / 编辑器
```

## 分层与模块边界

| 层 | 位置 | 职责 |
| --- | --- | --- |
| State | `src/shared/derive.ts` + `src/host/controller-state.ts` | 从 better-sidebar 快照推导语义状态（当前文件 / 上一个文件 / 已打开文件 / 已展开文件夹 / 侧边栏显隐），并维护 host 侧每会话镜像 |
| Bridge | `src/host/bridge-server.ts`、`src/host/bridge-socket.ts`、`src/shared/wire.ts`、`src/client/index.ts` | host ↔ 浏览器客户端的双向通道：命令下发、ack、状态回推、断线重连、队列重放 |
| Tools | `src/host/tools.ts` | 11 个明确的、单一职责的工具（无万能 command 工具） |
| Skill | `src/host/skill-registration.ts` + `skills/sidebar-controller/SKILL.md` | **自注册技能**：host 挂载时把打包的 SKILL.md 注册进 `ctx.skills`，装插件即装技能；SKILL.md 仍是唯一事实源（自然语言 → 工具映射与约定） |
| 支撑 | `src/host/paths.ts`、`src/host/fs-tree.ts`、`src/host/trust-fence.ts`、`src/context-types.ts` | 路径解析/围栏、目录列举、信任围栏、结构镜像类型 |

约束：代码与 API 使用英文命名；文档全部为中文；本插件 **不包含** Structured Document
节点操作能力（需求 §21 的后续版本），当前版本只做文件工作区控制。

## 双半（host + client）形态

DSH 插件以 cordis 插件包发布。本插件拆成两半，通过 `dsh.bundle.patch`（`cordis.patch.yml`）
与 `dsh.client` 声明挂入 profile：

- **host 半**（`src/index.ts`）：`inject = ['tools','webServer','sessions','webRuntime']`。
  - 注册 11 个工具；
  - 在 `/sidebar-controller/ws` 注册 HTTP Upgrade 端点（WebSocketServer, `noServer` 模式）；
  - 维护每会话的 ControllerState 镜像；
  - 通过 `ctx.sessions.get(id).header.cwd` 解析会话工作区根目录（回退 `process.cwd()`）。
- **client 半**（`src/client/index.ts`）：`inject = ['betterSidebar']`（**软依赖**：
  better-sidebar 未安装时该半永远不激活，host 半照常工作）。
  - 订阅 `service.subscribeState`，把每次快照推导出的语义状态推给 host；
  - 为当前活动会话建立 WS 连接，接收并执行工具命令，回传 ack；
  - 通过隐藏 anchor 标签页捕获 `SidebarStore`（见下文设计决策 D1）。

## 状态模型（4.1 的落地）

Controller State（host 镜像，工具返回）：

```ts
{
  sessionId, sidebarVisible,
  currentFile: string | null,      // 4.2：无选中文件时为 null
  previousFile: string | null,
  openedFiles: string[],           // 已打开文件（去重，按打开顺序）
  expandedFolders: string[],       // 已展开文件夹（绝对路径）
  workspaceRoot: string | null,
  connected: boolean, updatedAt: number
}
```

**current_file / previous_file 推导规则**（`deriveFileContext`，纯函数，client 权威，
完全满足 §4.3 的 meeting → project → source → meeting 示例）：

- `current === null`（关闭当前文件）：`previous = 原 current ?? 原 previous`；
- `current === 原 current`（当前文件未变）：两个字段都不动；
- 其他情况（切到新文件）：`previous = 原 current ?? 原 previous`。

所有鼠标操作（打开、关闭、激活、切标签）都经过 `subscribeState` 进入同一推导，因此
**用户与 Agent 看到的是同一份 current/previous**（需求 2.2）。

`opened_files` 来自对 split 树 + 底部面板 + 浮动窗口的遍历；`expanded_folders` 直接取
`state.expanded`。浏览器侧每次「语义变化」才推送（面板宽度变化等不刷屏），host 侧每会话
独立维护镜像，断线时保留最后已知状态并标记 `connected: false`。

## 桥接协议（Bridge）

- 端点：`/sidebar-controller/ws?sessionId=<会话id>`，浏览器信任围栏与 `/api` 网关一致
  （Host-header 回环 + `trustedHosts` + Origin 同源，见 `trust-fence.ts`）。
- client → host：`hello`（附加即重放队列）、`state`（语义状态回推）、`command-result`（ack）。
- host → client：`command { id, command }`。
- **投递语义**（镜像 better-sidebar `sidebar_open` 的 consume-on-send + replay）：
  - 有连接：立即下发，等待 ack（默认 4s，超时返回 `BRIDGE_TIMEOUT`）；
  - 无连接：命令入队（有界 64 条），工具立即返回 `{ ok: true, code: 'QUEUED' }`，
    下一次该会话的客户端 attach（hello）时按序重放；
  - 客户端执行成功回 `OK`，失败回具体错误码（如 `FILE_NOT_OPEN`）。
- 协议编解码集中在一处（`src/shared/wire.ts`），防御式校验，畸形消息丢弃不杀连接。

## 工具如何操作 better-sidebar（能力映射）

| 工具 | 实现通道 | 说明 |
| --- | --- | --- |
| `get_sidebar_state` | 读 host 镜像；若已连接先发 `sync_state` 强制刷新 | 保证回答不陈旧 |
| `show_sidebar` / `hide_sidebar` | `store.reduce(s => ({...s, panelOpen: true/false}))` | 见 D1 |
| `expand_folder` / `collapse_folder` | `store.reduce` 增删 `state.expanded` | 作用于当前可见 Sidebar（见 D3） |
| `refresh_tree` | `window.dispatchEvent(new Event('dsh-sidebar:refresh-files'))` + host 重列根目录 | better-sidebar 文档化的集成点 |
| `open_file` | `service.openFile(scope, absPath)` | 已打开则自动聚焦（per-path 去重） |
| `close_file` | 扫描快照找 tab → `service.closeTab(tab.id)` | 支持 splits / bottomSplits / floats |
| `activate_file` | 同上 → `service.activateTab(tab.id)` | 仅对已打开文件生效 |
| `reopen_previous_file` | 用镜像里的 `previous_file` 走 `open_file` | 永不自行拼路径 |
| `sync_state` | 客户端重算并回推状态 | 内部命令，不暴露为工具 |

所有路径参数：相对路径按会话 cwd 解析，绝对路径直用（含 WSL 投影）；`realpath` 规范化 +
工作区包含校验（`resolveWorkspaceTarget` / `resolveLexicalTarget`），越界一律
`PATH_OUTSIDE_WORKSPACE`。目录列举（`fs-tree.ts`）自包含复刻 better-sidebar 语义：
opendir 流式、目录优先 + 大小写不敏感排序、隐藏点前缀标记、符号链接探测、行数上限截断。

## 会话作用域

- 工具通过 `exec.agent.session.id` 绑定调用会话（模型永远不传 sessionId）。
- cwd / workspace_root 由 host 从 session store 解析。
- **打开/关闭/激活**通过 `service.openFile/closeTab/activateTab` 的 scope 支持任意会话；
  **显隐/展开/收起**作用于当前可见的 Sidebar（见 D3）。

## 错误码

`OK / QUEUED / BRIDGE_NOT_CONNECTED / BRIDGE_TIMEOUT / SIDEBAR_UNAVAILABLE /
NO_AGENT / NO_SESSION / INVALID_PATH / PATH_OUTSIDE_WORKSPACE / FILE_NOT_FOUND /
FS_ERROR / NOT_A_DIRECTORY / NOT_A_FILE / FILE_NOT_OPEN / NO_CURRENT_FILE /
NO_PREVIOUS_FILE / UNKNOWN_COMMAND / INTERNAL_ERROR`

工具结果统一信封：`{ ok, code, message, ...工具专属字段 }`，另有纯文本 render 投影
（结构化结果与展示分离，约定 C4/C10）。所有「业务失败」返回结构化结果而不是 throw；
参数校验错误（如缺 `path`）由工具运行时（ToolArgsError）负责。

## 设计决策记录

### D1. 通过隐藏 anchor 标签页获取 store（最小侵入，无核心修改）

better-sidebar 没有公开「改 `state.expanded` / `panelOpen`」的 service 方法；store 实例
只通过组件 props 暴露。本插件注册一个 `hidden + single` 的 anchor 标签
（`id: 'dsh-better-sidebar-controller:anchor'`），其 component 挂载时捕获 `props.store`，
然后用 `store.reduce` 修改 expanded / panelOpen —— 全程只使用**公开**的
`registerTab` API，未修改 better-sidebar 任何核心代码。

代价（已接受并文档化）：标签条上会有一个渲染为空的 pill（anchor 标签）。会话激活时自动打开，
会话内常驻；隐藏仅表示不出现在「+」菜单，标签条本身没有按标签隐藏的机制（v0.18.0）。

**上游扩展建议**：给 `BetterSidebarService` 增加 `setExpanded(paths)` / `setPanelOpen(open)`
（或通用的 `reduce`），即可让本插件在后续版本丢弃 anchor。

### D2. QUEUED 语义（离线操作的确定性）

工具在客户端未连接时**不失败**，而是入队并返回 `QUEUED`（真实世界：文件打开这类操作
在侧边栏下次可见时自动落地，和 `sidebar_open` 一致）。消息里明确告知「已排队，将在
Sidebar 可见时自动应用」。这是需求「打开/关闭/展开」在界面不可见时最友好的行为。

### D3. 显隐/展开/收起作用于当前可见 Sidebar

`panelOpen` 与 `expanded` 是**单份**活动会话状态，没有按会话区分（与标签页不同）。
因此这三个命令天然只作用于当前可见的 Sidebar；跨会话的打开/关闭/激活则用 service scope
实现。文档中如实标注该限制。

### D4. host 侧自包含实现（不 import better-sidebar 内部模块）

better-sidebar 发布物不导出 `fs-tree` / `path-security` / `trust-fence`（只有 src/ 内部
文件，运行时不可 import）。本插件在 host 半**自包含复刻**了同语义实现（`fs-tree.ts`、
`paths.ts`、`trust-fence.ts`），并注明与上游逐条对齐；client 半只 `import type`
`dsh-better-sidebar/client/service`（类型在编译期被擦除，不产生运行时依赖）。

### D5. sync_state：让「读状态」不陈旧

`get_sidebar_state` 在客户端已连接时先发一个内部 `sync_state` 命令，等 ack 后读镜像，
保证返回的就是当前状态；未连接时读镜像（可能为 `SIDEBAR_UNAVAILABLE`）。

### D6. 结构化错误而非 throw

大多数 DSH 工具约定「失败就 throw」。本插件把业务失败（路径越界、文件未打开、无上一
文件等）**返回为带明确错误码的结构化结果**，让模型拿到机器可读的错误而不仅是错误文本；
只有参数校验失败走运行时 ToolArgsError。两种失败模型在 SKILL 里都有对应话术。

### D7. 技能自注册（装插件即装技能）

需求要求「提供可工作的 SKILL.md」，但把技能做成第二个手动安装步骤（复制到 skills 目录）
对发布和安装都很别扭。DSH 0.1.2-rc.1+ 的 `dsh-skill` 运行时提供 `ctx.skills` 注册中心，
其中 `ctx.skills.register(skill)` 就是为插件在 `apply()` 期间注册技能设计的：

- host 半新增 `inject: ['skills']`；挂载时读取包内 `skills/sidebar-controller/SKILL.md`
  （`skill-registration.ts` 解析 YAML frontmatter：name / description / whenToUse，
  支持 `>-` 折叠块），把它注册为 `source: 'bundled'`、`provider: 'dsh-better-sidebar-controller'`
  的运行时技能，缺省 invocation = 模型与用户双面可用。
- SKILL.md 仍是**唯一事实源**（人写的完整映射/约定/话术），注册只做「读文件 → 解析 → 注册」，
  不复制、不生成。`files` 已包含 `skills/`，发布包自带该文件。
- 挂载采用 cordis effect（卸载时自动反注册），文件读取是异步但 teardown 同步且带 disposed
  竞态保护；`ctx.skills` 缺失时（旧版运行时）优雅跳过，主机端其余功能不受影响
  （`dsh-skill` 是 optional peer，测试里同样提供 stub 断言注册发生）。
- 结果：**`dsh plugin --profile web add dsh-better-sidebar-controller` 一条命令，插件 + 技能
  一次装好**，Agent 技能目录自动出现 `sidebar-controller`。手动复制仅作为旧版 DSH 的兜底。

与此相对，`dsh-skill-filesystem` 提供的是文件系统技能源（项目 `.dsh/skills`、用户
`<dshHome>/skills`、`customSkillDirs`、`DSH_BUNDLED_SKILL_DIR` 等发现根）——对本插件
无必要，反而引入「技能与包分开管理」的复杂度。

## 测试策略

- `tests/shared/derive.spec.ts`：current/previous 推导、快照投影、tab 查找（纯函数）。
- `tests/shared/wire.spec.ts`：协议编解码往返 + 畸形输入拒绝。
- `tests/host/bridge.spec.ts`：投递/队列/重放/超时/镜像合并（假发送者 + 注入时钟）。
- `tests/host/bridge.integration.spec.ts`：真实 `ws` 端口上的端到端往返。
- `tests/host/paths.spec.ts` / `fs-tree.spec.ts`：临时目录上的路径与列举语义。
- `tests/host/tools.spec.ts`：11 个工具的结构化结果与错误码（假 bridge + 临时目录）。
- `tests/register.spec.ts`：cordis Context 挂载冒烟（工具齐全、路由注册）。
- `tests/skill.spec.ts`：SKILL.md 覆盖全部工具与自然语言意图（契约测试）。

## 未来方向（当前版本不做）

- Structured Document 节点操作（需求 §21 预留接口，不实现）。
- 语音 STT 输入（Skill 层保持「自然语言 → 工具」形状，天然兼容，不实现）。
- 按会话区分 `expanded` / `panelOpen` 的完整隔离（依赖上游 D1 建议）。
