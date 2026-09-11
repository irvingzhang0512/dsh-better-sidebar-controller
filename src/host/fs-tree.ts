/**
 * Single-level directory listing for the controller's `list_files` tool,
 * mirroring dsh-better-sidebar's explorer semantics: opendir streaming,
 * directory-first case-insensitive name order, dot-prefixed rows flagged
 * `hidden`, symlinks stat'ed once to expose their target kind, dangling
 * links flagged `broken`, and a row bound that flags `truncated`.
 *
 * This module is a self-contained reimplementation of the same helpers in
 * dsh-better-sidebar's src/fs-tree.ts (which the published package does not
 * expose as a runnable entry) — behavior is kept in lockstep so the agent's
 * view of a directory never disagrees with the sidebar's.
 */
import { opendir, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

/** One listed row. */
export interface FsEntry {
  name: string
  path: string
  isDir: boolean
  hidden: boolean
  /** Whether the row is a symlink; `isDir` then describes the link's target. */
  isSymlink: boolean
  /** For symlinks: the target is missing or unreadable (stat failed). */
  broken: boolean
}

/** One listed level. */
export interface FsListing {
  path: string
  entries: FsEntry[]
  truncated: boolean
}

/** Directory-first, case-insensitive name ordering (VSCode explorer order). */
export function compareEntries(a: FsEntry, b: FsEntry): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

/** Result of a safe listing attempt (the tool reports codes, not throws). */
export type ListDirectoryResult =
  | { ok: true; listing: FsListing }
  | { ok: false; code: 'NOT_A_DIRECTORY' | 'FILE_NOT_FOUND' | 'FS_ERROR'; message: string }

/** List one directory level, returning a structured result. */
export async function listDirectorySafe(path: string, maxEntries = 1000): Promise<ListDirectoryResult> {
  let level
  try {
    level = await opendir(path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return { ok: false, code: 'NOT_A_DIRECTORY', message: `不是可读取的目录: "${path}"` }
    }
    return { ok: false, code: 'FS_ERROR', message: `无法列出目录 "${path}": ${messageOf(error)}` }
  }
  const rows: FsEntry[] = []
  let overflow = 0
  try {
    for await (const dirent of level) {
      if (rows.length >= maxEntries) {
        overflow += 1
        continue
      }
      rows.push({
        name: dirent.name,
        path: join(path, dirent.name),
        isDir: dirent.isDirectory(),
        isSymlink: dirent.isSymbolicLink(),
        broken: false,
        hidden: dirent.name.startsWith('.'),
      })
    }
  } catch (error) {
    return { ok: false, code: 'FS_ERROR', message: `无法列出目录 "${path}": ${messageOf(error)}` }
  }
  await probeSymlinkTargets(rows)
  rows.sort(compareEntries)
  return { ok: true, listing: { path, entries: rows, truncated: overflow > 0 } }
}

/** How many symlink target stats run in flight during one level listing. */
const SYMLINK_PROBE_CONCURRENCY = 32

/** Probe each symlink row's target once (bounded concurrency, order-preserving). */
async function probeSymlinkTargets(rows: FsEntry[], concurrency = SYMLINK_PROBE_CONCURRENCY): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
    for (;;) {
      const index = next
      next += 1
      if (index >= rows.length) return
      const row = rows[index]!
      if (!row.isSymlink) continue
      const info = await stat(row.path).catch(() => undefined)
      row.isDir = info !== undefined ? info.isDirectory() : row.isDir
      row.broken = info === undefined
    }
  })
  await Promise.all(workers)
}

/**
 * Whether `target` lies under `base` (or equals it), tolerant of separator
 * style and — on Windows, where the filesystem is case-insensitive — of
 * letter case.
 */
export function isWithin(base: string, target: string, platform: NodeJS.Platform = process.platform): boolean {
  const norm = (value: string): string => value.replace(/[\\/]+/g, '/').replace(/\/$/, '')
  const b = norm(base)
  const t = norm(target)
  if (platform === 'win32') {
    const lb = b.toLowerCase()
    const lt = t.toLowerCase()
    return lt === lb || lt.startsWith(`${lb}/`)
  }
  return t === b || t.startsWith(`${b}/`)
}

/** Whether a caller-supplied path is absolute on this OS. */
export function requireAbsolute(path: string): string {
  if (!isAbsolute(path)) {
    throw new Error(`"${path}" is not an absolute path`)
  }
  return resolve(path)
}

/** Message text of an unknown thrown value. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The root row label of a listing: the last path segment. */
export function rootLabel(path: string): string {
  const base = basename(path)
  return base !== '' ? base : path
}

/** Parent of a path, or undefined at the filesystem root. */
export function parentOf(path: string): string | undefined {
  const parent = dirname(path)
  return parent === path ? undefined : parent
}
