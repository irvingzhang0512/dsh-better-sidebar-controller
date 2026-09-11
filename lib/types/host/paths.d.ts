import type { ControllerCode } from '../shared/types.ts';
export type PathResolveResult = {
    ok: true;
    path: string;
} | {
    ok: false;
    code: ControllerCode;
    message: string;
};
/**
 * Turn a caller-supplied path into an absolute path in one session's
 * namespace. Relative paths resolve against the cwd (natural language);
 * absolute paths pass through, with the WSL projection applied for
 * Windows-hosted WSL workspaces. No filesystem access.
 */
export declare function resolveSessionPath(cwd: string, target: string, platform?: NodeJS.Platform): string;
/**
 * Resolve an EXISTING workspace target: canonicalize through symlinks and
 * enforce workspace containment. Returns a structured error instead of
 * throwing, so tools can map it to an explicit error code.
 */
export declare function resolveWorkspaceTarget(cwd: string, raw: string): Promise<PathResolveResult>;
/**
 * Resolve a target LEXICALLY (no existence required) — used for close /
 * activate, where the file may have been deleted from disk while its tab is
 * still open. Containment is still enforced against the cwd.
 */
export declare function resolveLexicalTarget(cwd: string, raw: string, platform?: NodeJS.Platform): PathResolveResult;
/** Classify an existing target: directory, file, or a structured error. */
export type PathKindResult = {
    ok: true;
    kind: 'dir' | 'file';
} | {
    ok: false;
    code: ControllerCode;
    message: string;
};
export declare function pathKind(path: string): Promise<PathKindResult>;
