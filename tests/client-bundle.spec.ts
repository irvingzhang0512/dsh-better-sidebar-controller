import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { editorTab, leaf, makeState, snapshot } from './helpers/sidebar-fixtures.ts'

const anchor = 'dsh-better-sidebar-controller:anchor'
const flush = () => new Promise(resolve => setTimeout(resolve, 15))
function probe(ready = true) {
  let mounted: string | undefined = 'a'
  let active = 'initial'
  let visible = true
  let entries: Array<{ sessionId: string; tabId: string; kind: string; contentId: string }> = []
  let current = snapshot('a', makeState(), { agentOpenTools: true, pluginSettings: { [anchor]: { agentControlTools: true } } } as never)
  const notifications: Array<() => void> = []
  const timers: Array<{ fn: () => void; ms: number }> = []
  const descriptors: Array<Record<string, any>> = []
  const documentEvents = new Map<string, (event: any) => void>()
  const operations: string[] = []
  const scopes: any[] = []
  const closed: string[] = []
  let teardown = () => {}
  const notify = () => notifications.forEach(fn => fn())
  const address = (path: string) => `dsh-resource://file/session/${mounted}/${path.replace(/\\/g, '/')}`
  const sidebar = {
    mounted: { getSnapshot: () => mounted, subscribe: (fn: () => void) => { notifications.push(fn); return () => {} } },
    openTabs: { getSnapshot: () => entries, subscribe: (fn: () => void) => { notifications.push(fn); return () => {} } },
    active: () => { if (!ready) return undefined; const found = entries.find(t => t.tabId === active); return found ? { ...found, id: found.tabId } : { id: active, kind: 'guide', contentId: '' } },
    isExpanded: () => visible, toggleExpanded: () => { visible = !visible },
    focus: (id: string) => { active = id; operations.push(`focus:${id}`) },
    close: (id: string) => { closed.push(id); entries = entries.filter(t => t.tabId !== id); active = entries.at(-1)?.tabId ?? 'guide' },
    openTab: (kind: string, options: any) => { active = `browser-${entries.length}`; entries.push({ sessionId: mounted!, tabId: active, kind, contentId: `dsh-resource://page/browser/${options.params.url}` }); operations.push('browser') },
  }
  const add = (path: string) => { active = path; entries.push({ sessionId: mounted!, tabId: active, kind: 'editor', contentId: address(path) }); operations.push(`open:${path}`) }
  const store = { reduce: (fn: any) => { current = { ...current, state: fn(current.state) }; notify() } }
  const service = {
    registerTab: (d: any) => { descriptors.push(d); return () => {} }, getSnapshot: () => current,
    subscribeState: (fn: () => void) => { notifications.push(fn); return () => {} },
    isTabEnabled: () => true, hostRouteUrl: (path: string) => `http://127.0.0.1:19991/prefix/${path}`,
    openTab: (seed: any, scope: any) => {
      if (seed.type === anchor) { active = anchor; descriptors[0]!.component({ store, scope }); return }
      add(seed.path)
    }, closeTab: (id: string) => {
      closed.push(id)
      const pane = current.state?.bottomSplits
      if (pane?.kind === 'leaf' && pane.tabs.some(t => t.id === id)) {
        const tabs = pane.tabs.filter(t => t.id !== id)
        current = { ...current, state: { ...current.state!, bottomSplits: { ...pane, tabs, active: tabs[0]?.id ?? null } } }; notify()
      }
    }, activateTab: (id: string) => {
      const pane = current.state?.bottomSplits
      if (pane?.kind === 'leaf') current = { ...current, state: { ...current.state!, bottomSplits: { ...pane, active: id } } }
      notify()
    },
    openFile: (scope: any, path: string) => { scopes.push(scope); if (!entries.some(t => t.tabId === path)) add(path); else active = path },
  }
  const sockets: Socket[] = []
  class Socket {
    static OPEN = 1; readyState = 0; onopen?: () => void; onmessage?: (event: any) => void; onclose?: () => void; onerror?: () => void
    sent: any[] = []
    constructor(public url: string) { sockets.push(this) }
    send(text: string) { this.sent.push(JSON.parse(text)) }
    close() { this.readyState = 3; this.onclose?.() }
    open() { this.readyState = 1; this.onopen?.() }
    command(name: string, args = {}, id = name) { this.onmessage?.({ data: JSON.stringify({ type: 'command', id, command: { name, ...args } }) }) }
  }
  let module: any
  const context = createContext({
    window: { __ModuleLoader__: { load: (m: any) => { module = m } }, setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length }, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {}, dispatchEvent: () => {} },
    document: { addEventListener: (name: string, fn: any) => documentEvents.set(name, fn), removeEventListener: () => {} },
    WebSocket: Socket, URL, AbortSignal, Event, queueMicrotask, console,
    fetch: async (_url: string, options: any) => {
      const body = JSON.parse(options.body)
      return { ok: true, json: async () => ({ ok: true, value: body.query === undefined ? { cwd: 'F:/workspace' } : { matches: [body.query], dirs: body.query.endsWith('/docs') ? [body.query] : [] } }) }
    },
  })
  runInContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'), context)
  const exports = module.factory((id: string) => { if (id !== 'react') throw new Error(`unexpected external ${id}`); return { createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children }) } })
  exports.apply({ effect: (fn: any) => { teardown = fn() }, get: () => sidebar, betterSidebar: service, sessions: { list: { subscribe: (fn: () => void) => { notifications.push(fn); return () => {} } } } })
  timers.filter(t => t.ms === 0).forEach(t => t.fn())
  return {
    sockets, descriptors, operations, scopes, closed, timers, sidebar, inject: exports.inject,
    ready: () => { ready = true; notify() }, teardown: () => teardown(), notify,
    select: (path: string) => { active = path; notify() }, add,
    bottom: (state: ReturnType<typeof makeState>) => { current = { ...current, state }; notify() },
    focusBottom: () => documentEvents.get('pointerdown')?.({ target: { closest: () => ({}) } }),
    prefs: (prefs: any) => { current = { ...current, prefs }; notify() },
    switch: (id?: string) => { mounted = id; current = snapshot(id, makeState(), current.prefs); notify() },
    state: () => sockets.at(-1)!.sent.filter(m => m.type === 'state').at(-1)?.state,
  }
}

describe('built desktop client', () => {
  it('uses cwd on the first open and reuses an existing file across address spellings', async () => {
    const p = probe(); const ws = p.sockets[0]!; ws.open(); await flush()
    ws.command('better_sidebar_open', { kind: 'file', target: 'F:/workspace/A.md', title: 'A' }); await flush()
    expect(p.scopes[0]).toMatchObject({ sessionId: 'a', cwd: 'F:/workspace' })
    ws.command('open_file', { path: 'f:/workspace/a.md' }); await flush()
    expect(p.operations.filter(op => op.startsWith('open:'))).toHaveLength(1)
    expect(ws.sent.filter(m => m.type === 'command-result').every(m => m.result.ok)).toBe(true); p.teardown()
  })
  it('unifies native and bottom files and controls the actual bottom tab', async () => {
    const p = probe(); const ws = p.sockets[0]!; ws.open(); await flush()
    p.add('F:/workspace/native.md')
    p.bottom(makeState({ bottomOpen: true, splits: leaf('pane-1', [editorTab('bottom-a', 'F:/outside/a.md'), editorTab('bottom-b', 'F:/outside/b.md')]) }))
    p.focusBottom(); await flush()
    expect(p.state()).toMatchObject({ currentFile: 'F:/outside/a.md', openedFiles: ['F:/workspace/native.md', 'F:/outside/a.md', 'F:/outside/b.md'] })
    ws.command('activate_file', { path: 'F:/outside/b.md' }); await flush()
    expect(p.state().currentFile).toBe('F:/outside/b.md')
    ws.command('better_sidebar_open', { kind: 'file', target: 'F:/outside/a.md', title: 'A' }); await flush()
    expect(p.state().currentFile).toBe('F:/outside/a.md'); expect(p.scopes).toHaveLength(0)
    ws.command('close_file', { path: 'F:/outside/a.md' }); await flush()
    expect(p.state().openedFiles).not.toContain('F:/outside/a.md'); p.teardown()
  })
  it('declares accessed services and waits for actual surface readiness', async () => {
    const p = probe(false)
    expect(p.inject).toEqual(['betterSidebar', 'sessions', 'sidebarRight'])
    expect(p.sockets).toHaveLength(0); expect(p.closed).toHaveLength(0)
    p.ready(); expect(p.sockets).toHaveLength(1)
    p.sockets[0]!.open(); await flush(); expect(p.closed).toContain(anchor); p.teardown()
  })
  it('does not report success for a native close no-op', async () => {
    const p = probe(); const ws = p.sockets[0]!; ws.open(); await flush()
    p.add('F:/outside/a.md'); p.notify(); await flush()
    p.sidebar.close = () => {}
    ws.command('close_file', { path: 'F:/outside/a.md' }); await flush()
    expect(ws.sent.find(m => m.type === 'command-result')?.result).toMatchObject({ ok: false, code: 'SIDEBAR_UNAVAILABLE' }); p.teardown()
  })
  it('cleans restored anchors by their real native IDs when seed records are absent', async () => {
    const p = probe(); await flush()
    p.sidebar.openTab(anchor, { params: { url: 'restored' } }); p.notify(); await flush()
    expect(p.sidebar.openTabs.getSnapshot().some(t => t.kind === anchor)).toBe(false)
    expect(p.closed).toContain('browser-0'); p.teardown()
  })
  it('uses hostRouteUrl and pushes initial state after CONNECTING', async () => {
    const p = probe(); expect(p.sockets[0]!.url).toBe('ws://127.0.0.1:19991/prefix/sidebar-controller/ws?sessionId=a')
    await flush(); expect(p.sockets[0]!.sent).toHaveLength(0)
    p.sockets[0]!.open(); await flush(); expect(p.state()).toMatchObject({ sessionId: 'a', currentFile: null })
    expect(p.closed).toContain(anchor); expect(p.operations).toContain('focus:initial'); p.teardown()
  })
  it('tracks mouse and agent files; folders and browsers never become file pointers', async () => {
    const p = probe(); const ws = p.sockets[0]!; ws.open(); await flush()
    ws.command('better_sidebar_open', { kind: 'file', target: 'F:/workspace/会议.md', title: '会议' }); await flush()
    expect(p.state().currentFile).toBe('F:/workspace/会议.md')
    ws.command('better_sidebar_open', { kind: 'file', target: 'F:/外部/计划.md', title: '计划' }); await flush()
    expect(p.state()).toMatchObject({ currentFile: 'F:/外部/计划.md', previousFile: 'F:/workspace/会议.md' })
    p.select('F:/workspace/会议.md'); await flush(); expect(p.state().previousFile).toBe('F:/外部/计划.md')
    ws.command('better_sidebar_open', { kind: 'folder', target: 'F:/workspace/docs', title: 'docs' }); await flush()
    expect(p.state().currentFile).toBeNull(); expect(p.state().openedFiles).not.toContain('F:/workspace/docs')
    ws.command('better_sidebar_open', { kind: 'url', target: 'https://example.com', title: 'web' }); await flush()
    expect(p.state().currentFile).toBeNull(); expect(p.operations).toContain('browser'); p.teardown()
  })
  it('accepts activate/close/return on known outside files', async () => {
    const p = probe(); const ws = p.sockets[0]!; ws.open(); await flush()
    p.add('F:/outside/a.md'); p.add('F:/outside/b.md'); p.notify(); await flush()
    ws.command('activate_file', { path: 'F:/outside/a.md' }); await flush(); expect(p.state().currentFile).toBe('F:/outside/a.md')
    ws.command('reopen_previous_file', { path: 'F:/outside/b.md' }); await flush(); expect(p.state().currentFile).toBe('F:/outside/b.md')
    ws.command('close_file', { path: 'F:/outside/b.md' }); await flush(); expect(p.state().openedFiles).toEqual(['F:/outside/a.md']); p.teardown()
  })
  it('rechecks settings at execution and retains state sync with tools off', async () => {
    const p = probe(); const ws = p.sockets[0]!; ws.open(); await flush(); p.prefs({ agentOpenTools: false, pluginSettings: {} })
    ws.command('better_sidebar_open', { kind: 'file', target: 'F:/x.md', title: 'x' }); await flush()
    expect(ws.sent.find(m => m.type === 'command-result')?.result.code).toBe('TOOL_DISABLED')
    expect(p.operations.some(x => x.startsWith('open:'))).toBe(false)
    ws.command('sync_state'); await flush(); expect(ws.sent.at(-1).result.ok).toBe(true); p.teardown()
  })
  it('does not operate the other mounted session and forces reconnect state', async () => {
    const p = probe(); const old = p.sockets[0]!; old.open(); await flush(); p.switch('b')
    old.command('open_file', { path: 'F:/wrong.md' }); p.sockets.at(-1)!.open(); await flush()
    expect(p.state().sessionId).toBe('b'); expect(p.operations).not.toContain('open:F:/wrong.md')
    p.sockets.at(-1)!.close(); p.timers.filter(t => t.ms === 2000).at(-1)!.fn(); p.sockets.at(-1)!.open(); await flush()
    expect(p.state().sessionId).toBe('b'); p.teardown()
  })
  it('settings card hides listing options until enabled and includes the shipped guide', () => {
    const p = probe(); const updates: any[] = []; const render = p.descriptors[0]!.settings.render
    const props = { prefs: { agentOpenTools: false }, pluginSettings: {}, updatePluginSetting: (...args: any[]) => updates.push(args) }
    const off = JSON.stringify(render(props)); expect(off).not.toContain('"children":["列出隐藏项"]'); expect(off).toContain('查看 Agent 使用说明')
    const on = JSON.stringify(render({ ...props, pluginSettings: { agentControlTools: true } })); expect(on).toContain('列出隐藏项'); expect(on).toContain('BRIDGE_TIMEOUT'); expect(on).toContain(JSON.stringify(readFileSync(new URL('../docs/usage.md', import.meta.url), 'utf8'))); p.teardown()
    const legacy = JSON.stringify(render({ ...props, pluginSettings: { agentControlTools: true, maxListedEntries: -2.5 } }))
    expect(legacy).toContain('"value":1'); expect(legacy).not.toContain('"value":-2.5')
  })
})
