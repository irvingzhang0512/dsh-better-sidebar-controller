/** One listed row. */
export interface FsEntry {
    name: string;
    path: string;
    isDir: boolean;
    hidden: boolean;
    /** Whether the row is a symlink; `isDir` then describes the link's target. */
    isSymlink: boolean;
    /** For symlinks: the target is missing or unreadable (stat failed). */
    broken: boolean;
}
/** One listed level. */
export interface FsListing {
    path: string;
    entries: FsEntry[];
    truncated: boolean;
}
/** Directory-first, case-insensitive name ordering (VSCode explorer order). */
export declare function compareEntries(a: FsEntry, b: FsEntry): number;
/** Result of a safe listing attempt (the tool reports codes, not throws). */
export type ListDirectoryResult = {
    ok: true;
    listing: FsListing;
} | {
    ok: false;
    code: 'NOT_A_DIRECTORY' | 'FILE_NOT_FOUND' | 'FS_ERROR';
    message: string;
};
/**
 * Options of one level listing (SPEC F009 侧边卡片设置).
 *
 * Order matters and is deliberate: entries are filtered by
 * `includeHiddenEntries` FIRST, then counted against `maxListedEntries` —
 * hidden rows must not eat the visible rows' quota. `truncated` therefore
 * means "there are more ELIGIBLE rows than the bound", not "the directory
 * has more rows".
 */
export interface ListDirectoryOptions {
    /** Return dot-prefixed rows (still flagged `hidden`); default true. */
    includeHiddenEntries?: boolean;
    /** Row bound of this level; default 1000. */
    maxListedEntries?: number;
}
/**
 * List one directory level, returning a structured result.
 *
 * Accepts a bare number for backward compatibility (older call sites passed
 * `listDirectorySafe(path, 2)`).
 */
export declare function listDirectorySafe(path: string, options?: number | ListDirectoryOptions): Promise<ListDirectoryResult>;
/**
 * Whether `target` lies under `base` (or equals it), tolerant of separator
 * style and — on Windows, where the filesystem is case-insensitive — of
 * letter case.
 */
export declare function isWithin(base: string, target: string, platform?: NodeJS.Platform): boolean;
/** Whether a caller-supplied path is absolute on this OS. */
export declare function requireAbsolute(path: string): string;
/** Message text of an unknown thrown value. */
export declare function messageOf(error: unknown): string;
/** The root row label of a listing: the last path segment. */
export declare function rootLabel(path: string): string;
/** Parent of a path, or undefined at the filesystem root. */
export declare function parentOf(path: string): string | undefined;
