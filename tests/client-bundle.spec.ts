/**
 * 构建产物冒烟 + 锚点标签清理回归（lib/client.js）。
 *
 * 回归背景（SPEC F007「获取 store 后清理锚点」）：better-sidebar 0.19+ 在挂了
 * 原生右侧栏（`ctx.sidebarRight`）时会把 `openTab` 改投到原生页面，锚点因此
 * **不在** `state.bottomSplits` 里；旧实现以 bottomSplits 作为清理前置条件，
 * 原生锚点永远关不掉，泄漏成侧边栏里的空白页（新窗口每次加载都出现）。
 *
 * 本用例直接跑构建产物：确认 bundle 以包名注册、apply 能挂载，并覆盖两种落点
 * 的锚点清理（原生落点必须也调用 closeTab）。lib/client.js 未构建时整组跳过。
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createContext, runInContext } from 'node:vm'
import type { Context } from 'dsh-better-sidebar'
import { homeTab, leaf, makeState, snapshot } from './helpers/sidebar-fixtures.ts'

const BUNDLE_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const BUNDLE_ID = 'dsh-better-sidebar-controller'
const ANCHOR_TAB_ID = 'dsh-better-sidebar-controller:anchor'

interface CapturedModule {
  id: string
  factory: (require: (id: string) => unknown) => Record<string, unknown>
}

interface Probe {
  module: CapturedModule
  context: ReturnType<typeof createContext>
  tabs: Array<Record<string, unknown>>
  opened: Array<Record<string, unknown>>
  closed: string[]
  activated: string[]
  sockets: WebSocketStub[]
  /** 假 store 的订阅者（subscribeState），用来模拟"快照变化"。 */
  listeners: Array<() => void>
  /** 可变快照持有者：改 prefs 后调用 listeners 即可模拟设置变更。 */
  current: { value: ReturnType<typeof snapshot> }
}

/** 按指定落点策略构造一套最小假 ctx + DOM/浏览器桩，并执行 bundle。 */
function loadBundle(options: { nativeLanding: boolean; prefs?: unknown }): Probe {
  const captured: CapturedModule[] = []
  const tabs: Array<Record<string, unknown>> = []
  const opened: Array<Record<string, unknown>> = []
  const closed: string[] = []
  const activated: string[] = []
  const listeners: Array<() => void> = []
  const anchorTab = { id: ANCHOR_TAB_ID, type: 'dsh-better-sidebar-controller:anchor', title: '' }
  const current = { value: snapshot('s1', makeState(), options.prefs) }

  const service = {
    registerTab: (descriptor: Record<string, unknown>) => {
      tabs.push(descriptor)
      return () => undefined
    },
    getSnapshot: () => current.value,
    subscribeState: (listener: () => void) => {
      listeners.push(listener)
      return () => undefined
    },
    openTab: (seed: Record<string, unknown>) => {
      opened.push(seed)
      if (options.nativeLanding) return
      // 底部落点：锚点进入插件自己的 bottomSplits 并成为活动标签。
      current.value = snapshot('s1', makeState({
        splits: leaf('pane-1', [homeTab('t-home'), anchorTab as never], ANCHOR_TAB_ID),
        panelOpen: true,
      }))
    },
    closeTab: (tabId: string) => { closed.push(tabId) },
    activateTab: (tabId: string) => { activated.push(tabId) },
  }

  const fakeCtx = {
    effect: (fn: () => (() => void) | void) => {
      fn()
      return () => undefined
    },
    get: (name: string) => (name === 'sidebarRight'
      ? { isExpanded: () => true, toggleExpanded: () => undefined }
      : undefined),
    betterSidebar: service,
  }

  const windowStub: Record<string, unknown> = {
    __ModuleLoader__: { load: (module: CapturedModule) => { captured.push(module) } },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    location: { origin: 'http://127.0.0.1:3080', protocol: 'http:' },
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    setInterval: () => 0,
    clearInterval: () => undefined,
  }
  const socketCalls: string[] = []
  const sockets: WebSocketStub[] = []
  class WebSocketStub {
    static readonly OPEN = 1
    readyState = 0
    onopen: unknown
    onmessage: unknown
    onclose: unknown
    onerror: unknown
    readonly sent: string[] = []
    constructor(readonly url: string) {
      socketCalls.push(url)
      sockets.push(this)
    }
    send(message: string): void { this.sent.push(message) }
    close(): void { /* no-op */ }
  }

  const context = createContext({
    window: windowStub,
    console,
    WebSocket: WebSocketStub,
    URL,
    URLSearchParams,
    Event: class EventStub { constructor(readonly type: string) {} },
    queueMicrotask,
    structuredClone,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    require: (id: string) => { throw new Error(`unexpected require("${id}") in client bundle`) },
    __probe: { fakeCtx, service, current },
  })
  runInContext(readFileSync(BUNDLE_PATH, 'utf8'), context)

  const module = captured[0]!
  const exports = module.factory((id) => (context as unknown as { require: (id: string) => unknown }).require(id))
  ;(exports.apply as (ctx: Context) => void)(fakeCtx as unknown as Context)

  return { module, context, tabs, opened, closed, activated, sockets, listeners, current }
}

/** 模拟浏览器侧 WebSocket 握手完成：置为 OPEN 并触发 onopen。 */
function openSocket(probe: Probe, index = 0): WebSocketStub {
  const ws = probe.sockets[index]!
  ws.readyState = 1
  ;(ws.onopen as () => void)()
  return ws
}

/** 解析该 socket 收到的全部消息。 */
function messagesOf(ws: WebSocketStub): Array<Record<string, unknown>> {
  return ws.sent.map(text => JSON.parse(text) as Record<string, unknown>)
}

/** 让锚点组件挂载（真实环境由侧边栏渲染该隐藏页），随后清空微任务队列。 */
async function mountAnchor(probe: Probe): Promise<void> {
  const descriptor = probe.tabs[0]!
  const component = descriptor.component as (props: { store: unknown }) => unknown
  let reduced = 0
  const store = {
    reduce: (fn: (state: Record<string, unknown>) => Record<string, unknown>) => { reduced += 1; return fn({ bottomOpen: true }) },
  }
  component({ store })
  await new Promise(resolve => setTimeout(resolve, 0))
  void reduced
}

describe.skipIf(!existsSync(BUNDLE_PATH))('lib/client.js 构建产物冒烟与锚点清理', () => {
  it('以包名注册、apply 挂载并注册隐藏锚点标签（含 F009 标题与设置行）', () => {
    const probe = loadBundle({ nativeLanding: true })
    expect(probe.module.id).toBe(BUNDLE_ID)
    expect(probe.tabs).toHaveLength(1)
    expect(probe.tabs[0]!.id).toBe('dsh-better-sidebar-controller:anchor')
    expect(probe.tabs[0]!.hidden).toBe(true)
    expect(probe.tabs[0]!.single).toBe(true)
    // SPEC F009：锚点卡片有正式标题（可见修正只有标题）。
    expect((probe.tabs[0]!.title as () => string)()).toBe('文件树与列表')
    // SPEC F009：两行 pluginToggles（switch + number，min 1），键为插件本地键。
    const settings = probe.tabs[0]!.settings as {
      pluginToggles: Array<Record<string, unknown>>
    }
    expect(settings.pluginToggles).toHaveLength(2)
    expect(settings.pluginToggles[0]).toMatchObject({ key: 'includeHiddenEntries', type: 'switch' })
    expect(settings.pluginToggles[1]).toMatchObject({ key: 'maxListedEntries', type: 'number', min: 1 })
  })

  it('锚点仍不进「+」菜单：hidden 保持 true，且没有任何非隐藏描述符', () => {
    const probe = loadBundle({ nativeLanding: true })
    expect(probe.tabs.filter(tab => tab.hidden !== true)).toHaveLength(0)
  })

  it('原生落点（锚点不在 bottomSplits）：仍然关掉锚点，不残留空白页', async () => {
    const probe = loadBundle({ nativeLanding: true })
    // 锚点被投到原生右侧栏：bottomSplits 里没有它。
    expect(probe.opened).toHaveLength(1)
    expect(probe.opened[0]!.type).toBe('dsh-better-sidebar-controller:anchor')

    await mountAnchor(probe)

    // 回归点：旧实现因 bottomSplits 守卫直接 return，这里不会出现 closeTab。
    expect(probe.closed).toContain(ANCHOR_TAB_ID)
  })

  it('底部落点：关掉锚点并恢复原活动标签（既有行为不回退）', async () => {
    const probe = loadBundle({ nativeLanding: false })
    await mountAnchor(probe)
    expect(probe.closed).toContain(ANCHOR_TAB_ID)
    // 锚点抢占前的活动标签被恢复。
    expect(probe.activated).toContain('t-home')
  })

  it('SPEC F009：socket 打开后把两项设置推送给宿主（未设置时为默认值）', () => {
    const probe = loadBundle({ nativeLanding: true })
    const ws = openSocket(probe)
    const settings = messagesOf(ws).filter(message => message.type === 'settings')
    expect(settings).toHaveLength(1)
    expect(settings[0]!.settings).toEqual({ includeHiddenEntries: true, maxListedEntries: 1000 })
  })

  it('SPEC F009：读回 better-sidebar prefs 的 pluginSettings 并同步给宿主', () => {
    const probe = loadBundle({
      nativeLanding: true,
      prefs: {
        pluginSettings: {
          [ANCHOR_TAB_ID]: { includeHiddenEntries: false, maxListedEntries: 3 },
        },
      },
    })
    const ws = openSocket(probe)
    const settings = messagesOf(ws).filter(message => message.type === 'settings')
    expect(settings).toHaveLength(1)
    expect(settings[0]!.settings).toEqual({ includeHiddenEntries: false, maxListedEntries: 3 })
  })

  it('SPEC F009：prefs 缺失或畸形时回落到默认值，不抛错', () => {
    const noPrefs = loadBundle({ nativeLanding: true, prefs: undefined })
    const wsNoPrefs = openSocket(noPrefs)
    const a = messagesOf(wsNoPrefs).filter(message => message.type === 'settings')
    expect(a[0]!.settings).toEqual({ includeHiddenEntries: true, maxListedEntries: 1000 })

    const badPrefs = loadBundle({
      nativeLanding: true,
      prefs: { pluginSettings: { [ANCHOR_TAB_ID]: { includeHiddenEntries: 'yes', maxListedEntries: 0 } } },
    })
    const wsBad = openSocket(badPrefs)
    const b = messagesOf(wsBad).filter(message => message.type === 'settings')
    // 非法布尔按关闭；越界数字由宿主夹取，这里按 min 归一后送出。
    expect(b[0]!.settings).toEqual({ includeHiddenEntries: false, maxListedEntries: 1 })
  })

  it('SPEC F009：设置未变化时不重复推送，变化后再推送新值', () => {
    const anchorBlob = { includeHiddenEntries: true, maxListedEntries: 5 }
    const probe = loadBundle({
      nativeLanding: true,
      prefs: { pluginSettings: { [ANCHOR_TAB_ID]: anchorBlob } },
    })
    const ws = openSocket(probe)
    const countSettings = (): number => messagesOf(ws).filter(message => message.type === 'settings').length
    expect(countSettings()).toBe(1)

    // 快照变化但设置不变：不重复推送（去重保护）。
    probe.listeners.forEach(listener => listener())
    expect(countSettings()).toBe(1)

    // 用户在设置页改了值：下一次快照变化就把新值推给宿主。
    probe.current.value = snapshot('s1', makeState(), {
      pluginSettings: { [ANCHOR_TAB_ID]: { includeHiddenEntries: false, maxListedEntries: 2 } },
    })
    probe.listeners.forEach(listener => listener())
    expect(countSettings()).toBe(2)
    const last = messagesOf(ws).filter(message => message.type === 'settings').at(-1)!
    expect(last.settings).toEqual({ includeHiddenEntries: false, maxListedEntries: 2 })
  })
})
