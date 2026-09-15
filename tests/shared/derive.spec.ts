/**
 * Pure derivation tests: current/previous file switching (requirements §4.3),
 * opened-files/expanded projection, tab lookup. These mirror the rules the
 * browser client applies on every better-sidebar snapshot.
 */
import { describe, expect, it } from 'vitest'
import {
  activeFileOf,
  baseName,
  deriveFileContext,
  deriveSidebarState,
  findTabByPath,
  isEditorFileTab,
  openedFilesOf,
  replacementTabId,
} from '../../src/shared/derive.ts'
import { browserTab, dirTab, editorTab, float, homeTab, leaf, makeState, snapshot, split, terminalTab } from '../helpers/sidebar-fixtures.ts'

const A = '/root/a.md'
const B = '/root/b.md'
const C = '/root/c.md'

describe('isEditorFileTab', () => {
  it('accepts editor tabs with a path', () => {
    expect(isEditorFileTab(editorTab('t1', A))).toBe(true)
  })
  it('rejects the files home tab (empty path)', () => {
    expect(isEditorFileTab(homeTab('t-home'))).toBe(false)
  })
  it('rejects folder windows (meta.dir === true)', () => {
    expect(isEditorFileTab(dirTab('t-dir', '/root/docs'))).toBe(false)
  })
  it('rejects browser tabs (path is a URL)', () => {
    expect(isEditorFileTab(browserTab('t-b', 'https://example.com'))).toBe(false)
  })
  it('rejects terminal tabs (no path)', () => {
    expect(isEditorFileTab(terminalTab('t-term'))).toBe(false)
  })
})

describe('activeFileOf', () => {
  it('returns the active editor file of the active pane', () => {
    const state = makeState({
      activePane: 'pane-1',
      splits: leaf('pane-1', [homeTab('home'), editorTab('ta', A)], 'ta'),
    })
    expect(activeFileOf(state)).toBe(A)
  })
  it('returns null when the active tab is not a file (home/terminal)', () => {
    const state = makeState({
      activePane: 'pane-1',
      splits: leaf('pane-1', [homeTab('home')], 'home'),
    })
    expect(activeFileOf(state)).toBeNull()
  })
  it('falls back to the first pane with an active editor file', () => {
    const state = makeState({
      activePane: 'pane-2',
      splits: split('s1', [
        leaf('pane-1', [homeTab('home')], 'home'),
        leaf('pane-2', [editorTab('tb', B)], 'tb'),
      ]),
    })
    expect(activeFileOf(state)).toBe(B)
  })
  it('sees the bottom panel when it owns the active pane', () => {
    const state = makeState({
      activePane: 'pane-bottom',
      bottomOpen: true,
      bottomSplits: leaf('pane-bottom', [editorTab('tb', B)], 'tb'),
    })
    expect(activeFileOf(state)).toBe(B)
  })
})

describe('replacementTabId', () => {
  it('uses the last non-excluded tab in the active pane', () => {
    const state = makeState({
      splits: leaf('pane-1', [homeTab('home'), homeTab('view'), homeTab('anchor')], 'anchor'),
    })
    expect(replacementTabId(state, 'anchor')).toBe('view')
  })

  it('falls back to another pane when the active pane only contains the excluded tab', () => {
    const state = makeState({
      activePane: 'pane-2',
      splits: split('root', [
        leaf('pane-1', [homeTab('home')], 'home'),
        leaf('pane-2', [homeTab('anchor')], 'anchor'),
      ]),
    })
    expect(replacementTabId(state, 'anchor')).toBe('home')
  })

  it('returns null when no user-facing tab remains', () => {
    const state = makeState({ splits: leaf('pane-1', [homeTab('anchor')], 'anchor') })
    expect(replacementTabId(state, 'anchor')).toBeNull()
  })
})

describe('openedFilesOf', () => {
  it('collects pane tabs, dedupes by path, and excludes non-files', () => {
    const state = makeState({
      splits: leaf('pane-1', [
        editorTab('t1', A),
        editorTab('t2', A), // duplicate path
        dirTab('t3', '/root/docs'),
        homeTab('t4'),
        terminalTab('t5'),
      ]),
    })
    expect(openedFilesOf(state)).toEqual([A])
  })
  it('includes floating windows', () => {
    const state = makeState({
      splits: leaf('pane-1', [editorTab('t1', A)], 't1'),
      floats: [float('f1', editorTab('t2', B))],
    })
    expect(openedFilesOf(state)).toEqual([A, B])
  })
})

describe('deriveFileContext (requirements §4.3 switching rules)', () => {
  it('undefined → A: current=A, previous=null', () => {
    expect(deriveFileContext(undefined, A)).toEqual({ currentFile: A, previousFile: null })
  })
  it('A → B: current=B, previous=A', () => {
    expect(deriveFileContext({ currentFile: A, previousFile: null }, B)).toEqual({ currentFile: B, previousFile: A })
  })
  it('B → A: current=A, previous=B (the classic switch-back)', () => {
    expect(deriveFileContext({ currentFile: B, previousFile: A }, A)).toEqual({ currentFile: A, previousFile: B })
  })
  it('A → A (same file stays active): neither field changes', () => {
    expect(deriveFileContext({ currentFile: A, previousFile: null }, A)).toEqual({ currentFile: A, previousFile: null })
  })
  it('A → null (file closed): keep last current as previous', () => {
    expect(deriveFileContext({ currentFile: A, previousFile: null }, null)).toEqual({ currentFile: null, previousFile: A })
  })
  it('A → B → null: previous keeps B', () => {
    const step1 = deriveFileContext(undefined, A)
    const step2 = deriveFileContext(step1, B)
    expect(deriveFileContext(step2, null)).toEqual({ currentFile: null, previousFile: B })
  })
  it('three-way meeting → project → source keeps each predecessor', () => {
    const meeting = deriveFileContext(undefined, '/w/meeting.md')
    const project = deriveFileContext(meeting, '/w/project.md')
    const source = deriveFileContext(project, '/w/source.ts')
    expect(source).toEqual({ currentFile: '/w/source.ts', previousFile: '/w/project.md' })
    expect(deriveFileContext(source, '/w/meeting.md')).toEqual({ currentFile: '/w/meeting.md', previousFile: '/w/source.ts' })
  })
})

describe('deriveSidebarState', () => {
  it('projects a full snapshot', () => {
    const state = makeState({
      panelOpen: true,
      expanded: ['/root/docs'],
      activePane: 'pane-1',
      splits: leaf('pane-1', [editorTab('t1', A)], 't1'),
    })
    const derived = deriveSidebarState(undefined, snapshot('s-1', state))
    expect(derived.sessionId).toBe('s-1')
    expect(derived.sidebarVisible).toBe(true)
    expect(derived.currentFile).toBe(A)
    expect(derived.fileCandidate).toBe(A)
    expect(derived.fileCandidateSource).toBe('current')
    expect(derived.previousFile).toBeNull()
    expect(derived.openedFiles).toEqual([A])
    expect(derived.expandedFolders).toEqual(['/root/docs'])
  })
  it('threads current/previous across snapshots (meeting → project → meeting)', () => {
    const s1 = makeState({ splits: leaf('pane-1', [editorTab('a', '/w/meeting.md')], 'a') })
    const s2 = makeState({ splits: leaf('pane-1', [editorTab('b', '/w/project.md')], 'b') })
    const s3 = makeState({ splits: leaf('pane-1', [editorTab('a', '/w/meeting.md')], 'a') })
    const d1 = deriveSidebarState(undefined, snapshot('s-1', s1))
    const d2 = deriveSidebarState(d1, snapshot('s-1', s2))
    expect(d2.currentFile).toBe('/w/project.md')
    expect(d2.previousFile).toBe('/w/meeting.md')
    const d3 = deriveSidebarState(d2, snapshot('s-1', s3))
    expect(d3.currentFile).toBe('/w/meeting.md')
    expect(d3.previousFile).toBe('/w/project.md')
  })
  it('handles a snapshot without state (unattached sidebar)', () => {
    const derived = deriveSidebarState(undefined, snapshot(undefined, undefined))
    expect(derived.sidebarVisible).toBe(false)
    expect(derived.currentFile).toBeNull()
    expect(derived.openedFiles).toEqual([])
    expect(derived.fileCandidate).toBeNull()
  })

  it('keeps the recently browsed file when a non-file tab becomes active', () => {
    const file = makeState({ activePane: 'pane-1', splits: leaf('pane-1', [editorTab('a', A)], 'a') })
    const home = makeState({ activePane: 'pane-1', splits: leaf('pane-1', [editorTab('a', A), homeTab('h')], 'h') })
    const first = deriveSidebarState(undefined, snapshot('s-1', file))
    const second = deriveSidebarState(first, snapshot('s-1', home))
    expect(second.currentFile).toBeNull()
    expect(second.fileCandidate).toBe(A)
    expect(second.fileCandidateSource).toBe('recent')
  })

  it('does not guess an active file from another pane', () => {
    const state = makeState({
      activePane: 'pane-1',
      splits: { kind: 'split', id: 'split', direction: 'horizontal', sizes: [1, 1], children: [
        leaf('pane-1', [homeTab('h')], 'h'),
        leaf('pane-2', [editorTab('b', B)], 'b'),
      ] },
    })
    const derived = deriveSidebarState(undefined, snapshot('s-1', state))
    expect(derived.currentFile).toBeNull()
    expect(derived.fileCandidate).toBeNull()
  })
})

describe('findTabByPath', () => {
  it('finds a docked tab', () => {
    const state = makeState({ splits: leaf('pane-1', [editorTab('t1', A)], 't1') })
    expect(findTabByPath(state, A)?.id).toBe('t1')
  })
  it('searches floats after panes', () => {
    const state = makeState({
      splits: leaf('pane-1', [homeTab('h')]),
      floats: [float('f1', editorTab('t2', B))],
    })
    expect(findTabByPath(state, B)?.id).toBe('t2')
  })
  it('returns undefined when closed', () => {
    const state = makeState({ splits: leaf('pane-1', [homeTab('h')]) })
    expect(findTabByPath(state, C)).toBeUndefined()
  })
  it('does not match folder-window tabs', () => {
    const state = makeState({ splits: leaf('pane-1', [dirTab('d', '/root/docs')]) })
    expect(findTabByPath(state, '/root/docs')).toBeUndefined()
  })
})

describe('baseName', () => {
  it('extracts the last segment', () => {
    expect(baseName('/a/b/c.md')).toBe('c.md')
    expect(baseName('C:\\x\\y.ts')).toBe('y.ts')
    expect(baseName('top.txt')).toBe('top.txt')
  })
  it('strips trailing slashes', () => {
    expect(baseName('/root/docs/')).toBe('docs')
  })
})
