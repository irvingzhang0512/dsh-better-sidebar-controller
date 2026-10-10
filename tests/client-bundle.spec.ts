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
}

/** 按指定落点策略构造一套最小假 ctx + DOM/浏览器桩，并执行 bundle。 */
function loadBundle(options: { nativeLanding: boolean }): Probe {
  const captured: CapturedModule[] = []
  const tabs: Array<Record<string, unknown>> = []
  const opened: Array<Record<string, unknown>> = []
  const closed: string[] = []
  const activated: string[] = []
  const listeners: Array<() => void> = []
  const anchorTab = { id: ANCHOR_TAB_ID, type: 'dsh-better-sidebar-controller:anchor', title: '' }
  const current = { value: snapshot('s1', makeState()) }

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
  class WebSocketStub {
    static readonly OPEN = 1
    readyState = 0
    onopen: unknown
    onmessage: unknown
    onclose: unknown
    onerror: unknown
    constructor(readonly url: string) { socketCalls.push(url) }
    send(): void { /* never open in this probe */ }
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

  return { module, context, tabs, opened, closed, activated }
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
  it('以包名注册、apply 挂载并注册隐藏锚点标签', () => {
    const probe = loadBundle({ nativeLanding: true })
    expect(probe.module.id).toBe(BUNDLE_ID)
    expect(probe.tabs).toHaveLength(1)
    expect(probe.tabs[0]!.id).toBe('dsh-better-sidebar-controller:anchor')
    expect(probe.tabs[0]!.hidden).toBe(true)
    expect((probe.tabs[0]!.title as () => string)()).toBe('')
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
})
