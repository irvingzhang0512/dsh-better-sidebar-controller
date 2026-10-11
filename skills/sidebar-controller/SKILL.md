---
name: sidebar-controller
description: >-
  通过 better-sidebar 增强工具打开文件、文件夹窗口与 HTTP(S) 网页，管理侧栏显隐、目录树和文件标签。
  用户要求打开、关闭、切换、返回、列出文件、查询哪个文件或刷新文件树时使用。能力依赖 better-sidebar 与侧边卡片工具开关。
---

# sidebar-controller

## 调用规则


1. 先查看本轮真实可用工具，不能因技能列出了名称就假定已注册。缺 `better_sidebar_open/open_file` 时说明上游打开开关；缺查询/管理工具时说明管理开关；缺全部工具时还需核对 better-sidebar 与增强插件是否启用且兼容。不能借 shell、伪造工具或修改配置绕过工具开关。
2. 常规打开优先 `better_sidebar_open(target, title?)`。file/folder/http(s) 自动分类，不指定 sessionId；路径不明确且管理可用时先 `list_files` 找真实工作区路径。外部绝对路径由用户提供，增强打开不改变 cwd。
3. 文件夹窗口用增强打开，现有工作区树展开用 `expand_folder`，两者不混同。网页只支持 HTTP(S)；接受打开请求不代表网站成功加载。
4. `open_file(path)` 保留旧兼容语义，只接受工作区内文件。不要把其 PATH_OUTSIDE_WORKSPACE 当成增强打开也禁止外部文件；目录工具仍受工作区限制。
5. 切到已打开文件用 `activate_file`；尚未打开且打开工具可用时用增强打开。关闭用 `close_file`（不传 path 则当前文件）。工作区外文件仅在当前会话已打开清单中可关闭/切换，不能借此访问未知外部路径。
6. “回到刚才那个文件”用 `reopen_previous_file`，需两个开关都开；使用系统上一文件指针，不自行记忆或猜路径。网页、目录窗口与其他页面不计作当前/上一文件。
7. 状态问询优先 `get_sidebar_state`；管理关闭时不能为回答状态自行打开权限。内部工作台状态服务存在不代表模型拥有查询工具。
8. `OK` 表示客户端确认接受操作；`QUEUED` 如实说等待对应会话界面接入，不重复投递。`QUEUE_FULL` 表示未入队；`TOOL_DISABLED/SETTINGS_UNAVAILABLE/SIDEBAR_UNAVAILABLE` 按实际 message 说明，不能说“已排队”。
9. `BRIDGE_TIMEOUT` 表示结果未知。查询可用时先查文件状态并核对界面；查询不可用时请用户目视确认，或由用户决定开启管理，不能自动重开。网页/目录状态不在文件清单中，不能仅凭 openedFiles 中没有它判失败后重复开。
10. 只操作调用会话。未连接的后台会话等待其正确界面；不切换前台其他会话来伪装完成。文件内容编辑、Git、搜索替换与语音不属于本技能；不把 close_file 用来关闭网页或目录窗口。


## 工具清单与自然语言示例

打开：`better_sidebar_open`、`open_file`。管理：`get_sidebar_state`、`show_sidebar`、`hide_sidebar`、`list_files`、`expand_folder`、`collapse_folder`、`refresh_tree`、`close_file`、`activate_file`。两种能力：`reopen_previous_file`。

| 对 Agent 说 | 对应工具参数 | 需要的开关 |
|---|---|---|
| 「用侧边栏控制技能打开 docs/会议纪要.md」 | `better_sidebar_open(target: "docs/会议纪要.md")` | 打开 |
| 「在侧边栏打开 F:/资料/项目计划.md」 | `better_sidebar_open(target: "F:/资料/项目计划.md")` | 打开 |
| 「把 docs 文件夹作为一个窗口打开」 | `better_sidebar_open(target: "docs")` | 打开 |
| 「在侧边栏打开 https://example.com」 | `better_sidebar_open(target: "https://example.com")` | 打开 |
| 「现在打开的是哪个文件？有哪些文件开着？」 | `get_sidebar_state()` | 管理 |
| 「显示侧边栏」 | `show_sidebar()` | 管理 |
| 「隐藏侧边栏」 | `hide_sidebar()` | 管理 |
| 「列一下工作区根目录／docs 目录」 | `list_files()`／`list_files(path: "docs")` | 管理 |
| 「在文件树里展开 docs」 | `expand_folder(path: "docs")` | 管理 |
| 「收起文件树里的 docs」 | `collapse_folder(path: "docs")` | 管理 |
| 「我刚在外部新建了文件，刷新文件树」 | `refresh_tree()` | 管理 |
| 「关闭当前文件／把 docs/会议纪要.md 关掉」 | `close_file()`／`close_file(path: "docs/会议纪要.md")` | 管理 |
| 「切到已经打开的 docs/项目计划.md」 | `activate_file(path: "docs/项目计划.md")` | 管理 |
| 「回到刚才那个文件」 | `reopen_previous_file()` | 打开和管理 |
| 「用兼容工具打开工作区内的 docs/会议纪要.md」 | `open_file(path: "docs/会议纪要.md")` | 打开 |


## 完整流程

两个开关都开时：列出 docs → 增强打开会议纪要 → 查询状态 → 增强打开项目计划 → 切到会议纪要 → 切到项目计划 → 返回会议纪要 → 关闭当前文件 → 查询剩余文件。使用真实已存在的路径。打开侧边栏用 show_sidebar，刷新文件树用 refresh_tree。

具体参数和错误说明见 [使用指南](../../docs/usage.md)与[工具参考](../../docs/tools.md)。
