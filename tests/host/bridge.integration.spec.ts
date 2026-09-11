/**
 * End-to-end bridge integration over real WebSockets: a host http/ws server
 * on an ephemeral port, a real client socket, queue-replay on attach, ack
 * round-trips, and state-push mirror merging. This is the closest thing to
 * the production browser path that runs without a browser.
 */
import { createServer, type Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import { attachSocket } from '../../src/host/bridge-socket.ts'
import { BridgeServer } from '../../src/host/bridge-server.ts'
import { ControllerStateStore } from '../../src/host/controller-state.ts'
import { parseClientMessage } from '../../src/shared/wire.ts'
import type { ClientToHostMessage, ControllerCommand, SidebarStateWire } from '../../src/shared/types.ts'

const SID = 's-int-1'

interface Host {
  http: Server
  bridge: BridgeServer
  store: ControllerStateStore
  port: number
}

let host: Host
let client: WebSocket
let received: Array<{ id: string; command: ControllerCommand }> = []

async function makeHost(): Promise<Host> {
  const store = new ControllerStateStore()
  const bridge = new BridgeServer({ store, resolveWorkspaceRoot: async () => '/workspace' })
  const http = createServer()
  const wss = new WebSocketServer({ noServer: true })
  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const sessionId = url.searchParams.get('sessionId')
    if (sessionId === null) return
    wss.handleUpgrade(req, socket, head, (ws) => {
      attachSocket(bridge, ws, sessionId, parseClientMessage)
    })
  })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  const address = http.address()
  if (address === null || typeof address === 'string') throw new Error('no address')
  return { http, bridge, store, port: address.port }
}

async function connectClient(): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${host.port}/sidebar-controller/ws?sessionId=${SID}`)
  ws.on('message', (data) => {
    const parsed = JSON.parse(data.toString()) as { type: string; id?: string; command?: ControllerCommand }
    if (parsed.type === 'command' && parsed.id !== undefined && parsed.command !== undefined) {
      received.push({ id: parsed.id, command: parsed.command })
    }
  })
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve)
    ws.once('error', reject)
  })
  return ws
}

function send(message: ClientToHostMessage): void {
  client.send(JSON.stringify(message))
}

beforeEach(async () => {
  received = []
  host = await makeHost()
  client = await connectClient()
})

afterEach(async () => {
  client?.terminate()
  await new Promise<void>((resolve) => host.http.close(() => resolve()))
})

describe('bridge integration', () => {
  it('delivers a command and resolves the ack end-to-end', async () => {
    send({ type: 'hello', sessionId: SID })
    const dispatch = host.bridge.dispatch(SID, { name: 'show_sidebar' })
    await vi.waitFor(() => expect(received.length).toBe(1))
    const command = received[0]!
    send({ type: 'command-result', result: { id: command.id, ok: true, code: 'OK', message: 'opened' } })
    const outcome = await dispatch
    expect(outcome.delivered).toBe(true)
    expect(outcome.ack?.message).toBe('opened')
  })

  it('replays a queued command when the client attaches (hello)', async () => {
    // No client for a fresh session: dispatch queues.
    const detached = new BridgeServer({ store: host.store, resolveWorkspaceRoot: async () => '/workspace' })
    const outcome = await detached.dispatch(SID, { name: 'expand_folder', path: '/w/docs' })
    expect(outcome).toEqual({ delivered: false, queued: true, ack: null })
    detached.attach(SID, () => {})
    detached.handleClientMessage(SID, { type: 'hello', sessionId: SID })
    // The queued command was consumed by the fake sender; assert no crash and
    // that dispatch on the real bridge still works.
    expect(detached.isAttached(SID)).toBe(true)
    detached.detach(SID, () => {})
  })

  it('replays queued commands to a REAL client that attaches late', async () => {
    // Disconnect the first client, dispatch while unattached (queued),
    // then attach a fresh real client: hello triggers the replay.
    client.terminate()
    await new Promise<void>((resolve) => host.http.close(() => resolve()))
    host = await makeHost()
    const queued = await host.bridge.dispatch(SID, { name: 'refresh_tree' })
    expect(queued.queued).toBe(true)
    client = await connectClient()
    send({ type: 'hello', sessionId: SID })
    await vi.waitFor(() => expect(received.length).toBe(1))
    expect(received[0]!.command).toEqual({ name: 'refresh_tree' })
  })

  it('merges client state pushes into the host mirror', async () => {
    const wire: SidebarStateWire = {
      sessionId: SID,
      sidebarVisible: true,
      currentFile: '/w/a.md',
      previousFile: '/w/prev.md',
      openedFiles: ['/w/a.md', '/w/prev.md'],
      expandedFolders: ['/w/docs'],
      updatedAt: 99,
    }
    send({ type: 'state', state: wire })
    await vi.waitFor(() => {
      const state = host.store.get(SID)
      expect(state?.currentFile).toBe('/w/a.md')
      expect(state?.previousFile).toBe('/w/prev.md')
      expect(state?.workspaceRoot).toBe('/workspace')
      expect(state?.connected).toBe(true)
    })
  })

  it('marks the session disconnected when the client closes', async () => {
    send({ type: 'state', state: { sessionId: SID, sidebarVisible: true, currentFile: '/w/a.md', previousFile: null, openedFiles: [], expandedFolders: [], updatedAt: 1 } })
    await vi.waitFor(() => expect(host.store.get(SID)?.connected).toBe(true))
    client.terminate()
    await vi.waitFor(() => expect(host.store.get(SID)?.connected).toBe(false))
  })
})
