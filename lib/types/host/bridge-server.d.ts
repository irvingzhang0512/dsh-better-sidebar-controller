import type { ClientToHostMessage, ControllerCommand, DispatchOutcome } from '../shared/types.ts';
import { ControllerStateStore } from './controller-state.ts';
/** How long a dispatched command waits for the client's ack by default. */
export declare const BRIDGE_ACK_TIMEOUT_MS = 4000;
/** A minimal message sender (a WebSocket in production, a stub in tests). */
export type Sender = (message: string) => void;
export interface BridgeOptions {
    /** The state mirror the client pushes into. */
    store: ControllerStateStore;
    /** Resolve a session's workspace root (its cwd). */
    resolveWorkspaceRoot: (sessionId: string) => Promise<string | null>;
    /** Optional clock injection for tests. */
    now?: () => number;
}
export declare class BridgeServer {
    private options;
    readonly store: ControllerStateStore;
    private sockets;
    private queues;
    private pending;
    private roots;
    constructor(options: BridgeOptions);
    /** Whether at least one client is attached for the session. */
    isAttached(sessionId: string): boolean;
    /** Attach one client sender for a session; returns the disposer. */
    attach(sessionId: string, sender: Sender): () => void;
    /** Detach one client sender for a session (idempotent). */
    detach(sessionId: string, sender: Sender): void;
    /** Route one decoded client message. */
    handleClientMessage(sessionId: string, message: ClientToHostMessage): void;
    /**
     * Dispatch one command to the session's client. When a client is attached
     * the tool waits for the ack (bounded by `waitMs`); otherwise the command
     * is queued for the next attach and `{ delivered: false, queued: true }`
     * is returned immediately.
     */
    dispatch(sessionId: string, command: ControllerCommand, waitMs?: number): Promise<DispatchOutcome>;
    /** Drop every queued command (feature off / teardown). */
    drain(sessionId: string): void;
    /** Reject and clear every pending ack waiter and queue (teardown). */
    dispose(): void;
    private broadcast;
    private enqueue;
    private replay;
    private expectAck;
    private onAck;
    private applyState;
    private rootOf;
}
