/**
 * dsh-better-sidebar-controller — host half.
 *
 * The controller is dsh-better-sidebar's Agent control layer:
 *
 *   natural language → DSH Agent → Controller Skill → Controller Tools →
 *   Bridge → better-sidebar → file tree / file / tab state
 *
 * This module mounts:
 * - the twelve gated controller tools (better_sidebar_open / get_sidebar_state / show_sidebar /
 *   hide_sidebar / list_files / expand_folder / collapse_folder /
 *   refresh_tree / open_file / close_file / activate_file /
 *   reopen_previous_file);
 * - the bridge WebSocket `/sidebar-controller/ws?sessionId=…` where the
 *   browser client attaches (per active session), receives tool commands and
 *   pushes the controller state mirror back;
 * - the per-session state mirror.
 *
 * The internal service mounts regardless. Model capabilities require an
 * active compatible better-sidebar and its authoritative persisted gates.
 * Only an allowed operation awaiting its own session UI can be queued.
 */
import { WebSocketServer } from 'ws';
import { attachSocket } from "./host/bridge-socket.js";
import { BRIDGE_ACK_TIMEOUT_MS, BridgeServer } from "./host/bridge-server.js";
import { ControllerStateStore } from "./host/controller-state.js";
import { listDirectorySafe } from "./host/fs-tree.js";
import { readSidebarAccess } from "./host/access.js";
import { refusal } from "./shared/access.js";
import { pathKind, resolveLexicalTarget, resolveWorkspaceTarget } from "./host/paths.js";
import { loadBundledSkill } from "./host/skill-registration.js";
import { registerControllerTools } from "./host/tools.js";
import { isTrustedApiRequest } from "./host/trust-fence.js";
import { parseClientMessage } from "./shared/wire.js";
/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-better-sidebar-controller';
/** Services required before mounting: the webserver upgrade surface, the
 *  session store (authoritative cwd), the web runtime's trusted hosts, the
 *  tool registry, and the skill registry (for self-registering the bundled
 *  SKILL.md so installing the plugin also installs its skill). */
export const inject = ['tools', 'webServer', 'sessions', 'webRuntime', 'skills'];
/** Bridge upgrade path (must match the client half). */
export const BRIDGE_PATH = '/sidebar-controller/ws';
/**
 * Plugin body: mount the bridge endpoint and the controller tools.
 * @param ctx - host plugin context (tools, webServer, sessions, webRuntime).
 */
export function apply(ctx) {
    const store = new ControllerStateStore();
    const readAccess = () => {
        const editor = ctx.get('configEditor');
        const settings = ctx.get('settings');
        const packages = ctx.get('pluginPackages');
        return readSidebarAccess(editor && settings ? {
            entries: () => editor.entries(), describe: () => settings.describe(),
            versionOf: entry => {
                const baseUrl = entry.parent?.tree.ctx.baseUrl;
                return baseUrl && entry.options.name ? packages?.packageOf(entry.options.name, baseUrl)?.version : undefined;
            },
        } : undefined);
    };
    const authorize = (name) => refusal(name, readAccess());
    const removeService = ctx.provide('sidebarController', {
        id: 'dsh-better-sidebar-controller',
        getState: (sessionId) => store.get(sessionId),
        subscribe: (sessionId, listener) => store.subscribe(sessionId, listener),
    });
    const bridge = new BridgeServer({
        store,
        authorize,
        resolveWorkspaceRoot: async (sessionId) => {
            const session = ctx.sessions.get(sessionId);
            const cwd = session?.header?.cwd;
            if (typeof cwd === 'string' && cwd !== '')
                return cwd;
            return process.cwd();
        },
    });
    // Browser-trust fence identical to the /api gateway's.
    const fence = (req) => isTrustedApiRequest(req, ctx.webRuntime.trustedHosts);
    const wss = new WebSocketServer({ noServer: true });
    ctx.effect(() => ctx.webServer.registerUpgrade({
        path: BRIDGE_PATH,
        handler: (req, socket, head) => {
            const incoming = req;
            if (!fence(incoming)) {
                socket.destroy();
                return;
            }
            const url = new URL(incoming.url ?? '', 'http://localhost');
            const sessionId = url.searchParams.get('sessionId');
            if (sessionId === null || sessionId === '') {
                socket.destroy();
                return;
            }
            wss.handleUpgrade(incoming, socket, head, (ws) => {
                attachSocket(bridge, ws, sessionId, parseClientMessage);
            });
        },
    }), 'dsh-better-sidebar-controller: bridge WebSocket');
    const deps = {
        getCwd: async (sessionId) => {
            const session = ctx.sessions.get(sessionId);
            const cwd = session?.header?.cwd;
            if (typeof cwd === 'string' && cwd !== '')
                return cwd;
            return process.cwd();
        },
        store,
        bridge,
        resolveTarget: resolveWorkspaceTarget,
        resolveLexical: resolveLexicalTarget,
        pathKind,
        listDirectory: listDirectorySafe,
        listingSettings: () => readAccess().listing,
        authorize,
        ackTimeoutMs: BRIDGE_ACK_TIMEOUT_MS,
    };
    let toolsDisposer = () => { };
    let accessKey = '';
    const refreshAccess = () => {
        const access = readAccess();
        const key = JSON.stringify([access.available, access.open, access.control]);
        if (key === accessKey)
            return;
        accessKey = key;
        toolsDisposer();
        if (!access.available)
            bridge.invalidate();
        else
            bridge.prune();
        toolsDisposer = registerControllerTools(ctx, deps);
    };
    refreshAccess();
    ctx.effect(() => {
        let stopped = false;
        const refresh = () => queueMicrotask(() => { if (!stopped)
            refreshAccess(); });
        const events = ctx;
        const off = events.on('settings/document-updated', refresh, { global: true });
        const timer = setInterval(refreshAccess, 500);
        return () => { stopped = true; clearInterval(timer); off(); };
    }, 'dsh-better-sidebar-controller: authoritative settings');
    // Self-register the bundled SKILL.md on `ctx.skills` (the dsh-skill runtime
    // registry). Installing the plugin therefore also installs its skill — no
    // manual copy into a skills directory. Registration is async (file read) but
    // the effect teardown is synchronous and race-safe.
    ctx.effect(() => {
        const skills = ctx.skills;
        let disposed = false;
        let skillDisposer;
        if (skills?.register !== undefined) {
            void loadBundledSkill().then((skill) => {
                if (disposed || skill === undefined)
                    return;
                skillDisposer = skills.register(skill);
            });
        }
        return () => {
            disposed = true;
            skillDisposer?.();
        };
    }, 'dsh-better-sidebar-controller: bundled skill');
    ctx.effect(() => () => {
        removeService();
        toolsDisposer();
        bridge.dispose();
        wss.close();
    }, 'dsh-better-sidebar-controller: teardown');
}
