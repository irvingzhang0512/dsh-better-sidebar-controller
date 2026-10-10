/**
 * dsh-better-sidebar-controller — client half (browser).
 *
 * Runs only when `ctx.betterSidebar` is provided (i.e. dsh-better-sidebar is
 * installed): a soft dependency — the host half mounts regardless, and this
 * module simply never activates otherwise.
 *
 * Responsibilities:
 * 1. State mirror — derives the controller state (current/previous file,
 *    opened files, expanded folders, sidebar visibility) from every
 *    better-sidebar snapshot and pushes it to the host bridge. Because the
 *    snapshot observes every mouse interaction, user operations and Agent
 *    operations share one state.
 * 2. Bridge client — attaches to `/sidebar-controller/ws?sessionId=…` for
 *    the ACTIVE session, receives tool commands from the host, applies them
 *    through the better-sidebar service / store, and acknowledges.
 * 3. Store access — captures the sidebar store through a hidden anchor tab
 *    registered via the PUBLIC `registerTab` API. This is the minimal,
 *    non-invasive way to mutate `state.expanded` (expand/collapse) and panel
 *    visibility without modifying better-sidebar's core. The anchor renders
 *    nothing and is removed as soon as the store has been captured.
 * 4. Settings mirror — the same anchor descriptor carries this plugin's
 *    side-card listing settings (SPEC F009); the client reads them from the
 *    public service snapshot and pushes them to the host, where the actual
 *    directory listing runs.
 */
import type { Context } from 'dsh-better-sidebar'
import type { SidebarSnapshot, SidebarStore } from 'dsh-better-sidebar/client/service'
import { activeTabIdOf, allLeaves, baseName, deriveSidebarState, findTabByPath, replacementTabId, type DerivedSidebarState } from '../shared/derive.ts'
import { LISTING_SETTINGS_DEFAULTS, MAX_LISTED_ENTRIES_MIN, type ClientToHostMessage, type CommandAck, type ControllerCommand, type ListingSettings, type SidebarStateWire } from '../shared/types.ts'
import { parseHostMessage } from '../shared/wire.ts'

export const inject = ['betterSidebar']

/** Hidden anchor tab type (captures the store through the public registry API). */
const ANCHOR_TYPE = 'dsh-better-sidebar-controller:anchor'
/** The anchor tab's stable id (dedupes on reopen / restore). */
const ANCHOR_TAB_ID = 'dsh-better-sidebar-controller:anchor'
/**
 * The anchor descriptor's formal name (SPEC F009「文件树与列表」).
 *
 * The side-card settings page renders ONE card per registered tab descriptor
 * WITHOUT filtering `hidden`, so this hidden anchor is also the card that
 * carries this plugin's two listing settings — and its title is the only
 * visible part actually under our control (the card's second line is fixed
 * to the descriptor id upstream, and `description` is not rendered on cards).
 */
const ANCHOR_TITLE = '文件树与列表'
/** Bridge upgrade path (must match the host half). */
const BRIDGE_PATH = '/sidebar-controller/ws'
/** Reconnect cap so a refused endpoint never spins forever. */
const RECONNECT_FAILURE_LIMIT = 8
const RECONNECT_DELAY_MS = 2000

/**
 * Client plugin body.
 * @param ctx - the client cordis context (betterSidebar injected).
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const service = ctx.betterSidebar
    const nativeSidebar = () => ctx.get('sidebarRight') as unknown as {
      isExpanded(): boolean
      toggleExpanded(): void
    } | undefined
    let store: SidebarStore | undefined
    let derived: DerivedSidebarState | undefined
    let socket: WebSocket | null = null
    let attachedSession: string | null = null
    let sessionId: string | undefined
    let retryTimer: number | undefined
    let closed = false
    let failures = 0
    let lastSemantic: string | undefined
    /** Last settings blob pushed (SPEC F009 change guard). */
    let lastSettingsKey: string | undefined
    let lastIntentionallyClosed: string | null = null
    let anchorOriginalBottomOpen: boolean | undefined

    /** Send one message; returns whether it actually went out (socket OPEN). */
    const send = (message: ClientToHostMessage): boolean => {
      if (socket !== null && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message))
        return true
      }
      return false
    }

    const pushState = (): void => {
      if (sessionId === undefined) return
      const snapshot = service.getSnapshot()
      const next = deriveSidebarState(derived, snapshot, nativeSidebar()?.isExpanded())
      derived = next
      // Only push when something actually changed (panel resize etc. must not
      // spam the bridge); `updatedAt` is excluded from the change guard.
      const semantic = JSON.stringify([next.sidebarVisible, next.currentFile, next.previousFile, next.fileCandidate, next.fileCandidateSource, next.openedFiles, next.expandedFolders])
      if (semantic === lastSemantic) return
      lastSemantic = semantic
      const wire: SidebarStateWire = {
        sessionId,
        sidebarVisible: next.sidebarVisible,
        currentFile: next.currentFile,
        previousFile: next.previousFile,
        fileCandidate: next.fileCandidate,
        fileCandidateSource: next.fileCandidateSource,
        openedFiles: next.openedFiles,
        expandedFolders: next.expandedFolders,
        updatedAt: Date.now(),
      }
      send({ type: 'state', state: wire })
    }

    const ack = (id: string, result: Omit<CommandAck, 'id'>): void => {
      send({ type: 'command-result', result: { id, ...result } })
    }

    /**
     * Read this plugin's own settings blob out of a snapshot (SPEC F009).
     *
     * Read-only through the PUBLIC service snapshot (`prefs.pluginSettings`),
     * never the private store; every level is probed because the blob is an
     * open map owned by better-sidebar's prefs document and an older
     * better-sidebar (< 0.12.0) may carry no `pluginSettings` at all. A
     * snapshot that throws or omits prefs degrades to the defaults, so the
     * listing behavior stays at the pre-F009 contract.
     */
    const settingsFromSnapshot = (snapshot: SidebarSnapshot): ListingSettings => {
      let blob: unknown
      try {
        const pluginSettings = (snapshot as { prefs?: { pluginSettings?: unknown } }).prefs?.pluginSettings
        blob = (pluginSettings !== null && typeof pluginSettings === 'object')
          ? (pluginSettings as Record<string, unknown>)[ANCHOR_TAB_ID]
          : undefined
      } catch {
        blob = undefined
      }
      const record = (blob !== null && typeof blob === 'object' && !Array.isArray(blob))
        ? blob as Record<string, unknown>
        : {}
      const bound = record.maxListedEntries
      return {
        // Unset key → documented default (hidden rows returned); a present
        // value counts as ON only when it is literally true.
        includeHiddenEntries: record.includeHiddenEntries === undefined
          ? LISTING_SETTINGS_DEFAULTS.includeHiddenEntries
          : record.includeHiddenEntries === true,
        maxListedEntries: typeof bound === 'number' && Number.isFinite(bound)
          ? Math.max(MAX_LISTED_ENTRIES_MIN, Math.floor(bound))
          : LISTING_SETTINGS_DEFAULTS.maxListedEntries,
      }
    }

    /**
     * Mirror the two listing settings to the host when they CHANGE.
     *
     * The bridge carries them on their own `settings` message rather than
     * inside the state push, because a settings-only change leaves the
     * semantic state identical (the state push's change guard would swallow
     * it). The host falls back to the defaults when no client ever pushed,
     * so a missing mirror never breaks listing.
     */
    const pushSettings = (): void => {
      if (sessionId === undefined) return
      const next = settingsFromSnapshot(service.getSnapshot())
      const key = JSON.stringify(next)
      if (key === lastSettingsKey) return
      // Only remember the value once it actually went out: a push attempted
      // while the socket is still CONNECTING would otherwise mark the
      // settings as synced and the `onopen` retry would skip them — leaving
      // the host on stale defaults after a page reload.
      if (!send({ type: 'settings', settings: next })) return
      lastSettingsKey = key
    }

    const connect = (targetSessionId: string): void => {
      if (closed) return
      // Only the ACTIVE session keeps a live bridge: drop any prior socket so
      // its host mirror turns honestly disconnected, and no stale socket keeps
      // serving an inactive session (queued work replays on the next attach).
      if (socket !== null) {
        if (attachedSession !== null) lastIntentionallyClosed = attachedSession
        socket.close()
        socket = null
      }
      const url = new URL(BRIDGE_PATH, window.location.origin)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      url.search = new URLSearchParams({ sessionId: targetSessionId }).toString()
      const ws = new WebSocket(url.toString())
      socket = ws
      ws.onopen = () => {
        if (socket !== ws) return
        attachedSession = targetSessionId
        failures = 0
        send({ type: 'hello', sessionId: targetSessionId })
        pushSettings()
        pushState()
      }
      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return
        try {
          const message = parseHostMessage(event.data)
          handleCommand(message.id, message.command)
        } catch {
          // Malformed push: drop it, keep the socket.
        }
      }
      ws.onclose = () => {
        if (socket === ws) socket = null
        if (attachedSession === targetSessionId) attachedSession = null
        if (closed) return
        // An intentionally-closed socket (session switch / teardown) must not
        // trigger a reconnect storm for the session it served.
        if (lastIntentionallyClosed === targetSessionId) {
          lastIntentionallyClosed = null
          return
        }
        failures += 1
        if (failures >= RECONNECT_FAILURE_LIMIT) return
        retryTimer = window.setTimeout(() => connect(targetSessionId), RECONNECT_DELAY_MS)
      }
      ws.onerror = () => { ws.close() }
    }

    /** The session scope for service calls (the attached / active session). */
    const scopeOf = (): { sessionId: string } | null => {
      const id = attachedSession ?? sessionId
      return typeof id === 'string' && id !== '' ? { sessionId: id } : null
    }

    const storeUnavailable = (id: string): void => {
      ack(id, { ok: false, code: 'SIDEBAR_UNAVAILABLE', message: 'Sidebar 存储不可用，请刷新页面后重试。' })
    }

    const handleCommand = (id: string, command: ControllerCommand): void => {
      switch (command.name) {
        case 'show_sidebar': {
          const sidebar = nativeSidebar()
          if (sidebar === undefined) return storeUnavailable(id)
          if (!sidebar.isExpanded()) sidebar.toggleExpanded()
          pushState()
          ack(id, { ok: true, code: 'OK', message: '侧边栏已打开。', value: { sidebarVisible: true } })
          break
        }
        case 'hide_sidebar': {
          const sidebar = nativeSidebar()
          if (sidebar === undefined) return storeUnavailable(id)
          if (sidebar.isExpanded()) sidebar.toggleExpanded()
          pushState()
          ack(id, { ok: true, code: 'OK', message: '侧边栏已关闭。', value: { sidebarVisible: false } })
          break
        }
        case 'expand_folder': {
          const s = store
          if (s === undefined) return storeUnavailable(id)
          const path = command.path
          s.reduce(state => (
            state.expanded.includes(path) ? state : { ...state, expanded: [...state.expanded, path] }
          ))
          ack(id, { ok: true, code: 'OK', message: `已展开 ${baseName(path)}。`, value: { path, expanded: true } })
          break
        }
        case 'collapse_folder': {
          const s = store
          if (s === undefined) return storeUnavailable(id)
          const path = command.path
          s.reduce(state => (
            !state.expanded.includes(path) ? state : { ...state, expanded: state.expanded.filter(x => x !== path) }
          ))
          ack(id, { ok: true, code: 'OK', message: `已收起 ${baseName(path)}。`, value: { path, expanded: false } })
          break
        }
        case 'refresh_tree': {
          // Documented integration point: dispatching this window event bumps
          // the tree's refresh tick so every visible level reloads.
          window.dispatchEvent(new Event('dsh-sidebar:refresh-files'))
          ack(id, { ok: true, code: 'OK', message: '文件树已刷新。' })
          break
        }
        case 'open_file': {
          const scope = scopeOf()
          if (scope === null) return ack(id, { ok: false, code: 'SIDEBAR_UNAVAILABLE', message: '当前没有活动的会话。' })
          service.openFile(scope, command.path, command.title)
          ack(id, { ok: true, code: 'OK', message: `已打开 ${baseName(command.path)}。`, value: { path: command.path } })
          break
        }
        case 'close_file': {
          const snapshot = service.getSnapshot()
          const state = snapshot.state
          if (state === undefined) return storeUnavailable(id)
          const path = command.path
          if (path === undefined || path === '') {
            return ack(id, { ok: false, code: 'NO_CURRENT_FILE', message: '未指定文件且当前没有已打开的文件。' })
          }
          const tab = findTabByPath(state, path)
          if (tab === undefined) {
            return ack(id, { ok: false, code: 'FILE_NOT_OPEN', message: `文件未打开: ${path}` })
          }
          const scope = scopeOf() ?? { sessionId: snapshot.sessionId ?? '' }
          service.closeTab(tab.id, scope)
          ack(id, { ok: true, code: 'OK', message: `已关闭 ${baseName(path)}。`, value: { path } })
          break
        }
        case 'activate_file': {
          const snapshot = service.getSnapshot()
          const state = snapshot.state
          if (state === undefined) return storeUnavailable(id)
          const path = command.path
          const tab = findTabByPath(state, path)
          if (tab === undefined) {
            return ack(id, { ok: false, code: 'FILE_NOT_OPEN', message: `文件未打开: ${path}。请先使用 open_file。` })
          }
          const scope = scopeOf() ?? { sessionId: snapshot.sessionId ?? '' }
          service.activateTab(tab.id, scope)
          ack(id, { ok: true, code: 'OK', message: `已切换到 ${baseName(path)}。`, value: { path } })
          break
        }
        case 'reopen_previous_file': {
          const prev = derived?.previousFile ?? null
          if (prev === null) {
            return ack(id, { ok: false, code: 'NO_PREVIOUS_FILE', message: '没有上一个文件。' })
          }
          const scope = scopeOf()
          if (scope === null) return ack(id, { ok: false, code: 'SIDEBAR_UNAVAILABLE', message: '当前没有活动的会话。' })
          service.openFile(scope, prev)
          ack(id, { ok: true, code: 'OK', message: `已打开上一个文件 ${baseName(prev)}。`, value: { path: prev } })
          break
        }
        case 'sync_state': {
          pushState()
          ack(id, { ok: true, code: 'OK', message: '状态已同步。' })
          break
        }
        default: {
          const exhaustive: never = command
          void exhaustive
          ack(id, { ok: false, code: 'UNKNOWN_COMMAND', message: '未知命令。' })
          break
        }
      }
    }

    // Anchor tab: the only non-invasive way to reach the store (and thus
    // `state.expanded` / panel visibility) through the public API. It renders
    // nothing. Because openTab ACTIVATES the tab (which would leave a blank
    // pill hijacking the user's active view on every session switch / reload),
    // the anchor is minted at most once per page load — the store capture is
    // global, so later session switches need no second anchor — and the
    // previously active tab is restored immediately after the open. Once its
    // component captures the store, the temporary tab is removed so it cannot
    // leak into the tab strip or persisted layouts.
    let anchorCleanupScheduled = false

    /**
     * Remove the hidden anchor tab.
     *
     * The anchor can land in two places: with a native right Sidebar mounted
     * (`ctx.sidebarRight`, DSH 0.1.5+), better-sidebar routes `openTab` to the
     * native surface, so the anchor never appears in `state.bottomSplits`; only
     * without that surface does it land in the plugin's own bottom workbench.
     * `service.closeTab` is safe for both (it closes the native page when a
     * native record exists, and otherwise falls through to the bottom-tree
     * reducer, where an unknown id is a strict no-op) — so the bottom tree must
     * NOT gate the close: the old guard skipped it for native anchors, which
     * leaked a blank page into the right Sidebar's tab strip on every load.
     * Only the bottom landing needs the "restore the previously active tab /
     * panel state" follow-up; the native landing is finished by DSH's sidebar
     * (the public API has no cross-pane activation face).
     */
    const removeAnchor = (snapshot: SidebarSnapshot): void => {
      if (snapshot.state === undefined || snapshot.sessionId === undefined) return
      const scope = { sessionId: snapshot.sessionId }
      const inBottomTree = allLeaves(snapshot.state).some(leaf => leaf.tabs.some(tab => tab.id === ANCHOR_TAB_ID))
      service.closeTab(ANCHOR_TAB_ID, scope)
      if (inBottomTree) {
        const active = activeTabIdOf(snapshot.state)
        const replacement = active === ANCHOR_TAB_ID
          ? replacementTabId(snapshot.state, ANCHOR_TAB_ID)
          : active
        if (replacement !== null) service.activateTab(replacement, scope)
      }
      if (anchorOriginalBottomOpen === false && store !== undefined) {
        store.reduce(state => state.bottomOpen ? { ...state, bottomOpen: false } : state)
      }
      anchorOriginalBottomOpen = undefined
    }

    const disposeAnchor = service.registerTab({
      id: ANCHOR_TYPE,
      hidden: true,
      single: true,
      title: () => ANCHOR_TITLE,
      // SPEC F009: the two single-level listing settings. They live in
      // better-sidebar's own prefs document under `pluginSettings[<id>]`
      // (plugin-local keys, v0.12.0+), and the client mirrors them to the
      // host — the listing itself runs on the host half.
      settings: {
        pluginToggles: [
          {
            key: 'includeHiddenEntries',
            type: 'switch',
            title: '列出隐藏项',
            desc: '开启时单层列举返回点开头的隐藏条目（仍带 hidden 标记）；关闭后过滤它们，且不占用行数上限。',
          },
          {
            key: 'maxListedEntries',
            type: 'number',
            min: MAX_LISTED_ENTRIES_MIN,
            title: '单层条目上限',
            desc: '单层列举最多返回的行数；超出时结果标记 truncated。默认 1000。',
          },
        ],
      },
      component: (props) => {
        store = props.store
        if (!anchorCleanupScheduled) {
          anchorCleanupScheduled = true
          queueMicrotask(() => {
            anchorCleanupScheduled = false
            if (!closed) removeAnchor(service.getSnapshot())
          })
        }
        return null
      },
    })

    /** Mint the anchor tab in the BACKGROUND: never steal the user's active
     *  tab. A no-op once the store is captured (global capture — later
     *  session switches must not reopen/activate the anchor again). */
    const openAnchorInBackground = (snapshot: SidebarSnapshot): void => {
      if (store !== undefined) {
        // Also remove anchors persisted by older versions when switching to a
        // session that has not been visited since this fix was installed.
        removeAnchor(snapshot)
        return
      }
      const active = snapshot.state === undefined ? null : activeTabIdOf(snapshot.state)
      const previous = active === ANCHOR_TAB_ID && snapshot.state !== undefined
        ? replacementTabId(snapshot.state, ANCHOR_TAB_ID)
        : active
      anchorOriginalBottomOpen = snapshot.state?.bottomOpen
      service.openTab({ type: ANCHOR_TYPE, id: ANCHOR_TAB_ID, title: '' })
      if (previous !== null && sessionId !== undefined) {
        service.activateTab(previous, { sessionId })
      }
    }

    // Follow the active session: reconnect the bridge and mint the anchor
    // (once) whenever the sidebar's session changes.
    const onChange = (): void => {
      const snapshot = service.getSnapshot()
      const nextSession = snapshot.sessionId
      if (nextSession !== sessionId) {
        sessionId = nextSession
        // Settings are better-sidebar USER settings (global), but the host
        // mirror is per session — re-push for the newly active one.
        lastSettingsKey = undefined
        if (nextSession !== undefined) {
          openAnchorInBackground(snapshot)
          if (socket === null) connect(nextSession)
          else if (attachedSession !== nextSession) connect(nextSession)
        }
      }
      pushSettings()
      pushState()
    }

    const offState = service.subscribeState(onChange)
    const nativeStateTimer = window.setInterval(pushState, 500)
    onChange()

    return () => {
      closed = true
      offState()
      window.clearInterval(nativeStateTimer)
      disposeAnchor()
      window.clearTimeout(retryTimer)
      if (socket !== null) {
        socket.close()
        socket = null
      }
    }
  }, 'dsh-better-sidebar-controller: bridge client')
}
