import { access, realpath, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { ControllerCode } from '../shared/types.ts'

export async function classifyOpenTarget(cwd: string, raw: string, title?: string): Promise<
  { ok: true; kind: 'file' | 'folder' | 'url'; target: string; title: string } |
  { ok: false; code: ControllerCode; message: string }
> {
  if (!raw.trim()) return { ok: false, code: 'INVALID_TARGET', message: '请指定文件、文件夹路径或 HTTP(S) URL。' }
  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw)
      return { ok: true, kind: 'url', target: url.href, title: title?.trim() ? title : url.hostname }
    }
    if (!/^[A-Za-z]:[\\/]/.test(raw) && /^[a-z][a-z\d+.-]*:/i.test(raw)) return { ok: false, code: 'INVALID_TARGET', message: '网页仅支持 HTTP(S)，本地文件请使用普通路径。' }
    const target = await realpath(resolve(cwd, raw))
    const info = await stat(target)
    await access(target, constants.R_OK)
    if (!info.isFile() && !info.isDirectory()) return { ok: false, code: 'NOT_A_FILE', message: '目标不是普通文件或目录。' }
    return { ok: true, kind: info.isDirectory() ? 'folder' : 'file', target, title: title?.trim() ? title : basename(target) || target }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return { ok: false, code: code === 'ENOENT' || code === 'ENOTDIR' ? 'FILE_NOT_FOUND' : /^https?:/i.test(raw) ? 'INVALID_TARGET' : 'FS_ERROR', message: `无法打开目标：${error instanceof Error ? error.message : String(error)}` }
  }
}
