import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { classifyOpenTarget } from '../../src/host/open-target.ts'
describe('enhanced target classification', () => {
  it('supports Chinese relative files, external absolute files, and folder windows', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sidebar-target-'))
    try {
      await mkdir(join(root, 'workspace')); await writeFile(join(root, '外部.md'), 'x'); await writeFile(join(root, 'workspace', '会议.md'), 'x')
      expect(await classifyOpenTarget(join(root, 'workspace'), '会议.md')).toMatchObject({ ok: true, kind: 'file', target: join(root, 'workspace', '会议.md'), title: '会议.md' })
      expect(await classifyOpenTarget(join(root, 'workspace'), join(root, '外部.md'), '资料')).toMatchObject({ ok: true, kind: 'file', title: '资料' })
      expect(await classifyOpenTarget(root, 'workspace')).toMatchObject({ kind: 'folder', target: resolve(root, 'workspace') })
      expect(await classifyOpenTarget(root, 'missing.md')).toMatchObject({ ok: false, code: 'FILE_NOT_FOUND' })
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('accepts only HTTP(S) and never treats a Windows drive as a URL', async () => {
    expect(await classifyOpenTarget('.', 'https://example.com/a?q=中文')).toMatchObject({ ok: true, kind: 'url', title: 'example.com' })
    for (const target of ['', ' ', 'javascript:alert(1)', 'file:///a', 'ftp://host/a', 'https://']) expect((await classifyOpenTarget('.', target)).ok).toBe(false)
    expect(await classifyOpenTarget('.', 'F:/definitely-no-such-sidebar-file.md')).toMatchObject({ code: 'FILE_NOT_FOUND' })
  })
})
