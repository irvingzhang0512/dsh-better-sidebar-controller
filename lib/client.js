window.__ModuleLoader__.load({
	id: "dsh-better-sidebar-controller",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
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
		/** The id of the tab currently active in the active pane, or null. */
		function activeTabIdOf(state) {
			const leaves = allLeaves(state);
			return (leaves.find((leaf) => leaf.id === state.activePane) ?? leaves[0])?.active ?? null;
		}
		/**
		* Pick the tab that should remain visible when an internal/temporary tab is
		* removed. Prefer the active pane and its most recently appended tab, matching
		* better-sidebar's close-tab fallback, then fall back to any other pane.
		*/
		function replacementTabId(state, excludedId) {
			const leaves = allLeaves(state);
			const activeLeaf = leaves.find((leaf) => leaf.id === state.activePane);
			if (activeLeaf !== void 0) for (let index = activeLeaf.tabs.length - 1; index >= 0; index -= 1) {
				const tab = activeLeaf.tabs[index];
				if (tab !== void 0 && tab.id !== excludedId) return tab.id;
			}
			for (const leaf of leaves) {
				const active = leaf.active === excludedId ? void 0 : leaf.tabs.find((tab) => tab.id === leaf.active);
				if (active !== void 0) return active.id;
				for (let index = leaf.tabs.length - 1; index >= 0; index -= 1) {
					const tab = leaf.tabs[index];
					if (tab !== void 0 && tab.id !== excludedId) return tab.id;
				}
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
		/** Derive the controller state for one snapshot, threading previous/current across calls. */
		function deriveSidebarState(prev, snapshot, nativeVisible) {
			const state = snapshot.state;
			const current = state === void 0 ? null : activeFileOf(state);
			const fileContext = deriveFileContext(prev, current);
			const openedFiles = state === void 0 ? [] : openedFilesOf(state);
			const recent = fileContext.previousFile !== null && openedFiles.includes(fileContext.previousFile) ? fileContext.previousFile : null;
			return {
				sessionId: snapshot.sessionId ?? null,
				sidebarVisible: nativeVisible ?? state?.bottomOpen ?? false,
				openedFiles,
				expandedFolders: state?.expanded ?? [],
				fileCandidate: current ?? recent,
				fileCandidateSource: current !== null ? "current" : recent !== null ? "recent" : null,
				...fileContext
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
		/** Last path segment of an absolute path (display helper). */
		function baseName(path) {
			const trimmed = path.replace(/[\\/]+$/, "");
			const at = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
			return at === -1 ? trimmed : trimmed.slice(at + 1);
		}
		//#endregion
		//#region src/shared/types.ts
		/** Every command name (kept in sync with the union above; used for
		*  validation and for SKILL/docs contract tests). */
		const CONTROLLER_COMMAND_NAMES = [
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
				case "show_sidebar":
				case "hide_sidebar":
				case "refresh_tree":
				case "reopen_previous_file":
				case "sync_state": return { name };
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
		//#region src/client/index.ts
		const inject = ["betterSidebar"];
		/** Hidden anchor tab type (captures the store through the public registry API). */
		const ANCHOR_TYPE = "dsh-better-sidebar-controller:anchor";
		/** The anchor tab's stable id (dedupes on reopen / restore). */
		const ANCHOR_TAB_ID = "dsh-better-sidebar-controller:anchor";
		/** Bridge upgrade path (must match the host half). */
		const BRIDGE_PATH = "/sidebar-controller/ws";
		/** Reconnect cap so a refused endpoint never spins forever. */
		const RECONNECT_FAILURE_LIMIT = 8;
		const RECONNECT_DELAY_MS = 2e3;
		/**
		* Client plugin body.
		* @param ctx - the client cordis context (betterSidebar injected).
		*/
		function apply(ctx) {
			ctx.effect(() => {
				const service = ctx.betterSidebar;
				const nativeSidebar = () => ctx.get("sidebarRight");
				let store;
				let derived;
				let socket = null;
				let attachedSession = null;
				let sessionId;
				let retryTimer;
				let closed = false;
				let failures = 0;
				let lastSemantic;
				let lastIntentionallyClosed = null;
				let anchorOriginalBottomOpen;
				const send = (message) => {
					if (socket !== null && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
				};
				const pushState = () => {
					if (sessionId === void 0) return;
					const snapshot = service.getSnapshot();
					const next = deriveSidebarState(derived, snapshot, nativeSidebar()?.isExpanded());
					derived = next;
					const semantic = JSON.stringify([
						next.sidebarVisible,
						next.currentFile,
						next.previousFile,
						next.fileCandidate,
						next.fileCandidateSource,
						next.openedFiles,
						next.expandedFolders
					]);
					if (semantic === lastSemantic) return;
					lastSemantic = semantic;
					const wire = {
						sessionId,
						sidebarVisible: next.sidebarVisible,
						currentFile: next.currentFile,
						previousFile: next.previousFile,
						fileCandidate: next.fileCandidate,
						fileCandidateSource: next.fileCandidateSource,
						openedFiles: next.openedFiles,
						expandedFolders: next.expandedFolders,
						updatedAt: Date.now()
					};
					send({
						type: "state",
						state: wire
					});
				};
				const ack = (id, result) => {
					send({
						type: "command-result",
						result: {
							id,
							...result
						}
					});
				};
				const connect = (targetSessionId) => {
					if (closed) return;
					if (socket !== null) {
						if (attachedSession !== null) lastIntentionallyClosed = attachedSession;
						socket.close();
						socket = null;
					}
					const url = new URL(BRIDGE_PATH, window.location.origin);
					url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
					url.search = new URLSearchParams({ sessionId: targetSessionId }).toString();
					const ws = new WebSocket(url.toString());
					socket = ws;
					ws.onopen = () => {
						if (socket !== ws) return;
						attachedSession = targetSessionId;
						failures = 0;
						send({
							type: "hello",
							sessionId: targetSessionId
						});
						pushState();
					};
					ws.onmessage = (event) => {
						if (typeof event.data !== "string") return;
						try {
							const message = parseHostMessage(event.data);
							handleCommand(message.id, message.command);
						} catch {}
					};
					ws.onclose = () => {
						if (socket === ws) socket = null;
						if (attachedSession === targetSessionId) attachedSession = null;
						if (closed) return;
						if (lastIntentionallyClosed === targetSessionId) {
							lastIntentionallyClosed = null;
							return;
						}
						failures += 1;
						if (failures >= RECONNECT_FAILURE_LIMIT) return;
						retryTimer = window.setTimeout(() => connect(targetSessionId), RECONNECT_DELAY_MS);
					};
					ws.onerror = () => {
						ws.close();
					};
				};
				/** The session scope for service calls (the attached / active session). */
				const scopeOf = () => {
					const id = attachedSession ?? sessionId;
					return typeof id === "string" && id !== "" ? { sessionId: id } : null;
				};
				const storeUnavailable = (id) => {
					ack(id, {
						ok: false,
						code: "SIDEBAR_UNAVAILABLE",
						message: "Sidebar 存储不可用，请刷新页面后重试。"
					});
				};
				const handleCommand = (id, command) => {
					switch (command.name) {
						case "show_sidebar": {
							const sidebar = nativeSidebar();
							if (sidebar === void 0) return storeUnavailable(id);
							if (!sidebar.isExpanded()) sidebar.toggleExpanded();
							pushState();
							ack(id, {
								ok: true,
								code: "OK",
								message: "侧边栏已打开。",
								value: { sidebarVisible: true }
							});
							break;
						}
						case "hide_sidebar": {
							const sidebar = nativeSidebar();
							if (sidebar === void 0) return storeUnavailable(id);
							if (sidebar.isExpanded()) sidebar.toggleExpanded();
							pushState();
							ack(id, {
								ok: true,
								code: "OK",
								message: "侧边栏已关闭。",
								value: { sidebarVisible: false }
							});
							break;
						}
						case "expand_folder": {
							const s = store;
							if (s === void 0) return storeUnavailable(id);
							const path = command.path;
							s.reduce((state) => state.expanded.includes(path) ? state : {
								...state,
								expanded: [...state.expanded, path]
							});
							ack(id, {
								ok: true,
								code: "OK",
								message: `已展开 ${baseName(path)}。`,
								value: {
									path,
									expanded: true
								}
							});
							break;
						}
						case "collapse_folder": {
							const s = store;
							if (s === void 0) return storeUnavailable(id);
							const path = command.path;
							s.reduce((state) => !state.expanded.includes(path) ? state : {
								...state,
								expanded: state.expanded.filter((x) => x !== path)
							});
							ack(id, {
								ok: true,
								code: "OK",
								message: `已收起 ${baseName(path)}。`,
								value: {
									path,
									expanded: false
								}
							});
							break;
						}
						case "refresh_tree":
							window.dispatchEvent(new Event("dsh-sidebar:refresh-files"));
							ack(id, {
								ok: true,
								code: "OK",
								message: "文件树已刷新。"
							});
							break;
						case "open_file": {
							const scope = scopeOf();
							if (scope === null) return ack(id, {
								ok: false,
								code: "SIDEBAR_UNAVAILABLE",
								message: "当前没有活动的会话。"
							});
							service.openFile(scope, command.path, command.title);
							ack(id, {
								ok: true,
								code: "OK",
								message: `已打开 ${baseName(command.path)}。`,
								value: { path: command.path }
							});
							break;
						}
						case "close_file": {
							const snapshot = service.getSnapshot();
							const state = snapshot.state;
							if (state === void 0) return storeUnavailable(id);
							const path = command.path;
							if (path === void 0 || path === "") return ack(id, {
								ok: false,
								code: "NO_CURRENT_FILE",
								message: "未指定文件且当前没有已打开的文件。"
							});
							const tab = findTabByPath(state, path);
							if (tab === void 0) return ack(id, {
								ok: false,
								code: "FILE_NOT_OPEN",
								message: `文件未打开: ${path}`
							});
							const scope = scopeOf() ?? { sessionId: snapshot.sessionId ?? "" };
							service.closeTab(tab.id, scope);
							ack(id, {
								ok: true,
								code: "OK",
								message: `已关闭 ${baseName(path)}。`,
								value: { path }
							});
							break;
						}
						case "activate_file": {
							const snapshot = service.getSnapshot();
							const state = snapshot.state;
							if (state === void 0) return storeUnavailable(id);
							const path = command.path;
							const tab = findTabByPath(state, path);
							if (tab === void 0) return ack(id, {
								ok: false,
								code: "FILE_NOT_OPEN",
								message: `文件未打开: ${path}。请先使用 open_file。`
							});
							const scope = scopeOf() ?? { sessionId: snapshot.sessionId ?? "" };
							service.activateTab(tab.id, scope);
							ack(id, {
								ok: true,
								code: "OK",
								message: `已切换到 ${baseName(path)}。`,
								value: { path }
							});
							break;
						}
						case "reopen_previous_file": {
							const prev = derived?.previousFile ?? null;
							if (prev === null) return ack(id, {
								ok: false,
								code: "NO_PREVIOUS_FILE",
								message: "没有上一个文件。"
							});
							const scope = scopeOf();
							if (scope === null) return ack(id, {
								ok: false,
								code: "SIDEBAR_UNAVAILABLE",
								message: "当前没有活动的会话。"
							});
							service.openFile(scope, prev);
							ack(id, {
								ok: true,
								code: "OK",
								message: `已打开上一个文件 ${baseName(prev)}。`,
								value: { path: prev }
							});
							break;
						}
						case "sync_state":
							pushState();
							ack(id, {
								ok: true,
								code: "OK",
								message: "状态已同步。"
							});
							break;
						default: ack(id, {
							ok: false,
							code: "UNKNOWN_COMMAND",
							message: "未知命令。"
						});
					}
				};
				let anchorCleanupScheduled = false;
				const removeAnchor = (snapshot) => {
					if (snapshot.state === void 0 || snapshot.sessionId === void 0) return;
					if (!allLeaves(snapshot.state).some((leaf) => leaf.tabs.some((tab) => tab.id === ANCHOR_TAB_ID))) return;
					const active = activeTabIdOf(snapshot.state);
					const replacement = active === ANCHOR_TAB_ID ? replacementTabId(snapshot.state, ANCHOR_TAB_ID) : active;
					service.closeTab(ANCHOR_TAB_ID, { sessionId: snapshot.sessionId });
					if (replacement !== null) service.activateTab(replacement, { sessionId: snapshot.sessionId });
					if (anchorOriginalBottomOpen === false && store !== void 0) store.reduce((state) => state.bottomOpen ? {
						...state,
						bottomOpen: false
					} : state);
					anchorOriginalBottomOpen = void 0;
				};
				const disposeAnchor = service.registerTab({
					id: ANCHOR_TYPE,
					hidden: true,
					single: true,
					title: () => "",
					component: (props) => {
						store = props.store;
						if (!anchorCleanupScheduled) {
							anchorCleanupScheduled = true;
							queueMicrotask(() => {
								anchorCleanupScheduled = false;
								if (!closed) removeAnchor(service.getSnapshot());
							});
						}
						return null;
					}
				});
				/** Mint the anchor tab in the BACKGROUND: never steal the user's active
				*  tab. A no-op once the store is captured (global capture — later
				*  session switches must not reopen/activate the anchor again). */
				const openAnchorInBackground = (snapshot) => {
					if (store !== void 0) {
						removeAnchor(snapshot);
						return;
					}
					const active = snapshot.state === void 0 ? null : activeTabIdOf(snapshot.state);
					const previous = active === ANCHOR_TAB_ID && snapshot.state !== void 0 ? replacementTabId(snapshot.state, ANCHOR_TAB_ID) : active;
					anchorOriginalBottomOpen = snapshot.state?.bottomOpen;
					service.openTab({
						type: ANCHOR_TYPE,
						id: ANCHOR_TAB_ID,
						title: ""
					});
					if (previous !== null && sessionId !== void 0) service.activateTab(previous, { sessionId });
				};
				const onChange = () => {
					const snapshot = service.getSnapshot();
					const nextSession = snapshot.sessionId;
					if (nextSession !== sessionId) {
						sessionId = nextSession;
						if (nextSession !== void 0) {
							openAnchorInBackground(snapshot);
							if (socket === null) connect(nextSession);
							else if (attachedSession !== nextSession) connect(nextSession);
						}
					}
					pushState();
				};
				const offState = service.subscribeState(onChange);
				const nativeStateTimer = window.setInterval(pushState, 500);
				onChange();
				return () => {
					closed = true;
					offState();
					window.clearInterval(nativeStateTimer);
					disposeAnchor();
					window.clearTimeout(retryTimer);
					if (socket !== null) {
						socket.close();
						socket = null;
					}
				};
			}, "dsh-better-sidebar-controller: bridge client");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
