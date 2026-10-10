# Changelog

## 0.1.1 (2026-10-10)

### 修复

- **隐藏锚点标签泄漏成侧边栏空白页**（F007 预期「获取 store 后清理锚点」不变）：
  better-sidebar 0.19+ 在挂了原生右侧栏（`ctx.sidebarRight`）时会把 `openTab`
  改投到原生页面，锚点因此不在 `state.bottomSplits` 里；旧 `removeAnchor` 以
  `bottomSplits` 为前置条件，原生落点的锚点永远不会被关闭，表现为每次新开窗口／
  刷新后侧边栏多一个没有标题的空白标签页（旧版本遗留的锚点同样清不掉）。
  `removeAnchor` 现在无条件调用 `service.closeTab(ANCHOR_TAB_ID, scope)`——该调用
  对两种落点都安全（原生记录存在则关原生页面，否则退到底部树 reducer，未知 id
  严格 no-op），并且只有底部落点才做「恢复原活动标签 / 面板开合」的收尾。
  原生落点不再需要该收尾（公开 API 没有跨面板激活面），DSH 侧边栏自行收尾。

### 测试

- 新增 `tests/client-bundle.spec.ts`：在 `node:vm` 里直接执行 `lib/client.js`，
  校验 bundle 以包名注册、`apply` 挂载并注册隐藏锚点页，并覆盖两种落点的锚点
  清理（原生落点必须调用 `closeTab`；底部落点还要恢复原活动标签）。该用例在
  修复前对原生落点失败，是本次回归的保护网。

## 2026-10-03 补齐需求文档确认（不变更包版本）

- 功能任务先改规格与相关技术契约，用户明确确认该版文档后再开发；未确认不改对应源码／测试实现或运行配置，已确认同一版不重复询问。
- 新增语义差异重新确认；预期不变的 Bug 可直接修复。本次只修改维护文档。

## 2026-10-03 文档基线（不变更包版本）

- 新增 [当前功能规格](docs/SPEC.md)，建立功能与 Bug 两条开发入口，记录实现依据、现有验证入口和待办。
- 本次只修改维护文档，不变更公开 API、数据格式或运行逻辑；静态核对不代替产品测试及 GUI 兼容验证。


## 0.1.0 (2026-02-12)

Initial release。基于 [requirements.txt](./requirements.txt) 的需求规格实现 V0.1 范围。

### 新增

- **架构（State → Bridge → Tools → Skill）**
  - `State`：从 better-sidebar 快照推导语义状态（`current_file` / `previous_file` /
    `opened_files` / `expanded_folders` / `sidebar_visible` / `workspace_root`），
    鼠标操作与 Agent 操作共用同一份状态；`current_file` 无选中时为 `null`；
    `previous_file` 满足 meeting → project → source → meeting 切换语义。
  - `Bridge`：host ↔ 浏览器客户端的 WebSocket 通道（`/sidebar-controller/ws`），
    命令下发 + ack + 状态回推；无连接时命令入队并在客户端 attach 时重放（`QUEUED`）；
    断线保留最后已知状态并标记 `connected`。
  - `Tools`：11 个明确小工具（无万能 command 工具），统一结构化结果
    `{ ok, code, message, ... }` 与 18 个明确错误码；纯文本 render 投影；
    路径相对会话 cwd 解析 + realpath 规范化 + 工作区围栏。
  - `Skill`：`skills/sidebar-controller/SKILL.md` 自然语言 → 工具映射与约定；host 挂载时
    经 `ctx.skills.register` **自注册**（装插件即装技能，无需手动复制；旧版 DSH 可兜底手动安装）。
- **host 半**（`src/index.ts`）：工具注册、WS 端点、每会话状态镜像、信任围栏
  （Host 回环 + trustedHosts + Origin 同源）。
- **client 半**（`src/client/index.ts`）：订阅 `subscribeState` 回推状态；执行命令；
  通过隐藏 anchor 标签页经公开 `registerTab` API 捕获 store，用 `store.reduce`
  实现展开/收起/显隐（最小侵入，零核心修改）。
- **能力映射**：`open_file`→`service.openFile`（已打开自动聚焦）；`close_file` /
  `activate_file`→扫描 splits / bottomSplits / floats 后 `closeTab` / `activateTab`；
  `refresh_tree`→文档化 `dsh-sidebar:refresh-files` 事件。
- **文档与交付物**：README（中文）、CHANGELOG、LICENSE(MIT)、
  `docs/architecture.md`（含设计决策记录与上游扩展建议）、`docs/tools.md`、`docs/usage.md`。
- **测试**：128 个用例，覆盖推导/协议/桥投递与重放/真实 WS 集成/路径/文件树/
  工具契约/cordis 挂载（含技能自注册断言）/技能解析与加载/SKILL 契约。

### 已知限制（见 docs/architecture.md 决策 D1–D6）

- 显隐/展开/收起作用于当前可见 Sidebar（`panelOpen`/`expanded` 为活动会话单份状态）。
- 标签条上存在一个空 anchor 标签（接入公开 API 的最小侵入方案）。
- 技能自注册依赖运行时的 `ctx.skills`（0.1.2-rc.1+）；更早版本需手动复制 SKILL.md。
- 不含 Structured Document 节点操作与语音输入（需求预留，未实现）。
