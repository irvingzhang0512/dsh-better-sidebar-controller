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
import type { ControllerCode } from '../shared/types.ts'

/** How long a dispatched command waits for the client's ack by default. */
export const BRIDGE_ACK_TIMEOUT_MS = 4000

/** A minimal message sender (a WebSocket in production, a stub in tests). */
export type Sender = (message: string) => void

export interface BridgeOptions {
  /** The state mirror the client pushes into. */
  store: ControllerStateStore
  /** Re-read the authoritative dependency and capability gates before delivery. */
  authorize?: (name: string) => { ok: false; code: ControllerCode; message: string } | undefined
  /** Resolve a session's workspace root (its cwd). */
  resolveWorkspaceRoot: (sessionId: string) => Promise<string | null>
  /** Optional clock injection for tests. */
  now?: () => number
}

export class BridgeServer {
  readonly store: ControllerStateStore
  private sockets = new Map<string, Set<Sender>>()
  private queues = new Map<string, Array<{ id: string; command: ControllerCommand }>>()
  private pending = new Map<string, { sessionId: string; resolve: (ack: CommandAck | null) => void; timer: ReturnType<typeof setTimeout> }>()
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
        if (message.sessionId === sessionId) this.replay(sessionId)
        break
      case 'state':
        this.applyState(sessionId, message.state)
        break
      case 'command-result':
        this.onAck(sessionId, message.result)
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
    const error = this.options.authorize?.(command.name)
    if (error) return { delivered: false, queued: false, ack: null, error }
    if (!this.isAttached(sessionId)) {
      if (!this.enqueue(sessionId, { id: randomUUID(), command })) return { delivered: false, queued: false, ack: null, error: { ok: false, code: 'QUEUE_FULL', message: '当前会话等待指令已达 64 条，新指令未入队。' } }
      return { delivered: false, queued: true, ack: null }
    }
    const id = randomUUID()
    const ackPromise = this.expectAck(sessionId, id, waitMs)
    const delivered = this.broadcast(sessionId, JSON.stringify({ type: 'command', id, command }))
    if (!delivered) {
      this.onAck(sessionId, { id, ok: false, code: 'SIDEBAR_UNAVAILABLE', message: '客户端连接已失效，指令未发送。' })
    }
    const ack = await ackPromise
    return { delivered, queued: false, ack }
  }

  /** Drop every queued command (feature off / teardown). */
  drain(sessionId: string): void {
    this.queues.delete(sessionId)
  }

  prune(): void {
    for (const [sessionId, entries] of this.queues) {
      const next = entries.filter(e => !this.options.authorize?.(e.command.name))
      if (next.length) this.queues.set(sessionId, next)
      else this.queues.delete(sessionId)
    }
  }

  invalidate(): void {
    this.queues.clear()
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.resolve({ id, ok: false, code: 'SIDEBAR_UNAVAILABLE', message: 'better-sidebar 已停用，等待操作已取消。' })
    }
    this.pending.clear()
    this.store.invalidate()
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

  private broadcast(sessionId: string, message: string): boolean {
    const set = this.sockets.get(sessionId)
    if (set === undefined) return false
    let delivered = false
    for (const sender of [...set]) {
      try {
        sender(message)
        delivered = true
        break
      } catch {
        // A dead sender surfaces on close/error; ignore here.
      }
    }
    return delivered
  }

  private enqueue(sessionId: string, entry: { id: string; command: ControllerCommand }): boolean {
    const list = this.queues.get(sessionId)
    if (list === undefined) {
      this.queues.set(sessionId, [entry])
      return true
    }
    if (list.length >= 64) {
      // Bound the queue so an absent sidebar cannot accumulate unbounded
      // work; drop the newest and keep the oldest (opens the user asked for).
      return false
    }
    list.push(entry)
    return true
  }

  private replay(sessionId: string): void {
    const list = this.queues.get(sessionId)
    if (list === undefined || list.length === 0) return
    this.queues.delete(sessionId)
    for (const entry of list) {
      if (this.options.authorize?.(entry.command.name)) continue
      if (!this.broadcast(sessionId, JSON.stringify({ type: 'command', id: entry.id, command: entry.command }))) this.enqueue(sessionId, entry)
    }
  }

  private expectAck(sessionId: string, id: string, waitMs: number): Promise<CommandAck | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve(null)
      }, waitMs)
      this.pending.set(id, { sessionId, resolve, timer })
    })
  }

  private onAck(sessionId: string, ack: CommandAck): void {
    const pending = this.pending.get(ack.id)
    if (pending === undefined || pending.sessionId !== sessionId) return
    clearTimeout(pending.timer)
    this.pending.delete(ack.id)
    pending.resolve(ack)
  }

  private applyState(sessionId: string, wire: SidebarStateWire): void {
    if (wire.sessionId !== sessionId || this.options.authorize?.('sync_state')) return
    void this.rootOf(sessionId).then((root) => {
      if (this.options.authorize?.('sync_state') || !this.isAttached(sessionId)) return
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
