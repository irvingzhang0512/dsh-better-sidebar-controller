# 使用指南（Usage）

## 安装

前置：已安装 [DSH](https://github.com/omdsh-dev/DSH)（本插件面向 0.1.2-rc.1+）与
[dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) v0.18+。

```bash
# 1. 安装插件到目标 profile（web 示例）
dsh plugin --profile web add dsh-better-sidebar-controller@latest

# 2. 把 Skill 复制到该 profile 的 skills 目录（让 Agent 学会自然语言 → 工具）
#    目标目录示例：<dshHome>/profiles/web/.dsh/skills/sidebar-controller/SKILL.md
```

重启 DSH 后即可使用。卸载：

```bash
dsh plugin --profile web remove dsh-better-sidebar-controller
```

> better-sidebar 是**软依赖**：未安装时本插件的主机端照常工作，但会话侧边栏无法连接，
> 写操作会返回 `QUEUED`，`get_sidebar_state` 返回 `SIDEBAR_UNAVAILABLE`。

## 自然语言示例（Agent 自动映射为工具调用）

| 你说 | 工具调用 |
| --- | --- |
| “现在打开的是哪个文件？” | `get_sidebar_state()` |
| “有哪些文件开着？” | `get_sidebar_state()` |
| “打开侧边栏 / 把文件栏打开” | `show_sidebar()` |
| “把侧边栏关掉” | `hide_sidebar()` |
| “看看根目录有哪些文件” | `list_files()` |
| “列一下 docs 目录” | `list_files(path: "docs")` |
| “展开 docs” | `expand_folder(path: "docs")` |
| “把 node_modules 收起来” | `collapse_folder(path: "node_modules")` |
| “刷新文件树” | `refresh_tree()` |
| “打开今天的会议纪要” | `open_file(path: "meeting.md")` |
| “关闭当前文件” | `close_file()` |
| “把 A.md 关掉” | `close_file(path: "A.md")` |
| “切到项目计划” | `activate_file(path: "项目计划.md")`（未打开则 `open_file`） |
| “回到刚才那个文件” | `reopen_previous_file()` |

## 状态行为说明

- **current_file / previous_file**：由系统自动维护。例如 会议纪要 → 项目计划 → 源码 →
  回到会议纪要，`previous_file` 始终是「切换之前的那个文件」。`reopen_previous_file`
  永远用系统记录的上一个文件，不要自行拼路径。
- **current_file 为 null**：当前没有选中的文件（例如焦点在终端标签页上）。
- **鼠标与 Agent 同步**：你在侧边栏里用鼠标打开/切换文件，Agent 的 `get_sidebar_state`
  立刻能看到；Agent 通过工具打开/切换文件，侧边栏 UI 同步变化。同一份状态，双向一致。

## 边界与限制（当前版本）

1. **显隐 / 展开 / 收起作用于当前可见的侧边栏**：`panelOpen` 与 `expanded` 是活动会话的
   单份状态；跨会话的「打开/关闭/激活文件」不受影响（通过 service scope 支持）。
2. **anchor 标签**：为捕获 store，侧边栏标签条上会有一个空的小标签（`dsh-better-sidebar-controller:anchor`）。
   这是接入 better-sidebar 公开 API 的最小侵入方案，不影响任何功能；上游支持
   `setExpanded` 后即可移除（见 docs/architecture.md 决策 D1）。
3. **本插件不做**：文件内容编辑、搜索、git 操作、Structured Document 节点操作、语音输入。
4. **刷新时机**：外部（如命令行）新建文件后，用 `refresh_tree()` 刷新文件树。
5. **相对路径**始终相对**当前会话的工作区根目录**，而不是 DSH 进程目录。

## 常见问题

**Q：工具返回 `QUEUED` 是什么意思？**
A：该会话的侧边栏当前不可见（未打开或未连接）。命令已排队，侧边栏下次可见时自动生效；
无需重试。

**Q：`SIDEBAR_UNAVAILABLE`？**
A：该会话从未连接过侧边栏。请确认已安装 dsh-better-sidebar、打开过侧边栏，再试。

**Q：`activate_file` 提示 `FILE_NOT_OPEN`？**
A：文件尚未打开，先用 `open_file` 打开，或直接 `open_file`（已打开会自动激活）。

**Q：路径报 `PATH_OUTSIDE_WORKSPACE`？**
A：路径超出了会话工作区，无法访问；请改用工作区内的路径。
