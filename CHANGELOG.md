# Changelog

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
