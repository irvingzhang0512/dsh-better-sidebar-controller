export class ControllerStateStore {
    states = new Map();
    listeners = new Map();
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
        this.emit(sessionId, next);
        return next;
    }
    /** Mark a session disconnected while keeping the last known data (stale). */
    markDisconnected(sessionId) {
        const current = this.states.get(sessionId);
        if (current !== undefined) {
            const next = { ...current, connected: false };
            this.states.set(sessionId, next);
            this.emit(sessionId, next);
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
    subscribe(sessionId, listener) {
        const set = this.listeners.get(sessionId) ?? new Set();
        set.add(listener);
        this.listeners.set(sessionId, set);
        const current = this.states.get(sessionId);
        if (current !== undefined)
            listener(current);
        return () => {
            set.delete(listener);
            if (set.size === 0)
                this.listeners.delete(sessionId);
        };
    }
    clear() {
        this.states.clear();
        this.listeners.clear();
    }
    emit(sessionId, state) {
        for (const listener of this.listeners.get(sessionId) ?? [])
            listener(state);
    }
}
