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
/** List one directory level, returning a structured result. */
export declare function listDirectorySafe(path: string, maxEntries?: number): Promise<ListDirectoryResult>;
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
