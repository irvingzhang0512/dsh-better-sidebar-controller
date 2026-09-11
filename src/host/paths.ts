/**
 * Session path resolution and workspace containment for the controller's
 * host half, mirroring dsh-better-sidebar's session-path.ts / path-security.ts
 * semantics so the agent's path view never disagrees with the sidebar's.
 *
 * Tools accept natural-language paths: a relative path is resolved against
 * the calling session's cwd; an absolute path is used as-is (WSL sessions
 * project POSIX roots onto their distro, exactly like better-sidebar).
 * Every path that reaches the filesystem or the client is canonicalized
 * through symlinks and fenced to the session workspace.
 */
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, resolve, win32 } from 'node:path'
import { isWithin } from './fs-tree.ts'
import type { ControllerCode } from '../shared/types.ts'

/** `\\wsl.localhost\<distro>` root of a Windows-hosted WSL workspace. */
const WSL_LOCALHOST_ROOT = /^\\\\wsl\.localhost\\([^\\]+)(?:\\|$)/i

export type PathResolveResult =
  | { ok: true; path: string }
  | { ok: false; code: ControllerCode; message: string }

/**
 * Turn a caller-supplied path into an absolute path in one session's
 * namespace. Relative paths resolve against the cwd (natural language);
 * absolute paths pass through, with the WSL projection applied for
 * Windows-hosted WSL workspaces. No filesystem access.
 */
export function resolveSessionPath(cwd: string, target: string, platform: NodeJS.Platform = process.platform): string {
  if (!isAbsolute(target)) return resolve(cwd, target)
  if (platform !== 'win32' || !/^\/(?!\/)/.test(target)) return target
  const normalizedCwd = cwd.replace(/\//g, '\\')
  const match = WSL_LOCALHOST_ROOT.exec(normalizedCwd)
  if (match === null) return target
  const distroRoot = `\\\\wsl.localhost\\${match[1]}`
  const relative = target.slice(1).replace(/\//g, '\\')
  return win32.resolve(distroRoot, relative)
}

/**
 * Resolve an EXISTING workspace target: canonicalize through symlinks and
 * enforce workspace containment. Returns a structured error instead of
 * throwing, so tools can map it to an explicit error code.
 */
export async function resolveWorkspaceTarget(cwd: string, raw: string): Promise<PathResolveResult> {
  if (raw === '') {
    return { ok: false, code: 'INVALID_PATH', message: '路径不能为空。' }
  }
  let absolute: string
  try {
    absolute = resolveSessionPath(cwd, raw)
  } catch {
    return { ok: false, code: 'INVALID_PATH', message: `无法解析路径 "${raw}"` }
  }
  if (!isAbsolute(absolute)) {
    return { ok: false, code: 'INVALID_PATH', message: `路径不是绝对路径: "${raw}"` }
  }
  const [realCwd, realTarget] = await Promise.all([
    realpath(cwd).catch(() => cwd),
    realpath(absolute).catch(error => error as NodeJS.ErrnoException),
  ])
  if (realTarget instanceof Error) {
    const code = realTarget.code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return { ok: false, code: 'FILE_NOT_FOUND', message: `路径不存在: "${absolute}"` }
    }
    return { ok: false, code: 'FILE_NOT_FOUND', message: `无法访问 "${absolute}": ${realTarget.message}` }
  }
  if (!isWithin(realCwd, realTarget)) {
    return { ok: false, code: 'PATH_OUTSIDE_WORKSPACE', message: `路径 "${absolute}" 在工作区之外` }
  }
  return { ok: true, path: realTarget }
}

/**
 * Resolve a target LEXICALLY (no existence required) — used for close /
 * activate, where the file may have been deleted from disk while its tab is
 * still open. Containment is still enforced against the cwd.
 */
export function resolveLexicalTarget(cwd: string, raw: string, platform: NodeJS.Platform = process.platform): PathResolveResult {
  if (raw === '') {
    return { ok: false, code: 'INVALID_PATH', message: '路径不能为空。' }
  }
  let absolute: string
  try {
    absolute = resolveSessionPath(cwd, raw)
  } catch {
    return { ok: false, code: 'INVALID_PATH', message: `无法解析路径 "${raw}"` }
  }
  if (!isAbsolute(absolute)) {
    return { ok: false, code: 'INVALID_PATH', message: `路径不是绝对路径: "${raw}"` }
  }
  if (!isWithin(cwd, absolute, platform)) {
    return { ok: false, code: 'PATH_OUTSIDE_WORKSPACE', message: `路径 "${absolute}" 在工作区之外` }
  }
  return { ok: true, path: absolute }
}

/** Classify an existing target: directory, file, or a structured error. */
export type PathKindResult =
  | { ok: true; kind: 'dir' | 'file' }
  | { ok: false; code: ControllerCode; message: string }

export async function pathKind(path: string): Promise<PathKindResult> {
  const info = await stat(path).catch(error => error as NodeJS.ErrnoException)
  if (info instanceof Error) {
    if (info.code === 'ENOENT' || info.code === 'ENOTDIR') {
      return { ok: false, code: 'FILE_NOT_FOUND', message: `路径不存在: "${path}"` }
    }
    return { ok: false, code: 'FILE_NOT_FOUND', message: `无法访问 "${path}": ${info.message}` }
  }
  return { ok: true, kind: info.isDirectory() ? 'dir' : 'file' }
}
