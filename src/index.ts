/**
 * dsh-better-sidebar-controller — host half.
 *
 * The controller is dsh-better-sidebar's Agent control layer:
 *
 *   natural language → DSH Agent → Controller Skill → Controller Tools →
 *   Bridge → better-sidebar → file tree / file / tab state
 *
 * This module mounts:
 * - the eleven controller tools (get_sidebar_state / show_sidebar /
 *   hide_sidebar / list_files / expand_folder / collapse_folder /
 *   refresh_tree / open_file / close_file / activate_file /
 *   reopen_previous_file);
 * - the bridge WebSocket `/sidebar-controller/ws?sessionId=…` where the
 *   browser client attaches (per active session), receives tool commands and
 *   pushes the controller state mirror back;
 * - the per-session state mirror.
 *
 * better-sidebar is a soft dependency: the host mounts regardless; the
 * browser client only activates once `ctx.betterSidebar` is provided. Until
 * a session's sidebar client attaches, mutating tools report QUEUED and
 * `get_sidebar_state` reports SIDEBAR_UNAVAILABLE — both with actionable
 * messages.
 */
import { WebSocketServer } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { attachSocket } from './host/bridge-socket.ts'
import { BRIDGE_ACK_TIMEOUT_MS, BridgeServer } from './host/bridge-server.ts'
import { ControllerStateStore } from './host/controller-state.ts'
import { listDirectorySafe } from './host/fs-tree.ts'
import { pathKind, resolveLexicalTarget, resolveWorkspaceTarget } from './host/paths.ts'
import { loadBundledSkill } from './host/skill-registration.ts'
import { registerControllerTools } from './host/tools.ts'
import { isTrustedApiRequest } from './host/trust-fence.ts'
import { parseClientMessage } from './shared/wire.ts'
import type { Context } from './context-types.ts'

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-better-sidebar-controller'

/** Services required before mounting: the webserver upgrade surface, the
 *  session store (authoritative cwd), the web runtime's trusted hosts, the
 *  tool registry, and the skill registry (for self-registering the bundled
 *  SKILL.md so installing the plugin also installs its skill). */
export const inject = ['tools', 'webServer', 'sessions', 'webRuntime', 'skills']

/** Bridge upgrade path (must match the client half). */
export const BRIDGE_PATH = '/sidebar-controller/ws'

/**
 * Plugin body: mount the bridge endpoint and the controller tools.
 * @param ctx - host plugin context (tools, webServer, sessions, webRuntime).
 */
export function apply(ctx: Context): void {
  const store = new ControllerStateStore()
  const removeService = ctx.provide('sidebarController', {
    id: 'dsh-better-sidebar-controller' as const,
    getState: (sessionId: string) => store.get(sessionId),
    subscribe: (sessionId: string, listener: Parameters<ControllerStateStore['subscribe']>[1]) => store.subscribe(sessionId, listener),
  })
  const bridge = new BridgeServer({
    store,
    resolveWorkspaceRoot: async (sessionId) => {
      const session = ctx.sessions.get(sessionId)
      const cwd = session?.header?.cwd
      if (typeof cwd === 'string' && cwd !== '') return cwd
      return process.cwd()
    },
  })

  // Browser-trust fence identical to the /api gateway's.
  const fence = (req: IncomingMessage): boolean => isTrustedApiRequest(req, ctx.webRuntime.trustedHosts)

  const wss = new WebSocketServer({ noServer: true })
  ctx.effect(() => ctx.webServer.registerUpgrade({
    path: BRIDGE_PATH,
    handler: (req, socket, head) => {
      const incoming = req as IncomingMessage
      if (!fence(incoming)) {
        socket.destroy()
        return
      }
      const url = new URL(incoming.url ?? '', 'http://localhost')
      const sessionId = url.searchParams.get('sessionId')
      if (sessionId === null || sessionId === '') {
        socket.destroy()
        return
      }
      wss.handleUpgrade(incoming, socket as unknown as Duplex, head as Buffer, (ws) => {
        attachSocket(bridge, ws, sessionId, parseClientMessage)
      })
    },
  }), 'dsh-better-sidebar-controller: bridge WebSocket')

  const toolsDisposer = registerControllerTools(ctx, {
    getCwd: async (sessionId) => {
      const session = ctx.sessions.get(sessionId)
      const cwd = session?.header?.cwd
      if (typeof cwd === 'string' && cwd !== '') return cwd
      return process.cwd()
    },
    store,
    bridge,
    resolveTarget: resolveWorkspaceTarget,
    resolveLexical: resolveLexicalTarget,
    pathKind,
    listDirectory: listDirectorySafe,
    ackTimeoutMs: BRIDGE_ACK_TIMEOUT_MS,
  })

  // Self-register the bundled SKILL.md on `ctx.skills` (the dsh-skill runtime
  // registry). Installing the plugin therefore also installs its skill — no
  // manual copy into a skills directory. Registration is async (file read) but
  // the effect teardown is synchronous and race-safe.
  ctx.effect(() => {
    const skills = ctx.skills
    let disposed = false
    let skillDisposer: (() => void) | undefined
    if (skills?.register !== undefined) {
      void loadBundledSkill().then((skill) => {
        if (disposed || skill === undefined) return
        skillDisposer = skills.register(skill)
      })
    }
    return () => {
      disposed = true
      skillDisposer?.()
    }
  }, 'dsh-better-sidebar-controller: bundled skill')

  ctx.effect(() => () => {
    removeService()
    toolsDisposer()
    bridge.dispose()
    wss.close()
  }, 'dsh-better-sidebar-controller: teardown')
}
