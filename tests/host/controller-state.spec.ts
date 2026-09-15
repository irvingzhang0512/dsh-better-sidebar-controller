/**
 * Controller state mirror tests: merging pushed wires, disconnection flags,
 * per-session isolation.
 */
import { describe, expect, it } from 'vitest'
import { ControllerStateStore } from '../../src/host/controller-state.ts'
import type { SidebarStateWire } from '../../src/shared/types.ts'

function wire(overrides: Partial<SidebarStateWire> = {}): SidebarStateWire {
  return {
    sessionId: 's-1',
    sidebarVisible: true,
    currentFile: '/w/a.md',
    previousFile: null,
    fileCandidate: '/w/a.md',
    fileCandidateSource: 'current',
    openedFiles: ['/w/a.md'],
    expandedFolders: ['/w/docs'],
    updatedAt: 100,
    ...overrides,
  }
}

describe('ControllerStateStore', () => {
  it('merges a pushed wire with host bookkeeping', () => {
    const store = new ControllerStateStore()
    const merged = store.apply('s-1', wire(), '/workspace', 200)
    expect(merged).toMatchObject({
      sessionId: 's-1',
      sidebarVisible: true,
      currentFile: '/w/a.md',
      previousFile: null,
      fileCandidate: '/w/a.md',
      fileCandidateSource: 'current',
      openedFiles: ['/w/a.md'],
      expandedFolders: ['/w/docs'],
      workspaceRoot: '/workspace',
      connected: true,
      updatedAt: 200,
    })
  })
  it('keeps sessions isolated', () => {
    const store = new ControllerStateStore()
    store.apply('s-1', wire(), '/w1', 1)
    store.apply('s-2', wire({ currentFile: '/w2/b.md' }), '/w2', 2)
    expect(store.get('s-1')?.currentFile).toBe('/w/a.md')
    expect(store.get('s-2')?.currentFile).toBe('/w2/b.md')
  })
  it('markDisconnected preserves the last known state', () => {
    const store = new ControllerStateStore()
    store.apply('s-1', wire(), '/workspace', 100)
    store.markDisconnected('s-1')
    const state = store.get('s-1')
    expect(state?.connected).toBe(false)
    expect(state?.currentFile).toBe('/w/a.md')
    expect(state?.updatedAt).toBe(100)
  })
  it('markDisconnected is a no-op for unknown sessions', () => {
    const store = new ControllerStateStore()
    expect(() => store.markDisconnected('nope')).not.toThrow()
    expect(store.get('nope')).toBeUndefined()
  })
  it('get returns undefined before the first sync; list/clear behave', () => {
    const store = new ControllerStateStore()
    expect(store.get('s-1')).toBeUndefined()
    store.apply('s-1', wire(), '/w', 1)
    store.apply('s-2', wire(), '/w', 2)
    expect(store.list().map(s => s.sessionId).sort()).toEqual(['s-1', 's-2'])
    store.clear()
    expect(store.list()).toEqual([])
  })
  it('subscribe publishes current, updated, and disconnected state per session', () => {
    const store = new ControllerStateStore()
    const seen: Array<string | null> = []
    store.apply('s-1', wire(), '/workspace', 1)
    const off = store.subscribe('s-1', state => seen.push(state.connected ? state.currentFile : null))
    store.apply('s-1', wire({ currentFile: '/w/b.md' }), '/workspace', 2)
    store.markDisconnected('s-1')
    off()
    store.apply('s-1', wire({ currentFile: '/w/c.md' }), '/workspace', 3)
    expect(seen).toEqual(['/w/a.md', '/w/b.md', null])
  })
})
