/**
 * Pure derivation of the controller's semantic state from a better-sidebar
 * snapshot. This is the single source of truth for `current_file`,
 * `previous_file`, `opened_files` and the sidebar visibility flags, so the
 * client (which sees every user mouse interaction through `subscribeState`)
 * and the agent (through tools) always converge on the same picture.
 *
 * The module is deliberately free of Node and browser runtime imports — it
 * only reads the {@link SidebarSnapshot} shape — so it unit-tests in plain
 * Node.
 */
import type { SidebarSnapshot, SidebarState, SidebarTab } from 'dsh-better-sidebar/client/service'

/**
 * The recursive split-tree shapes are not re-exported by the package's
 * public service subpath; derive them structurally from `SidebarState`.
 */
type SplitNode = SidebarState['splits']
type SidebarLeaf = Extract<SplitNode, { kind: 'leaf' }>
type SidebarSplit = Extract<SplitNode, { kind: 'split' }>
type FloatWindow = SidebarState['floats'][number]

/** The file-switch context: current + previous. */
export interface DerivedFileContext {
  currentFile: string | null
  previousFile: string | null
}

/** The full derived controller state (session-scoped). */
export interface DerivedSidebarState extends DerivedFileContext {
  sessionId: string | null
  sidebarVisible: boolean
  openedFiles: string[]
  expandedFolders: string[]
  fileCandidate: string | null
  fileCandidateSource: 'current' | 'recent' | null
}

/**
 * Whether a tab is an open FILE (an editor tab carrying a path that is not a
 * folder window). Browser tabs also carry `path` (the URL) but have a
 * different `type`, so `type === 'editor'` is the discriminator; folder
 * windows (`meta.dir === true`) are navigation, not files.
 */
export function isEditorFileTab(tab: SidebarTab): boolean {
  if (tab.type !== 'editor') return false
  if (typeof tab.path !== 'string' || tab.path === '') return false
  const meta = tab.meta as { dir?: unknown } | null | undefined
  if (meta !== null && typeof meta === 'object' && meta.dir === true) return false
  return true
}

/** All leaves of one split tree (depth-first, stable order). */
export function leavesOf(node: SplitNode): SidebarLeaf[] {
  if (node.kind === 'leaf') return [node]
  const split = node as SidebarSplit
  return split.children.flatMap(leavesOf)
}

/** Every leaf across the right panel and the bottom panel. */
export function allLeaves(state: SidebarState): SidebarLeaf[] {
  return [...leavesOf(state.splits), ...leavesOf(state.bottomSplits)]
}

/** The path of the currently active editor file, or null. */
export function activeFileOf(state: SidebarState): string | null {
  const leaves = allLeaves(state)
  // Only the active pane is authoritative; another pane would be a guess.
  const activeLeaf = leaves.find(leaf => leaf.id === state.activePane)
  if (activeLeaf !== undefined && activeLeaf.active !== null) {
    const tab = activeLeaf.tabs.find(t => t.id === activeLeaf.active)
    if (tab !== undefined && isEditorFileTab(tab)) return tab.path as string
  }
  return null
}

/** The id of the tab currently active in the active pane, or null. */
export function activeTabIdOf(state: SidebarState): string | null {
  const leaves = allLeaves(state)
  const activeLeaf = leaves.find(leaf => leaf.id === state.activePane) ?? leaves[0]
  return activeLeaf?.active ?? null
}

/**
 * Pick the tab that should remain visible when an internal/temporary tab is
 * removed. Prefer the active pane and its most recently appended tab, matching
 * better-sidebar's close-tab fallback, then fall back to any other pane.
 */
export function replacementTabId(state: SidebarState, excludedId: string): string | null {
  const leaves = allLeaves(state)
  const activeLeaf = leaves.find(leaf => leaf.id === state.activePane)
  if (activeLeaf !== undefined) {
    for (let index = activeLeaf.tabs.length - 1; index >= 0; index -= 1) {
      const tab = activeLeaf.tabs[index]
      if (tab !== undefined && tab.id !== excludedId) return tab.id
    }
  }

  for (const leaf of leaves) {
    const active = leaf.active === excludedId ? undefined : leaf.tabs.find(tab => tab.id === leaf.active)
    if (active !== undefined) return active.id
    for (let index = leaf.tabs.length - 1; index >= 0; index -= 1) {
      const tab = leaf.tabs[index]
      if (tab !== undefined && tab.id !== excludedId) return tab.id
    }
  }
  return null
}

/** All open file paths (pane tabs then floats), deduplicated in first-open order. */
export function openedFilesOf(state: SidebarState): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const visit = (tab: SidebarTab): void => {
    if (!isEditorFileTab(tab)) return
    const path = tab.path as string
    if (seen.has(path)) return
    seen.add(path)
    out.push(path)
  }
  for (const leaf of allLeaves(state)) {
    for (const tab of leaf.tabs) visit(tab)
  }
  for (const float of state.floats) visit(float.tab)
  return out
}

/**
 * Advance the current/previous file context when the active file changes.
 *
 * Rules (per requirements §4.3):
 * - A → B: current = B, previous = A.
 * - B → A: current = A, previous = B.
 * - current becomes null (file closed / focus moves to a non-file tab):
 *   keep the last current as `previous`, so “回到刚才那个文件” still works.
 * - the current file stays the same (panel toggles, tab closes elsewhere):
 *   neither field changes.
 */
export function deriveFileContext(prev: DerivedFileContext | undefined, current: string | null): DerivedFileContext {
  const prevCurrent = prev?.currentFile ?? null
  const prevPrevious = prev?.previousFile ?? null
  if (current === null) {
    return { currentFile: null, previousFile: prevCurrent ?? prevPrevious }
  }
  if (current === prevCurrent) {
    return { currentFile: current, previousFile: prevPrevious }
  }
  return { currentFile: current, previousFile: prevCurrent ?? prevPrevious }
}

/** Derive the controller state for one snapshot, threading previous/current across calls. */
export function deriveSidebarState(prev: DerivedSidebarState | undefined, snapshot: SidebarSnapshot): DerivedSidebarState {
  const state = snapshot.state
  const current = state === undefined ? null : activeFileOf(state)
  const fileContext = deriveFileContext(prev, current)
  const openedFiles = state === undefined ? [] : openedFilesOf(state)
  const recent = fileContext.previousFile !== null && openedFiles.includes(fileContext.previousFile)
    ? fileContext.previousFile
    : null
  return {
    sessionId: snapshot.sessionId ?? null,
    sidebarVisible: state?.panelOpen ?? false,
    openedFiles,
    expandedFolders: state?.expanded ?? [],
    fileCandidate: current ?? recent,
    fileCandidateSource: current !== null ? 'current' : recent !== null ? 'recent' : null,
    ...fileContext,
  }
}

/**
 * Find the first open tab whose path matches (pane tabs first, then floats).
 * Used by close/activate to map a path to the service's tab id. Returns
 * undefined when the file is not open.
 */
export function findTabByPath(state: SidebarState, path: string): SidebarTab | undefined {
  for (const leaf of allLeaves(state)) {
    const tab = leaf.tabs.find(t => isEditorFileTab(t) && t.path === path)
    if (tab !== undefined) return tab
  }
  for (const float of state.floats) {
    if (isEditorFileTab(float.tab) && float.tab.path === path) return float.tab
  }
  return undefined
}

/** Last path segment of an absolute path (display helper). */
export function baseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const at = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return at === -1 ? trimmed : trimmed.slice(at + 1)
}
