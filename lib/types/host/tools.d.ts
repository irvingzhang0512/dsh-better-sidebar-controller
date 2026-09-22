import type { ControllerCode, ControllerCommand, ControllerState, DispatchOutcome } from '../shared/types.ts';
import type { ControllerStateStore } from './controller-state.ts';
import type { ListDirectoryResult } from './fs-tree.ts';
import type { PathKindResult, PathResolveResult } from './paths.ts';
/** Every tool name (kept in sync for SKILL/docs contract tests). */
export declare const CONTROLLER_TOOL_NAMES: readonly ["get_sidebar_state", "show_sidebar", "hide_sidebar", "list_files", "expand_folder", "collapse_folder", "refresh_tree", "open_file", "close_file", "activate_file", "reopen_previous_file"];
export type ControllerToolName = (typeof CONTROLLER_TOOL_NAMES)[number];
/** The bridge face tools use (a small subset of {@link BridgeServer}). */
export interface ControllerBridge {
    isAttached(sessionId: string): boolean;
    dispatch(sessionId: string, command: ControllerCommand, waitMs?: number): Promise<DispatchOutcome>;
}
/** Everything a tool needs from the host (injectable for tests). */
export interface ControllerDeps {
    getCwd(sessionId: string): Promise<string | null>;
    store: ControllerStateStore;
    bridge: ControllerBridge;
    resolveTarget(cwd: string, raw: string): Promise<PathResolveResult>;
    resolveLexical(cwd: string, raw: string): PathResolveResult;
    pathKind(path: string): Promise<PathKindResult>;
    listDirectory(path: string, maxEntries?: number): Promise<ListDirectoryResult>;
    /** How long a dispatched command waits for the client ack. */
    ackTimeoutMs?: number;
}
/** Base tool-result envelope (every tool returns at least these fields). */
export interface BaseResult {
    ok: boolean;
    code: ControllerCode;
    message: string;
}
/** The state view reported by `get_sidebar_state` (null fields omitted). */
export interface ControllerStateView {
    connected: boolean;
    state: {
        sidebarVisible: boolean;
        currentFile?: string;
        previousFile?: string;
        fileCandidate?: string;
        fileCandidateSource?: 'current' | 'recent';
        openedFiles: string[];
        expandedFolders: string[];
        workspaceRoot?: string;
        updatedAt: number;
    } | null;
}
/** Public state projection for `get_sidebar_state` results (nulls omitted). */
export declare function stateView(state: ControllerState | null, connected: boolean): ControllerStateView;
/** Register the eleven controller tools. Returns the combined disposer. */
export declare function registerControllerTools(ctx: {
    tools: {
        register(tool: unknown): () => void;
    };
}, deps: ControllerDeps): () => void;
