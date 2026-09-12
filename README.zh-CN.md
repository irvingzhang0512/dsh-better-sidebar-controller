[English](README.md) | **简体中文**

# dsh-better-sidebar-controller

**dsh-better-sidebar 的 Agent 控制层。**

本插件不重新实现文件树、标签页或编辑器 UI，而是通过一组稳定的小工具（Tools）与一份技能（Skill），把 better-sidebar 的既有能力暴露给 DSH Agent：你说「打开今天的会议纪要」「切到项目计划」「回到刚才那个文件」「展开 docs」，Agent 就能驱动侧边栏文件工作区，而且与用户用鼠标操作看到的状态完全一致。

## 特性

- **11 个明确小工具（无万能 command 工具）**：`get_sidebar_state`、`show_sidebar` / `hide_sidebar`、`list_files`、`expand_folder` / `collapse_folder`、`refresh_tree`、`open_file`、`close_file`、`activate_file`、`reopen_previous_file`。每个工具都单一职责、小而明确，刻意不做 `workspace(action)` 之类的万能工具。
- **统一结构化结果**：所有工具返回统一信封 `{ ok, code, message, ... }` 加工具专属字段，并带明确错误码（`OK`、`QUEUED`、`SIDEBAR_UNAVAILABLE`、`PATH_OUTSIDE_WORKSPACE`、`FILE_NOT_OPEN`、`NO_PREVIOUS_FILE` 等）。业务失败以结构化结果返回而不是抛异常，模型总能拿到机器可读的答案。
- **状态双向同步**：鼠标与 Agent 操作共用同一份按会话独立维护的状态——`current_file` / `previous_file` / `opened_files` / `expanded_folders` / `sidebar_visible` / `workspace_root`。Agent 看到的和用户看到的一致，双向皆然。
- **装插件即装技能**：host 端挂载时把打包的 `skills/sidebar-controller/SKILL.md` 注册进 `ctx.skills`，技能随插件一起装好，无需手动复制任何文件。
- **better-sidebar 软依赖**：未安装时主机端照常加载。写操作返回 `QUEUED`（已排队，侧边栏可见时自动应用），`get_sidebar_state` 返回 `SIDEBAR_UNAVAILABLE`。
- **零核心修改**：仅通过公开接口接入——隐藏 anchor 标签页（公开 `registerTab`）+ `service.openFile` / `closeTab` / `activateTab`。
- **anchor 标签不抢占激活视图**：anchor 标签在后台打开，每个页面加载最多创建一次（store 捕获是全局的），打开后会立即恢复此前的激活标签，不会抢走用户当前的激活视图。

## 安装

前置条件：[DSH](https://github.com/omdsh-dev/DSH) 0.1.2-rc.1+（技能自注册需要）与 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) v0.18+（先装它——本插件控制的就是它）。

从 npm 安装（正式发布）：

```bash
dsh plugin --profile web add dsh-better-sidebar-controller@latest
```

或直接从 GitHub 安装（无需 npm 账号；预构建的 `lib/` 已提交进仓库）：

```bash
dsh plugin --profile web add "github:irvingzhang0512/dsh-better-sidebar-controller"
```

两条命令都是「插件 + 自带技能」一次装好：host 端挂载时会把 `skills/sidebar-controller/SKILL.md` 注册进 DSH 技能注册中心（`ctx.skills`），Agent 技能目录自动出现 `sidebar-controller`，无需手动复制。

> **旧版 DSH 兜底**：若运行环境没有 `ctx.skills`（0.1.2-rc.1 之前），请手动复制技能：
> `cp skills/sidebar-controller/SKILL.md <dshHome>/profiles/web/.dsh/skills/sidebar-controller/SKILL.md`

安装后重启 DSH 即可使用。卸载（技能随插件一起移除）：

```bash
dsh plugin --profile web remove dsh-better-sidebar-controller
```

## 快速使用（自然语言示例）

| 你说 | 工具调用 |
| --- | --- |
| “我现在打开的是哪个文件” / “有哪些文件开着” | `get_sidebar_state()` |
| “打开侧边栏” | `show_sidebar()` |
| “把侧边栏关掉” | `hide_sidebar()` |
| “看看根目录有哪些文件” / “列一下 docs 目录” | `list_files()` / `list_files(path: "docs")` |
| “展开 docs” | `expand_folder(path: "docs")` |
| “把 node_modules 收起来” | `collapse_folder(path: "node_modules")` |
| “刷新文件树” | `refresh_tree()` |
| “打开今天的会议纪要” | `open_file(path: "meeting.md")` |
| “关闭当前文件” | `close_file()` |
| “切到项目计划” | `activate_file(path: "项目计划.md")`（未打开则 `open_file`） |
| “回到刚才那个文件” | `reopen_previous_file()` |

## 工具一览（11 个）

| 工具 | 作用 |
| --- | --- |
| `get_sidebar_state` | 获取侧边栏/工作区状态：`sidebarVisible`、`currentFile`、`previousFile`、`openedFiles`、`expandedFolders`、`workspaceRoot`。客户端已连接时先强制同步一次再回答；该会话侧边栏从未连接过时 `state` 为 `null`。 |
| `show_sidebar` / `hide_sidebar` | 打开 / 隐藏侧边栏面板。 |
| `list_files` | 列出目录内容（单层；`path` 省略时列出工作区根目录）。返回 `entries[]`：`name` / `path` / `isDir` / `hidden` / `isSymlink` / `broken`。 |
| `expand_folder` / `collapse_folder` | 在文件树中展开 / 收起文件夹（`path` 必填；目标必须是目录，否则 `NOT_A_DIRECTORY`）。 |
| `refresh_tree` | 重新读取工作区根目录并重载已展开目录（例如外部新建文件后刷新）。 |
| `open_file` | 打开文件；已打开则自动激活。目标必须是文件，否则 `NOT_A_FILE`。 |
| `close_file` | 关闭文件标签页；省略 `path` 时关闭当前文件（无当前文件时返回 `NO_CURRENT_FILE`）。 |
| `activate_file` | 切换到已打开文件的标签页（未打开返回 `FILE_NOT_OPEN`）。 |
| `reopen_previous_file` | 重新打开 `previous_file`（当前文件之前的那个文件；没有时返回 `NO_PREVIOUS_FILE`）。 |

所有 `path` 参数按调用会话的工作区根目录解析相对路径（也接受绝对路径），经 `realpath` 规范化并限制在工作区内，越界一律返回 `PATH_OUTSIDE_WORKSPACE`。所有工具都返回 `{ ok, code, message, ... }` 信封；完整工具参考与错误码表见 [docs/tools.md](docs/tools.md)。

## 技能

插件自带的 `sidebar-controller` 技能是面向 Agent 的一侧：把「打开某文件 / 切到那个文件 / 回到刚才那个文件」等自然语言映射到 11 个工具，并写明约定（相对/绝对路径、`current_file` / `previous_file` 自动维护、`QUEUED` 语义、失败重试建议）。技能是自然语言 → 工具映射的唯一事实源；host 挂载时自动注册进 `ctx.skills`，装插件即装技能。

## 工作原理

```
自然语言 → DSH Agent → Skill → Tools(host) → Bridge(WebSocket) → better-sidebar(client) → 文件树/标签页
                                        ↑ 状态回推（鼠标与 Agent 共用同一份状态）
```

四层结构：

- **State**：从 better-sidebar 快照推导语义状态（`current_file` / `previous_file` / `opened_files` / `expanded_folders` / `sidebar_visible` / `workspace_root`），host 端按会话独立维护镜像。由于快照能观察到每一次鼠标操作，用户操作与 Agent 操作共用同一份状态。
- **Bridge**：host ↔ 浏览器客户端的 WebSocket 通道（`/sidebar-controller/ws`）：命令下发、ack、状态回推、队列重放。会话侧边栏不可见时写命令入队（有界），下次 attach 时按序重放。
- **Tools**：`src/host/tools.ts` 中的 11 个明确小工具，统一返回结构化信封 `{ ok, code, message, ... }`。
- **Skill**：随插件打包的 `sidebar-controller` 技能，host 挂载时自动注册进 `ctx.skills`。

设计决策（D1–D7）记录在 [docs/architecture.md](docs/architecture.md)。

## 文档链接

- [docs/architecture.md](docs/architecture.md) — 架构与设计决策（State → Bridge → Tools → Skill，决策 D1–D7）
- [docs/tools.md](docs/tools.md) — 工具与错误码参考
- [docs/usage.md](docs/usage.md) — 使用指南（示例、状态行为、常见问题）

## 许可证

[MIT](LICENSE)
