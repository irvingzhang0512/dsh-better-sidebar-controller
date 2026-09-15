/**
 * The host-side controller state mirror. The authoritative semantic state is
 * derived in the browser (which sees every mouse interaction); this store
 * keeps the latest pushed {@link SidebarStateWire} per session and enriches
 * it with host bookkeeping (`workspaceRoot`, `connected`, `updatedAt`) that
 * tools report.
 */
import type { ControllerState, SidebarStateWire } from '../shared/types.ts'

export class ControllerStateStore {
  private states = new Map<string, ControllerState>()
  private listeners = new Map<string, Set<(state: ControllerState) => void>>()

  /** Merge one client-pushed state wire into the mirror. */
  apply(
    sessionId: string,
    wire: SidebarStateWire,
    workspaceRoot: string | null,
    now: number = Date.now(),
  ): ControllerState {
    const next: ControllerState = {
      sessionId,
      sidebarVisible: wire.sidebarVisible,
      currentFile: wire.currentFile,
      previousFile: wire.previousFile,
      fileCandidate: wire.fileCandidate ?? null,
      fileCandidateSource: wire.fileCandidateSource ?? null,
      openedFiles: wire.openedFiles,
      expandedFolders: wire.expandedFolders,
      workspaceRoot,
      connected: true,
      updatedAt: now,
    }
    this.states.set(sessionId, next)
    this.emit(sessionId, next)
    return next
  }

  /** Mark a session disconnected while keeping the last known data (stale). */
  markDisconnected(sessionId: string): void {
    const current = this.states.get(sessionId)
    if (current !== undefined) {
      const next = { ...current, connected: false }
      this.states.set(sessionId, next)
      this.emit(sessionId, next)
    }
  }

  /** The mirror entry for one session (undefined when never synced). */
  get(sessionId: string): ControllerState | undefined {
    return this.states.get(sessionId)
  }

  /** All mirror entries (test/debug helper). */
  list(): ControllerState[] {
    return [...this.states.values()]
  }

  subscribe(sessionId: string, listener: (state: ControllerState) => void): () => void {
    const set = this.listeners.get(sessionId) ?? new Set<(state: ControllerState) => void>()
    set.add(listener)
    this.listeners.set(sessionId, set)
    const current = this.states.get(sessionId)
    if (current !== undefined) listener(current)
    return () => {
      set.delete(listener)
      if (set.size === 0) this.listeners.delete(sessionId)
    }
  }

  clear(): void {
    this.states.clear()
    this.listeners.clear()
  }

  private emit(sessionId: string, state: ControllerState): void {
    for (const listener of this.listeners.get(sessionId) ?? []) listener(state)
  }
}
