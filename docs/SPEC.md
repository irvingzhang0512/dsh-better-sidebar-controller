# dsh-better-sidebar-controller 当前功能规格

基线日期：2026-10-03；包版本：0.1.0；核对的源码提交：`24aba717c5e2a1abe2f39820e88836c61a0bdbef`。此提交是首次整理前的实现基线，后续文档提交不提高包版本。

本规格可编辑，功能任务先改预期与验收及相关技术契约，交用户明确确认该版文档后再开发；确认前不得修改对应源码／测试实现或运行配置。用户已明确要求按同一版文档实现且含义未变时，不重复询问；新增语义差异须重新确认，确认范围写入规格变更或任务交付记录。Bug 按已有且不变的预期直接定位源码。流程见 [根文档驱动开发规范](../../docs/DOC-DRIVEN-DEVELOPMENT.md)。原始需求保持只读，技术文档保留现有名称。

依据与技术入口：[../requirements.txt](../requirements.txt)、[architecture.md](architecture.md)、[tools.md](tools.md)、[usage.md](usage.md)。

实现状态与验证状态分别记录。“已实现”表示有当前源码依据，不表示本次已通过运行测试。下面的测试链接是核对过的现有验证入口；2026-10-03 本次只静态核对源码、测试与文档，没有运行产品测试、构建、GUI 或外部服务验证。具体遗漏见条目与末尾待办。

## F001 文件树列举与路径边界

- 实现状态：已实现。
- 场景与预期：列举工作区文件／目录，目录优先排序，支持隐藏项和递归控制，为用户与工具定位文件。
- 边界与异常：路径经过工作区与真实路径校验，含符号链接及 WSL 映射处理；越界、缺失与不可读路径返回错误。
- 验收条件：目录排序稳定；隐藏策略一致；外部路径及越界链接拒绝；合法工作区文件可列。
- 实现依据：[../src/host/fs-tree.ts](../src/host/fs-tree.ts)、[../src/host/paths.ts](../src/host/paths.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/host/fs-tree.spec.ts](../tests/host/fs-tree.spec.ts)、[../tests/host/paths.spec.ts](../tests/host/paths.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F002 状态与文件候选

- 实现状态：已实现。
- 场景与预期：读取 currentFile、previousFile、openedFiles、expandedFolders、sidebarVisible 与 connected；候选优先当前文件，否则使用仍打开的上一文件。
- 边界与异常：首页／目录页不作为当前文档；无候选返回空，不能伪造上次文件；有客户端时读取状态先请求同步。
- 验收条件：关闭上一文件后不再成为候选；切换标签能更新当前／上一文件；断开状态明确可读。
- 实现依据：[../src/host/controller-state.ts](../src/host/controller-state.ts)、[../src/shared/derive.ts](../src/shared/derive.ts)、[../src/shared/types.ts](../src/shared/types.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/host/controller-state.spec.ts](../tests/host/controller-state.spec.ts)、[../tests/shared/derive.spec.ts](../tests/shared/derive.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F003 侧边栏与目录控制

- 实现状态：已实现。
- 场景与预期：工具可显示／隐藏侧边栏、展开／折叠目录、刷新文件树；复用实际 better-sidebar 文件树。
- 边界与异常：全局可见性和目录展开作用于当前可见侧边栏；不承诺每个会话有独立原生侧边栏，也不创建结构化文档节点树。
- 验收条件：指令确认后状态与可见文件树对应；相同展开指令幂等；无客户端按队列规则反馈。
- 实现依据：[../src/client/index.ts](../src/client/index.ts)、[../src/host/tools.ts](../src/host/tools.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/host/tools.spec.ts](../tests/host/tools.spec.ts)、[../tests/host/bridge.spec.ts](../tests/host/bridge.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F004 文件标签控制

- 实现状态：已实现。
- 场景与预期：打开、关闭、激活文件及重新打开上一文件；维护每个会话的文件状态镜像。
- 边界与异常：文件需在工作区内；当前／上一文件指针遵循状态推导；只有确认的客户端反馈代表执行完成。
- 验收条件：打开 A/B 后激活、关闭和重开得到正确标签与 currentFile；非法路径拒绝。
- 实现依据：[../src/client/index.ts](../src/client/index.ts)、[../src/host/controller-state.ts](../src/host/controller-state.ts)、[../src/host/tools.ts](../src/host/tools.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/host/controller-state.spec.ts](../tests/host/controller-state.spec.ts)、[../tests/host/tools.spec.ts](../tests/host/tools.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F005 桥接、排队与确认

- 实现状态：已实现。
- 场景与预期：宿主通过 WebSocket 发送命令，客户端 hello 后同步状态、接收排队命令并 ack；断线可重连。
- 边界与异常：无客户端最多排队 64 条，返回 QUEUED 而非已完成；等待确认超时与客户端断开明确返回；写入口有信任校验。
- 验收条件：hello 后排队命令重放；ack 能对应请求；无连接和超时有可区分结果；跨站请求拒绝。
- 实现依据：[../src/host/bridge-server.ts](../src/host/bridge-server.ts)、[../src/host/bridge-socket.ts](../src/host/bridge-socket.ts)、[../src/host/trust-fence.ts](../src/host/trust-fence.ts)、[../src/shared/wire.ts](../src/shared/wire.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/host/bridge.integration.spec.ts](../tests/host/bridge.integration.spec.ts)、[../tests/host/bridge.spec.ts](../tests/host/bridge.spec.ts)、[../tests/shared/wire.spec.ts](../tests/shared/wire.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F006 工具与技能入口

- 实现状态：已实现。
- 场景与预期：11 个工具提供文件列举、状态、侧边栏与文件操作；捆绑中文 Skill 指导自然语言调用。
- 边界与异常：工具单一职责；Skill 不复制文件系统业务；better-sidebar 缺失时宿主可注册，界面能力取决于客户端接入。
- 验收条件：11 个工具注册并输出约定结构；Skill 可安装／查找；缺客户端反馈明确。
- 实现依据：[../src/index.ts](../src/index.ts)、[../src/host/tools.ts](../src/host/tools.ts)、[../src/host/skill-registration.ts](../src/host/skill-registration.ts)。
- 验证记录：2026-10-03 静态核对；已有测试入口：[../tests/register.spec.ts](../tests/register.spec.ts)、[../tests/skill.spec.ts](../tests/skill.spec.ts)、[../tests/host/skill-registration.spec.ts](../tests/host/skill-registration.spec.ts)（覆盖范围以用例为准，本次未执行）。

## F007 原生侧边栏适配

- 实现状态：已实现。
- 场景与预期：客户端获取原生 sidebar store 并控制实际树和标签；必要时短暂使用隐藏锚点标签获取 store，再清理与恢复。
- 边界与异常：适配依赖原生 UI 生命周期；宿主测试通过不等于所有布局／标签切换兼容。
- 验收条件：获取 store 后清理锚点；会话切换状态正确；用户原有标签、草稿与布局不被破坏。
- 实现依据：[../src/client/index.ts](../src/client/index.ts)。
- 验证记录：2026-10-10 修复「原生落点锚点泄漏」（此前 `removeAnchor` 以 `bottomSplits` 为前置条件，better-sidebar 0.19+ 把锚点投到原生右侧栏时永远关不掉，表现为侧边栏里多一个空白页）；预期未变，未改规格。`npm run typecheck`、`npm test`（12 文件 / 137 用例）、`npm run build` 三绿；新增构建产物用例 [../tests/client-bundle.spec.ts](../tests/client-bundle.spec.ts)（bundle 以包名注册、原生落点仍关闭锚点、底部落点恢复原活动标签），并已确认该用例在修复前对原生落点失败。GUI 回归（新窗口不再出现空白页、会话切换与原有文件标签恢复）尚未执行。

## F008 结构化节点树与语音引擎

- 实现状态：待实现。
- 历史场景：历史设计中的结构化内容节点树和独立语音识别引擎不属于当前控制器实现；现有自然语言工具不等于语音采集。
- 边界与异常：仅保留历史规划来源，不代表已承诺本次开发；尚无对应完整运行实现。
- 验收条件：实施前需确定与文档／视图／语音插件的分工，再补接口和真实交互验收。
- 来源依据：[../requirements.txt](../requirements.txt)。
- 验证记录：未实现，暂无运行验证；实际开发时先拆分规格并明确异常反馈。

## F009 侧边卡片设置（列举行为配置）

- 实现状态：已实现（2026-10-10 按已确认的本版文档实现；包版本 0.2.0）。
- 场景与预期：在「设置 → 侧边卡片」（第三方插件 `dsh-better-sidebar` 注册的 `settings.section` 页）里，本插件的卡片提供两个设置行，控制文件列举行为：`includeHiddenEntries`（开关，默认 `true`，是否返回点开头的隐藏项，返回时仍带 `hidden` 标记）与 `maxListedEntries`（数字，默认 `1000`，最小 `1`，单层列举行数上限，超出时结果标 `truncated`）。两项作用于 `list_files` 与 `refresh_tree` 共用的单层列举。该卡片现在是**空白标题**的行（描述符 `title: () => ''`，而该页的 tab 卡片不过滤 `hidden`、也不像 viewer 卡片那样回退 id），本规格要求给描述符正式标题（暂拟「文件树与列表」，待用户确认）。
- 边界与异常：
  - 软依赖：`dsh-better-sidebar` 缺失，或版本低于 0.12.0（能力列表 `service.features` 不含 `pluginSettings`，老版本可能没有该字段）时，两项回退现有硬编码默认值（返回隐藏项、上限 1000），插件与其 11 个工具照常工作；只通过公开 service 快照读取（`getSnapshot().prefs.pluginSettings[<描述符 id>]`）与订阅（`subscribe`／`subscribeState`）跟踪变化，不访问私有 store。
  - 优先级：设置过就用它，未设置回落默认值；该上游机制没有「重置为默认／标记被覆盖」与 revision 冲突保护。
  - 设置行只在卡片启用时渲染（上游条件为 `tabsEnabled[id] !== false` 且描述符声明了任一行／自定义面板）。
  - 锚点生命周期约束不变：抓取 store、后台建标签不抢用户活动标签、清理与会话切换、已有文件标签恢复都保持现状；给锚点加标题与设置行不得改变这些行为，也不得让它出现在「+」新建菜单里（仍是 `hidden: true`）。
  - `list_files` 的既有返回形状（目录优先排序、`hidden`／`broken`／`truncated` 标记）不变，只是行数与隐藏项受配置控制。
  - 过滤与截断顺序：先按 `includeHiddenEntries` 过滤，再按 `maxListedEntries` 计数截断（否则隐藏项会吃掉配额）；`truncated` 表示仍有未返回的行。
  - 值需要送达宿主：prefs 在浏览器侧（better-sidebar 的用户设置文档），而 `list_files`／`refresh_tree` 在宿主执行；客户端半边经既有桥接把两项同步给宿主，`src/shared/wire.ts` 新增可选字段承载（用户已于 2026-10-10 确认采用该路径，不改为宿主直接读 better-sidebar 命名空间）。无客户端连接时宿主按默认值列举，不失败。
  - 取值防御：宿主读取时对非有限值、小于 1 的值回落默认 1000；布尔非 `true` 视为关闭。上游数字行对无法解析的输入回落到当前值、并按声明的 `min` 夹取。
  - 卡片第二行显示的是描述符 id（上游对 tab 卡片固定用 `desc: tab.id`），描述符的 `description` **不在卡片上**渲染（它只出现在宿主「+」菜单的引导列表，而锚点是 `hidden`，不会出现）；因此本条的可见修正是标题。
  - 锚点卡片的启用开关是上游统一行为：关闭后上游 `openTab` 会拒绝（`console.warn`），锚点无法挂载、store 捕获失败，依赖 store 的显隐／展开类命令随之不可用。本规格不修改该上游行为，只如实记录。
  - 两项是 better-sidebar 的用户设置（全局），不按会话隔离；宿主镜像不因此新增每会话字段。
- 验收条件：默认（未设置）行为与当前一致（列出隐藏项、上限 1000、`truncated` 语义不变）；关闭 `includeHiddenEntries` 后 `list_files`／`refresh_tree` 不再返回点开头条目，且非隐藏条目数不因隐藏项占位而减少；`maxListedEntries` 设为 3 时单层最多返回 3 行并标 `truncated`，设为 0／非法值时回落 1000 或按 `min` 夹取且不报错；卡片上能看到正式标题与两个设置行；未安装 better-sidebar 或版本不支持时宿主仍能列目录并保持默认行为；设置改动后在**下一次**工具调用生效，不需要重载插件。
- 实现依据：已实现。描述符标题与两行设置：[../src/client/index.ts](../src/client/index.ts)（`ANCHOR_TITLE = '文件树与列表'`、`settings.pluginToggles` 两行，`min: 1`）；prefs 读回与同步：同文件 `settingsFromSnapshot`（只读公开 `service.getSnapshot().prefs.pluginSettings[...]`）与 `pushSettings`；协议：[../src/shared/wire.ts](../src/shared/wire.ts)（`settings` 消息 + `state.settings` 可选字段，`parseListingSettings` 防御校验）、[../src/shared/types.ts](../src/shared/types.ts)（`ListingSettings` / `LISTING_SETTINGS_DEFAULTS` / `MAX_LISTED_ENTRIES_MIN`）；宿主镜像与回落：[../src/host/listing-settings.ts](../src/host/listing-settings.ts)（`ListingSettingsStore` / `resolveListingSettings`）；桥接收：[../src/host/bridge-server.ts](../src/host/bridge-server.ts)；宿主列举开关：[../src/host/fs-tree.ts](../src/host/fs-tree.ts)（`ListDirectoryOptions`，先过滤再截断）、[../src/host/tools.ts](../src/host/tools.ts)（`list_files` / `refresh_tree` 共用 `getListingOptions`）、[../src/index.ts](../src/index.ts)（装配）。
- 验证记录：2026-10-10 实现并运行验证。`npm run typecheck`（`tsc -p tsconfig.json --noEmit`）通过、无输出；`npm test`（vitest 4.1.11）**13 个测试文件 / 171 个用例全部通过**（本次由 137 增至 171，新增 34 个：`tests/host/listing-settings.spec.ts` 11、`tests/host/fs-tree.spec.ts` +5、`tests/shared/wire.spec.ts` +4、`tests/host/bridge.spec.ts` +3、`tests/host/tools.spec.ts` +6、`tests/client-bundle.spec.ts` +5）；`npm run build`（clean + tsc + tsdown）成功，`lib/client.js` 25.26 kB，`lib/` 已重建并留在工作区。覆盖点：过滤与截断顺序（隐藏项不吃配额、只剩被过滤项时不标 `truncated`）、上限与非法值回落（非有限值回落 1000、越界按 `min` 夹取、分数取整）、`hidden` 标记保留、无客户端（无设置镜像）时按默认值列举、wire 新字段的编解码与畸形输入拒绝（缺字段／类型错误／非有限数字）、设置按会话隔离、改设置后**下一次**工具调用生效、锚点既有回归（`tests/client-bundle.spec.ts` 两种落点）保持通过。
  实现中确认并修正的一处自身缺陷：客户端 `pushSettings` 原先在 `send` 之前推进去重键，而 `send` 在 socket 仍为 CONNECTING 时是 no-op，导致 `onopen` 的补推被去重键吞掉（刷新页面后宿主持有陈旧默认值）。现改为 `send` 返回是否真正发出、仅在发出后推进去重键；新增 `tests/client-bundle.spec.ts` 用例模拟 socket 打开并断言 settings 消息确实发出（修正前该用例失败，为 0 条 settings 消息）。
  未执行：真实浏览器 GUI 核对（设置页看到「文件树与列表」标题与两行、改值后生效、刷新后仍生效）尚未执行；未安装 better-sidebar 的降级路径为单元/构建产物级覆盖，未在真实缺插件环境核对；`docs/architecture.md` 记录的锚点启用开关关闭后 store 捕获失败这一上游边界未做真实页面复核。
  取值口径（本版验收条件允许两者：「回落 1000 或按 `min` 夹取」）：`maxListedEntries` 为非有限值／非数字时回落默认 1000；为有限但小于 `min`（含 0／负数）时**按 `min` 夹取为 1**，与上游数字行按 `min` 夹取一致。

## 差异与验证待办

- 新补 AGENTS.md，保留实际 master 分支；lib/ 在本仓库是已跟踪产物，文档任务不运行构建去改写它。
- 原生 sidebar store 与隐藏锚点已新增构建产物级回归用例（两种落点）；真实浏览器 GUI 回归仍待执行。
- 2026-10-10 增量待办：F009 已实现并完成上述验证（实现与验证记录见 F009）；真实浏览器 GUI 核对仍待执行。已定事项：①锚点卡片的正式名称按暂拟「文件树与列表」定稿并已落地为描述符标题；②客户端→宿主的同步走 [../src/shared/wire.ts](../src/shared/wire.ts) 新增 `settings` 消息与 `state.settings` 可选字段（已实现，不改为宿主直接读 better-sidebar 命名空间）；③锚点卡片启用开关关闭会让 store 捕获失败（上游拒绝 `openTab`）这一上游边界只在本文档与 architecture.md 如实记录，不额外写进开发 Skill，也不修改上游行为。
- 2026-10-10 实现中记录的新观察（F009 范围外，未修改）：客户端 `pushState` 的「语义变化才推送」去重键在 socket 仍为 CONNECTING 时也会推进，而 `send` 此时是 no-op，导致 `onopen` 里为补齐而调用的 `pushState()` 被去重键拦掉——用构建产物探针实测，socket 打开后只发出 `hello` 与 `settings`，没有 `state`。这会让 F002「有客户端时读取状态先请求同步」与决策 D5「sync_state 保证回答不陈旧」在页面刚加载、尚无用户交互时失效（宿主镜像为空，`get_sidebar_state` 报 `SIDEBAR_UNAVAILABLE`），直到发生一次真实语义变化。本次按 F009 边界**未改动**该既有推送路径（避免改动 F002/F005 行为），与本次新加的 settings 推送采用了「仅在真正发出后推进去重键」的写法；是否一并修正 `pushState` 待用户拍板。
- 2026-10-10 上游显示与有效值的差异（未修改上游）：`pluginToggles` 的 `switch` 行读取原始键值并以 `read(key) === true` 判定勾选，未设置的键显示为「关闭」，而本规格的有效默认是「返回隐藏项（开）」。即卡片在用户未设置时显示关闭、实际行为为开启；该上游机制没有「默认值」概念，本插件未写入 prefs 伪造默认值。真实页面核对时可一并确认该显示是否符合预期。

## 规格变更记录

- 2026-10-03：首次从现行文档、实现和现有测试建立功能基线；仅修改维护文档，未变更 API、存储或运行逻辑。
- 2026-10-10：新增 F009 侧边卡片设置（列举行为配置：`includeHiddenEntries`／`maxListedEntries`，以及锚点描述符的正式标题）；配置契约同步到 [architecture.md](architecture.md) 的「配置契约」，`list_files` 说明同步到 [tools.md](tools.md)。本版为待用户确认的文档增量，未改动源码、测试或运行配置、未重创 `lib/`。
- 2026-10-10：按已确认的 F009 文档实现（包版本 0.2.0）：描述符标题「文件树与列表」、`settings.pluginToggles` 两行、prefs 读回经 `wire.ts` 新 `settings` 消息同步宿主、宿主按会话镜像两项设置并在 `list_files`／`refresh_tree` 共用的单层列举中先过滤再截断；配置契约在 [architecture.md](architecture.md) 补充实现位置，`refresh_tree` 说明同步到 [tools.md](tools.md)，`lib/` 已重建。验证结果与未执行项见 F009 的验证记录；规格预期与验收条件未变。
