---
name: sidebar-controller
description: >-
  通过 dsh-better-sidebar-controller 的 11 个工具控制 better-sidebar 文件工作区：
  查看/打开/关闭侧边栏、查看文件树、展开/收起文件夹、打开/关闭/切换文件、回到上一个文件、刷新文件树。
  当用户说「打开某文件 / 切到某文件 / 关闭当前文件 / 回到刚才那个文件 / 展开某文件夹 / 列出文件 / 打开或关闭侧边栏 / 刷新文件树 / 我现在打开的是哪个文件」等意图时使用。
---

# sidebar-controller — 控制 better-sidebar 文件工作区

`sidebar-controller` 是 `dsh-better-sidebar` 的 Agent 控制层：你（Agent）通过它用自然语言
驱动侧边栏里的文件树、文件打开/关闭/切换，以及侧边栏显隐。所有操作与用户的鼠标操作共享同一份状态
（current_file / previous_file / 已打开文件 / 已展开文件夹），你看到的就是用户看到的。

## 何时使用

- 用户想**看**侧边栏/文件状态：打开的是哪个文件、有哪些文件开着、侧边栏开着吗。
- 用户想**操作**侧边栏：打开/关闭侧边栏、列出目录、展开/收起文件夹、打开文件、关闭文件、
  切换当前文件、回到上一个文件、刷新文件树。

## 工具清单（11 个，全部是明确的小工具）

| 工具 | 作用 | 典型自然语言 |
| --- | --- | --- |
| `get_sidebar_state` | 获取侧边栏/工作区状态（当前文件、上一个文件、已打开文件、已展开文件夹、是否显示、工作区根目录） | “我现在打开的是哪个文件”“有哪些文件开着”“侧边栏开着吗” |
| `show_sidebar` | 打开（显示）侧边栏 | “打开侧边栏”“把文件栏打开” |
| `hide_sidebar` | 关闭（隐藏）侧边栏 | “把侧边栏关掉” |
| `list_files` | 列出目录内容（单层；省略 path 则列出工作区根目录） | “看看有哪些文件”“列一下 docs 目录”“根目录有什么” |
| `expand_folder` | 在文件树中展开文件夹 | “展开 docs”“把会议资料文件夹打开” |
| `collapse_folder` | 在文件树中收起文件夹 | “收起 docs”“把 node_modules 收起来” |
| `refresh_tree` | 刷新文件树（重新读取工作区根目录） | “刷新文件树”“重新看看文件” |
| `open_file` | 打开文件（已打开则激活） | “打开今天的会议纪要”“打开 A.md” |
| `close_file` | 关闭文件（省略 path 则关闭当前文件） | “关闭当前文件”“把 A.md 关掉” |
| `activate_file` | 切换到已打开的文件标签页 | “切到项目计划”“切到那个文件” |
| `reopen_previous_file` | 重新打开上一个文件 | “回到刚才那个文件”“切回上一个文件” |

## 自然语言 → 工具映射示例

1. “帮我把 docs 文件夹展开” → `expand_folder(path: "docs")`
2. “打开 requirements.txt 看看” → `open_file(path: "requirements.txt")`
3. “切到项目计划.md” → 若该文件已打开用 `activate_file(path: "项目计划.md")`；未打开则 `open_file(path: "项目计划.md")`
4. “关闭当前文件” → `close_file()`（省略 path 即当前文件）
5. “回到刚才那个文件” → `reopen_previous_file()`
6. “现在打开的是哪个文件？” → `get_sidebar_state()`
7. “把侧边栏关掉” → `hide_sidebar()`
8. “看看根目录有哪些文件” → `list_files()`

## 关键约定（务必遵守）

### 路径
- `path` 参数支持**相对路径**（相对工作区根目录，例如 `docs/meeting.md`）或**绝对路径**。
- 路径会被校验并限制在工作区内；工作区外会返回 `PATH_OUTSIDE_WORKSPACE`。
- 不知道确切路径时，先用 `list_files()` 逐层查看；文件名可能是中文，尽量按用户原样使用。

### 当前文件 / 上一个文件（状态自动维护，无需你记）
- 切换文件时，`previous_file` 自动变成切换前的文件，`current_file` 变成新文件。
- “回到刚才那个文件”直接用 `reopen_previous_file()`，不要自己拼路径。

### 结果与重试
- 工具返回统一信封 `{ ok, code, message, ... }`：
  - `code: "OK"` — 成功。
  - `code: "QUEUED"` — 侧边栏当前不可见，操作已排队，会在 Sidebar 可见时自动应用；可如实告诉用户。
  - `code: "SIDEBAR_UNAVAILABLE"` — 该会话侧边栏尚未连接（多为未安装 dsh-better-sidebar 或从未打开过侧边栏），提示用户安装/打开侧边栏后重试。
  - 其他错误码（如 `FILE_NOT_FOUND` / `NOT_A_DIRECTORY` / `NOT_A_FILE` / `FILE_NOT_OPEN` / `NO_PREVIOUS_FILE`）按 message 如实转述即可。
- 打开文件失败（如路径不存在）时，先 `list_files()` 找对路径再重试，不要反复猜测。

### 边界
- 本 skill 只控制**文件工作区**：不编辑文件内容、不做搜索替换、不做 git 操作。
- 不打开文件夹窗口（打开文件夹请用 `expand_folder`）。
- 一切操作都作用于当前会话的侧边栏；切换会话后状态自动跟随。

## 工作流建议

1. 用户意图不明确时，先 `get_sidebar_state()` 了解当前状态（是否已打开、当前文件是什么）。
2. 操作路径不确定时，先 `list_files()` / `expand_folder` 确认，再 `open_file` / `activate_file`。
3. 需要“切回刚才那个文件”时，永远优先 `reopen_previous_file()`。
