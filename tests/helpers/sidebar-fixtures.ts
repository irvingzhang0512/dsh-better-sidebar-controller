/**
 * Shared SidebarState / SidebarSnapshot fixture builders for tests. These
 * mirror the published better-sidebar shapes (see its lib/types) so the pure
 * derivation logic can be exercised without a browser.
 */
import type { SidebarLeaf, SidebarSnapshot, SidebarSplit, SidebarState, SidebarTab, SplitNode } from 'dsh-better-sidebar/client/service'

/** A plain editor file tab. */
export function editorTab(id: string, path: string, extra: Partial<SidebarTab> = {}): SidebarTab {
  return { id, type: 'editor', title: path.split('/').pop() ?? path, path, ...extra }
}

/** An editor tab whose meta marks it as a folder window (not a file). */
export function dirTab(id: string, path: string): SidebarTab {
  return editorTab(id, path, { meta: { dir: true } })
}

/** A browser tab (path is a URL, type is 'browser' — never a file). */
export function browserTab(id: string, url: string): SidebarTab {
  return { id, type: 'browser', title: url, path: url }
}

/** A terminal tab (no path — never a file). */
export function terminalTab(id: string): SidebarTab {
  return { id, type: 'terminal', title: 'terminal' }
}

/** The files home tab (editor tab with an empty path — never a file). */
export function homeTab(id: string): SidebarTab {
  return { id, type: 'editor', title: 'Files' }
}

/** A tab group. */
export function leaf(id: string, tabs: SidebarTab[], active: string | null = tabs[0]?.id ?? null): SidebarLeaf {
  return { kind: 'leaf', id, tabs, active }
}

/** A recursive split. */
export function split(id: string, children: SplitNode[], dir: 'row' | 'col' = 'row'): SidebarSplit {
  return { kind: 'split', id, dir, sizes: children.map(() => 1 / children.length), children }
}

/** A minimal valid SidebarState; override the bits each test cares about. */
export function makeState(overrides: Partial<SidebarState> & { splits?: SplitNode; panelOpen?: boolean } = {}): SidebarState {
  const { splits, panelOpen, ...rest } = overrides
  return {
    activePane: 'pane-1',
    nextTerminal: 0,
    nextBrowser: 0,
    expanded: [],
    revealed: [],
    bottomOpen: panelOpen ?? false,
    bottomHeight: 220,
    bottomOpenedOnce: false,
    bottomSplits: splits ?? leaf('pane-1', [homeTab('t-home')], 't-home'),
    agentWaits: {},
    ...rest,
  }
}

/** The prefs field of a snapshot is opaque to the controller (unused). */
const EMPTY_PREFS = {} as never

/** A snapshot. */
export function snapshot(sessionId: string | undefined, state: SidebarState | undefined, prefs: unknown = EMPTY_PREFS): SidebarSnapshot {
  return { sessionId, state, prefs: prefs as SidebarSnapshot['prefs'] }
}
