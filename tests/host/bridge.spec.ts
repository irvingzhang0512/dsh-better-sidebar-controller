/**
 * Bridge host tests: dispatch semantics (attached → ack, unattached → queue),
 * replay on attach, ack timeout, state push merging, disconnect bookkeeping.
 */
import { describe, expect, it, vi } from 'vitest'
import { BRIDGE_ACK_TIMEOUT_MS, BridgeServer } from '../../src/host/bridge-server.ts'
import { ControllerStateStore } from '../../src/host/controller-state.ts'
import type { CommandAck, ControllerCommand } from '../../src/shared/types.ts'

const SID = 's-1'

function makeBridge(options: { resolveRoot?: (sessionId: string) => Promise<string | null>; ackWait?: number } = {}) {
  const store = new ControllerStateStore()
  const bridge = new BridgeServer({
    store,
    resolveWorkspaceRoot: options.resolveRoot ?? (async () => '/workspace'),
  })
  return { store, bridge }
}

/** Collects every message a sender is given, tagged by sender name. */
function recordingSender(name: string, onMessage?: (message: string) => void) {
  const sent: string[] = []
  const sender = (message: string): void => {
    sent.push(message)
    onMessage?.(message)
  }
  return { name, sent, sender }
}

function ackFor(id: string, overrides: Partial<CommandAck> = {}): CommandAck {
  return { id, ok: true, code: 'OK', ...overrides }
}

describe('BridgeServer', () => {
  it('delivers a command to an attached client and resolves with its ack', async () => {
    const { bridge } = makeBridge()
    const a = recordingSender('a')
    bridge.attach(SID, a.sender)
    const dispatchPromise = bridge.dispatch(SID, { name: 'show_sidebar' })
    expect(a.sent.length).toBe(1)
    const message = JSON.parse(a.sent[0]!)
    expect(message.type).toBe('command')
    expect(message.command).toEqual({ name: 'show_sidebar' })
    bridge.handleClientMessage(SID, { type: 'command-result', result: ackFor(message.id) })
    const outcome = await dispatchPromise
    expect(outcome.delivered).toBe(true)
    expect(outcome.queued).toBe(false)
    expect(outcome.ack).toEqual(ackFor(message.id))
  })

  it('queues when no client is attached and replays on hello', async () => {
    const { bridge } = makeBridge()
    const outcome = await bridge.dispatch(SID, { name: 'expand_folder', path: '/a' })
    expect(outcome).toEqual({ delivered: false, queued: true, ack: null })
    const a = recordingSender('a')
    bridge.attach(SID, a.sender)
    bridge.handleClientMessage(SID, { type: 'hello', sessionId: SID })
    expect(a.sent.length).toBe(1)
    const message = JSON.parse(a.sent[0]!)
    expect(message.command).toEqual({ name: 'expand_folder', path: '/a' })
  })

  it('times out when the client never acks', async () => {
    const { bridge } = makeBridge()
    const a = recordingSender('a')
    bridge.attach(SID, a.sender)
    const outcome = await bridge.dispatch(SID, { name: 'hide_sidebar' }, 50)
    expect(outcome.delivered).toBe(true)
    expect(outcome.ack).toBeNull()
  })

  it('resolves only the pending ack for a command id', async () => {
    const { bridge } = makeBridge()
    const a = recordingSender('a')
    bridge.attach(SID, a.sender)
    const p1 = bridge.dispatch(SID, { name: 'show_sidebar' }, 500)
    const p2 = bridge.dispatch(SID, { name: 'hide_sidebar' }, 500)
    // Both commands were sent; ack the second id only.
    const ids = a.sent.map(m => JSON.parse(m).id as string)
    bridge.handleClientMessage(SID, { type: 'command-result', result: ackFor(ids[1]!) })
    const [o1, o2] = await Promise.all([p1, p2])
    expect(o1.ack).toBeNull()
    expect(o2.ack?.code).toBe('OK')
  })

  it('merges state pushes into the mirror with the workspace root', async () => {
    const { store, bridge } = makeBridge({ resolveRoot: async () => '/session-cwd' })
    bridge.handleClientMessage(SID, {
      type: 'state',
      state: {
        sessionId: SID,
        sidebarVisible: true,
        currentFile: '/w/a.md',
        previousFile: null,
        openedFiles: ['/w/a.md'],
        expandedFolders: ['/w/docs'],
        updatedAt: 42,
      },
    })
    await vi.waitFor(() => {
      const state = store.get(SID)
      expect(state).toBeDefined()
      expect(state?.workspaceRoot).toBe('/session-cwd')
      expect(state?.currentFile).toBe('/w/a.md')
      expect(state?.connected).toBe(true)
    })
  })

  it('marks the session disconnected when the last sender detaches', async () => {
    const { store, bridge } = makeBridge()
    bridge.handleClientMessage(SID, {
      type: 'state',
      state: { sessionId: SID, sidebarVisible: true, currentFile: '/w/a.md', previousFile: null, openedFiles: [], expandedFolders: [], updatedAt: 1 },
    })
    const a = recordingSender('a')
    const detach = bridge.attach(SID, a.sender)
    await vi.waitFor(() => expect(store.get(SID)?.connected).toBe(true))
    detach()
    await vi.waitFor(() => expect(store.get(SID)?.connected).toBe(false))
  })

  it('broadcasts to every attached sender of the session', async () => {
    const { bridge } = makeBridge()
    const a = recordingSender('a')
    const b = recordingSender('b')
    bridge.attach(SID, a.sender)
    bridge.attach(SID, b.sender)
    await bridge.dispatch(SID, { name: 'refresh_tree' }, 20)
    expect(a.sent.length).toBe(1)
    expect(b.sent.length).toBe(1)
  })

  it('dispose rejects pending waits and drops queues', async () => {
    const { bridge } = makeBridge()
    const a = recordingSender('a')
    bridge.attach(SID, a.sender)
    const p = bridge.dispatch(SID, { name: 'show_sidebar' }, 10000)
    bridge.dispose()
    const outcome = await p
    expect(outcome.ack).toBeNull()
  })

  it('drain drops queued commands', async () => {
    const { bridge } = makeBridge()
    await bridge.dispatch(SID, { name: 'show_sidebar' })
    bridge.drain(SID)
    const a = recordingSender('a')
    bridge.attach(SID, a.sender)
    bridge.handleClientMessage(SID, { type: 'hello', sessionId: SID })
    expect(a.sent.length).toBe(0)
  })

  it('exposes isAttached and uses the default ack timeout constant', () => {
    expect(BRIDGE_ACK_TIMEOUT_MS).toBe(4000)
    const { bridge } = makeBridge()
    expect(bridge.isAttached(SID)).toBe(false)
    bridge.attach(SID, () => {})
    expect(bridge.isAttached(SID)).toBe(true)
  })

  it('routes unknown command names through dispatch unchanged', async () => {
    const { bridge } = makeBridge()
    const a = recordingSender('a')
    bridge.attach(SID, a.sender)
    const command: ControllerCommand = { name: 'sync_state' }
    const outcome = await bridge.dispatch(SID, command)
    expect(outcome.delivered).toBe(true)
    expect(JSON.parse(a.sent[0]!).command).toEqual({ name: 'sync_state' })
  })
})
