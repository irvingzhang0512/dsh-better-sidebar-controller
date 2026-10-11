# 工具参考（Tools）

## 增强版目标工具契约

文档版：`sidebar-enhancement-20261011-v1`，用户已确认。对应 [SPEC F010–F013](SPEC.md#本次增强文档版与适用范围)及 [架构](architecture.md#增强控制层目标契约)。本版工具在 0.3.0 实施；验证见 [交付记录](VERIFICATION-0.3.0.md)。普通用户的 Agent 指令示例见 [使用指南](usage.md#操作分类与示例)。

### 注册与参数

| 工具 | 参数 | 门禁 | 路径/内容范围 |
|---|---|---|---|
| `better_sidebar_open` | `target: string` 必填，`title?: string` | 上游打开 | 文件、目录或 HTTP(S) 网页；允许外部绝对路径 |
| `open_file` | `path: string` 必填 | 上游打开 | 兼容文件打开，限工作区；旧参数/输出不改 |
| `get_sidebar_state` | 无 | 管理 | 调用会话文件状态，不把网页/目录计为文件 |
| `show_sidebar` | 无 | 管理 | 显示调用会话侧栏 |
| `hide_sidebar` | 无 | 管理 | 隐藏调用会话侧栏 |
| `list_files` | `path?: string` | 管理 | 工作区内单层目录；省略为会话工作区 |
| `expand_folder` | `path: string` 必填 | 管理 | 工作区内目录树展开 |
| `collapse_folder` | `path: string` 必填 | 管理 | 工作区内目录树折叠 |
| `refresh_tree` | 无 | 管理 | 刷新工作区树并返回根目录列举 |
| `close_file` | `path?: string` | 管理 | 已打开文件；省略为当前文件；支持已知外部文件 |
| `activate_file` | `path: string` 必填 | 管理 | 已打开文件；支持已知外部文件 |
| `reopen_previous_file` | 无 | 打开且管理 | 该会话系统记录的上一真实文件，重新检查可访问 |

所有相对路径按调用会话 cwd 解析，sessionId 从调用 Agent 取得、不接受模型指定。上游开关是 `agentOpenTools`，管理开关是 `pluginSettings['dsh-better-sidebar-controller:anchor'].agentControlTools`；默认均关闭（上游既有明确值保留）。依赖不可用或设置尚未读取时不注册本插件工具；只开启打开时 2 个，只开启管理时 9 个，两者开启时 12 个。上游自己的 `sidebar_open` 不计入数量。

### 增强打开输出

全部输出保持 `{ ok, code, message, ... }`。target 分类完成后增加 `kind: 'file'|'folder'|'url'`、`target`（规范化路径或验证过的 URL）、`title`（提交给上游的建议标题）、`delivered:boolean`、`queued:boolean`；分类前失败只有可确定的字段，不能伪造 kind/target。标题遵循上游支持，不承诺本工具额外修改 UI 默认标题。

```json
{
  "ok": true,
  "code": "OK",
  "message": "客户端已确认接受文件打开操作。",
  "kind": "file",
  "target": "F:/资料/项目计划.md",
  "title": "项目计划.md",
  "delivered": true,
  "queued": false
}
```

客户端未接入且允许排队时 `QUEUED/ok:true/delivered:false/queued:true`；未在 4 秒内确认时 `BRIDGE_TIMEOUT/ok:false/delivered:true/queued:false`；队列满时 `QUEUE_FULL/ok:false/delivered:false/queued:false`。发送成功不是操作成功，网页打开接受也不是网页加载成功。

`get_sidebar_state` 与旧工具输出继续采用现有字段，`sidebarController` 的服务接口形状不改；变化在真实 native/底部文件来源与外部已知文件可控制。目录列表配置由宿主权威上游设置读取，无浏览器连接也不能退回错误默认值。

### 新增和更新的失败含义

| code | 含义 |
|---|---|
| `TOOL_DISABLED` | 注册后执行期间权限关闭；不执行、不排队 |
| `SETTINGS_UNAVAILABLE` | 权威上游设置无法读取；不默认开启 |
| `SIDEBAR_UNAVAILABLE` | 依赖/目标界面能力不可用；区别于依赖有效但目标客户端暂未连接 |
| `QUEUE_FULL` | 64 条上限已满，新命令未接受 |
| `INVALID_TARGET` | 目标为空/协议非法等分类错误，Windows 盘符不会误判为协议 |
| `BRIDGE_TIMEOUT` | 未获得执行确认，先查询/核对状态，不自动重复打开 |

保留旧路径和状态错误码。普通业务失败返回结构化结果与一致的文本投影。关闭能力清理该类未执行队列，不回滚已执行操作；状态内部同步不受模型开关影响。更多门禁、协议及迁移细节以架构目标契约为准。

## 其他工具输出

| 工具 | 专属结果字段 |
|---|---|
| get_sidebar_state | connected、state（无连接时 null）；state 含 sidebarVisible、currentFile、previousFile、openedFiles、expandedFolders、workspaceRoot、fileCandidate、fileCandidateSource、updatedAt |
| show_sidebar / hide_sidebar | sidebarVisible、delivered、queued |
| list_files | path、entries（name/path/isDir/hidden/isSymlink/broken）、truncated |
| expand_folder / collapse_folder | path、expanded、delivered、queued |
| refresh_tree | rootPath、entries、truncated、delivered、queued |
| open_file / close_file / activate_file / reopen_previous_file | path、delivered、queued |

列举为单层，目录优先且按名称排序；先过滤隐藏项，再按上限截断。显隐／文件／目录操作只有客户端确认才返回 OK。状态字段中的空文件指针用 null，不能用网页或目录伪造。

## 保留的路径与状态错误

NO_AGENT（无法确定调用会话）、NO_SESSION（无工作目录）、INVALID_PATH、PATH_OUTSIDE_WORKSPACE、FILE_NOT_FOUND、FS_ERROR、NOT_A_DIRECTORY、NOT_A_FILE、FILE_NOT_OPEN、NO_CURRENT_FILE、NO_PREVIOUS_FILE、INTERNAL_ERROR；BRIDGE_NOT_CONNECTED 与 UNKNOWN_COMMAND 保留于协议。具体用户处理方式见 [使用指南](usage.md#结果与排错)。
