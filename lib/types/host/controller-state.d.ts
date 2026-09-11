/**
 * The host-side controller state mirror. The authoritative semantic state is
 * derived in the browser (which sees every mouse interaction); this store
 * keeps the latest pushed {@link SidebarStateWire} per session and enriches
 * it with host bookkeeping (`workspaceRoot`, `connected`, `updatedAt`) that
 * tools report.
 */
import type { ControllerState, SidebarStateWire } from '../shared/types.ts';
export declare class ControllerStateStore {
    private states;
    /** Merge one client-pushed state wire into the mirror. */
    apply(sessionId: string, wire: SidebarStateWire, workspaceRoot: string | null, now?: number): ControllerState;
    /** Mark a session disconnected while keeping the last known data (stale). */
    markDisconnected(sessionId: string): void;
    /** The mirror entry for one session (undefined when never synced). */
    get(sessionId: string): ControllerState | undefined;
    /** All mirror entries (test/debug helper). */
    list(): ControllerState[];
    clear(): void;
}
