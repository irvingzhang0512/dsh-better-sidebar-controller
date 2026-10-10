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
  it('filters hidden entries when includeHiddenEntries is false, keeping the hidden flag on the rest', async () => {
    await seed(['.env', '.git/', 'visible.md'])
    const result = await listDirectorySafe(root, { includeHiddenEntries: false })
    if (!result.ok) return
    const names = result.listing.entries.map(e => e.name)
    expect(names).not.toContain('.env')
    expect(names).not.toContain('.git')
    expect(names).toEqual(['visible.md'])
    expect(result.listing.entries.every(e => e.hidden === false)).toBe(true)
  })
  it('still flags hidden entries when they ARE returned', async () => {
    await seed(['.env', 'visible.md'])
    const result = await listDirectorySafe(root, { includeHiddenEntries: true })
    if (!result.ok) return
    expect(result.listing.entries.find(e => e.name === '.env')?.hidden).toBe(true)
  })
  it('filters BEFORE truncating: hidden rows never eat the visible quota', async () => {
    // 3 hidden + 3 visible, bound 2: filtering first means BOTH returned rows
    // are visible (the old order would have spent quota on the hidden rows),
    // and the third visible row makes truncated true. Which two visible rows
    // survive depends on readdir order (the bound applies while streaming,
    // before the sort), so only the count / flags are asserted.
    await seed(['.a', '.b', '.c', 'v1.md', 'v2.md', 'v3.md'])
    const result = await listDirectorySafe(root, { includeHiddenEntries: false, maxListedEntries: 2 })
    if (!result.ok) return
    expect(result.listing.entries).toHaveLength(2)
    expect(result.listing.entries.map(e => e.name).every(name => !name.startsWith('.'))).toBe(true)
    expect(result.listing.truncated).toBe(true)
  })
  it('does not flag truncation when only filtered-out hidden rows remain', async () => {
    // 3 hidden + 2 visible, bound 5: nothing eligible is left over, so the
    // listing is complete even though the directory has 5 rows.
    await seed(['.a', '.b', '.c', 'v1.md', 'v2.md'])
    const result = await listDirectorySafe(root, { includeHiddenEntries: false, maxListedEntries: 5 })
    if (!result.ok) return
    expect(result.listing.entries.map(e => e.name)).toEqual(['v1.md', 'v2.md'])
    expect(result.listing.truncated).toBe(false)
  })
  it('truncates on the visible count when the bound is exceeded without hidden rows', async () => {
    await seed(['.a', 'v1.md', 'v2.md', 'v3.md'])
    const result = await listDirectorySafe(root, { includeHiddenEntries: false, maxListedEntries: 2 })
    if (!result.ok) return
    expect(result.listing.entries).toHaveLength(2)
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
