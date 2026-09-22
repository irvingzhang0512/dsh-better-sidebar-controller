/**
 * The controller's eleven model-facing tools.
 *
 * Every tool is small and purpose-specific (no catch-all `workspace(action)`
 * tool); every tool returns ONE canonical structured JSON value with an
 * explicit `ok` / `code` / `message` envelope plus tool-specific data, and a
 * separate pure text `render` projection (conventions C4 / C10 of the DSH
 * plugin development guide). Failures are reported as structured results
 * with explicit error codes rather than throws, so the model always receives
 * a machine-readable answer.
 *
 * Session scoping: every tool binds to the CALLING agent's session
 * (`exec.agent.session.id`) — the model never passes a sessionId. Path
 * arguments are resolved against that session's cwd (natural language paths)
 * and fenced to its workspace. State-mutating tools dispatch a command over
 * the bridge: a connected sidebar applies it immediately, an unattached one
 * queues it (replayed when that session's sidebar next becomes visible).
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
/** Every tool name (kept in sync for SKILL/docs contract tests). */
export const CONTROLLER_TOOL_NAMES = [
    'get_sidebar_state',
    'show_sidebar',
    'hide_sidebar',
    'list_files',
    'expand_folder',
    'collapse_folder',
    'refresh_tree',
    'open_file',
    'close_file',
    'activate_file',
    'reopen_previous_file',
];
/** Extract the calling agent's session id (defensive structural read). */
function sessionIdOf(exec) {
    const agent = exec.agent;
    const id = agent?.session?.id;
    return typeof id === 'string' && id !== '' ? id : null;
}
/** Require a calling session or produce the canonical structured error. */
function requireSession(exec) {
    const sessionId = sessionIdOf(exec);
    if (sessionId === null) {
        return { error: failure('NO_AGENT', '无法确定调用方会话（工具需要由会话中的 Agent 调用）。') };
    }
    return { sessionId };
}
function failure(code, message) {
    return { ok: false, code, message };
}
function success(code, message) {
    return { ok: true, code, message };
}
/**
 * Map one bridge dispatch outcome to a structured tool result. The ack is a
 * confirmation (the host already knows what it sent); the client's
 * authoritative post-operation state arrives through the state push, so
 * `ack.value` is not spliced into results — keeping result shapes exact.
 */
function outcomeResult(outcome, okMessage, queuedMessage, value) {
    if (outcome.ack !== null) {
        if (outcome.ack.ok) {
            return {
                ...success(outcome.ack.code ?? 'OK', outcome.ack.message ?? okMessage),
                delivered: true,
                queued: false,
                ...value,
            };
        }
        return {
            ...failure(outcome.ack.code ?? 'INTERNAL_ERROR', outcome.ack.message ?? '客户端执行失败。'),
            delivered: true,
            queued: false,
            ...value,
        };
    }
    if (outcome.queued) {
        return {
            ...success('QUEUED', queuedMessage),
            delivered: false,
            queued: true,
            ...value,
        };
    }
    return {
        ...failure('BRIDGE_TIMEOUT', 'Sidebar 未在预期时间内确认操作，请稍后重试或确认侧边栏已打开。'),
        delivered: true,
        queued: false,
        ...value,
    };
}
/** Pure text projection of a result (the canonical value stays structured). */
function textOf(result) {
    const lines = [`[${result.code}] ${result.message}`];
    if (result.path !== undefined && typeof result.path === 'string')
        lines.push(`路径: ${result.path}`);
    if (result.sidebarVisible !== undefined)
        lines.push(`侧边栏显示: ${String(result.sidebarVisible)}`);
    if (result.currentFile !== undefined)
        lines.push(`当前文件: ${String(result.currentFile)}`);
    if (result.previousFile !== undefined)
        lines.push(`上一个文件: ${String(result.previousFile)}`);
    if (result.queued === true)
        lines.push('（操作已排队，将在 Sidebar 可见时自动应用）');
    return lines.join('\n');
}
/** One schema node for the common envelope fields (always present). */
const baseEnvelope = {
    ok: { type: 'boolean', required: true, description: '是否成功。' },
    code: { type: 'string', required: true, description: '状态 / 错误码。' },
    message: { type: 'string', required: true, description: '人类可读的结果说明。' },
};
/**
 * The state object reported by `get_sidebar_state`. Nullable fields are
 * OMITTED when null (cleaner for the model); `state` itself is oneOf
 * [object, null] because an unattached session reports no state.
 */
const stateSchema = {
    description: '当前状态；未连接或无状态时为 null。',
    oneOf: [
        {
            type: 'object',
            additionalProperties: false,
            properties: {
                sidebarVisible: { type: 'boolean', required: true, description: '侧边栏是否显示。' },
                currentFile: { type: 'string', description: '当前文件路径（无则省略）。' },
                previousFile: { type: 'string', description: '上一个文件路径（无则省略）。' },
                fileCandidate: { type: 'string', description: '可供工作台直接操作的明确文件（无则省略）。' },
                fileCandidateSource: { type: 'string', enum: ['current', 'recent'], description: '候选来自当前浏览或最近浏览。' },
                openedFiles: { type: 'array', items: { type: 'string' }, required: true, description: '已打开文件列表。' },
                expandedFolders: { type: 'array', items: { type: 'string' }, required: true, description: '已展开文件夹列表。' },
                workspaceRoot: { type: 'string', description: '工作区根目录（无则省略）。' },
                updatedAt: { type: 'number', required: true, description: '最近状态更新时间（epoch ms）。' },
            },
        },
        { type: 'null' },
    ],
};
const entrySchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
        name: { type: 'string', required: true, description: '条目名。' },
        path: { type: 'string', required: true, description: '条目绝对路径。' },
        isDir: { type: 'boolean', required: true, description: '是否目录。' },
        hidden: { type: 'boolean', required: true, description: '是否隐藏（点开头）。' },
        isSymlink: { type: 'boolean', required: true, description: '是否符号链接。' },
        broken: { type: 'boolean', required: true, description: '符号链接目标是否失效。' },
    },
};
const entriesSchema = {
    type: 'array',
    items: entrySchema,
    description: '目录条目列表。',
};
/**
 * Create the full output schema for a tool: the common envelope plus extras.
 * Generic so every tool's `output.schema` stays a SPECIFIC schema node (a
 * broad union would collapse the DSL's value inference to `never`).
 */
function outputWith(extra) {
    return {
        type: 'object',
        additionalProperties: false,
        properties: {
            ...baseEnvelope,
            ...extra,
        },
    };
}
/** Public state projection for `get_sidebar_state` results (nulls omitted). */
export function stateView(state, connected) {
    if (state === null) {
        return { state: null, connected };
    }
    return {
        state: {
            sidebarVisible: state.sidebarVisible,
            ...(state.currentFile !== null ? { currentFile: state.currentFile } : {}),
            ...(state.previousFile !== null ? { previousFile: state.previousFile } : {}),
            ...(state.fileCandidate !== null ? { fileCandidate: state.fileCandidate } : {}),
            ...(state.fileCandidateSource !== null ? { fileCandidateSource: state.fileCandidateSource } : {}),
            openedFiles: state.openedFiles,
            expandedFolders: state.expandedFolders,
            ...(state.workspaceRoot !== null ? { workspaceRoot: state.workspaceRoot } : {}),
            updatedAt: state.updatedAt,
        },
        connected,
    };
}
/** Register the eleven controller tools. Returns the combined disposer. */
export function registerControllerTools(ctx, deps) {
    const disposers = [];
    const getCwdOrError = async (sessionId) => {
        const cwd = await deps.getCwd(sessionId);
        if (cwd === null || cwd === '') {
            return { error: failure('NO_SESSION', '无法确定会话的工作目录。') };
        }
        return { cwd };
    };
    // ── 1. get_sidebar_state ──────────────────────────────────────────────
    disposers.push(ctx.tools.register(defineTool({
        name: 'get_sidebar_state',
        description: '获取当前 Sidebar / 工作区状态：侧边栏是否显示、当前文件、上一个文件、已打开文件、已展开文件夹、工作区根目录。'
            + '适合回答「我现在打开的是哪个文件」「有哪些文件开着」「侧边栏开着吗」。',
        parameters: {},
        output: {
            schema: outputWith({
                connected: { type: 'boolean', description: 'Sidebar 客户端是否已连接。' },
                state: stateSchema,
            }),
            render: (_args, value) => [{ type: 'text', text: renderState(value) }],
        },
        execute: async (_args, exec) => {
            exec.signal.throwIfAborted();
            const session = requireSession(exec);
            if ('error' in session)
                return session.error;
            const { sessionId } = session;
            // Force a fresh push when the client is attached, so the answer is not stale.
            if (deps.bridge.isAttached(sessionId)) {
                await deps.bridge.dispatch(sessionId, { name: 'sync_state' }, deps.ackTimeoutMs);
            }
            const state = deps.store.get(sessionId);
            if (state === undefined) {
                return {
                    ...failure('SIDEBAR_UNAVAILABLE', '尚未获取到 Sidebar 状态：该会话的侧边栏未连接。请确认已安装 dsh-better-sidebar 且该会话的侧边栏可见。'),
                    connected: false,
                    state: null,
                };
            }
            return {
                ...success('OK', '已获取当前 Sidebar 状态。'),
                ...stateView(state, state.connected),
            };
        },
    })));
    // ── 2/3. show_sidebar / hide_sidebar ──────────────────────────────────
    const sidebarVisibilityTool = (name, visible) => {
        disposers.push(ctx.tools.register(defineTool({
            name,
            description: name === 'show_sidebar'
                ? '打开（显示）better-sidebar 侧边栏。适合「打开侧边栏」「把文件栏打开」。'
                : '隐藏（关闭）better-sidebar 侧边栏。适合「把侧边栏关掉」。',
            parameters: {},
            output: {
                schema: outputWith({
                    sidebarVisible: { type: 'boolean', description: '操作后的侧边栏显示状态。' },
                    delivered: { type: 'boolean', description: '是否已送达 Sidebar 客户端。' },
                    queued: { type: 'boolean', description: '是否已排队等待 Sidebar 可见后应用。' },
                }),
                render: (_args, value) => [{ type: 'text', text: textOf(value) }],
            },
            execute: async (_args, exec) => {
                exec.signal.throwIfAborted();
                const session = requireSession(exec);
                if ('error' in session)
                    return session.error;
                const outcome = await deps.bridge.dispatch(session.sessionId, { name }, deps.ackTimeoutMs);
                return outcomeResult(outcome, visible ? '侧边栏已打开。' : '侧边栏已关闭。', visible ? '侧边栏当前未连接，打开操作已排队，将在 Sidebar 可见时自动应用。' : '侧边栏当前未连接，关闭操作已排队，将在 Sidebar 可见时自动应用。', { sidebarVisible: visible });
            },
        })));
    };
    sidebarVisibilityTool('show_sidebar', true);
    sidebarVisibilityTool('hide_sidebar', false);
    // ── 4. list_files ─────────────────────────────────────────────────────
    disposers.push(ctx.tools.register(defineTool({
        name: 'list_files',
        description: '列出目录内容（单层）。path 省略时列出工作区根目录。适合「看看有哪些文件」「列一下 docs 目录」。'
            + '返回目录优先排序的条目列表（目录在前，隐藏文件带 hidden 标记）。',
        parameters: {
            path: {
                type: 'string',
                description: '要列出的目录：相对工作区根目录的相对路径或绝对路径；省略则列出根目录。',
            },
        },
        output: {
            schema: outputWith({
                path: { type: 'string', description: '被列出的目录绝对路径。' },
                entries: entriesSchema,
                truncated: { type: 'boolean', description: '条目是否因超出上限被截断。' },
            }),
            render: (_args, value) => [{ type: 'text', text: renderListing(value) }],
        },
        execute: async (args, exec) => {
            exec.signal.throwIfAborted();
            const session = requireSession(exec);
            if ('error' in session)
                return session.error;
            const cwdResult = await getCwdOrError(session.sessionId);
            if ('error' in cwdResult)
                return cwdResult.error;
            const raw = typeof args.path === 'string' && args.path !== '' ? args.path : '.';
            const resolved = await deps.resolveTarget(cwdResult.cwd, raw);
            if (!resolved.ok)
                return resolved;
            const listing = await deps.listDirectory(resolved.path);
            if (!listing.ok)
                return listing;
            return {
                ...success('OK', `已列出 ${listing.listing.entries.length} 个条目。`),
                path: listing.listing.path,
                entries: listing.listing.entries.map(entry => ({
                    name: entry.name,
                    path: entry.path,
                    isDir: entry.isDir,
                    hidden: entry.hidden,
                    isSymlink: entry.isSymlink,
                    broken: entry.broken,
                })),
                truncated: listing.listing.truncated,
            };
        },
    })));
    // ── 5/6. expand_folder / collapse_folder ──────────────────────────────
    const folderTool = (name) => {
        disposers.push(ctx.tools.register(defineTool({
            name,
            description: name === 'expand_folder'
                ? '在文件树中展开一个文件夹，显示其子内容。适合「展开 docs」「把会议资料文件夹打开」。'
                    + 'path 为相对工作区根目录的相对路径或绝对路径。'
                : '在文件树中收起一个已展开的文件夹。适合「收起 docs」「把 node_modules 收起来」。'
                    + 'path 为相对工作区根目录的相对路径或绝对路径。',
            parameters: {
                path: {
                    type: 'string',
                    required: true,
                    description: '文件夹路径（相对或绝对）。',
                },
            },
            output: {
                schema: outputWith({
                    path: { type: 'string', description: '目标文件夹绝对路径。' },
                    expanded: { type: 'boolean', description: '操作后该文件夹是否处于展开状态。' },
                    delivered: { type: 'boolean', description: '是否已送达 Sidebar 客户端。' },
                    queued: { type: 'boolean', description: '是否已排队。' },
                }),
                render: (_args, value) => [{ type: 'text', text: textOf(value) }],
            },
            execute: async (args, exec) => {
                exec.signal.throwIfAborted();
                const session = requireSession(exec);
                if ('error' in session)
                    return session.error;
                if (typeof args.path !== 'string' || args.path === '') {
                    return failure('INVALID_PATH', '缺少 path 参数。');
                }
                const cwdResult = await getCwdOrError(session.sessionId);
                if ('error' in cwdResult)
                    return cwdResult.error;
                const resolved = await deps.resolveTarget(cwdResult.cwd, args.path);
                if (!resolved.ok)
                    return resolved;
                const kind = await deps.pathKind(resolved.path);
                if (!kind.ok)
                    return kind;
                if (kind.kind !== 'dir') {
                    return failure('NOT_A_DIRECTORY', `"${resolved.path}" 不是文件夹。`);
                }
                const outcome = await deps.bridge.dispatch(session.sessionId, { name, path: resolved.path }, deps.ackTimeoutMs);
                const expanded = name === 'expand_folder';
                return outcomeResult(outcome, expanded ? '文件夹已展开。' : '文件夹已收起。', expanded ? '文件夹展开操作已排队，将在 Sidebar 可见时自动应用。' : '文件夹收起操作已排队，将在 Sidebar 可见时自动应用。', { path: resolved.path, expanded });
            },
        })));
    };
    folderTool('expand_folder');
    folderTool('collapse_folder');
    // ── 7. refresh_tree ───────────────────────────────────────────────────
    disposers.push(ctx.tools.register(defineTool({
        name: 'refresh_tree',
        description: '刷新文件树：重新读取工作区根目录并让 Sidebar 重新加载已展开的目录。'
            + '适合「刷新文件树」「重新看看文件」等场景（例如外部新建了文件）。',
        parameters: {},
        output: {
            schema: outputWith({
                rootPath: { type: 'string', description: '工作区根目录绝对路径。' },
                entries: entriesSchema,
                truncated: { type: 'boolean', description: '根目录条目是否被截断。' },
                delivered: { type: 'boolean', description: '是否已送达 Sidebar 客户端。' },
                queued: { type: 'boolean', description: '是否已排队。' },
            }),
            render: (_args, value) => [{ type: 'text', text: renderListing(value) }],
        },
        execute: async (_args, exec) => {
            exec.signal.throwIfAborted();
            const session = requireSession(exec);
            if ('error' in session)
                return session.error;
            const cwdResult = await getCwdOrError(session.sessionId);
            if ('error' in cwdResult)
                return cwdResult.error;
            const listing = await deps.listDirectory(cwdResult.cwd);
            if (!listing.ok)
                return listing;
            const outcome = await deps.bridge.dispatch(session.sessionId, { name: 'refresh_tree' }, deps.ackTimeoutMs);
            return {
                ...outcomeResult(outcome, '文件树已刷新。', '文件树刷新已排队，将在 Sidebar 可见时自动应用。', { rootPath: cwdResult.cwd }),
                rootPath: cwdResult.cwd,
                entries: listing.listing.entries.map(entry => ({
                    name: entry.name,
                    path: entry.path,
                    isDir: entry.isDir,
                    hidden: entry.hidden,
                    isSymlink: entry.isSymlink,
                    broken: entry.broken,
                })),
                truncated: listing.listing.truncated,
            };
        },
    })));
    // ── 8. open_file ──────────────────────────────────────────────────────
    disposers.push(ctx.tools.register(defineTool({
        name: 'open_file',
        description: '在侧边栏中打开一个文件（若已打开则激活它）。path 为相对工作区根目录的相对路径或绝对路径。'
            + '适合「打开今天的会议纪要」「打开 A.md」。',
        parameters: {
            path: {
                type: 'string',
                required: true,
                description: '要打开的文件路径（相对或绝对）。',
            },
        },
        output: {
            schema: outputWith({
                path: { type: 'string', description: '被打开文件的绝对路径。' },
                delivered: { type: 'boolean', description: '是否已送达 Sidebar 客户端。' },
                queued: { type: 'boolean', description: '是否已排队。' },
            }),
            render: (_args, value) => [{ type: 'text', text: textOf(value) }],
        },
        execute: async (args, exec) => {
            exec.signal.throwIfAborted();
            const session = requireSession(exec);
            if ('error' in session)
                return session.error;
            if (typeof args.path !== 'string' || args.path === '') {
                return failure('INVALID_PATH', '缺少 path 参数。');
            }
            const cwdResult = await getCwdOrError(session.sessionId);
            if ('error' in cwdResult)
                return cwdResult.error;
            const resolved = await deps.resolveTarget(cwdResult.cwd, args.path);
            if (!resolved.ok)
                return resolved;
            const kind = await deps.pathKind(resolved.path);
            if (!kind.ok)
                return kind;
            if (kind.kind !== 'file') {
                return failure('NOT_A_FILE', `"${resolved.path}" 不是文件（是文件夹）。打开文件夹请使用 expand_folder。`);
            }
            const outcome = await deps.bridge.dispatch(session.sessionId, { name: 'open_file', path: resolved.path }, deps.ackTimeoutMs);
            return outcomeResult(outcome, '文件已打开。', '文件打开操作已排队，将在 Sidebar 可见时自动打开。', { path: resolved.path });
        },
    })));
    // ── 9. close_file ─────────────────────────────────────────────────────
    disposers.push(ctx.tools.register(defineTool({
        name: 'close_file',
        description: '关闭一个已打开的文件（关闭其标签页）。path 省略时关闭当前文件。'
            + '适合「关闭当前文件」「把 A.md 关掉」。',
        parameters: {
            path: {
                type: 'string',
                description: '要关闭的文件路径（相对或绝对）；省略则关闭当前文件。',
            },
        },
        output: {
            schema: outputWith({
                path: { type: 'string', description: '被关闭文件的绝对路径（关闭当前文件时必有）。' },
                delivered: { type: 'boolean', description: '是否已送达 Sidebar 客户端。' },
                queued: { type: 'boolean', description: '是否已排队。' },
            }),
            render: (_args, value) => [{ type: 'text', text: textOf(value) }],
        },
        execute: async (args, exec) => {
            exec.signal.throwIfAborted();
            const session = requireSession(exec);
            if ('error' in session)
                return session.error;
            const cwdResult = await getCwdOrError(session.sessionId);
            if ('error' in cwdResult)
                return cwdResult.error;
            let path;
            if (typeof args.path === 'string' && args.path !== '') {
                const resolved = deps.resolveLexical(cwdResult.cwd, args.path);
                if (!resolved.ok)
                    return resolved;
                path = resolved.path;
            }
            else {
                path = deps.store.get(session.sessionId)?.currentFile ?? undefined;
                if (path === undefined) {
                    return failure('NO_CURRENT_FILE', '当前没有已打开的文件，请通过 path 参数指定要关闭的文件。');
                }
            }
            const outcome = await deps.bridge.dispatch(session.sessionId, { name: 'close_file', path }, deps.ackTimeoutMs);
            return outcomeResult(outcome, '文件已关闭。', '文件关闭操作已排队，将在 Sidebar 可见时自动应用。', { path });
        },
    })));
    // ── 10. activate_file ─────────────────────────────────────────────────
    disposers.push(ctx.tools.register(defineTool({
        name: 'activate_file',
        description: '切换到（激活）一个已打开的文件标签页；文件必须已打开（未打开请用 open_file）。'
            + '适合「切到项目计划」「切到那个文件」。',
        parameters: {
            path: {
                type: 'string',
                required: true,
                description: '要激活的文件路径（相对或绝对）。',
            },
        },
        output: {
            schema: outputWith({
                path: { type: 'string', description: '目标文件绝对路径。' },
                delivered: { type: 'boolean', description: '是否已送达 Sidebar 客户端。' },
                queued: { type: 'boolean', description: '是否已排队。' },
            }),
            render: (_args, value) => [{ type: 'text', text: textOf(value) }],
        },
        execute: async (args, exec) => {
            exec.signal.throwIfAborted();
            const session = requireSession(exec);
            if ('error' in session)
                return session.error;
            if (typeof args.path !== 'string' || args.path === '') {
                return failure('INVALID_PATH', '缺少 path 参数。');
            }
            const cwdResult = await getCwdOrError(session.sessionId);
            if ('error' in cwdResult)
                return cwdResult.error;
            const resolved = deps.resolveLexical(cwdResult.cwd, args.path);
            if (!resolved.ok)
                return resolved;
            const outcome = await deps.bridge.dispatch(session.sessionId, { name: 'activate_file', path: resolved.path }, deps.ackTimeoutMs);
            return outcomeResult(outcome, '文件已激活。', '文件激活操作已排队，将在 Sidebar 可见时自动应用。', { path: resolved.path });
        },
    })));
    // ── 11. reopen_previous_file ──────────────────────────────────────────
    disposers.push(ctx.tools.register(defineTool({
        name: 'reopen_previous_file',
        description: '重新打开 / 回到上一个文件（previous_file，即本次当前文件之前的那个文件）。'
            + '适合「回到刚才那个文件」「切回上一个文件」。',
        parameters: {},
        output: {
            schema: outputWith({
                path: { type: 'string', description: '被重新打开的上一个文件绝对路径。' },
                delivered: { type: 'boolean', description: '是否已送达 Sidebar 客户端。' },
                queued: { type: 'boolean', description: '是否已排队。' },
            }),
            render: (_args, value) => [{ type: 'text', text: textOf(value) }],
        },
        execute: async (_args, exec) => {
            exec.signal.throwIfAborted();
            const session = requireSession(exec);
            if ('error' in session)
                return session.error;
            const state = deps.store.get(session.sessionId);
            const previous = state?.previousFile ?? null;
            if (previous === null) {
                return failure('NO_PREVIOUS_FILE', '没有上一个文件（此前没有切换过其他文件）。');
            }
            const cwdResult = await getCwdOrError(session.sessionId);
            if ('error' in cwdResult)
                return cwdResult.error;
            const resolved = await deps.resolveTarget(cwdResult.cwd, previous);
            if (!resolved.ok)
                return resolved;
            const outcome = await deps.bridge.dispatch(session.sessionId, { name: 'open_file', path: resolved.path }, deps.ackTimeoutMs);
            return outcomeResult(outcome, '已回到上一个文件。', '回到上一个文件的操作已排队，将在 Sidebar 可见时自动应用。', { path: resolved.path });
        },
    })));
    return () => {
        for (const disposer of disposers)
            disposer();
    };
}
/** Text projection for `get_sidebar_state`. */
function renderState(value) {
    if (value.ok && value.state !== null && value.state !== undefined) {
        const s = value.state;
        const current = typeof s.currentFile === 'string' ? s.currentFile : '（无）';
        const previous = typeof s.previousFile === 'string' ? s.previousFile : '（无）';
        const files = Array.isArray(s.openedFiles) ? s.openedFiles.join(', ') : '（无）';
        const folders = Array.isArray(s.expandedFolders) ? s.expandedFolders.join(', ') : '（无）';
        return [
            `当前文件: ${current}`,
            `上一个文件: ${previous}`,
            `侧边栏显示: ${String(s.sidebarVisible)}`,
            `已打开文件: ${files}`,
            `已展开文件夹: ${folders}`,
            `工作区根目录: ${typeof s.workspaceRoot === 'string' ? s.workspaceRoot : '（未知）'}`,
            `Sidebar 已连接: ${String(value.connected ?? false)}`,
        ].join('\n');
    }
    return `[${value.code}] ${value.message}`;
}
/** Text projection for listing-ish results. */
function renderListing(value) {
    const lines = [];
    if (!value.ok)
        return `[${value.code}] ${value.message}`;
    lines.push(`[OK] ${value.message}`);
    if (typeof value.path === 'string')
        lines.push(`目录: ${value.path}`);
    if (Array.isArray(value.entries)) {
        for (const entry of value.entries) {
            const mark = entry.isDir ? '📁' : '📄';
            lines.push(`  ${mark} ${entry.name}${entry.hidden ? ' (hidden)' : ''}`);
        }
        if (value.truncated === true)
            lines.push('  …（条目过多，已截断）');
    }
    return lines.join('\n');
}
