# 现状技术契约索引

本文件区分当前公开接口与历史接缝，不产生新的功能决定。后续已确认实现需要同步受影响的技术／使用文档；原始需求、旧 SPEC 和历史交付证据继续只读。原 docs/architecture.md、docs/tools.md、docs/usage.md 本轮字节保持。

## 当前工具与字段

| 工具 | 输入 | 返回专属字段 |
|---|---|---|
| better_sidebar_open | target 必填，title 可选 | kind=file/folder/url、规范化 target、title、delivered、queued |
| open_file | path 必填，限工作区 | path、delivered、queued |
| get_sidebar_state | 无 | connected、state（离线 null） |
| show_sidebar / hide_sidebar | 无 | sidebarVisible、delivered、queued |
| list_files | path 可选，默认会话 cwd | path、entries、truncated |
| expand_folder / collapse_folder | path 必填 | path、expanded、delivered、queued |
| refresh_tree | 无 | rootPath、entries、truncated、delivered、queued |
| close_file | path 可选，默认当前 | path、delivered、queued |
| activate_file | path 必填且已打开 | path、delivered、queued |
| reopen_previous_file | 无 | path、delivered、queued |

统一 {ok,code,message,...}，不采用原需求示意 success/error。会话来自 Agent，不接受模型指定 sessionId。state 含 sidebarVisible/currentFile/previousFile/openedFiles/expandedFolders/workspaceRoot/fileCandidate/fileCandidateSource/updatedAt；文件空指针为 null，URL／目录／终端不计文件。entries 为 name/path/isDir/hidden/isSymlink/broken。单层目录先过滤后截断，目录优先名称排序。

打开开关 agentOpenTools；管理开关 pluginSettings['dsh-better-sidebar-controller:anchor'].agentControlTools。缺省均关，保留上游显式值。依赖未就绪或权威设置未读不注册；仅打开 2、仅管理 9、两者 12，上游自己的 sidebar_open 不计。每次执行、投递及重放再验权限，关闭只清理未执行队列，不关闭已开文件。

成功仅在客户端确认后 OK；无连接可排队时 QUEUED/ok=true/delivered=false/queued=true；确认 4 秒超时 BRIDGE_TIMEOUT/ok=false/delivered=true/queued=false；64 条满后第 65 条 QUEUE_FULL/ok=false/delivered=false/queued=false。网页接受不等于网页加载。分类前失败不伪造 kind 或 target，标题只是交给上游的建议。

错误：TOOL_DISABLED、SETTINGS_UNAVAILABLE、SIDEBAR_UNAVAILABLE、QUEUE_FULL、INVALID_TARGET、BRIDGE_TIMEOUT；保留 NO_AGENT、NO_SESSION、INVALID_PATH、PATH_OUTSIDE_WORKSPACE、FILE_NOT_FOUND、FS_ERROR、NOT_A_DIRECTORY、NOT_A_FILE、FILE_NOT_OPEN、NO_CURRENT_FILE、NO_PREVIOUS_FILE、INTERNAL_ERROR，协议保留 BRIDGE_NOT_CONNECTED、UNKNOWN_COMMAND。原文 FOLDER_NOT_FOUND 等示意非当前 API。

## 当前配置与宿主

includeHiddenEntries 缺省 true，maxListedEntries 缺省 1000、最小 1。有限值取整夹下限，非法或非有限回默认。保存仅改本字段，未知字段与其他插件偏好保留。宿主读取唯一有效上游所有者的持久 prefs；旧客户端 settings 镜像不再是授权来源，不能从旧架构段落恢复。

较新固定基线为 DSH 0.2.1-rc.2、Better Sidebar 0.28.0；Connection 原生鉴权、公开客户端地址与冷会话真实目录按 2026-10-17 兼容交付使用。纯文档迁移不刷新 peer、包版本或兼容标记。

## 展示和交付

包身份 dsh-better-sidebar-controller 保持。中文名称 Irving · 侧边栏控制工具，英文 Irving · Sidebar Control Tools；实际双语描述来自本包 locale/en.json 与 locale/zh.json 的 meta.description（本轮不改资源），必须与既有确认文案及固定包一致。当前完整修订 0.2.1-rc.2+rev.1；独立包与办公套件不能重复组装，套件不改变条目 ID、配置和业务资料。

现行具体接缝与使用说明仍见 [架构](../docs/architecture.md)、[工具参考](../docs/tools.md)、[使用指南](../docs/usage.md)，其中历史／待定内容按 [迁移表](MIGRATION.md) 解释，不构成另一份活动规格。
