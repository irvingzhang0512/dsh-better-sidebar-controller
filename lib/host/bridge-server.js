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
import { randomUUID } from 'node:crypto';
import { ControllerStateStore } from "./controller-state.js";
/** How long a dispatched command waits for the client's ack by default. */
export const BRIDGE_ACK_TIMEOUT_MS = 4000;
export class BridgeServer {
    options;
    store;
    sockets = new Map();
    queues = new Map();
    pending = new Map();
    roots = new Map();
    constructor(options) {
        this.options = options;
        this.store = options.store;
    }
    /** Whether at least one client is attached for the session. */
    isAttached(sessionId) {
        return (this.sockets.get(sessionId)?.size ?? 0) > 0;
    }
    /** Attach one client sender for a session; returns the disposer. */
    attach(sessionId, sender) {
        let set = this.sockets.get(sessionId);
        if (set === undefined) {
            set = new Set();
            this.sockets.set(sessionId, set);
        }
        set.add(sender);
        return () => this.detach(sessionId, sender);
    }
    /** Detach one client sender for a session (idempotent). */
    detach(sessionId, sender) {
        const set = this.sockets.get(sessionId);
        if (set === undefined)
            return;
        set.delete(sender);
        if (set.size === 0) {
            this.sockets.delete(sessionId);
            this.store.markDisconnected(sessionId);
        }
    }
    /** Route one decoded client message. */
    handleClientMessage(sessionId, message) {
        switch (message.type) {
            case 'hello':
                if (message.sessionId === sessionId)
                    this.replay(sessionId);
                break;
            case 'state':
                this.applyState(sessionId, message.state);
                break;
            case 'command-result':
                this.onAck(sessionId, message.result);
                break;
        }
    }
    /**
     * Dispatch one command to the session's client. When a client is attached
     * the tool waits for the ack (bounded by `waitMs`); otherwise the command
     * is queued for the next attach and `{ delivered: false, queued: true }`
     * is returned immediately.
     */
    async dispatch(sessionId, command, waitMs = BRIDGE_ACK_TIMEOUT_MS) {
        const error = this.options.authorize?.(command.name);
        if (error)
            return { delivered: false, queued: false, ack: null, error };
        if (!this.isAttached(sessionId)) {
            if (!this.enqueue(sessionId, { id: randomUUID(), command }))
                return { delivered: false, queued: false, ack: null, error: { ok: false, code: 'QUEUE_FULL', message: '当前会话等待指令已达 64 条，新指令未入队。' } };
            return { delivered: false, queued: true, ack: null };
        }
        const id = randomUUID();
        const ackPromise = this.expectAck(sessionId, id, waitMs);
        const delivered = this.broadcast(sessionId, JSON.stringify({ type: 'command', id, command }));
        if (!delivered) {
            this.onAck(sessionId, { id, ok: false, code: 'SIDEBAR_UNAVAILABLE', message: '客户端连接已失效，指令未发送。' });
        }
        const ack = await ackPromise;
        return { delivered, queued: false, ack };
    }
    /** Drop every queued command (feature off / teardown). */
    drain(sessionId) {
        this.queues.delete(sessionId);
    }
    prune() {
        for (const [sessionId, entries] of this.queues) {
            const next = entries.filter(e => !this.options.authorize?.(e.command.name));
            if (next.length)
                this.queues.set(sessionId, next);
            else
                this.queues.delete(sessionId);
        }
    }
    invalidate() {
        this.queues.clear();
        for (const [id, entry] of this.pending) {
            clearTimeout(entry.timer);
            entry.resolve({ id, ok: false, code: 'SIDEBAR_UNAVAILABLE', message: 'better-sidebar 已停用，等待操作已取消。' });
        }
        this.pending.clear();
        this.store.invalidate();
    }
    /** Reject and clear every pending ack waiter and queue (teardown). */
    dispose() {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.resolve(null);
        }
        this.pending.clear();
        this.queues.clear();
        this.sockets.clear();
        this.roots.clear();
    }
    // ── internals ───────────────────────────────────────────────────────────
    broadcast(sessionId, message) {
        const set = this.sockets.get(sessionId);
        if (set === undefined)
            return false;
        let delivered = false;
        for (const sender of [...set]) {
            try {
                sender(message);
                delivered = true;
                break;
            }
            catch {
                // A dead sender surfaces on close/error; ignore here.
            }
        }
        return delivered;
    }
    enqueue(sessionId, entry) {
        const list = this.queues.get(sessionId);
        if (list === undefined) {
            this.queues.set(sessionId, [entry]);
            return true;
        }
        if (list.length >= 64) {
            // Bound the queue so an absent sidebar cannot accumulate unbounded
            // work; drop the newest and keep the oldest (opens the user asked for).
            return false;
        }
        list.push(entry);
        return true;
    }
    replay(sessionId) {
        const list = this.queues.get(sessionId);
        if (list === undefined || list.length === 0)
            return;
        this.queues.delete(sessionId);
        for (const entry of list) {
            if (this.options.authorize?.(entry.command.name))
                continue;
            if (!this.broadcast(sessionId, JSON.stringify({ type: 'command', id: entry.id, command: entry.command })))
                this.enqueue(sessionId, entry);
        }
    }
    expectAck(sessionId, id, waitMs) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                resolve(null);
            }, waitMs);
            this.pending.set(id, { sessionId, resolve, timer });
        });
    }
    onAck(sessionId, ack) {
        const pending = this.pending.get(ack.id);
        if (pending === undefined || pending.sessionId !== sessionId)
            return;
        clearTimeout(pending.timer);
        this.pending.delete(ack.id);
        pending.resolve(ack);
    }
    applyState(sessionId, wire) {
        if (wire.sessionId !== sessionId || this.options.authorize?.('sync_state'))
            return;
        void this.rootOf(sessionId).then((root) => {
            if (this.options.authorize?.('sync_state') || !this.isAttached(sessionId))
                return;
            this.store.apply(sessionId, wire, root, this.options.now?.() ?? Date.now());
        });
    }
    async rootOf(sessionId) {
        if (this.roots.has(sessionId))
            return this.roots.get(sessionId);
        const root = await this.options.resolveWorkspaceRoot(sessionId).catch(() => null);
        this.roots.set(sessionId, root);
        return root;
    }
}
