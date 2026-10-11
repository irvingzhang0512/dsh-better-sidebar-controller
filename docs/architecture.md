# 架构说明（Architecture）

## 增强控制层目标契约

文档版：`sidebar-enhancement-20261011-v1`；对应 [SPEC F010–F013](SPEC.md#本次增强文档版与适用范围)。用户已确认，源码已实现（验证见 [交付记录](VERIFICATION-0.3.0.md)）；目标 DSH `0.2.0-rc.2`、better-sidebar `0.25.0`。本节维护当前实现契约；旧组合的历史验证不作为新版兼容证据。

### 设置权威、读取与生命周期

- 复用公开 better-sidebar 设置描述符，固定 id `dsh-better-sidebar-controller:anchor`，标题「Sidebar Controller 增强控制」，保持隐藏、不进新建菜单、不残留标签的约束。
- 持久配置：打开取 better-sidebar 的 `agentOpenTools === true`；管理取 `pluginSettings[ANCHOR_ID].agentControlTools === true`（未设置即 false）。列举仍取同一 blob 的 `includeHiddenEntries`（缺省 true）与 `maxListedEntries`（缺省 1000，有限数字取整且至少 1）。未知字段不删除。
- 宿主等待 loader 就绪，按 `entry.options.name === 'dsh-better-sidebar'` 找实际活动加载条目，使用其真实 `options.id` 作为设置命名空间；不固定为 `better-sidebar`，支持聚合 bundle 的不同 id。只接受启用、实际活动且声明兼容目标组合的条目；不能仅凭包存在或安装快照判为可用。无法唯一确定活动条目时报告不可用，不猜测一个命名空间。
- 使用宿主公开 settings 读取上游完整有效值，不创建控制器独立 settings section 或文件。依赖停用、上游 effective disabled／external disable 状态、`tabsEnabled[ANCHOR_ID] === false` 或设置读取失败时停止模型能力。不能将“没有客户端”解释为“没有依赖”，也不能将客户端 hello 解释为“权限已开启”。
- 工具门禁的权威读取得到后才注册；在对应服务上下文观察配置/加载变化，另有 500 毫秒补充检查，定时器释放且不阻止宿主退出。注册与移除幂等；每次工具执行、发送及重放前重新读取门禁。不修改上游工具注册或偏好。
- 内部 `sidebarController` 服务保持 `id/getState/subscribe` 形状，工具关闭仍同步已连接有效界面的文件状态；依赖不可用则状态标 disconnected、文件候选为空，通知订阅者，不暴露陈旧候选供工作台操作。

### 工具注册矩阵

以下数量仅计本插件，上游 `sidebar_open` 仍由上游注册。

| 打开 | 管理 | 注册工具 |
|---|---|---|
| 关 | 关 | 无 |
| 开 | 关 | `better_sidebar_open`、`open_file`（2） |
| 关 | 开 | `get_sidebar_state`、`show_sidebar`、`hide_sidebar`、`list_files`、`expand_folder`、`collapse_folder`、`refresh_tree`、`close_file`、`activate_file`（9） |
| 开 | 开 | 上述全部及 `reopen_previous_file`（12） |

内部 `sync_state` 不属于模型工具，不受模型开关影响，但需要有效依赖与正确会话连接。关闭某组只移除对应工具与该组队列；关闭任一组即移除返回上一文件工具及其队列。已送达并执行的动作不回滚，原标签不关闭。

### 设置卡与说明入口

设置页面复用上游 descriptor 的公开 `settings.render`／插件设置写入接口，不修改上游源码。卡片保持上游外观：能力标题与说明在左、控件在右；有效显示值使用上面的默认归一，不再出现默认显示关闭而实际开启的差异。

- 打开行仅显示有效状态、原开关位置「本页 → 常规 → 为模型注入侧边栏打开工具」及作用，不创建第二个存储键或独立编辑开关。
- 管理开关：`agentControlTools`，说明涵盖状态查询、文件关闭/切换、目录与显隐；关闭时隐藏隐藏项和列表上限两行，保留说明、上游关联状态与使用指南。
- 现有描述符启用开关关闭表示控制器扩展停用；不能把隐藏锚点的启用开关误显示为新的工具许可。
- 使用指南在客户端随包提供只读的同版说明视图，由卡片内「查看 Agent 使用说明」展开／收起，不新增侧栏页签、独立设置分区或外部站点依赖。内容包含全部工具映射、完整流程与结果说明，与 docs/usage.md 静态核对；README 可链接同版仓库文档。
- 用上游公开 helper 保存 pluginSettings，合并当前 blob 与未知键；保存失败显示错误且保持上次有效值，不做未持久化的乐观授权。持久设置只有上游一份。

### 打开接口与桥接协议

模型参数：`better_sidebar_open({ target: string, title?: string })`，不接收 sessionId、action、kind；会话从调用 Agent 确定。宿主将 target 分类为 `file | folder | url`，本地路径按该会话 cwd 解析并规范化（允许外部真实路径），网页仅接受 HTTP(S)，Windows 盘符不判为协议；空白目标失败，空白标题回落到文件名／目录名／主机名。增强打开遵循上游标题支持，结果中的 title 表示提交给上游的建议标题，不保证原生 UI 改写默认标题。

规范输出：所有返回含 `ok:boolean/code:string/message:string`。分类成功后的返回再含 `kind/target/title/delivered/queued`；target 是规范化绝对路径或验证后的 HTTP(S) URL。参数／路径分类前失败不伪造 kind 等字段；未连接排队为 `ok:true/code:QUEUED/delivered:false/queued:true`；已送达未确认为 `ok:false/code:BRIDGE_TIMEOUT/delivered:true/queued:false`；队列满为 `ok:false/code:QUEUE_FULL/delivered:false/queued:false`；执行确认成功才 `OK`。

桥接保持 `/sidebar-controller/ws?sessionId=…` 及原信任围栏，新命令形状：

```ts
{ name: 'better_sidebar_open', kind: 'file' | 'folder' | 'url', target: string, title: string }
```

仅宿主生成分类命令。客户端验证形状、当前 mounted session 与连接绑定一致，并重新检查公开 prefs 门禁、目标页面可用性后调用公开 API。文件走 `betterSidebar.openFile(scope, target, title)`；目录走上游 editor seed（path、title、`meta.dir:true`）；网页走公开原生 `sidebarRight.openTab('browser', { params: { url: target } })`，遵循上游支持的标题行为；不使用不存在的 `betterSidebar.openUrl`，不复制或导入上游私有 AgentOpenRegistry。

`open_file` 保留原参数/输出、NOT_A_FILE 和工作区真实路径围栏；目录操作的围栏不变。新客户端与宿主同步交付，移除旧 `settings` 消息和 `state.settings` 有效处理及配置镜像对象，旧客户端不得通过这些载荷改变宿主门禁或列举值；旧客户端无新命令能力时不虚报成功。

### 状态、文件控制与投递

- 原生状态使用公开 `sidebarRight.openTabs`、`mounted`、`active()`，资源地址通过宿主公开资源语法解析；内部 tab id 不再假设等于 `editor:<path>`。底部状态继续读 better-sidebar 公共快照。以 mounted 会话的活动文件为准；前台在网页、目录或其他页面时 currentFile 为空，不从底部旧活动标签猜测当前文件。合并已打开文件时按真实文件路径去重，按会话隔离。
- 订阅标签清单、mounted 与 better-sidebar 快照变化；只在桥接已连接且 mounted 为对应会话时 500 毫秒补读活动标签。查询状态、命令执行及 ack 前立即读取；状态推送只有真正发送后推进去重键，hello/重连/换会话/sync_state 强制发当前状态。清理所有订阅、定时器与 socket。
- `close_file/activate_file` 的工作区外目标仅允许匹配该会话真实已打开文件，不把打开过某外部文件变成任意外部路径授权；`reopen_previous_file` 使用该会话记录的真实上一文件，并重新验证它可访问。文件不存在或无上一文件用原错误码。通过 native close/focus 或 better-sidebar closeTab/activateTab 操作对应真实 tab，公开接口严格 no-op 不能当作成功。
- UI 非活动会话的命令保留宿主队列，不把原生当前会话写接口当成跨会话接口。连接也须确认 mounted 目标会话；竞态不允许在错误会话执行，返回明确失败/继续等待而非伪造 OK。
- 每会话队列 64 条，入队失败反馈 QUEUE_FULL；关闭权限或依赖失效清理相关未执行条目，依赖失效清空全部队列与等待者。重放逐条检查权限后发送，发送后消费；已发送不在重连时自动再执行。保持原 4 秒确认超时；超时消息要求先查询状态而非无条件重试。
- 结构化失败：已注册工具的竞态关闭用 `TOOL_DISABLED`；依赖/界面不可用用 `SIDEBAR_UNAVAILABLE`；设置不可读用 `SETTINGS_UNAVAILABLE`；队列满用 `QUEUE_FULL`；网页非法协议用 `INVALID_TARGET`，缺失／不可读路径沿用相应路径错误码。错误不抛出普通业务异常，文本投影与 canonical JSON 含义一致。

### 配置迁移、验收与非目标

持久键未改名，不批量搬迁或清空 pluginSettings。新增 agentControlTools 缺省关闭，旧用户不会因原先 11 个工具始终注册而自动得到 true。迁移验收检查真实原始旧配置：缺失 blob、只含一个列举键、显式隐藏项开/关、异常上限、描述符关闭及其他插件未知键；读取不写入伪造默认值，单字段保存不覆盖其他键。重复保存/重启不丢值，不复活已移除的配置镜像读取。

运行验证包括四种工具矩阵、动态移除与队列清理、设置故障、依赖停用、中文/外部路径、native/browser 缺能力、双会话、状态首次补推与强制同步、文件控制、工作台候选、生命周期和真实 desktop UI；typecheck/test/build 与客户端产物冒烟分别记录。纯文档阶段只做链接/契约一致性/差异空白检查，不改运行技能、源码、测试、包版本或 lib；不恢复旧 web，不新增网页/目录窗口关闭工具，不自动推送。

## 原组合历史与独立升级差异

目标版技术契约：见 [DSH 0.2.0-rc.2 升级适配](DSH-UPGRADE-20261011.md)（`dsh-upgrade-20261011-v1`，待确认／待实现）。本文原宿主 API 和设置存储说明保留作为当前组合基线；目标版采用该补充中的接口、配置迁移与验收边界，不将旧 API 继续当作目标版可用接口。

旧版本设计保存在 Git 历史，当前运行契约以上文为准；已删除配置镜像／旧设置消息，不能使用历史默认注册 11 工具或 activateTab no-op 的旧假设指导新版开发。原升级文档差异单独保留，本次不替其他插件确认升级。

## 实现入口

- 宿主：src/index.ts、host/access.ts、host/tools.ts、host/bridge-server.ts。公开 settings.describe 和 configEditor 活动条目读取同一命名空间；pluginPackages.packageOf(name, entry.parent.tree.ctx.baseUrl) 确认实际解析包为 0.25.x，即使上游被风险豁免放行也不绕过本扩展版本检查。npm 的 optional peer 仅允许缺依赖时提供不可用内部状态，不代表功能可独立使用。
- UI 与宿主共享 shared/listing-settings.ts 的有效值归一；旧负数／小数上限显示与执行一致，读设置不自动覆写原值。
- 客户端：client/index.ts、native.ts、settings.ts。明确声明 betterSidebar/sessions/sidebarRight inject；mounted 早于 surface 就绪，临时锚点在实际渲染后清理，并通过公开清单关闭恢复出的真实锚点 tabId。
- 首次打开先取 cwd，复用当前／底部已有文件，避免绝对地址与会话地址为同一文件建立重复标签。
- desktop WebSocket 使用公开 __DSH_TRANSPORT__.streamBaseUrl，HTTP 继续使用 hostRouteUrl；官方 dsh-app://app 来源只在 loopback Host 且非 cross-site 标记下接受。
- 同会话多视图只投递到首个有效连接，发送失败才尝试后续连接，避免在多个视图重复打开网页；所有界面仍按会话同步状态。
- 运行与文档验证见 [交付记录](VERIFICATION-0.3.0.md)。
