export class ControllerStateStore {
    states = new Map();
    /** Merge one client-pushed state wire into the mirror. */
    apply(sessionId, wire, workspaceRoot, now = Date.now()) {
        const next = {
            sessionId,
            sidebarVisible: wire.sidebarVisible,
            currentFile: wire.currentFile,
            previousFile: wire.previousFile,
            openedFiles: wire.openedFiles,
            expandedFolders: wire.expandedFolders,
            workspaceRoot,
            connected: true,
            updatedAt: now,
        };
        this.states.set(sessionId, next);
        return next;
    }
    /** Mark a session disconnected while keeping the last known data (stale). */
    markDisconnected(sessionId) {
        const current = this.states.get(sessionId);
        if (current !== undefined) {
            this.states.set(sessionId, { ...current, connected: false });
        }
    }
    /** The mirror entry for one session (undefined when never synced). */
    get(sessionId) {
        return this.states.get(sessionId);
    }
    /** All mirror entries (test/debug helper). */
    list() {
        return [...this.states.values()];
    }
    clear() {
        this.states.clear();
    }
}
