/**
 * Path resolution / containment tests: relative and absolute targets, the WSL
 * projection, symlink canonicalization, workspace fencing.
 */
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveLexicalTarget, resolveSessionPath, resolveWorkspaceTarget } from '../../src/host/paths.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-ctrl-paths-'))
  await mkdir(join(root, 'docs'), { recursive: true })
  await writeFile(join(root, 'a.md'), 'a')
  await writeFile(join(root, 'docs', 'b.md'), 'b')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('resolveSessionPath', () => {
  it('resolves relative paths against the cwd', () => {
    expect(resolveSessionPath(root, 'a.md')).toBe(join(root, 'a.md'))
    expect(resolveSessionPath(root, './docs/b.md')).toBe(join(root, 'docs', 'b.md'))
  })
  it('passes absolute paths through', () => {
    const abs = resolve(root, 'a.md')
    expect(resolveSessionPath(root, abs)).toBe(abs)
  })
  it('projects POSIX roots onto the WSL distro on Windows', () => {
    const wslCwd = '\\\\wsl.localhost\\Ubuntu\\home\\me'
    const result = resolveSessionPath(wslCwd, '/home/me/a.md', 'win32')
    expect(result.toLowerCase()).toBe('\\\\wsl.localhost\\ubuntu\\home\\me\\a.md'.toLowerCase())
  })
  it('leaves non-WSL POSIX-looking absolute targets as-is on Windows', () => {
    expect(resolveSessionPath(root, '/plain/posix', 'win32')).toBe('/plain/posix')
  })
  it('resolves relative paths with the host resolver on any platform', () => {
    expect(resolveSessionPath('/home/me', 'rel', 'linux')).toBe(resolve('/home/me', 'rel'))
  })
})

describe('resolveWorkspaceTarget', () => {
  it('resolves and realpaths an existing relative target inside the workspace', async () => {
    const result = await resolveWorkspaceTarget(root, 'a.md')
    expect(result).toEqual({ ok: true, path: resolve(root, 'a.md') })
  })
  it('rejects an empty / invalid raw target', async () => {
    const result = await resolveWorkspaceTarget(root, '')
    expect(result.ok).toBe(false)
  })
  it('rejects a path outside the workspace', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'dsh-ctrl-outside-'))
    try {
      const result = await resolveWorkspaceTarget(root, outside)
      expect(result).toMatchObject({ ok: false, code: 'PATH_OUTSIDE_WORKSPACE' })
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
  it('rejects a nonexistent target with FILE_NOT_FOUND', async () => {
    const result = await resolveWorkspaceTarget(root, 'nope.md')
    expect(result).toMatchObject({ ok: false, code: 'FILE_NOT_FOUND' })
  })
  it('rejects a symlink that escapes the workspace', async () => {
    let canSymlink = true
    const outside = await mkdtemp(join(tmpdir(), 'dsh-ctrl-outside-'))
    try {
      const link = join(root, 'escape')
      try {
        await symlink(outside, link)
      } catch {
        canSymlink = false
      }
      if (canSymlink) {
        const result = await resolveWorkspaceTarget(root, 'escape')
        expect(result).toMatchObject({ ok: false, code: 'PATH_OUTSIDE_WORKSPACE' })
      }
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })
  it('canonicalizes a symlink inside the workspace', async () => {
    let canSymlink = true
    try {
      await symlink(join(root, 'a.md'), join(root, 'alias.md'))
    } catch {
      canSymlink = false
    }
    if (canSymlink) {
      const result = await resolveWorkspaceTarget(root, 'alias.md')
      expect(result).toMatchObject({ ok: true, path: resolve(root, 'a.md') })
    }
  })
})

describe('resolveLexicalTarget', () => {
  it('resolves without requiring existence (for closing still-open tabs)', () => {
    const result = resolveLexicalTarget(root, 'deleted.md')
    expect(result).toMatchObject({ ok: true, path: resolve(root, 'deleted.md') })
  })
  it('enforces workspace containment lexically', () => {
    const result = resolveLexicalTarget(root, '..\\outside.md')
    expect(result.ok).toBe(false)
    if (result.ok === false) expect(result.code).toBe('PATH_OUTSIDE_WORKSPACE')
  })
})
