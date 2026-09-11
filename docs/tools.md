# 工具参考（Tools）

本插件提供 **11 个明确的小工具**（刻意不做万能 `workspace(action)` 工具）。每个工具返回
统一信封，结构如下：

```jsonc
{
  "ok": true,             // 是否成功
  "code": "OK",           // 状态 / 错误码（见下表）
  "message": "文件已打开。", // 人类可读说明
  // ...工具专属字段
}
```

所有 `path` 参数：相对路径按会话工作区根目录（cwd）解析，也接受绝对路径；路径会被
规范化并限制在工作区内。

## 工具清单

### 1. `get_sidebar_state`
- 参数：无。
- 返回：`connected`、`state`（`sidebarVisible` / `currentFile` / `previousFile` /
  `openedFiles` / `expandedFolders` / `workspaceRoot` / `updatedAt`；无值字段省略；
  未连接时 `state` 为 `null`）。
- 说明：回答「我现在打开的是哪个文件」「有哪些文件开着」「侧边栏开着吗」等状态类问题。
  客户端已连接时会先强制同步一次最新状态再回答。

### 2. `show_sidebar`
- 参数：无。返回：`sidebarVisible: true`。
- 说明：打开（显示）better-sidebar 侧边栏。

### 3. `hide_sidebar`
- 参数：无。返回：`sidebarVisible: false`。
- 说明：隐藏（关闭）侧边栏。

### 4. `list_files`
- 参数：`path?`（要列出的目录，相对或绝对；省略 = 工作区根目录）。
- 返回：`path`、`entries[]`（`name` / `path` / `isDir` / `hidden` / `isSymlink` /
  `broken`）、`truncated`。
- 说明：单层列举；目录优先、大小写不敏感排序；隐藏文件带 `hidden: true`。

### 5. `expand_folder`
- 参数：`path`（文件夹路径，相对或绝对）。
- 返回：`path`、`expanded: true`、`delivered` / `queued`。
- 说明：在文件树中展开文件夹；目标必须是目录，否则 `NOT_A_DIRECTORY`。

### 6. `collapse_folder`
- 参数：`path`。返回：`path`、`expanded: false`、`delivered` / `queued`。
- 说明：收起文件夹。

### 7. `refresh_tree`
- 参数：无。返回：`rootPath`、`entries[]`、`truncated`、`delivered` / `queued`。
- 说明：刷新文件树（重新读取工作区根目录，并让 Sidebar 重载已展开目录）。

### 8. `open_file`
- 参数：`path`（文件路径，相对或绝对）。
- 返回：`path`、`delivered` / `queued`。
- 说明：打开文件；**已打开则自动激活**。目标必须是文件，否则 `NOT_A_FILE`。

### 9. `close_file`
- 参数：`path?`（省略 = 关闭当前文件）。
- 返回：`path`、`delivered` / `queued`。
- 说明：关闭文件标签页；文件必须已打开，否则 `FILE_NOT_OPEN`（省略 path 且无当前文件时
  返回 `NO_CURRENT_FILE`）。

### 10. `activate_file`
- 参数：`path`。返回：`path`、`delivered` / `queued`。
- 说明：切换到（激活）**已打开**的文件标签页；未打开请先 `open_file`。

### 11. `reopen_previous_file`
- 参数：无。返回：`path`、`delivered` / `queued`。
- 说明：重新打开上一个文件（`previous_file`）。没有上一文件时返回 `NO_PREVIOUS_FILE`。

## 错误码表

| code | 含义 | 模型话术建议 |
| --- | --- | --- |
| `OK` | 成功 | — |
| `QUEUED` | 侧边栏当前不可见，操作已排队，可见时自动应用 | “侧边栏还没打开，操作已排队，稍后会生效。” |
| `BRIDGE_NOT_CONNECTED` | 桥未连接（保留码） | — |
| `BRIDGE_TIMEOUT` | 客户端未在 4s 内确认 | “侧边栏没有响应，请确认侧边栏已打开后重试。” |
| `SIDEBAR_UNAVAILABLE` | 该会话侧边栏尚未连接（多为未安装 better-sidebar 或从未打开过侧边栏） | “需要先打开侧边栏（或安装 dsh-better-sidebar）。” |
| `NO_AGENT` | 无法确定调用会话 | — |
| `NO_SESSION` | 无法确定会话工作目录 | — |
| `INVALID_PATH` | 路径无法解析或为空 | — |
| `PATH_OUTSIDE_WORKSPACE` | 路径在工作区之外 | “该路径在工作区之外，无法访问。” |
| `FILE_NOT_FOUND` | 路径不存在 | “先列一下目录确认路径。” |
| `FS_ERROR` | 文件系统读取失败 | — |
| `NOT_A_DIRECTORY` | 目标不是目录 | “这是一个文件，不是文件夹。” |
| `NOT_A_FILE` | 目标不是文件（是文件夹） | “这是文件夹，请用展开文件夹。” |
| `FILE_NOT_OPEN` | 文件未打开 | “该文件还没打开，先打开它。” |
| `NO_CURRENT_FILE` | 没有当前文件 | — |
| `NO_PREVIOUS_FILE` | 没有上一个文件 | — |
| `UNKNOWN_COMMAND` | 未知命令（保留码） | — |
| `INTERNAL_ERROR` | 内部错误 | — |

## 返回说明

- `delivered: true` 表示命令已送达 Sidebar 客户端；`queued: true` 表示已排队等待重放。
- 打开/关闭/激活/展开/收起/显隐/刷新 这 8 个写操作都带有投递状态，方便模型判断“是否已生效”。
- 所有结果同时有一个纯文本 render 投影（供 UI 展示），结构化 JSON 才是权威结果。
