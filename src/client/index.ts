import type { Context } from 'dsh-better-sidebar'
import type { SidebarStore } from 'dsh-better-sidebar/client/service'
import { activeFileOf, deriveFileContext, findTabByPath, openedFilesOf } from '../shared/derive.ts'
import { ANCHOR_ID, accessFromPrefs, refusal } from '../shared/access.ts'
import type { ClientToHostMessage, ControllerCommand, ControllerCode, SidebarStateWire } from '../shared/types.ts'
import { parseHostMessage } from '../shared/wire.ts'
import { ControllerSettings } from './settings.ts'
import { bridgeUrl, pathKey, resourcePath, type NativeSidebar } from './native.ts'

export const inject = ['betterSidebar', 'sessions', 'sidebarRight']
export function apply(ctx: Context): void {
  ctx.effect(() => {
    try {
    const service = ctx.betterSidebar
    const native = () => ctx.get('sidebarRight') as unknown as NativeSidebar | undefined
    let store: SidebarStore | undefined
    let sessionId: string | undefined
    let socket: WebSocket | undefined
    let closed = false
    let retry: number | undefined
    let failures = 0
    let lastSemantic: string | undefined
    let wire: SidebarStateWire | undefined
    let chain = Promise.resolve()
    let syncChain = Promise.resolve()
    let bottomFocused = false
    const roots = new Map<string, string>()
    const files = new Map<string, string | null>()
    const contexts = new Map<string, { currentFile: string | null; previousFile: string | null }>()
    const disposers: Array<() => void> = []
    const send = (message: ClientToHostMessage) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return false
      socket.send(JSON.stringify(message)); return true
    }
    const api = async <T>(method: string, body: object): Promise<T> => {
      const response = await fetch(service.hostRouteUrl(`sidebar/api/${method}`), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(2000) })
      const result = await response.json() as { ok: boolean; value: T; error?: { message?: string } }
      if (!response.ok || !result.ok) throw new Error(result.error?.message ?? `HTTP ${response.status}`)
      return result.value
    }
    const cwdOf = async (id: string) => {
      if (!roots.has(id)) roots.set(id, (await api<{ cwd: string }>('session.cwd', { sessionId: id })).cwd)
      return roots.get(id)
    }
    const nativeFiles = async (id: string) => {
      const sidebar = native()
      if (!sidebar) return []
      const tabs = sidebar.openTabs.getSnapshot().filter(t => t.sessionId === id && t.contentId.startsWith('dsh-resource://file/'))
      if (!tabs.length) return []
      const cwd = await cwdOf(id)
      return (await Promise.all(tabs.map(async tab => {
        const path = resourcePath(tab.contentId, id, cwd)
        if (path === undefined) return undefined
        const key = `${id}:${pathKey(path)}`
        if (!files.has(key)) {
          // Folder windows also have file addresses; public search confirms their type.
          const result = await api<{ matches: string[]; dirs: string[] }>('fs.search', { sessionId: id, query: path }).catch(() => undefined)
          if (!result) return undefined
          const found = result.matches.find(p => pathKey(p) === pathKey(path))
          files.set(key, found && !result.dirs.some(p => pathKey(p) === pathKey(found)) ? found : null)
        }
        const file = files.get(key)
        return file ? { tab, path: file } : undefined
      }))).filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
    }
    const sync = async (force = false) => {
      const id = sessionId
      if (!id || closed || capturing) return
      const entries = await nativeFiles(id)
      if (id !== sessionId || closed || native()?.mounted.getSnapshot() !== id) return
      const snapshot = service.getSnapshot()
      const state = snapshot.sessionId === id ? snapshot.state : undefined
      const sidebar = native()
      const current = bottomFocused ? (state ? activeFileOf(state) : null) : entries.find(e => e.tab.tabId === sidebar?.active()?.id)?.path ?? null
      const context = deriveFileContext(contexts.get(id), current)
      contexts.set(id, context)
      const all = [...entries.map(e => e.path), ...(state ? openedFilesOf(state) : [])]
      const openedFiles = all.filter((p, index) => all.findIndex(q => pathKey(q) === pathKey(p)) === index)
      const recent = context.previousFile && openedFiles.some(p => pathKey(p) === pathKey(context.previousFile!)) ? context.previousFile : null
      wire = { sessionId: id, sidebarVisible: sidebar?.isExpanded() ?? false, ...context, openedFiles, expandedFolders: state?.expanded ?? [], fileCandidate: current ?? recent, fileCandidateSource: current ? 'current' : recent ? 'recent' : null, updatedAt: Date.now() }
      const semantic = JSON.stringify({ ...wire, updatedAt: 0 })
      if ((force || lastSemantic !== semantic) && send({ type: 'state', state: wire })) lastSemantic = semantic
    }
    const push = (force = false) => {
      syncChain = syncChain.catch(() => {}).then(() => sync(force))
      return syncChain
    }
    const command = async (id: string, cmd: ControllerCommand, ws: WebSocket, targetSession: string) => {
      const sameSession = () => socket === ws && sessionId === targetSession && native()?.mounted.getSnapshot() === targetSession
      const ack = (ok: boolean, code: ControllerCode, message: string) => {
        if (socket === ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'command-result', result: { id, ok, code, message } }))
      }
      if (!sameSession()) return ack(false, 'SIDEBAR_UNAVAILABLE', '调用会话界面已离开，指令未执行。')
      try {
        await push(true)
        if (!sameSession()) return ack(false, 'SIDEBAR_UNAVAILABLE', '调用会话界面已离开。')
        const denied = refusal(cmd.name, accessFromPrefs(service.getSnapshot().prefs))
        if (denied) return ack(false, denied.code, denied.message)
        const sidebar = native()!
        // Supply cwd even before the first file exists, so upstream creates
        // the same canonical resource address as later opens in this session.
        const scope = { sessionId: targetSession, cwd: await cwdOf(targetSession) }
        if (!sameSession()) return ack(false, 'SIDEBAR_UNAVAILABLE', '调用会话界面已离开。')
        const revoked = refusal(cmd.name, accessFromPrefs(service.getSnapshot().prefs))
        if (revoked) return ack(false, revoked.code, revoked.message)
        const openFile = async (path: string, title?: string) => {
          const existing = (await nativeFiles(targetSession)).find(e => pathKey(e.path) === pathKey(path))
          if (!sameSession()) throw new Error('调用会话界面已离开。')
          const denied = refusal(cmd.name, accessFromPrefs(service.getSnapshot().prefs))
          if (denied) return denied
          const bottom = service.getSnapshot().state
          const tab = bottom && findTabByPath(bottom, path)
          bottomFocused = !existing && !!tab
          if (existing) sidebar.focus(existing.tab.tabId)
          else if (tab) service.activateTab(tab.id, scope)
          else service.openFile(scope, path, title)
          await push(true)
          return wire?.openedFiles.some(p => pathKey(p) === pathKey(path)) ? undefined : { ok: false, code: 'SIDEBAR_UNAVAILABLE' as const, message: '上游未接受文件打开操作。' }
        }
        switch (cmd.name) {
          case 'sync_state': break
          case 'show_sidebar': if (!sidebar.isExpanded()) sidebar.toggleExpanded(); break
          case 'hide_sidebar': if (sidebar.isExpanded()) sidebar.toggleExpanded(); break
          case 'expand_folder': case 'collapse_folder': {
            if (!store) return ack(false, 'SIDEBAR_UNAVAILABLE', '文件树存储尚未就绪。')
            store.reduce(state => ({ ...state, expanded: cmd.name === 'expand_folder' ? [...new Set([...state.expanded, cmd.path])] : state.expanded.filter(p => pathKey(p) !== pathKey(cmd.path)) }))
            break
          }
          case 'refresh_tree': files.clear(); roots.delete(targetSession); window.dispatchEvent(new Event('dsh-sidebar:refresh-files')); break
          case 'better_sidebar_open': {
            bottomFocused = false
            if (cmd.kind === 'url') sidebar.openTab('browser', { params: { url: cmd.target, title: cmd.title } })
            else if (cmd.kind === 'folder') service.openTab({ type: 'editor', path: cmd.target, title: cmd.title, meta: { dir: true } }, scope)
            else {
              const error = await openFile(cmd.target, cmd.title)
              if (error) return ack(false, error.code, error.message)
            }
            const after = sidebar.openTabs.getSnapshot().filter(t => t.sessionId === targetSession)
            if (cmd.kind === 'url' ? sidebar.active()?.kind !== 'browser' : cmd.kind === 'folder' && !after.some(t => pathKey(resourcePath(t.contentId, targetSession, roots.get(targetSession)) ?? '') === pathKey(cmd.target))) return ack(false, 'SIDEBAR_UNAVAILABLE', '上游未接受目标，请检查对应卡片是否启用。')
            break
          }
          case 'open_file': case 'reopen_previous_file': {
            const path = cmd.name === 'open_file' ? cmd.path : cmd.path ?? wire?.previousFile
            if (!path) return ack(false, 'NO_PREVIOUS_FILE', '没有上一文件。')
            const error = await openFile(path, cmd.name === 'open_file' ? cmd.title : undefined)
            if (error) return ack(false, error.code, error.message)
            break
          }
          case 'close_file': case 'activate_file': {
            const path = cmd.path
            if (!path) return ack(false, 'NO_CURRENT_FILE', '当前没有文件。')
            const entries = await nativeFiles(targetSession)
            if (!sameSession()) return ack(false, 'SIDEBAR_UNAVAILABLE', '调用会话界面已离开。')
            const tab = entries.find(e => pathKey(e.path) === pathKey(path))
            const state = service.getSnapshot().state
            const bottom = state && findTabByPath(state, path)
            if (tab) { bottomFocused = false; if (cmd.name === 'close_file') sidebar.close(tab.tab.tabId); else sidebar.focus(tab.tab.tabId) }
            else if (bottom) { bottomFocused = true; if (cmd.name === 'close_file') service.closeTab(bottom.id, scope); else service.activateTab(bottom.id, scope) }
            else return ack(false, 'FILE_NOT_OPEN', '目标文件未打开。')
            break
          }
        }
        await push(true)
        if (!sameSession()) return ack(false, 'SIDEBAR_UNAVAILABLE', '调用会话界面已离开，结果未确认。')
        if (cmd.name === 'show_sidebar' && !sidebar.isExpanded() || cmd.name === 'hide_sidebar' && sidebar.isExpanded()) return ack(false, 'SIDEBAR_UNAVAILABLE', '侧栏未接受显隐操作。')
        if (cmd.name === 'close_file' && wire?.openedFiles.some(p => pathKey(p) === pathKey(cmd.path ?? ''))) return ack(false, 'SIDEBAR_UNAVAILABLE', '文件仍在打开列表中，关闭未确认。')
        if (cmd.name === 'activate_file' && pathKey(wire?.currentFile ?? '') !== pathKey(cmd.path)) return ack(false, 'SIDEBAR_UNAVAILABLE', '目标文件尚未激活，切换未确认。')
        ack(true, 'OK', cmd.name === 'better_sidebar_open' && cmd.kind === 'url' ? '网页标签已打开，页面加载由浏览器决定。' : '操作已接受，状态已同步。')
      } catch (error) { ack(false, 'INTERNAL_ERROR', error instanceof Error ? error.message : String(error)) }
    }
    const connect = (target: string) => {
      if (closed || sessionId !== target) return
      window.clearTimeout(retry); retry = undefined; socket?.close()
      const transport = (globalThis as { __DSH_TRANSPORT__?: { streamBaseUrl?: string } }).__DSH_TRANSPORT__
      const url = bridgeUrl(service.hostRouteUrl('sidebar-controller/ws'), transport?.streamBaseUrl)
      url.searchParams.set('sessionId', target)
      const ws = new WebSocket(url.toString()); socket = ws
      ws.onopen = () => { if (socket !== ws) return; failures = 0; lastSemantic = undefined; send({ type: 'hello', sessionId: target }); void push(true).catch(() => {}) }
      ws.onmessage = event => {
        if (socket !== ws || typeof event.data !== 'string') return
        try { const message = parseHostMessage(event.data); chain = chain.catch(() => {}).then(() => command(message.id, message.command, ws, target)) } catch { /* malformed wire */ }
      }
      ws.onclose = () => { if (socket !== ws) return; socket = undefined; if (!closed && sessionId === target && ++failures < 8) retry = window.setTimeout(() => connect(target), 2000) }
      ws.onerror = () => ws.close()
    }
    let capturing = false
    let anchorRestore: { sessionId: string; active?: string; visible: boolean } | undefined
    let anchorTimer: number | undefined
    const cleanupAnchor = () => {
      const restore = anchorRestore
      if (!restore) return
      anchorRestore = undefined
      window.clearTimeout(anchorTimer)
      service.closeTab(ANCHOR_ID, { sessionId: restore.sessionId })
      // Restored native tabs can outlive the upstream seed-id records.
      // Remove the descriptor's real inventory IDs as well as its seed ID.
      const sidebar = native()
      if (sidebar?.mounted.getSnapshot() === restore.sessionId) {
        sidebar.openTabs.getSnapshot().filter(t => t.sessionId === restore.sessionId && t.kind === ANCHOR_ID).forEach(t => sidebar.close(t.tabId))
      }
      if (sessionId === restore.sessionId) {
        if (restore.active) sidebar?.focus(restore.active)
        if (!restore.visible && sidebar?.isExpanded()) sidebar.toggleExpanded()
      }
      capturing = false
    }
    const disposeAnchor = service.registerTab({ id: ANCHOR_ID, hidden: true, single: true, title: 'Sidebar Controller 增强控制', settings: { render: ControllerSettings }, component: props => {
      store = props.store
      queueMicrotask(() => { if (!closed) cleanupAnchor() })
      return null
    } })
    const captureStore = () => {
      if (store || capturing || !sessionId || !service.isTabEnabled(ANCHOR_ID)) return
      capturing = true
      const sidebar = native()!
      const target = sessionId
      const active = sidebar.active()
      anchorRestore = { sessionId: target, active: active?.kind === ANCHOR_ID ? sidebar.openTabs.getSnapshot().find(t => t.sessionId === target && t.kind !== ANCHOR_ID)?.tabId : active?.id, visible: sidebar.isExpanded() }
      try { service.openTab({ type: ANCHOR_ID, id: ANCHOR_ID, title: '' }, { sessionId: target }) }
      catch { anchorRestore = undefined; capturing = false; return }
      // Cleanup follows actual rendering. The fallback only removes an unrenderable anchor.
      anchorTimer = window.setTimeout(cleanupAnchor, 2000)
    }
    const change = () => {
      const next = native()?.mounted.getSnapshot()
      if (next !== sessionId) {
        cleanupAnchor()
        sessionId = next; failures = 0; lastSemantic = undefined; bottomFocused = false
        window.clearTimeout(retry); retry = undefined
        const old = socket; socket = undefined; old?.close()
      }
      // mounted is published before React adopts the surface. active() is public readiness.
      if (next && native()?.active() !== undefined) {
        if (!socket && retry === undefined) connect(next)
        captureStore()
        if (store && !capturing) native()?.openTabs.getSnapshot().filter(t => t.sessionId === next && t.kind === ANCHOR_ID).forEach(t => native()?.close(t.tabId))
      }
      void push().catch(() => {})
    }
    const focus = (event: Event) => {
      const target = event.target as Element | null
      if (!target?.closest) return
      bottomFocused = target.closest('[data-dsh-bottom-panel]') !== null
      void push().catch(() => {})
    }
    document.addEventListener('pointerdown', focus, true); document.addEventListener('focusin', focus, true)
    disposers.push(service.subscribeState(change))
    const sidebar = native()
    if (sidebar) disposers.push(sidebar.mounted.subscribe(change), sidebar.openTabs.subscribe(change))
    disposers.push(ctx.sessions.list.subscribe(change))
    const timer = window.setInterval(change, 500)
    change()
    return () => { cleanupAnchor(); closed = true; socket?.close(); window.clearTimeout(retry); window.clearInterval(timer); disposers.forEach(off => off()); disposeAnchor(); document.removeEventListener('pointerdown', focus, true); document.removeEventListener('focusin', focus, true) }
    } catch (error) { console.error('[sidebar-controller] client initialization failed', error); throw error }
  }, 'dsh-better-sidebar-controller: desktop bridge')
}
