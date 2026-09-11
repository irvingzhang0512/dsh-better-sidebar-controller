/**
 * Whether a tab is an open FILE (an editor tab carrying a path that is not a
 * folder window). Browser tabs also carry `path` (the URL) but have a
 * different `type`, so `type === 'editor'` is the discriminator; folder
 * windows (`meta.dir === true`) are navigation, not files.
 */
export function isEditorFileTab(tab) {
    if (tab.type !== 'editor')
        return false;
    if (typeof tab.path !== 'string' || tab.path === '')
        return false;
    const meta = tab.meta;
    if (meta !== null && typeof meta === 'object' && meta.dir === true)
        return false;
    return true;
}
/** All leaves of one split tree (depth-first, stable order). */
export function leavesOf(node) {
    if (node.kind === 'leaf')
        return [node];
    const split = node;
    return split.children.flatMap(leavesOf);
}
/** Every leaf across the right panel and the bottom panel. */
export function allLeaves(state) {
    return [...leavesOf(state.splits), ...leavesOf(state.bottomSplits)];
}
/** The path of the currently active editor file, or null. */
export function activeFileOf(state) {
    const leaves = allLeaves(state);
    // Prefer the active pane's active tab; fall back to the first leaf.
    const activeLeaf = leaves.find(leaf => leaf.id === state.activePane) ?? leaves[0];
    if (activeLeaf !== undefined && activeLeaf.active !== null) {
        const tab = activeLeaf.tabs.find(t => t.id === activeLeaf.active);
        if (tab !== undefined && isEditorFileTab(tab))
            return tab.path;
    }
    // Fallback: the first leaf whose active tab is an editor file.
    for (const leaf of leaves) {
        if (leaf.active === null)
            continue;
        const tab = leaf.tabs.find(t => t.id === leaf.active);
        if (tab !== undefined && isEditorFileTab(tab))
            return tab.path;
    }
    return null;
}
/** The id of the tab currently active in the active pane, or null. */
export function activeTabIdOf(state) {
    const leaves = allLeaves(state);
    const activeLeaf = leaves.find(leaf => leaf.id === state.activePane) ?? leaves[0];
    return activeLeaf?.active ?? null;
}
/** All open file paths (pane tabs then floats), deduplicated in first-open order. */
export function openedFilesOf(state) {
    const out = [];
    const seen = new Set();
    const visit = (tab) => {
        if (!isEditorFileTab(tab))
            return;
        const path = tab.path;
        if (seen.has(path))
            return;
        seen.add(path);
        out.push(path);
    };
    for (const leaf of allLeaves(state)) {
        for (const tab of leaf.tabs)
            visit(tab);
    }
    for (const float of state.floats)
        visit(float.tab);
    return out;
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
export function deriveFileContext(prev, current) {
    const prevCurrent = prev?.currentFile ?? null;
    const prevPrevious = prev?.previousFile ?? null;
    if (current === null) {
        return { currentFile: null, previousFile: prevCurrent ?? prevPrevious };
    }
    if (current === prevCurrent) {
        return { currentFile: current, previousFile: prevPrevious };
    }
    return { currentFile: current, previousFile: prevCurrent ?? prevPrevious };
}
/** Derive the controller state for one snapshot, threading previous/current across calls. */
export function deriveSidebarState(prev, snapshot) {
    const state = snapshot.state;
    const current = state === undefined ? null : activeFileOf(state);
    const fileContext = deriveFileContext(prev, current);
    return {
        sessionId: snapshot.sessionId ?? null,
        sidebarVisible: state?.panelOpen ?? false,
        openedFiles: state === undefined ? [] : openedFilesOf(state),
        expandedFolders: state?.expanded ?? [],
        ...fileContext,
    };
}
/**
 * Find the first open tab whose path matches (pane tabs first, then floats).
 * Used by close/activate to map a path to the service's tab id. Returns
 * undefined when the file is not open.
 */
export function findTabByPath(state, path) {
    for (const leaf of allLeaves(state)) {
        const tab = leaf.tabs.find(t => isEditorFileTab(t) && t.path === path);
        if (tab !== undefined)
            return tab;
    }
    for (const float of state.floats) {
        if (isEditorFileTab(float.tab) && float.tab.path === path)
            return float.tab;
    }
    return undefined;
}
/** Last path segment of an absolute path (display helper). */
export function baseName(path) {
    const trimmed = path.replace(/[\\/]+$/, '');
    const at = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
    return at === -1 ? trimmed : trimmed.slice(at + 1);
}
