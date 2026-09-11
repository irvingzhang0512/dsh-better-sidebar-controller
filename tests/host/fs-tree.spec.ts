/**
 * Directory listing tests: explorer order (dirs first, case-insensitive),
 * hidden flags, symlink probing, truncation bound.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compareEntries, isWithin, listDirectorySafe } from '../../src/host/fs-tree.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-ctrl-tree-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function seed(names: string[]): Promise<void> {
  for (const name of names) {
    if (name.endsWith('/')) await mkdir(join(root, name))
    else await writeFile(join(root, name), name)
  }
}

describe('listDirectorySafe', () => {
  it('lists entries with the explorer contract: dirs first, then case-insensitive names', async () => {
    await seed(['zeta.md', 'alpha.md', 'Beta.md', 'dir-x/', 'Dir-y/'])
    const result = await listDirectorySafe(root)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const names = result.listing.entries.map(e => e.name)
    // dirs first, alphabetical (case-insensitive: Beta before zeta)
    expect(names.slice(0, 2).sort()).toEqual(['Dir-y', 'dir-x'])
    expect(names.slice(2)).toEqual(['alpha.md', 'Beta.md', 'zeta.md'])
  })
  it('flags dot-prefixed entries as hidden', async () => {
    await seed(['.env', 'visible.md'])
    const result = await listDirectorySafe(root)
    if (!result.ok) return
    const hidden = result.listing.entries.find(e => e.name === '.env')
    const visible = result.listing.entries.find(e => e.name === 'visible.md')
    expect(hidden?.hidden).toBe(true)
    expect(visible?.hidden).toBe(false)
    expect(hidden?.isDir).toBe(false)
  })
  it('exposes absolute paths on every row', async () => {
    await seed(['a.md'])
    const result = await listDirectorySafe(root)
    if (!result.ok) return
    expect(result.listing.entries[0]!.path).toBe(join(root, 'a.md'))
  })
  it('flags subdirectories', async () => {
    await seed(['sub/', 'f.md'])
    const result = await listDirectorySafe(root)
    if (!result.ok) return
    const sub = result.listing.entries.find(e => e.name === 'sub')
    expect(sub?.isDir).toBe(true)
    expect(sub?.isSymlink).toBe(false)
  })
  it('probes symlinks: target kind, broken flag', async () => {
    let canSymlink = true
    try {
      await symlink('sub', join(root, 'linkdir'))
      await symlink('missing-target', join(root, 'broken'))
    } catch {
      canSymlink = false
    }
    if (canSymlink) {
      const result = await listDirectorySafe(root)
      if (!result.ok) return
      const linkdir = result.listing.entries.find(e => e.name === 'linkdir')
      const broken = result.listing.entries.find(e => e.name === 'broken')
      expect(linkdir?.isSymlink).toBe(true)
      expect(linkdir?.isDir).toBe(false) // target does not exist yet
      expect(broken?.isSymlink).toBe(true)
      expect(broken?.broken).toBe(true)
    }
  })
  it('truncates past the entry bound', async () => {
    for (let i = 0; i < 5; i += 1) await writeFile(join(root, `f${i}.md`), 'x')
    const result = await listDirectorySafe(root, 2)
    if (!result.ok) return
    expect(result.listing.entries.length).toBe(2)
    expect(result.listing.truncated).toBe(true)
  })
  it('returns NOT_A_DIRECTORY for a file or a missing path', async () => {
    await writeFile(join(root, 'f.md'), 'x')
    const fileResult = await listDirectorySafe(join(root, 'f.md'))
    expect(fileResult).toMatchObject({ ok: false, code: 'NOT_A_DIRECTORY' })
    const missing = await listDirectorySafe(join(root, 'nope'))
    expect(missing).toMatchObject({ ok: false, code: 'NOT_A_DIRECTORY' })
  })
})

describe('compareEntries', () => {
  const entry = (name: string, isDir: boolean) => ({ name, path: name, isDir, hidden: name.startsWith('.'), isSymlink: false, broken: false })
  it('orders dirs first', () => {
    expect(compareEntries(entry('a.md', false), entry('z/', true))).toBeGreaterThan(0)
  })
  it('orders names case-insensitively', () => {
    expect(compareEntries(entry('Beta', false), entry('alpha', false))).toBeGreaterThan(0)
  })
})

describe('isWithin', () => {
  it('accepts containment, equality, mixed separators and Windows case', () => {
    expect(isWithin('/a/b', '/a/b/c')).toBe(true)
    expect(isWithin('/a/b', '/a/b')).toBe(true)
    expect(isWithin('/a/b', '/a/bc')).toBe(false)
    expect(isWithin('C:\\a\\b', 'c:/a/b/d.txt', 'win32')).toBe(true)
    expect(isWithin('C:\\a\\b', 'c:/a/bc/d.txt', 'win32')).toBe(false)
  })
})
