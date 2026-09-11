# dsh-better-sidebar-controller

> **An Agent control layer for [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar):**
> let the DSH Agent drive the file workspace by natural language.
>
> **一个让 DSH Agent 用自然语言控制 better-sidebar 文件工作区的插件。**

`dsh-better-sidebar-controller` 是 `dsh-better-sidebar` 的 **Agent 控制层**：它不重新实现文件树、
标签页或编辑器 UI，而是通过一组稳定的小工具（Tools）与一份技能（Skill），把 better-sidebar 的既有
能力暴露给 DSH Agent。用户说「打开今天的会议纪要」「切到项目计划」「回到刚才那个文件」「展开 docs」，
Agent 就能驱动侧边栏，而且与用户用鼠标操作看到的状态完全一致。

`dsh-better-sidebar-controller` is the **Agent control layer** for `dsh-better-sidebar`. It does not
reimplement the file tree, tabs, or editor UI. Instead, it exposes better-sidebar's existing
capabilities through a stable set of small tools and a skill, so the DSH Agent can say
_"open today's meeting notes"_, _"switch to the project plan"_, _"go back to the previous file"_,
or _"expand docs"_ — and drive the sidebar while sharing exactly the same state the user sees
from mouse interactions.

## 特性 / Features

- **11 个明确小工具**（无万能 command 工具）：查看状态、开/关侧边栏、列目录、展开/收起文件夹、
  刷新文件树、打开/关闭/切换文件、回到上一个文件。11 focused tools (no kitchen-sink command tool).
- **统一结构化结果** `{ ok, code, message, ... }` + 明确错误码。Consistent structured results with
  explicit error codes.
- **状态双向同步**：鼠标与 Agent 操作共用 `current_file` / `previous_file` / `opened_files` /
  `expanded_folders` / `sidebar_visible` / `workspace_root`，按会话独立维护。Mouse and Agent share
  one state, maintained per session.
- **装插件即装技能**：host 端挂载时把打包的 `SKILL.md` 注册进 `ctx.skills`，无需手动复制。
  Installing the plugin also installs its skill (self-registered on `ctx.skills`).
- **better-sidebar 软依赖**：未安装时主机端照常加载。better-sidebar is a soft dependency.
- **零核心修改**：仅通过公开接口接入（anchor 标签 + `service.openFile/closeTab/activateTab`）。
  No core modifications — public APIs only.

## 安装 / Installation

前置 / Prerequisites：**DSH 0.1.2-rc.1+** 与 **dsh-better-sidebar v0.18+**。

**从 npm 安装（正式发布） / From the npm registry (release):**

```bash
dsh plugin --profile web add dsh-better-sidebar-controller@latest
```

**直接从 GitHub 安装（无需 npm 账号） / From GitHub directly (no npm account needed):**

```bash
dsh plugin --profile web add "github:irvingzhang0512/dsh-better-sidebar-controller"
```

两种方式都是一条命令：插件 + 它自带的 SKILL 一起装好。插件主机端挂载时会把
`skills/sidebar-controller/SKILL.md` 注册到 DSH 技能注册中心（`ctx.skills`），
所以 **装插件 = 技能自动可用**，无需手动复制任何文件。

Either command installs the plugin **and** its bundled skill in one step — the host half registers
`skills/sidebar-controller/SKILL.md` into the DSH skill registry (`ctx.skills`) at mount time, so
**installing the plugin installs the skill** — no manual copy.

> **旧版 DSH 兜底 / Fallback for older DSH**：若运行环境没有 `ctx.skills`（0.1.2-rc.1 之前），
> 请手动复制技能文件。If the runtime lacks `ctx.skills`, copy the skill manually:
> `copy skills\sidebar-controller\SKILL.md <dshHome>\profiles\web\.dsh\skills\sidebar-controller\SKILL.md`

## 工具列表 / Tools (11)

| 工具 Tool | 作用 Purpose |
| --- | --- |
| `get_sidebar_state` | 获取侧边栏/工作区状态（当前文件、上一文件、已打开文件、已展开文件夹…）Get sidebar/workspace state (current file, previous file, opened files, expanded folders…) |
| `show_sidebar` / `hide_sidebar` | 打开 / 隐藏侧边栏 Show / hide the sidebar |
| `list_files` | 列出目录内容（单层）List directory entries (one level) |
| `expand_folder` / `collapse_folder` | 展开 / 收起文件夹 Expand / collapse a folder |
| `refresh_tree` | 刷新文件树 Refresh the file tree |
| `open_file` | 打开文件（已打开则自动激活）Open a file (activates if already open) |
| `close_file` | 关闭文件（省略 path 则关当前文件）Close a file (omitting path closes the current file) |
| `activate_file` | 切换到已打开的文件 Switch to an already-open file |
| `reopen_previous_file` | 回到上一个文件 Re-open the previous file |

所有工具返回统一信封 `{ ok, code, message, ... }`；完整工具参考与错误码表见
[docs/tools.md](docs/tools.md)（中文）。

## 自然语言示例 / Natural Language Examples

| 你说 / You say | 工具调用 / Tool call |
| --- | --- |
| “我现在打开的是哪个文件” / “What file am I on?” | `get_sidebar_state()` |
| “有哪些文件开着” / “Which files are open?” | `get_sidebar_state()` |
| “打开侧边栏” / “Open the sidebar” | `show_sidebar()` |
| “把侧边栏关掉” / “Close the sidebar” | `hide_sidebar()` |
| “看看根目录有哪些文件” / “List the workspace root” | `list_files()` |
| “展开 docs” / “Expand docs” | `expand_folder(path: "docs")` |
| “刷新文件树” / “Refresh the file tree” | `refresh_tree()` |
| “打开今天的会议纪要” / “Open today's meeting notes” | `open_file(path: "meeting.md")` |
| “关闭当前文件” / “Close the current file” | `close_file()` |
| “切到项目计划” / “Switch to the project plan” | `activate_file(path: "plan.md")`（未打开则 `open_file`） |
| “回到刚才那个文件” / “Go back to the previous file” | `reopen_previous_file()` |

更多自然语言示例与状态行为说明见 [docs/usage.md](docs/usage.md)（中文）。

## 架构 / Architecture

```
自然语言 → DSH Agent → Skill → Tools(host) → Bridge(WS) → better-sidebar(client) → 文件树/标签页
                                        ↑ 状态回推（鼠标与 Agent 共用同一份状态）
natural language → DSH Agent → Skill → Tools(host) → Bridge(WS) → better-sidebar(client) → file tree/tabs
                                        ↑ state push-back (mouse and Agent share one state)
```

四层：**State**（从 better-sidebar 快照推导语义状态）→ **Bridge**（host ↔ 浏览器客户端 WebSocket，
命令下发/ack/状态回推/断线重放）→ **Tools**（11 个明确小工具）→ **Skill**（自然语言映射，随插件自注册）。
详细设计（桥接协议、投递/重放语义、`current_file`/`previous_file` 推导、设计决策 D1–D7、上游扩展建议）
见 [docs/architecture.md](docs/architecture.md)（中文）。

Four layers: **State** (semantic state derived from the better-sidebar snapshot) → **Bridge**
(host ↔ browser WebSocket: command dispatch, ack, state push-back, queue replay) → **Tools**
(11 focused tools) → **Skill** (natural-language mapping, self-registered with the plugin).
Detailed design is documented (in Chinese) in [docs/architecture.md](docs/architecture.md).

## 开发 / Development

```bash
npm install
npm run typecheck   # tsc 类型检查 type-check
npm run test        # vitest（128 个用例）128 tests
npm run build       # host 半 tsc 编译 + client 半 tsdown 浏览器 bundle host build + browser bundle
npm pack            # 发布前自验（先跑 build）pre-publish self-check (runs build)
```

> `lib/`（构建产物）**已提交进仓库**，因此无需 npm 也能用
> `dsh plugin add "github:irvingzhang0512/dsh-better-sidebar-controller"` 直接安装。
> 改动源码后请 `npm run build` 并把新的 `lib/` 一并提交。
>
> `lib/` (built artifacts) is **committed**, so git-based installs work without npm.
> After changing source, run `npm run build` and commit the updated `lib/`.

## 当前限制 / Current Limitations

- 显隐 / 展开 / 收起作用于**当前可见**的侧边栏（`panelOpen` / `expanded` 是活动会话单份状态）。
  Show/hide and expand/collapse act on the **currently visible** sidebar.
- 标签条上有一个空的 anchor 标签（获取 store 的最小侵入方案，见架构决策 D1）。
  An empty anchor tab sits in the tab strip (minimal-invasion way to reach the store; decision D1).
- 技能自注册依赖运行时的 `ctx.skills`（DSH 0.1.2-rc.1+）；更早版本需手动复制 SKILL.md。
  Skill self-registration needs the runtime `ctx.skills` (DSH 0.1.2-rc.1+); older versions need a
  manual SKILL.md copy.
- 不含 Structured Document 节点操作与语音输入（需求预留，当前版本不实现）。
  No Structured Document node operations or voice input (reserved for future versions).

## 文档 / Documentation

详细文档为中文（Detailed docs are in Chinese）：

- [docs/architecture.md](docs/architecture.md) — 架构与设计决策 Architecture & design decisions
- [docs/tools.md](docs/tools.md) — 工具与错误码参考 Tools & error-code reference
- [docs/usage.md](docs/usage.md) — 使用指南 User guide

## 许可 / License

[MIT](LICENSE)
