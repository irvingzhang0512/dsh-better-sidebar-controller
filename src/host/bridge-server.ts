/**
 * The bridge host: delivers tool commands to the session's sidebar client
 * and absorbs the client's state pushes into the controller mirror.
 *
 * Delivery semantics mirror dsh-better-sidebar's `sidebar_open` registry
 * (consume-on-send + replay): when a client is attached for the session the
 * command is sent and the tool waits for its acknowledgment; when no client
 * is attached the command is queued and replayed the next time that
 * session's sidebar attaches. The mirror keeps the last pushed state per
 * session and flags disconnects.
 */
import { randomUUID } from 'node:crypto'
import type { ClientToHostMessage, CommandAck, ControllerCommand, DispatchOutcome, SidebarStateWire } from '../shared/types.ts'
import { ControllerStateStore } from './controller-state.ts'

/** How long a dispatched command waits for the client's ack by default. */
export const BRIDGE_ACK_TIMEOUT_MS = 4000

/** A minimal message sender (a WebSocket in production, a stub in tests). */
export type Sender = (message: string) => void

export interface BridgeOptions {
  /** The state mirror the client pushes into. */
  store: ControllerStateStore
  /** Resolve a session's workspace root (its cwd). */
  resolveWorkspaceRoot: (sessionId: string) => Promise<string | null>
  /** Optional clock injection for tests. */
  now?: () => number
}

export class BridgeServer {
  readonly store: ControllerStateStore
  private sockets = new Map<string, Set<Sender>>()
  private queues = new Map<string, Array<{ id: string; command: ControllerCommand }>>()
  private pending = new Map<string, { resolve: (ack: CommandAck | null) => void; timer: ReturnType<typeof setTimeout> }>()
  private roots = new Map<string, string | null>()

  constructor(private options: BridgeOptions) {
    this.store = options.store
  }

  /** Whether at least one client is attached for the session. */
  isAttached(sessionId: string): boolean {
    return (this.sockets.get(sessionId)?.size ?? 0) > 0
  }

  /** Attach one client sender for a session; returns the disposer. */
  attach(sessionId: string, sender: Sender): () => void {
    let set = this.sockets.get(sessionId)
    if (set === undefined) {
      set = new Set()
      this.sockets.set(sessionId, set)
    }
    set.add(sender)
    return () => this.detach(sessionId, sender)
  }

  /** Detach one client sender for a session (idempotent). */
  detach(sessionId: string, sender: Sender): void {
    const set = this.sockets.get(sessionId)
    if (set === undefined) return
    set.delete(sender)
    if (set.size === 0) {
      this.sockets.delete(sessionId)
      this.store.markDisconnected(sessionId)
    }
  }

  /** Route one decoded client message. */
  handleClientMessage(sessionId: string, message: ClientToHostMessage): void {
    switch (message.type) {
      case 'hello':
        this.replay(sessionId)
        break
      case 'state':
        this.applyState(sessionId, message.state)
        break
      case 'command-result':
        this.onAck(message.result)
        break
    }
  }

  /**
   * Dispatch one command to the session's client. When a client is attached
   * the tool waits for the ack (bounded by `waitMs`); otherwise the command
   * is queued for the next attach and `{ delivered: false, queued: true }`
   * is returned immediately.
   */
  async dispatch(
    sessionId: string,
    command: ControllerCommand,
    waitMs: number = BRIDGE_ACK_TIMEOUT_MS,
  ): Promise<DispatchOutcome> {
    if (!this.isAttached(sessionId)) {
      this.enqueue(sessionId, { id: randomUUID(), command })
      return { delivered: false, queued: true, ack: null }
    }
    const id = randomUUID()
    const ackPromise = this.expectAck(id, waitMs)
    this.broadcast(sessionId, JSON.stringify({ type: 'command', id, command }))
    const ack = await ackPromise
    return { delivered: true, queued: false, ack }
  }

  /** Drop every queued command (feature off / teardown). */
  drain(sessionId: string): void {
    this.queues.delete(sessionId)
  }

  /** Reject and clear every pending ack waiter and queue (teardown). */
  dispose(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.resolve(null)
    }
    this.pending.clear()
    this.queues.clear()
    this.sockets.clear()
    this.roots.clear()
  }

  // ── internals ───────────────────────────────────────────────────────────

  private broadcast(sessionId: string, message: string): void {
    const set = this.sockets.get(sessionId)
    if (set === undefined) return
    for (const sender of [...set]) {
      try {
        sender(message)
      } catch {
        // A dead sender surfaces on close/error; ignore here.
      }
    }
  }

  private enqueue(sessionId: string, entry: { id: string; command: ControllerCommand }): void {
    const list = this.queues.get(sessionId)
    if (list === undefined) {
      this.queues.set(sessionId, [entry])
      return
    }
    if (list.length >= 64) {
      // Bound the queue so an absent sidebar cannot accumulate unbounded
      // work; drop the newest and keep the oldest (opens the user asked for).
      return
    }
    list.push(entry)
  }

  private replay(sessionId: string): void {
    const list = this.queues.get(sessionId)
    if (list === undefined || list.length === 0) return
    this.queues.delete(sessionId)
    for (const entry of list) {
      this.broadcast(sessionId, JSON.stringify({ type: 'command', id: entry.id, command: entry.command }))
    }
  }

  private expectAck(id: string, waitMs: number): Promise<CommandAck | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve(null)
      }, waitMs)
      this.pending.set(id, { resolve, timer })
    })
  }

  private onAck(ack: CommandAck): void {
    const pending = this.pending.get(ack.id)
    if (pending === undefined) return
    clearTimeout(pending.timer)
    this.pending.delete(ack.id)
    pending.resolve(ack)
  }

  private applyState(sessionId: string, wire: SidebarStateWire): void {
    void this.rootOf(sessionId).then((root) => {
      this.store.apply(sessionId, wire, root, this.options.now?.() ?? Date.now())
    })
  }

  private async rootOf(sessionId: string): Promise<string | null> {
    if (this.roots.has(sessionId)) return this.roots.get(sessionId)!
    const root = await this.options.resolveWorkspaceRoot(sessionId).catch(() => null)
    this.roots.set(sessionId, root)
    return root
  }
}
