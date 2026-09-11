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
import type { SidebarSnapshot, SidebarState, SidebarTab } from 'dsh-better-sidebar/client/service';
/**
 * The recursive split-tree shapes are not re-exported by the package's
 * public service subpath; derive them structurally from `SidebarState`.
 */
type SplitNode = SidebarState['splits'];
type SidebarLeaf = Extract<SplitNode, {
    kind: 'leaf';
}>;
/** The file-switch context: current + previous. */
export interface DerivedFileContext {
    currentFile: string | null;
    previousFile: string | null;
}
/** The full derived controller state (session-scoped). */
export interface DerivedSidebarState extends DerivedFileContext {
    sessionId: string | null;
    sidebarVisible: boolean;
    openedFiles: string[];
    expandedFolders: string[];
}
/**
 * Whether a tab is an open FILE (an editor tab carrying a path that is not a
 * folder window). Browser tabs also carry `path` (the URL) but have a
 * different `type`, so `type === 'editor'` is the discriminator; folder
 * windows (`meta.dir === true`) are navigation, not files.
 */
export declare function isEditorFileTab(tab: SidebarTab): boolean;
/** All leaves of one split tree (depth-first, stable order). */
export declare function leavesOf(node: SplitNode): SidebarLeaf[];
/** Every leaf across the right panel and the bottom panel. */
export declare function allLeaves(state: SidebarState): SidebarLeaf[];
/** The path of the currently active editor file, or null. */
export declare function activeFileOf(state: SidebarState): string | null;
/** All open file paths (pane tabs then floats), deduplicated in first-open order. */
export declare function openedFilesOf(state: SidebarState): string[];
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
export declare function deriveFileContext(prev: DerivedFileContext | undefined, current: string | null): DerivedFileContext;
/** Derive the controller state for one snapshot, threading previous/current across calls. */
export declare function deriveSidebarState(prev: DerivedSidebarState | undefined, snapshot: SidebarSnapshot): DerivedSidebarState;
/**
 * Find the first open tab whose path matches (pane tabs first, then floats).
 * Used by close/activate to map a path to the service's tab id. Returns
 * undefined when the file is not open.
 */
export declare function findTabByPath(state: SidebarState, path: string): SidebarTab | undefined;
/** Last path segment of an absolute path (display helper). */
export declare function baseName(path: string): string;
export {};
