window.__ModuleLoader__.load({
	id: "dsh-better-sidebar-controller",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/shared/derive.ts
		/**
		* Whether a tab is an open FILE (an editor tab carrying a path that is not a
		* folder window). Browser tabs also carry `path` (the URL) but have a
		* different `type`, so `type === 'editor'` is the discriminator; folder
		* windows (`meta.dir === true`) are navigation, not files.
		*/
		function isEditorFileTab(tab) {
			if (tab.type !== "editor") return false;
			if (typeof tab.path !== "string" || tab.path === "") return false;
			const meta = tab.meta;
			if (meta !== null && typeof meta === "object" && meta.dir === true) return false;
			return true;
		}
		/** All leaves of one split tree (depth-first, stable order). */
		function leavesOf(node) {
			if (node.kind === "leaf") return [node];
			return node.children.flatMap(leavesOf);
		}
		/** Every leaf across the right panel and the bottom panel. */
		function allLeaves(state) {
			return leavesOf(state.bottomSplits);
		}
		/** The path of the currently active editor file, or null. */
		function activeFileOf(state) {
			const activeLeaf = allLeaves(state).find((leaf) => leaf.id === state.activePane);
			if (activeLeaf !== void 0 && activeLeaf.active !== null) {
				const tab = activeLeaf.tabs.find((t) => t.id === activeLeaf.active);
				if (tab !== void 0 && isEditorFileTab(tab)) return tab.path;
			}
			return null;
		}
		/** All open file paths (pane tabs then floats), deduplicated in first-open order. */
		function openedFilesOf(state) {
			const out = [];
			const seen = /* @__PURE__ */ new Set();
			const visit = (tab) => {
				if (!isEditorFileTab(tab)) return;
				const path = tab.path;
				if (seen.has(path)) return;
				seen.add(path);
				out.push(path);
			};
			for (const leaf of allLeaves(state)) for (const tab of leaf.tabs) visit(tab);
			return out;
		}
		/**
		* Advance the current/previous file context when the active file changes.
		*
		* Rules (per requirements §4.3):
		* - A → B: current = B, previous = A.
		* - B → A: current = A, previous = B.
		* - current becomes null (file closed / focus moves to a non-file tab):
		*   keep the last current as `previous`, so “回到刚才那个文件” still works.
		* - the current file stays the same (panel toggles, tab closes elsewhere):
		*   neither field changes.
		*/
		function deriveFileContext(prev, current) {
			const prevCurrent = prev?.currentFile ?? null;
			const prevPrevious = prev?.previousFile ?? null;
			if (current === null) return {
				currentFile: null,
				previousFile: prevCurrent ?? prevPrevious
			};
			if (current === prevCurrent) return {
				currentFile: current,
				previousFile: prevPrevious
			};
			return {
				currentFile: current,
				previousFile: prevCurrent ?? prevPrevious
			};
		}
		/**
		* Find the first open tab whose path matches (pane tabs first, then floats).
		* Used by close/activate to map a path to the service's tab id. Returns
		* undefined when the file is not open.
		*/
		function findTabByPath(state, path) {
			for (const leaf of allLeaves(state)) {
				const tab = leaf.tabs.find((t) => isEditorFileTab(t) && t.path === path);
				if (tab !== void 0) return tab;
			}
		}
		//#endregion
		//#region src/shared/access.ts
		const ANCHOR_ID = "dsh-better-sidebar-controller:anchor";
		function allowed(name, access) {
			if (!access.available) return false;
			if (name === "sync_state") return true;
			if (name === "better_sidebar_open" || name === "open_file") return access.open;
			if (name === "reopen_previous_file") return access.open && access.control;
			return access.control;
		}
		function accessFromPrefs(raw) {
			if (!raw || typeof raw !== "object") return {
				available: false,
				open: false,
				control: false,
				code: "SETTINGS_UNAVAILABLE",
				message: "无法读取侧边卡片设置。"
			};
			const prefs = raw;
			const tabs = prefs.tabsEnabled;
			const pluginSettings = prefs.pluginSettings;
			const available = prefs.disabled !== true && tabs?.["dsh-better-sidebar-controller:anchor"] !== false;
			return {
				available,
				open: available && prefs.agentOpenTools === true,
				control: available && pluginSettings?.["dsh-better-sidebar-controller:anchor"]?.agentControlTools === true
			};
		}
		function refusal(name, access) {
			if (allowed(name, access)) return void 0;
			return {
				ok: false,
				code: access.available ? "TOOL_DISABLED" : access.code ?? "SIDEBAR_UNAVAILABLE",
				message: access.available ? "对应侧边栏工具开关已关闭，请在设置 → 侧边卡片中开启。" : access.message ?? "better-sidebar 或控制器扩展不可用。"
			};
		}
		//#endregion
		//#region src/shared/types.ts
		/** Fallback listing settings: current behavior (hidden rows on, bound 1000). */
		const LISTING_SETTINGS_DEFAULTS = {
			includeHiddenEntries: true,
			maxListedEntries: 1e3
		};
		/** Every command name (kept in sync with the union above; used for
		*  validation and for SKILL/docs contract tests). */
		const CONTROLLER_COMMAND_NAMES = [
			"better_sidebar_open",
			"show_sidebar",
			"hide_sidebar",
			"expand_folder",
			"collapse_folder",
			"refresh_tree",
			"open_file",
			"close_file",
			"activate_file",
			"reopen_previous_file",
			"sync_state"
		];
		//#endregion
		//#region src/shared/wire.ts
		/** Thrown when a wire message fails validation. */
		var WireError = class extends Error {
			constructor(message) {
				super(message);
				this.name = "WireError";
			}
		};
		function isRecord(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value);
		}
		function requireString(record, key) {
			const value = record[key];
			if (typeof value !== "string") throw new WireError(`missing or invalid "${key}"`);
			return value;
		}
		/** Validate one command name + payload (the shape of {@link ControllerCommand}). */
		function parseCommand(raw) {
			if (!isRecord(raw) || typeof raw.name !== "string") throw new WireError("invalid command");
			const name = raw.name;
			if (!CONTROLLER_COMMAND_NAMES.includes(name)) throw new WireError(`unknown command "${name}"`);
			switch (name) {
				case "better_sidebar_open":
					if (raw.kind !== "file" && raw.kind !== "folder" && raw.kind !== "url") throw new WireError("invalid target kind");
					return {
						name,
						kind: raw.kind,
						target: requireString(raw, "target"),
						title: requireString(raw, "title")
					};
				case "show_sidebar":
				case "hide_sidebar":
				case "refresh_tree":
				case "sync_state": return { name };
				case "reopen_previous_file": return {
					name,
					...typeof raw.path === "string" ? { path: raw.path } : {}
				};
				case "expand_folder":
				case "collapse_folder":
				case "open_file":
				case "activate_file": {
					const path = requireString(raw, "path");
					if (name === "open_file") {
						const title = typeof raw.title === "string" && raw.title !== "" ? raw.title : void 0;
						return {
							name,
							path,
							...title !== void 0 ? { title } : {}
						};
					}
					return {
						name,
						path
					};
				}
				case "close_file": {
					const path = typeof raw.path === "string" && raw.path !== "" ? raw.path : void 0;
					return {
						name,
						...path !== void 0 ? { path } : {}
					};
				}
				default: throw new WireError(`unknown command "${name}"`);
			}
		}
		/** Decode a host→client message from its JSON text. */
		function parseHostMessage(text) {
			let parsed;
			try {
				parsed = JSON.parse(text);
			} catch {
				throw new WireError("invalid JSON");
			}
			if (!isRecord(parsed) || parsed.type !== "command") throw new WireError("invalid message envelope");
			return {
				type: "command",
				id: requireString(parsed, "id"),
				command: parseCommand(parsed.command)
			};
		}
		//#endregion
		//#region \0sidebar-controller-guide
		var _sidebar_controller_guide_default = "# 使用指南：通过 Agent 控制侧边栏\n\n本指南说明如何配置 `dsh-better-sidebar-controller`，以及如何让 Agent 操作 better-sidebar 和 DSH 官方右侧栏。适用于插件 `0.3.0`，目标组合为 DSH desktop `0.2.0-rc.2`、better-sidebar `0.25.0`；实际验证范围见 [验证记录](VERIFICATION-0.3.0.md)。\n\n首次使用按顺序阅读：[插件与侧栏的关系](#插件与侧栏的关系) → [配置](#配置) → [操作分类与示例](#操作分类与示例) → [完整使用流程](#完整使用流程)。遇到问题查看 [结果与排错](#结果与排错)。\n\n## 插件与侧栏的关系\n\n你向 Agent 发出自然语言指令，Agent 读取 `sidebar-controller` 技能，再调用本插件的工具，由当前会话界面执行操作。\n\n| 组成 | 负责什么 |\n|---|---|\n| DSH 官方右侧栏 | 原生文件等标签的展示，以及右侧栏的显示／隐藏 |\n| better-sidebar | 文件打开、文件夹窗口、工作区文件树、底部工作台，以及侧边卡片设置 |\n| 本增强扩展 | 为 Agent 提供打开、查询、切换、返回、关闭文件与文件树操作工具，并同步文件状态 |\n\n本扩展依赖已启用且兼容的 better-sidebar。配置也保存于 better-sidebar 的设置中，无需创建独立配置文件。文件的显示位置沿用 better-sidebar 设置，可能位于官方右侧栏或底部工作台；`show_sidebar`／`hide_sidebar` 只控制官方右侧栏。\n\n文件夹窗口、网页和终端不计入当前／上一文件。本扩展不提供网页或文件夹窗口的关闭、返回工具，也不负责文件内容编辑。\n\n## 配置\n\n### 1. 确认前置条件\n\n使用 DSH desktop，并确认以下两个插件均已安装、启用：\n\n- `dsh-better-sidebar@0.25.0`。\n- `dsh-better-sidebar-controller@0.3.0`。\n\n进入「设置 → 侧边卡片」，应能找到「Sidebar Controller 增强控制」卡片。缺少卡片时先核对插件加载和依赖状态；下面的工具开关不能替代安装或启用插件。\n\n### 2. 按用途开启能力\n\n1. 打开「设置 → 侧边卡片」。\n2. 如果需要 Agent 打开文件、文件夹或网页，在「常规」开启 **为模型注入侧边栏打开工具**。\n3. 如果需要 Agent 查询状态、管理文件标签、操作文件树或控制右侧栏，在「Sidebar Controller 增强控制」卡片点击 **功能设置**，开启 **允许模型管理侧边栏**。\n4. 如果需要“回到刚才那个文件”，两个开关都要开启。\n5. 按需调整管理开关下的 **列出隐藏项** 和 **单层条目上限**。\n\n增强卡片会显示打开能力的关联状态及其设置位置。打开开关只有上游「常规」里的一个，不需要再开启第二个打开开关。\n\n### 3. 配置项一览\n\n| 配置项 | 所在位置 | 有效默认值 | 影响范围 |\n|---|---|---|---|\n| 为模型注入侧边栏打开工具 | 侧边卡片 → 常规 | 未设置时关闭；保留已有值 | 上游 `sidebar_open`，增强 `better_sidebar_open`，兼容 `open_file` |\n| 允许模型管理侧边栏 | 增强控制卡片 → 功能设置 | 关闭 | 状态查询、文件关闭／切换、目录操作、右侧栏显隐；与打开开关共同允许返回上一文件 |\n| 列出隐藏项 | 增强控制卡片 → 功能设置 | 开启 | 目录列举与刷新结果是否包含点开头的隐藏条目 |\n| 单层条目上限 | 增强控制卡片 → 功能设置 | 1000，最小 1 | 目录单层返回条目数；超出时结果标记 `truncated` |\n\n管理关闭时，隐藏项和条目上限设置不显示，原有值保留。这两项不改变文件打开权限，也不会让目录工具访问工作区外的目录。\n\n设置自动保存，并随开关变化动态注册或移除工具；执行和队列重放前也会重新核对权限。关闭某类能力会清理该类尚未执行的指令，保留已经打开的标签。两个开关均关闭时，讨论工作台使用的内部文件状态同步服务仍可运行。\n\n维护者需要核对存储时：打开能力使用上游 `agentOpenTools`；本扩展的 `agentControlTools`、`includeHiddenEntries`、`maxListedEntries` 保存在上游 `pluginSettings` 的控制器条目中。宿主读取实际加载的 better-sidebar 持久设置；日常使用直接在界面修改，无需手工填写设置命名空间。\n\n### 4. 两个开关怎样组合\n\n下表统计本扩展的工具，不包含上游独立注册的 `sidebar_open`。\n\n| 打开开关 | 管理开关 | 本扩展可用能力 | 工具数量 |\n|---|---|---|---|\n| 关闭 | 关闭 | 无模型工具 | 0 |\n| 开启 | 关闭 | 打开文件、文件夹窗口、网页，以及兼容打开 | 2 |\n| 关闭 | 开启 | 查询、切换和关闭已打开文件，操作文件树，显示／隐藏右侧栏 | 9 |\n| 开启 | 开启 | 上述全部能力，加上返回上一文件 | 12 |\n\n只开启管理时，可以操作已打开的文件；`reopen_previous_file` 仍不可用，因为它同时需要打开权限。\n\n### 5. 检查配置是否生效\n\n在需要操作的会话中对 Agent 说：\n\n> 请使用 sidebar-controller 技能，检查当前可用的侧边栏工具。告诉我 better_sidebar_open、get_sidebar_state 和 reopen_previous_file 是否可用，以及对应哪些开关。\n\n技能随插件自动注册，无需手动复制。技能能被读取不代表工具已经授权：Agent 必须检查实际可用工具列表，不能只凭文档中的名称假定工具存在。\n\n设置变化后等待同步，再发起新一轮对话核对。如果当前会话仍没有更新工具列表，可在新会话检查。若两个开关都已开启但工具仍不可用，检查依赖、插件加载及设置读取状态。\n\n## 操作分类与示例\n\n你只需要说自然语言。下面的调用示例用于理解 Agent 应选择哪个工具；无需自己提供会话编号。参数和返回字段的完整定义见 [工具参考](tools.md)。\n\n### 一、打开内容\n\n需要开启 **打开开关**。技能优先选择 `better_sidebar_open`，自动识别文件、文件夹和 HTTP(S) 网页。\n\n| 对 Agent 说 | 应调用的工具 |\n|---|---|\n| “用侧边栏控制技能打开 docs/会议纪要.md” | `better_sidebar_open(target: \"docs/会议纪要.md\")` |\n| “在侧边栏打开 F:/资料/项目计划.md” | `better_sidebar_open(target: \"F:/资料/项目计划.md\")` |\n| “把 docs 文件夹作为一个窗口打开” | `better_sidebar_open(target: \"docs\")` |\n| “在侧边栏打开 https://example.com” | `better_sidebar_open(target: \"https://example.com\")` |\n| “用兼容工具打开工作区里的 docs/会议纪要.md” | `open_file(path: \"docs/会议纪要.md\")` |\n\n相对路径按调用会话的工作目录解析。文件系统目标必须存在且可访问；增强入口允许工作区外的绝对路径。旧 `open_file` 保留工作区限制，通常只用于旧调用兼容。上游 `sidebar_open` 与增强工具同时存在时，技能优先使用增强入口。\n\n`title` 是可选的建议标题，例如 `better_sidebar_open(target: \"docs/会议纪要.md\", title: \"本周会议\")`。实际显示沿用上游接口支持的行为。\n\n**打开文件夹窗口**会创建以该文件夹为根的浏览窗口；**展开目录**则操作现有工作区文件树。打开外部文件夹不会改变会话工作目录，也不会扩大目录工具的访问范围。\n\n网页通过 DSH 原生浏览器打开，只接受 HTTP(S)；本地目标使用普通路径，不使用 `file:` URL。成功表示客户端接受了打开操作，网站是否可读仍取决于网络、登录及网页嵌入限制。\n\n### 二、管理文件标签\n\n需要开启 **管理开关**；返回上一文件还需要 **打开开关**。\n\n| 对 Agent 说 | 应调用的工具 |\n|---|---|\n| “现在打开的是哪个文件？还有哪些文件开着？” | `get_sidebar_state()` |\n| “切到已经打开的 docs/项目计划.md” | `activate_file(path: \"docs/项目计划.md\")` |\n| “回到刚才那个文件” | `reopen_previous_file()` |\n| “关闭当前文件” | `close_file()` |\n| “把 docs/会议纪要.md 关掉” | `close_file(path: \"docs/会议纪要.md\")` |\n\n查询结果中的 `currentFile` 是当前文件，`previousFile` 是上一文件，`openedFiles` 是已打开文件列表。官方右侧栏与底部工作台中的文件统一纳入状态；鼠标打开、切换或关闭文件也会同步。焦点落在非文件页面时，当前文件可能为空。\n\n切换工具用于已经打开的文件，不能用它打开一个新文件。已知的工作区外文件也支持关闭、切换和返回；返回工具使用系统记录的上一文件，不要求 Agent 自己记住路径。\n\n关闭文件后，界面可能自动激活另一文件，应再次查询状态确认。上述操作不用于网页、目录窗口或终端。\n\n### 三、操作工作区文件树\n\n需要开启 **管理开关**。这些工具使用现有 better-sidebar 文件树，并限制在调用会话的工作区内。\n\n| 对 Agent 说 | 应调用的工具 |\n|---|---|\n| “列一下工作区根目录” | `list_files()` |\n| “列一下 docs 里的文件” | `list_files(path: \"docs\")` |\n| “在文件树里展开 docs” | `expand_folder(path: \"docs\")` |\n| “收起文件树里的 docs” | `collapse_folder(path: \"docs\")` |\n| “我刚在外部新建了文件，刷新文件树” | `refresh_tree()` |\n\n路径不确定时先列目录，再用返回的真实路径打开文件。结果是否包含隐藏条目，以及单层返回多少条目，由前述列举设置控制。达到上限时留意 `truncated`，不要把截断结果当作完整目录。\n\n### 四、控制官方右侧栏显示\n\n需要开启 **管理开关**。\n\n| 对 Agent 说 | 应调用的工具 |\n|---|---|\n| “显示官方右侧栏” | `show_sidebar()` |\n| “隐藏官方右侧栏” | `hide_sidebar()` |\n\n这两个工具控制 DSH 官方右侧栏的展开状态，不独立控制 better-sidebar 底部工作台，也不操作左侧会话导航。隐藏侧栏不会关闭其中的文件。\n\n## 完整使用流程\n\n先开启两个开关。在当前工作区选择两个已有且可读的文件；以下以 `docs/会议纪要.md` 和 `docs/项目计划.md` 为例，没有这些文件时使用实际列举到的文件。\n\n| 步骤 | 对 Agent 说 | 工具与预期 |\n|---|---|---|\n| 1. 列目录 | “使用 sidebar-controller，列一下 docs，确认两个文件的路径” | `list_files(path: \"docs\")`，取得真实路径 |\n| 2. 打开文件 | “打开会议纪要，然后打开项目计划” | 依次调用 `better_sidebar_open`，等待各自执行确认 |\n| 3. 查询状态 | “现在打开的是哪个文件？上一文件是什么？” | `get_sidebar_state()`；当前为项目计划，上一文件为会议纪要 |\n| 4. 切换 | “切到已经打开的会议纪要” | `activate_file(path: \"docs/会议纪要.md\")`；当前为会议纪要 |\n| 5. 返回 | “回到刚才那个文件” | `reopen_previous_file()`；返回项目计划 |\n| 6. 关闭并确认 | “关闭当前文件，再告诉我还有哪些文件开着” | `close_file()` 后查询状态；项目计划从已打开列表移除 |\n\n如果中间出现排队或确认超时，先按下一节处理，再继续流程。你也可以用鼠标进行切换，再让 Agent 查询，核对两种操作得到的状态是否一致。\n\n操作只投递到调用会话。需要操作另一个会话时，在那个会话发出指令；切换前台界面不会让当前调用自动改为操作其他会话。\n\n## 结果与排错\n\n### 技能或工具不可用\n\n| 现象／结果 | 处理方法 |\n|---|---|\n| 找不到 `sidebar-controller` 技能或增强设置卡 | 检查增强插件及 better-sidebar 是否安装、启用和成功加载 |\n| 技能可见，但缺少某个工具 | 按开关组合表检查授权，再核对当前会话实际可用工具列表 |\n| `TOOL_DISABLED` | 对应能力已关闭；开启后再发新指令，该类尚未执行的旧指令已清理 |\n| `SIDEBAR_UNAVAILABLE` | 按返回的 `message` 检查依赖、兼容版本或目标界面能力；此结果不表示已经排队 |\n| `SETTINGS_UNAVAILABLE` | 无法读取权威设置，需要恢复设置读取；不会用客户端缓存或默认开启继续执行 |\n\nbetter-sidebar 缺失、停用或不兼容时，本扩展不注册模型工具，也不接受排队。技能不能绕过能力开关。\n\n### 等待执行或确认\n\n| 结果 | 含义与下一步 |\n|---|---|\n| `OK` | 客户端已确认接受操作；网页标签打开不保证网页加载成功 |\n| `QUEUED` | 依赖和权限有效，但调用会话界面暂未接入；等待该会话界面连接，不重复发送同一操作 |\n| `QUEUE_FULL` | 当前会话已有 64 条等待指令，新指令未入队；等待队列处理后再决定是否发起 |\n| `BRIDGE_TIMEOUT` | 4 秒内未收到确认，结果未知，操作可能已经发生；先查询状态或查看界面，避免重复打开 |\n\n管理开启时，确认超时后先调用 `get_sidebar_state`。管理关闭时先查看界面，或开启管理后查询。已发送但未确认的操作不会在重连后自动重复；仅尚未发送的队列会重放。\n\n### 路径或文件状态不符合条件\n\n| 结果 | 处理方法 |\n|---|---|\n| `FILE_NOT_FOUND` 或路径不可读 | 核对路径及访问权限；工作区内可先列目录，不反复猜文件名 |\n| `PATH_OUTSIDE_WORKSPACE` | 兼容打开或目录工具越界；打开外部内容使用增强入口，目录工具仍限工作区 |\n| `INVALID_TARGET` | 检查目标格式；网页只接受 HTTP(S)，本地文件使用普通路径 |\n| `FILE_NOT_OPEN` | 目标尚未打开；需要打开时调用增强打开工具 |\n| `NO_CURRENT_FILE` | 当前没有可操作的文件；先查询已打开文件或查看焦点位置 |\n| `NO_PREVIOUS_FILE` | 没有记录到上一文件；先打开或切换文件再使用返回 |\n\n## 进一步阅读\n\n- [README](../README.md)：功能概览与快速上手。\n- [工具参考](tools.md)：12 个工具的完整契约。\n- [捆绑技能](../skills/sidebar-controller/SKILL.md)：Agent 的执行规则。\n- [当前规格](SPEC.md)／[技术契约](architecture.md)：功能、配置和集成依据。\n";
		//#endregion
		//#region src/shared/listing-settings.ts
		/** One effective-value normalizer shared by host reads and the settings UI. */
		function resolveListingSettings(raw) {
			const record = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
			const bound = record.maxListedEntries;
			return {
				includeHiddenEntries: record.includeHiddenEntries === void 0 ? LISTING_SETTINGS_DEFAULTS.includeHiddenEntries : record.includeHiddenEntries === true,
				maxListedEntries: typeof bound === "number" && Number.isFinite(bound) ? Math.max(1, Math.floor(bound)) : LISTING_SETTINGS_DEFAULTS.maxListedEntries
			};
		}
		//#endregion
		//#region src/client/settings.ts
		/** Kept visible even when model management is disabled. Uses upstream persistence helpers. */
		function ControllerSettings(props) {
			const { pluginSettings: own, updatePluginSetting: update } = props;
			const access = accessFromPrefs(props.prefs);
			const listing = resolveListingSettings(own);
			const row = (title, desc, input) => (0, react.createElement)("label", { style: {
				display: "flex",
				justifyContent: "space-between",
				gap: 16,
				margin: "16px 0"
			} }, (0, react.createElement)("span", null, (0, react.createElement)("strong", null, title), (0, react.createElement)("div", { style: {
				opacity: .7,
				fontSize: 12
			} }, desc)), input);
			const toggle = (key, value, title, desc) => row(title, desc, (0, react.createElement)("input", {
				type: "checkbox",
				role: "switch",
				"aria-label": title,
				checked: value,
				style: {
					appearance: "none",
					flexShrink: 0,
					width: 36,
					height: 20,
					borderRadius: 10,
					cursor: "pointer",
					background: `radial-gradient(circle at ${value ? "26px" : "10px"} 10px, white 7px, transparent 8px), ${value ? "#2563eb" : "#9ca3af"}`
				},
				onChange: (e) => update(key, e.target.checked)
			}));
			return (0, react.createElement)("div", null, (0, react.createElement)("p", null, "增强 better-sidebar 的 Agent 控制：打开文件、文件夹与网页，管理文件树及文件标签。"), (0, react.createElement)("p", { role: "status" }, `打开能力：${access.open ? "开启" : "关闭"}；管理能力：${access.control ? "开启" : "关闭"}${!access.available ? "（扩展当前不可用）" : ""}`), (0, react.createElement)("p", null, "打开能力跟随本页「常规 → 为模型注入侧边栏打开工具」，同时提供 sidebar_open、better_sidebar_open 和兼容 open_file。"), toggle("agentControlTools", own.agentControlTools === true, "允许模型管理侧边栏", "启用状态查询、显隐、目录列举／展开／折叠／刷新、文件关闭／切换。两个开关均开启时可返回上一文件。默认关闭。"), own.agentControlTools === true ? (0, react.createElement)("div", null, toggle("includeHiddenEntries", listing.includeHiddenEntries, "列出隐藏项", "列举与刷新返回点开头的隐藏条目。"), row("单层条目上限", "超出时返回 truncated，默认 1000。", (0, react.createElement)("input", {
				type: "number",
				min: 1,
				value: listing.maxListedEntries,
				onChange: (e) => {
					const n = Number(e.target.value);
					if (Number.isFinite(n)) update("maxListedEntries", Math.max(1, Math.floor(n)));
				}
			}))) : null, (0, react.createElement)("p", null, "试着对 Agent 说：“用侧边栏控制技能打开 docs/会议纪要.md”“现在打开的是哪个文件？”“在文件树里展开 docs”“回到刚才那个文件”。"), (0, react.createElement)("details", null, (0, react.createElement)("summary", null, "查看 Agent 使用说明"), (0, react.createElement)("pre", { style: {
				whiteSpace: "pre-wrap",
				fontFamily: "inherit",
				overflowWrap: "anywhere",
				maxHeight: "60vh",
				overflowY: "auto"
			} }, _sidebar_controller_guide_default)));
		}
		//#endregion
		//#region src/client/native.ts
		/** HTTP stays on the desktop page's forwarding scheme; WebSocket uses the public shell transport. */
		function bridgeUrl(httpRoute, streamBaseUrl) {
			const url = streamBaseUrl ? new URL("sidebar-controller/ws", `${streamBaseUrl.split(/[?#]/)[0].replace(/\/+$/, "")}/`) : new URL(httpRoute);
			if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("desktop 未提供有效的 Host WebSocket 地址。");
			url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
			return url;
		}
		function pathKey(path) {
			const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
			return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith("//") ? normalized.toLowerCase() : normalized;
		}
		function resourcePath(address, sessionId, cwd) {
			if (!address.startsWith("dsh-resource://file/")) return void 0;
			try {
				const [scope, ...segments] = address.slice(20).split(/[?#]/)[0].split("/").map(decodeURIComponent);
				let path;
				if (scope === "session") {
					if (segments.shift() !== sessionId) return void 0;
					path = segments.join("/");
					if (!path.startsWith("/") && !/^[A-Za-z]:\//.test(path)) {
						if (!cwd) return void 0;
						path = `${cwd.replace(/\\/g, "/").replace(/\/+$/, "")}/${path}`;
					}
				} else if (scope === "absolute") {
					path = segments.join("/");
					path = path.startsWith("/") ? `/${path}` : /^[A-Za-z]:\//.test(path) ? path : `/${path}`;
				} else return void 0;
				return path;
			} catch {
				return;
			}
		}
		//#endregion
		//#region src/client/index.ts
		const inject = [
			"betterSidebar",
			"sessions",
			"sidebarRight"
		];
		function apply(ctx) {
			ctx.effect(() => {
				try {
					const service = ctx.betterSidebar;
					const native = () => ctx.get("sidebarRight");
					let store;
					let sessionId;
					let socket;
					let closed = false;
					let retry;
					let failures = 0;
					let lastSemantic;
					let wire;
					let chain = Promise.resolve();
					let syncChain = Promise.resolve();
					let bottomFocused = false;
					const roots = /* @__PURE__ */ new Map();
					const files = /* @__PURE__ */ new Map();
					const contexts = /* @__PURE__ */ new Map();
					const disposers = [];
					const send = (message) => {
						if (!socket || socket.readyState !== WebSocket.OPEN) return false;
						socket.send(JSON.stringify(message));
						return true;
					};
					const api = async (method, body) => {
						const response = await fetch(service.hostRouteUrl(`sidebar/api/${method}`), {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify(body),
							signal: AbortSignal.timeout(2e3)
						});
						const result = await response.json();
						if (!response.ok || !result.ok) throw new Error(result.error?.message ?? `HTTP ${response.status}`);
						return result.value;
					};
					const cwdOf = async (id) => {
						if (!roots.has(id)) roots.set(id, (await api("session.cwd", { sessionId: id })).cwd);
						return roots.get(id);
					};
					const nativeFiles = async (id) => {
						const sidebar = native();
						if (!sidebar) return [];
						const tabs = sidebar.openTabs.getSnapshot().filter((t) => t.sessionId === id && t.contentId.startsWith("dsh-resource://file/"));
						if (!tabs.length) return [];
						const cwd = await cwdOf(id);
						return (await Promise.all(tabs.map(async (tab) => {
							const path = resourcePath(tab.contentId, id, cwd);
							if (path === void 0) return void 0;
							const key = `${id}:${pathKey(path)}`;
							if (!files.has(key)) {
								const result = await api("fs.search", {
									sessionId: id,
									query: path
								}).catch(() => void 0);
								if (!result) return void 0;
								const found = result.matches.find((p) => pathKey(p) === pathKey(path));
								files.set(key, found && !result.dirs.some((p) => pathKey(p) === pathKey(found)) ? found : null);
							}
							const file = files.get(key);
							return file ? {
								tab,
								path: file
							} : void 0;
						}))).filter((entry) => entry !== void 0);
					};
					const sync = async (force = false) => {
						const id = sessionId;
						if (!id || closed || capturing) return;
						const entries = await nativeFiles(id);
						if (id !== sessionId || closed || native()?.mounted.getSnapshot() !== id) return;
						const snapshot = service.getSnapshot();
						const state = snapshot.sessionId === id ? snapshot.state : void 0;
						const sidebar = native();
						const current = bottomFocused ? state ? activeFileOf(state) : null : entries.find((e) => e.tab.tabId === sidebar?.active()?.id)?.path ?? null;
						const context = deriveFileContext(contexts.get(id), current);
						contexts.set(id, context);
						const all = [...entries.map((e) => e.path), ...state ? openedFilesOf(state) : []];
						const openedFiles = all.filter((p, index) => all.findIndex((q) => pathKey(q) === pathKey(p)) === index);
						const recent = context.previousFile && openedFiles.some((p) => pathKey(p) === pathKey(context.previousFile)) ? context.previousFile : null;
						wire = {
							sessionId: id,
							sidebarVisible: sidebar?.isExpanded() ?? false,
							...context,
							openedFiles,
							expandedFolders: state?.expanded ?? [],
							fileCandidate: current ?? recent,
							fileCandidateSource: current ? "current" : recent ? "recent" : null,
							updatedAt: Date.now()
						};
						const semantic = JSON.stringify({
							...wire,
							updatedAt: 0
						});
						if ((force || lastSemantic !== semantic) && send({
							type: "state",
							state: wire
						})) lastSemantic = semantic;
					};
					const push = (force = false) => {
						syncChain = syncChain.catch(() => {}).then(() => sync(force));
						return syncChain;
					};
					const command = async (id, cmd, ws, targetSession) => {
						const sameSession = () => socket === ws && sessionId === targetSession && native()?.mounted.getSnapshot() === targetSession;
						const ack = (ok, code, message) => {
							if (socket === ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({
								type: "command-result",
								result: {
									id,
									ok,
									code,
									message
								}
							}));
						};
						if (!sameSession()) return ack(false, "SIDEBAR_UNAVAILABLE", "调用会话界面已离开，指令未执行。");
						try {
							await push(true);
							if (!sameSession()) return ack(false, "SIDEBAR_UNAVAILABLE", "调用会话界面已离开。");
							const denied = refusal(cmd.name, accessFromPrefs(service.getSnapshot().prefs));
							if (denied) return ack(false, denied.code, denied.message);
							const sidebar = native();
							const scope = {
								sessionId: targetSession,
								cwd: await cwdOf(targetSession)
							};
							if (!sameSession()) return ack(false, "SIDEBAR_UNAVAILABLE", "调用会话界面已离开。");
							const revoked = refusal(cmd.name, accessFromPrefs(service.getSnapshot().prefs));
							if (revoked) return ack(false, revoked.code, revoked.message);
							const openFile = async (path, title) => {
								const existing = (await nativeFiles(targetSession)).find((e) => pathKey(e.path) === pathKey(path));
								if (!sameSession()) throw new Error("调用会话界面已离开。");
								const denied = refusal(cmd.name, accessFromPrefs(service.getSnapshot().prefs));
								if (denied) return denied;
								const bottom = service.getSnapshot().state;
								const tab = bottom && findTabByPath(bottom, path);
								bottomFocused = !existing && !!tab;
								if (existing) sidebar.focus(existing.tab.tabId);
								else if (tab) service.activateTab(tab.id, scope);
								else service.openFile(scope, path, title);
								await push(true);
								return wire?.openedFiles.some((p) => pathKey(p) === pathKey(path)) ? void 0 : {
									ok: false,
									code: "SIDEBAR_UNAVAILABLE",
									message: "上游未接受文件打开操作。"
								};
							};
							switch (cmd.name) {
								case "sync_state": break;
								case "show_sidebar":
									if (!sidebar.isExpanded()) sidebar.toggleExpanded();
									break;
								case "hide_sidebar":
									if (sidebar.isExpanded()) sidebar.toggleExpanded();
									break;
								case "expand_folder":
								case "collapse_folder":
									if (!store) return ack(false, "SIDEBAR_UNAVAILABLE", "文件树存储尚未就绪。");
									store.reduce((state) => ({
										...state,
										expanded: cmd.name === "expand_folder" ? [.../* @__PURE__ */ new Set([...state.expanded, cmd.path])] : state.expanded.filter((p) => pathKey(p) !== pathKey(cmd.path))
									}));
									break;
								case "refresh_tree":
									files.clear();
									roots.delete(targetSession);
									window.dispatchEvent(new Event("dsh-sidebar:refresh-files"));
									break;
								case "better_sidebar_open": {
									bottomFocused = false;
									if (cmd.kind === "url") sidebar.openTab("browser", { params: {
										url: cmd.target,
										title: cmd.title
									} });
									else if (cmd.kind === "folder") service.openTab({
										type: "editor",
										path: cmd.target,
										title: cmd.title,
										meta: { dir: true }
									}, scope);
									else {
										const error = await openFile(cmd.target, cmd.title);
										if (error) return ack(false, error.code, error.message);
									}
									const after = sidebar.openTabs.getSnapshot().filter((t) => t.sessionId === targetSession);
									if (cmd.kind === "url" ? sidebar.active()?.kind !== "browser" : cmd.kind === "folder" && !after.some((t) => pathKey(resourcePath(t.contentId, targetSession, roots.get(targetSession)) ?? "") === pathKey(cmd.target))) return ack(false, "SIDEBAR_UNAVAILABLE", "上游未接受目标，请检查对应卡片是否启用。");
									break;
								}
								case "open_file":
								case "reopen_previous_file": {
									const path = cmd.name === "open_file" ? cmd.path : cmd.path ?? wire?.previousFile;
									if (!path) return ack(false, "NO_PREVIOUS_FILE", "没有上一文件。");
									const error = await openFile(path, cmd.name === "open_file" ? cmd.title : void 0);
									if (error) return ack(false, error.code, error.message);
									break;
								}
								case "close_file":
								case "activate_file": {
									const path = cmd.path;
									if (!path) return ack(false, "NO_CURRENT_FILE", "当前没有文件。");
									const entries = await nativeFiles(targetSession);
									if (!sameSession()) return ack(false, "SIDEBAR_UNAVAILABLE", "调用会话界面已离开。");
									const tab = entries.find((e) => pathKey(e.path) === pathKey(path));
									const state = service.getSnapshot().state;
									const bottom = state && findTabByPath(state, path);
									if (tab) {
										bottomFocused = false;
										if (cmd.name === "close_file") sidebar.close(tab.tab.tabId);
										else sidebar.focus(tab.tab.tabId);
									} else if (bottom) {
										bottomFocused = true;
										if (cmd.name === "close_file") service.closeTab(bottom.id, scope);
										else service.activateTab(bottom.id, scope);
									} else return ack(false, "FILE_NOT_OPEN", "目标文件未打开。");
									break;
								}
							}
							await push(true);
							if (!sameSession()) return ack(false, "SIDEBAR_UNAVAILABLE", "调用会话界面已离开，结果未确认。");
							if (cmd.name === "show_sidebar" && !sidebar.isExpanded() || cmd.name === "hide_sidebar" && sidebar.isExpanded()) return ack(false, "SIDEBAR_UNAVAILABLE", "侧栏未接受显隐操作。");
							if (cmd.name === "close_file" && wire?.openedFiles.some((p) => pathKey(p) === pathKey(cmd.path ?? ""))) return ack(false, "SIDEBAR_UNAVAILABLE", "文件仍在打开列表中，关闭未确认。");
							if (cmd.name === "activate_file" && pathKey(wire?.currentFile ?? "") !== pathKey(cmd.path)) return ack(false, "SIDEBAR_UNAVAILABLE", "目标文件尚未激活，切换未确认。");
							ack(true, "OK", cmd.name === "better_sidebar_open" && cmd.kind === "url" ? "网页标签已打开，页面加载由浏览器决定。" : "操作已接受，状态已同步。");
						} catch (error) {
							ack(false, "INTERNAL_ERROR", error instanceof Error ? error.message : String(error));
						}
					};
					const connect = (target) => {
						if (closed || sessionId !== target) return;
						window.clearTimeout(retry);
						retry = void 0;
						socket?.close();
						const transport = globalThis.__DSH_TRANSPORT__;
						const url = bridgeUrl(service.hostRouteUrl("sidebar-controller/ws"), transport?.streamBaseUrl);
						url.searchParams.set("sessionId", target);
						const ws = new WebSocket(url.toString());
						socket = ws;
						ws.onopen = () => {
							if (socket !== ws) return;
							failures = 0;
							lastSemantic = void 0;
							send({
								type: "hello",
								sessionId: target
							});
							push(true).catch(() => {});
						};
						ws.onmessage = (event) => {
							if (socket !== ws || typeof event.data !== "string") return;
							try {
								const message = parseHostMessage(event.data);
								chain = chain.catch(() => {}).then(() => command(message.id, message.command, ws, target));
							} catch {}
						};
						ws.onclose = () => {
							if (socket !== ws) return;
							socket = void 0;
							if (!closed && sessionId === target && ++failures < 8) retry = window.setTimeout(() => connect(target), 2e3);
						};
						ws.onerror = () => ws.close();
					};
					let capturing = false;
					let anchorRestore;
					let anchorTimer;
					const cleanupAnchor = () => {
						const restore = anchorRestore;
						if (!restore) return;
						anchorRestore = void 0;
						window.clearTimeout(anchorTimer);
						service.closeTab(ANCHOR_ID, { sessionId: restore.sessionId });
						const sidebar = native();
						if (sidebar?.mounted.getSnapshot() === restore.sessionId) sidebar.openTabs.getSnapshot().filter((t) => t.sessionId === restore.sessionId && t.kind === "dsh-better-sidebar-controller:anchor").forEach((t) => sidebar.close(t.tabId));
						if (sessionId === restore.sessionId) {
							if (restore.active) sidebar?.focus(restore.active);
							if (!restore.visible && sidebar?.isExpanded()) sidebar.toggleExpanded();
						}
						capturing = false;
					};
					const disposeAnchor = service.registerTab({
						id: ANCHOR_ID,
						hidden: true,
						single: true,
						title: "Sidebar Controller 增强控制",
						settings: { render: ControllerSettings },
						component: (props) => {
							store = props.store;
							queueMicrotask(() => {
								if (!closed) cleanupAnchor();
							});
							return null;
						}
					});
					const captureStore = () => {
						if (store || capturing || !sessionId || !service.isTabEnabled("dsh-better-sidebar-controller:anchor")) return;
						capturing = true;
						const sidebar = native();
						const target = sessionId;
						const active = sidebar.active();
						anchorRestore = {
							sessionId: target,
							active: active?.kind === "dsh-better-sidebar-controller:anchor" ? sidebar.openTabs.getSnapshot().find((t) => t.sessionId === target && t.kind !== "dsh-better-sidebar-controller:anchor")?.tabId : active?.id,
							visible: sidebar.isExpanded()
						};
						try {
							service.openTab({
								type: ANCHOR_ID,
								id: ANCHOR_ID,
								title: ""
							}, { sessionId: target });
						} catch {
							anchorRestore = void 0;
							capturing = false;
							return;
						}
						anchorTimer = window.setTimeout(cleanupAnchor, 2e3);
					};
					const change = () => {
						const next = native()?.mounted.getSnapshot();
						if (next !== sessionId) {
							cleanupAnchor();
							sessionId = next;
							failures = 0;
							lastSemantic = void 0;
							bottomFocused = false;
							window.clearTimeout(retry);
							retry = void 0;
							const old = socket;
							socket = void 0;
							old?.close();
						}
						if (next && native()?.active() !== void 0) {
							if (!socket && retry === void 0) connect(next);
							captureStore();
							if (store && !capturing) native()?.openTabs.getSnapshot().filter((t) => t.sessionId === next && t.kind === "dsh-better-sidebar-controller:anchor").forEach((t) => native()?.close(t.tabId));
						}
						push().catch(() => {});
					};
					const focus = (event) => {
						const target = event.target;
						if (!target?.closest) return;
						bottomFocused = target.closest("[data-dsh-bottom-panel]") !== null;
						push().catch(() => {});
					};
					document.addEventListener("pointerdown", focus, true);
					document.addEventListener("focusin", focus, true);
					disposers.push(service.subscribeState(change));
					const sidebar = native();
					if (sidebar) disposers.push(sidebar.mounted.subscribe(change), sidebar.openTabs.subscribe(change));
					disposers.push(ctx.sessions.list.subscribe(change));
					const timer = window.setInterval(change, 500);
					change();
					return () => {
						cleanupAnchor();
						closed = true;
						socket?.close();
						window.clearTimeout(retry);
						window.clearInterval(timer);
						disposers.forEach((off) => off());
						disposeAnchor();
						document.removeEventListener("pointerdown", focus, true);
						document.removeEventListener("focusin", focus, true);
					};
				} catch (error) {
					console.error("[sidebar-controller] client initialization failed", error);
					throw error;
				}
			}, "dsh-better-sidebar-controller: desktop bridge");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
