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
		var _sidebar_controller_guide_default = "# 使用指南（Usage）\n\n适用于本仓库 0.3.0 源码，目标组合 DSH desktop 0.2.0-rc.2／better-sidebar 0.25.0。验证范围见 [交付记录](VERIFICATION-0.3.0.md)，本机日常是否启用需单独核对。\n\n## 增强版如何通过 Agent 使用\n\n### 先准备环境和开关\n\n目标环境：DSH desktop 内置 DSH `0.2.0-rc.2`、已启用且兼容的 `dsh-better-sidebar@0.25.0`，以及 `dsh-better-sidebar-controller`。本机目前自研插件停用的事实不能因本指南而视作已安装／已启用；安装与验证完成由交付记录另行说明。本指南使用 desktop，不恢复旧 web 环境。\n\n启用步骤：\n\n1. 打开 desktop 的「设置 → 侧边卡片」。\n2. 在「常规」开启「为模型注入侧边栏打开工具」。它同时允许上游 `sidebar_open`、增强 `better_sidebar_open` 和兼容 `open_file`；未设置时关闭。\n3. 找到「Sidebar Controller 增强控制」卡片，点击「功能设置」，开启「允许模型管理侧边栏」（默认关闭）。它允许查询状态、管理文件标签、控制侧边栏和目录树；返回上一文件需要这项和上面的打开开关都开启。\n4. 按需调整「列出隐藏项」（有效默认开启）及「列表上限」（有效默认 1000）；它们只控制目录工具，不改变可打开的文件范围。管理关闭时这两行隐藏，原有值不会删除。\n5. 在当前会话对 Agent 说：「请使用 sidebar-controller 技能，先检查当前可用的侧边栏工具，再告诉我哪些能力已开启。」\n\n技能由插件自动注册，无需手动复制。技能可见不表示模型已经获得全部工具：如果 Agent 找不到技能，先核对增强插件和依赖是否真正启用；如果技能可见但某工具不在当前可用工具列表中，先看对应开关，不要让 Agent 凭空执行工具名称。设置变化会自动同步工具，执行前还会重新核对权限；已有会话若没有更新可用工具列表，待设置同步后开启新一轮对话或新会话核对。\n\n工具开关关闭不会关闭讨论工作台使用的内部文件状态服务。better-sidebar 缺失、停用或不兼容时，模型工具不提供，操作也不会排队等待一个不存在的依赖。\n\n### 直接用自然语言发出指令\n\n用户不需要输入工具代码，也不需要自己提供 sessionId。下面的“工具”列用于了解或排查 Agent 应如何调用。\n\n| 对 Agent 说 | 对应工具参数 | 需要的开关 |\n|---|---|---|\n| 「用侧边栏控制技能打开 docs/会议纪要.md」 | `better_sidebar_open(target: \"docs/会议纪要.md\")` | 打开 |\n| 「在侧边栏打开 F:/资料/项目计划.md」 | `better_sidebar_open(target: \"F:/资料/项目计划.md\")` | 打开 |\n| 「把 docs 文件夹作为一个窗口打开」 | `better_sidebar_open(target: \"docs\")` | 打开 |\n| 「在侧边栏打开 https://example.com」 | `better_sidebar_open(target: \"https://example.com\")` | 打开 |\n| 「现在打开的是哪个文件？有哪些文件开着？」 | `get_sidebar_state()` | 管理 |\n| 「显示侧边栏」 | `show_sidebar()` | 管理 |\n| 「隐藏侧边栏」 | `hide_sidebar()` | 管理 |\n| 「列一下工作区根目录／docs 目录」 | `list_files()`／`list_files(path: \"docs\")` | 管理 |\n| 「在文件树里展开 docs」 | `expand_folder(path: \"docs\")` | 管理 |\n| 「收起文件树里的 docs」 | `collapse_folder(path: \"docs\")` | 管理 |\n| 「我刚在外部新建了文件，刷新文件树」 | `refresh_tree()` | 管理 |\n| 「关闭当前文件／把 docs/会议纪要.md 关掉」 | `close_file()`／`close_file(path: \"docs/会议纪要.md\")` | 管理 |\n| 「切到已经打开的 docs/项目计划.md」 | `activate_file(path: \"docs/项目计划.md\")` | 管理 |\n| 「回到刚才那个文件」 | `reopen_previous_file()` | 打开和管理 |\n| 「用兼容工具打开工作区内的 docs/会议纪要.md」 | `open_file(path: \"docs/会议纪要.md\")` | 打开 |\n\n共 12 个工具；`show_sidebar/hide_sidebar`、`expand_folder/collapse_folder` 在表中分别列出。一般打开优先选择 `better_sidebar_open`；`open_file` 用于保留旧调用兼容。上游 `sidebar_open` 可以同时存在，由上游管理注册，不需要卸载或改写它。\n\n**打开文件夹窗口**是在侧边栏打开以该文件夹为根的浏览窗口；**展开目录**是在现有工作区文件树里展开一层。两者不是同一个动作，也不会因为打开文件夹窗口就改变会话工作目录。\n\n### 完整操作流程示例\n\n先启用两个开关，使用已有且可读的 `docs/会议纪要.md`、`docs/项目计划.md`。没有这两个文件时，让 Agent 从实际目录中选择两个已有文件，不为了验收本指南创建或覆盖文件。\n\n1. 对 Agent 说：「使用 sidebar-controller，列一下 docs 的文件，确认会议纪要和项目计划的路径。」调用 `list_files(path: \"docs\")`。\n2. 说：「在侧边栏打开会议纪要。」Agent 使用列举到的真实路径调用 `better_sidebar_open`，收到客户端确认后报告已接受打开操作。\n3. 说：「现在打开的是哪个文件？」调用 `get_sidebar_state()`，`currentFile` 应为会议纪要的绝对路径。\n4. 说：「打开项目计划，再切回会议纪要，然后切到已经打开的项目计划。」打开用 `better_sidebar_open`，后续切换用 `activate_file`；最后 currentFile 为项目计划，previousFile 为会议纪要。\n5. 说：「回到刚才那个文件。」调用 `reopen_previous_file()`，返回会议纪要。\n6. 说：「关闭当前文件，再告诉我还有哪些文件开着。」依次调用 `close_file()` 和 `get_sidebar_state()`；会议纪要从 openedFiles 中移除，不要求关闭后 currentFile 必定为空，上游可能激活其他文件。\n\n你也可以用鼠标打开、切换或关闭这些文件，再让 Agent 查询状态。原生侧栏及底部工作台的文件都应能被识别；网页、目录窗口、终端等页面不作为当前文件或文档候选。状态按会话隔离：不要在一个会话下要求 Agent 声称操作了另一个会话。\n\n### 路径、标题与外部文件\n\n- 相对路径相对于调用会话的工作目录，不是 desktop 可执行文件目录。\n- 增强入口支持工作区外的绝对路径和合法符号链接的真实目标；旧 `open_file` 与目录工具仍限制在工作区内，越界会返回 `PATH_OUTSIDE_WORKSPACE`。\n- 外部路径由用户提供；工作区里的未知路径可先 `list_files` 查找。打开外部目录不会让 `list_files` 获得该目录的列举权限。\n- 已打开的外部文件可以查询、关闭和切换；返回上一文件使用系统记录，不需要 Agent 自己记路径，也不能借此访问任意未知外部文件。\n- `title` 可作为建议标题传给上游；实际页面标题按上游公开接口支持显示，不承诺额外改名。\n- HTTP(S) 网页使用 DSH 原生浏览器。某网站拒绝 iframe 嵌入、登录限制或网络失败时，打开标签不能保证网页可读；Agent 应按界面实际情况说明。\n\n### 结果说明与排查\n\n| 情况 | 含义及下一步 |\n|---|---|\n| 找不到某个工具 | 核对依赖与开关；技能不是绕过开关的入口，不以 shell 或其他工具伪装调用 |\n| `OK` | 客户端已确认接受对应操作；网页仍可能加载失败 |\n| `QUEUED` | 有效依赖和权限均满足，但该会话界面暂未连接；等对应会话界面接入，不重复发同一指令 |\n| `QUEUE_FULL` | 当前会话已有 64 条等待指令，新指令未入队；等待队列执行后再决定是否发起 |\n| `TOOL_DISABLED` | 调用期间开关被关闭；开启对应能力后再发新指令，旧未执行指令已清理 |\n| `SIDEBAR_UNAVAILABLE` | 依赖／界面或目标页面能力不可用；按 message 核对启用、兼容版本和原生侧栏，不能当作已排队 |\n| `SETTINGS_UNAVAILABLE` | 无法取得权威设置；恢复上游设置读取，不以默认开启或客户端缓存继续执行 |\n| `BRIDGE_TIMEOUT` | 4 秒内没有确认，结果未知，操作可能已经发生；管理开关开启时先查询状态并核对界面，不盲目重复打开。管理关闭时先目视确认，或自行开启管理再查询 |\n| `FILE_NOT_FOUND`／不可读路径 | 核对真实路径和文件访问状态；工作区可先列目录，不反复猜路径 |\n| `PATH_OUTSIDE_WORKSPACE` | 使用了受工作区限制的兼容/目录工具；打开外部内容用增强入口，不扩大目录权限 |\n| `FILE_NOT_OPEN`／`NO_CURRENT_FILE`／`NO_PREVIOUS_FILE` | 分别表示文件未打开、无当前文件、无上一文件；按状态处理，不伪造文件指针 |\n| `INVALID_TARGET` | 目标或协议非法；网页只用 HTTP(S)，本地文件用普通路径，不能使用 file: 或 javascript: |\n\n关闭打开或管理能力只清理相应尚未执行的操作，不关闭已经打开的标签。已发送但未确认的操作不会在重连后自动重复；仅尚未发送的队列会重放。\n\n本扩展不编辑文件内容、不做搜索替换或 Git 操作，也不新增网页／目录窗口关闭工具。Agent 调用这组工具只是在现有界面中打开与管理内容。\n";
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
