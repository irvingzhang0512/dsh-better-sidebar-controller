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
    return leavesOf(state.bottomSplits);
}
/** The path of the currently active editor file, or null. */
export function activeFileOf(state) {
    const leaves = allLeaves(state);
    // Only the active pane is authoritative; another pane would be a guess.
    const activeLeaf = leaves.find(leaf => leaf.id === state.activePane);
    if (activeLeaf !== undefined && activeLeaf.active !== null) {
        const tab = activeLeaf.tabs.find(t => t.id === activeLeaf.active);
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
/**
 * Pick the tab that should remain visible when an internal/temporary tab is
 * removed. Prefer the active pane and its most recently appended tab, matching
 * better-sidebar's close-tab fallback, then fall back to any other pane.
 */
export function replacementTabId(state, excludedId) {
    const leaves = allLeaves(state);
    const activeLeaf = leaves.find(leaf => leaf.id === state.activePane);
    if (activeLeaf !== undefined) {
        for (let index = activeLeaf.tabs.length - 1; index >= 0; index -= 1) {
            const tab = activeLeaf.tabs[index];
            if (tab !== undefined && tab.id !== excludedId)
                return tab.id;
        }
    }
    for (const leaf of leaves) {
        const active = leaf.active === excludedId ? undefined : leaf.tabs.find(tab => tab.id === leaf.active);
        if (active !== undefined)
            return active.id;
        for (let index = leaf.tabs.length - 1; index >= 0; index -= 1) {
            const tab = leaf.tabs[index];
            if (tab !== undefined && tab.id !== excludedId)
                return tab.id;
        }
    }
    return null;
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
export function deriveSidebarState(prev, snapshot, nativeVisible) {
    const state = snapshot.state;
    const current = state === undefined ? null : activeFileOf(state);
    const fileContext = deriveFileContext(prev, current);
    const openedFiles = state === undefined ? [] : openedFilesOf(state);
    const recent = fileContext.previousFile !== null && openedFiles.includes(fileContext.previousFile)
        ? fileContext.previousFile
        : null;
    return {
        sessionId: snapshot.sessionId ?? null,
        sidebarVisible: nativeVisible ?? state?.bottomOpen ?? false,
        openedFiles,
        expandedFolders: state?.expanded ?? [],
        fileCandidate: current ?? recent,
        fileCandidateSource: current !== null ? 'current' : recent !== null ? 'recent' : null,
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
    return undefined;
}
/** Last path segment of an absolute path (display helper). */
export function baseName(path) {
    const trimmed = path.replace(/[\\/]+$/, '');
    const at = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
    return at === -1 ? trimmed : trimmed.slice(at + 1);
}
