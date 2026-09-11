/**
 * Tool contract tests: every controller tool returns the structured
 * envelope with explicit codes, respects session scoping, path fencing, and
 * queue semantics. Tools are executed directly against stub dependencies
 * (no browser, no WebSocket).
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { registerControllerTools, type ControllerDeps } from '../../src/host/tools.ts'
import { ControllerStateStore } from '../../src/host/controller-state.ts'
import { listDirectorySafe } from '../../src/host/fs-tree.ts'
import { pathKind, resolveLexicalTarget, resolveWorkspaceTarget } from '../../src/host/paths.ts'
import type { CommandAck, ControllerCommand, DispatchOutcome } from '../../src/shared/types.ts'

const SID = 's-1'

interface RegisteredTool {
  name: string
  execute: (args: Record<string, unknown>, exec: ToolRunContext) => Promise<unknown>
}

class FakeBridge {
  sent: Array<{ id: string; command: ControllerCommand }> = []
  attached = new Map<string, number>()
  ackBehavior: (command: ControllerCommand) => CommandAck | null = () => ({ id: '', ok: true, code: 'OK' })
  timeout = false

  isAttached(sessionId: string): boolean {
    return (this.attached.get(sessionId) ?? 0) > 0
  }

  async dispatch(sessionId: string, command: ControllerCommand): Promise<DispatchOutcome> {
    this.sent.push({ id: `id-${this.sent.length + 1}`, command })
    if (!this.isAttached(sessionId)) return { delivered: false, queued: true, ack: null }
    if (this.timeout) return { delivered: true, queued: false, ack: null }
    const ack = this.ackBehavior(command)
    return { delivered: true, queued: false, ack: ack === null ? null : { ...ack, id: `id-${this.sent.length}` } }
  }
}

function makeHarness(bridge = new FakeBridge(), cwd: string | null = root) {
  const store = new ControllerStateStore()
  const tools = new Map<string, RegisteredTool>()
  const deps: ControllerDeps = {
    getCwd: async () => cwd,
    store,
    bridge,
    resolveTarget: resolveWorkspaceTarget,
    resolveLexical: resolveLexicalTarget,
    pathKind,
    listDirectory: listDirectorySafe,
  }
  registerControllerTools(
    { tools: { register: (tool) => { const t = tool as RegisteredTool; tools.set(t.name, t); return () => {} } } },
    deps,
  )
  const run = async (name: string, args: Record<string, unknown> = {}, sessionId: string | null = SID): Promise<Record<string, unknown>> => {
    const tool = tools.get(name)
    if (tool === undefined) throw new Error(`tool ${name} not registered`)
    const exec = { signal: new AbortController().signal } as unknown as ToolRunContext
    if (sessionId !== null) {
      ;(exec as { agent?: { session?: { id: string } } }).agent = { session: { id: sessionId } }
    }
    const result = await tool.execute(args, exec)
    return result as Record<string, unknown>
  }
  return { store, tools, run, bridge }
}

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-ctrl-tools-'))
  await mkdir(join(root, 'docs'), { recursive: true })
  await writeFile(join(root, 'a.md'), 'a')
  await writeFile(join(root, 'docs', 'b.md'), 'b')
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('registration', () => {
  it('registers exactly the eleven documented tools, all named uniquely', () => {
    const { tools } = makeHarness()
    const names = [...tools.keys()].sort()
    expect(names).toEqual([
      'activate_file',
      'close_file',
      'collapse_folder',
      'expand_folder',
      'get_sidebar_state',
      'hide_sidebar',
      'list_files',
      'open_file',
      'refresh_tree',
      'reopen_previous_file',
      'show_sidebar',
    ])
  })
})

describe('session scoping', () => {
  it('rejects calls without an agent session', async () => {
    const { run } = makeHarness()
    const result = await run('get_sidebar_state', {}, null)
    expect(result).toMatchObject({ ok: false, code: 'NO_AGENT' })
  })
  it('rejects calls when the session cwd cannot be resolved', async () => {
    const { run } = makeHarness(new FakeBridge(), null)
    const result = await run('list_files', {})
    expect(result).toMatchObject({ ok: false, code: 'NO_SESSION' })
  })
})

describe('get_sidebar_state', () => {
  it('reports SIDEBAR_UNAVAILABLE before the first sync', async () => {
    const { run } = makeHarness()
    const result = await run('get_sidebar_state')
    expect(result).toMatchObject({ ok: false, code: 'SIDEBAR_UNAVAILABLE', connected: false, state: null })
  })
  it('reports the mirror state when synced', async () => {
    const { store, run } = makeHarness()
    store.apply(SID, {
      sessionId: SID,
      sidebarVisible: true,
      currentFile: join(root, 'a.md'),
      previousFile: null,
      openedFiles: [join(root, 'a.md')],
      expandedFolders: [join(root, 'docs')],
      updatedAt: 7,
    }, root, 7)
    const result = await run('get_sidebar_state')
    expect(result.ok).toBe(true)
    expect(result.code).toBe('OK')
    const state = result.state as Record<string, unknown>
    expect(state.currentFile).toBe(join(root, 'a.md'))
    expect(state.openedFiles).toEqual([join(root, 'a.md')])
    expect(state.expandedFolders).toEqual([join(root, 'docs')])
    expect(state.workspaceRoot).toBe(root)
    expect(result.connected).toBe(true)
  })
  it('asks the attached client to re-sync before answering', async () => {
    const bridge = new FakeBridge()
    bridge.attached.set(SID, 1)
    const { run } = makeHarness(bridge)
    await run('get_sidebar_state')
    expect(bridge.sent.some(m => m.command.name === 'sync_state')).toBe(true)
  })
})

describe('show_sidebar / hide_sidebar', () => {
  it('returns OK with the new visibility when acked', async () => {
    const bridge = new FakeBridge()
    bridge.attached.set(SID, 1)
    const { run } = makeHarness(bridge)
    const shown = await run('show_sidebar')
    expect(shown).toMatchObject({ ok: true, code: 'OK', delivered: true, queued: false, sidebarVisible: true })
    const hidden = await run('hide_sidebar')
    expect(hidden).toMatchObject({ ok: true, code: 'OK', sidebarVisible: false })
  })
  it('returns QUEUED when the sidebar is not attached', async () => {
    const { run } = makeHarness()
    const result = await run('show_sidebar')
    expect(result).toMatchObject({ ok: true, code: 'QUEUED', delivered: false, queued: true, sidebarVisible: true })
  })
  it('returns BRIDGE_TIMEOUT when no ack arrives', async () => {
    const bridge = new FakeBridge()
    bridge.attached.set(SID, 1)
    bridge.timeout = true
    const { run } = makeHarness(bridge)
    const result = await run('hide_sidebar')
    expect(result).toMatchObject({ ok: false, code: 'BRIDGE_TIMEOUT' })
  })
  it('surfaces a client failure ack', async () => {
    const bridge = new FakeBridge()
    bridge.attached.set(SID, 1)
    bridge.ackBehavior = () => ({ id: '', ok: false, code: 'INTERNAL_ERROR', message: 'boom' })
    const { run } = makeHarness(bridge)
    const result = await run('show_sidebar')
    expect(result).toMatchObject({ ok: false, code: 'INTERNAL_ERROR', message: 'boom' })
  })
})

describe('list_files', () => {
  it('lists the workspace root when path is omitted', async () => {
    const { run } = makeHarness()
    const result = await run('list_files')
    expect(result.ok).toBe(true)
    const entries = result.entries as Array<Record<string, unknown>>
    expect(entries.map(e => e.name)).toEqual(expect.arrayContaining(['a.md', 'docs']))
    expect(result.path).toBe(root)
  })
  it('lists a relative subdirectory', async () => {
    const { run } = makeHarness()
    const result = await run('list_files', { path: 'docs' })
    expect(result.ok).toBe(true)
    const entries = result.entries as Array<Record<string, unknown>>
    expect(entries).toEqual([expect.objectContaining({ name: 'b.md', isDir: false })])
  })
  it('rejects a nonexistent target with FILE_NOT_FOUND', async () => {
    const { run } = makeHarness()
    const result = await run('list_files', { path: 'nope' })
    expect(result).toMatchObject({ ok: false, code: 'FILE_NOT_FOUND' })
  })
  it('rejects a file target with NOT_A_DIRECTORY', async () => {
    const { run } = makeHarness()
    const result = await run('list_files', { path: 'a.md' })
    expect(result).toMatchObject({ ok: false, code: 'NOT_A_DIRECTORY' })
  })
  it('rejects a path outside the workspace', async () => {
    const { run } = makeHarness()
    const result = await run('list_files', { path: '..' })
    expect(result).toMatchObject({ ok: false, code: 'PATH_OUTSIDE_WORKSPACE' })
  })
})

describe('expand_folder / collapse_folder', () => {
  it('dispatches expand_folder with the canonical path', async () => {
    const bridge = new FakeBridge()
    bridge.attached.set(SID, 1)
    const { run } = makeHarness(bridge)
    const result = await run('expand_folder', { path: 'docs' })
    expect(result).toMatchObject({ ok: true, code: 'OK', path: join(root, 'docs'), expanded: true, delivered: true })
    expect(bridge.sent.at(-1)?.command).toEqual({ name: 'expand_folder', path: join(root, 'docs') })
  })
  it('dispatches collapse_folder and queues when unattached', async () => {
    const { run, bridge } = makeHarness()
    const result = await run('collapse_folder', { path: 'docs' })
    expect(result).toMatchObject({ ok: true, code: 'QUEUED', queued: true })
    expect(bridge.sent.at(-1)?.command).toEqual({ name: 'collapse_folder', path: join(root, 'docs') })
  })
  it('rejects a file target with NOT_A_DIRECTORY', async () => {
    const { run } = makeHarness()
    const result = await run('expand_folder', { path: 'a.md' })
    expect(result).toMatchObject({ ok: false, code: 'NOT_A_DIRECTORY' })
  })
  it('requires the path argument (pipeline validation)', async () => {
    const { run } = makeHarness()
    await expect(run('expand_folder', {})).rejects.toThrow(/path/i)
  })
})

describe('refresh_tree', () => {
  it('dispatches refresh_tree and re-lists the root', async () => {
    const bridge = new FakeBridge()
    bridge.attached.set(SID, 1)
    const { run } = makeHarness(bridge)
    const result = await run('refresh_tree')
    expect(result).toMatchObject({ ok: true, code: 'OK', rootPath: root, delivered: true })
    expect(bridge.sent.at(-1)?.command).toEqual({ name: 'refresh_tree' })
    const entries = result.entries as Array<Record<string, unknown>>
    expect(entries.map(e => e.name)).toEqual(expect.arrayContaining(['a.md', 'docs']))
  })
})

describe('open_file', () => {
  it('dispatches open_file with the canonical path', async () => {
    const bridge = new FakeBridge()
    bridge.attached.set(SID, 1)
    const { run } = makeHarness(bridge)
    const result = await run('open_file', { path: 'docs/b.md' })
    expect(result).toMatchObject({ ok: true, code: 'OK', path: join(root, 'docs', 'b.md') })
    expect(bridge.sent.at(-1)?.command).toEqual({ name: 'open_file', path: join(root, 'docs', 'b.md') })
  })
  it('accepts an absolute path', async () => {
    const { run } = makeHarness()
    const result = await run('open_file', { path: join(root, 'a.md') })
    expect(result).toMatchObject({ ok: true, code: 'QUEUED' })
  })
  it('rejects a directory target with NOT_A_FILE', async () => {
    const { run } = makeHarness()
    const result = await run('open_file', { path: 'docs' })
    expect(result).toMatchObject({ ok: false, code: 'NOT_A_FILE' })
  })
  it('rejects a nonexistent file', async () => {
    const { run } = makeHarness()
    const result = await run('open_file', { path: 'missing.md' })
    expect(result).toMatchObject({ ok: false, code: 'FILE_NOT_FOUND' })
  })
})

describe('close_file', () => {
  it('uses the supplied path (lexical, existence not required)', async () => {
    const bridge = new FakeBridge()
    bridge.attached.set(SID, 1)
    const { run } = makeHarness(bridge)
    const result = await run('close_file', { path: 'deleted.md' })
    expect(result).toMatchObject({ ok: true, code: 'OK', path: join(root, 'deleted.md') })
    expect(bridge.sent.at(-1)?.command).toEqual({ name: 'close_file', path: join(root, 'deleted.md') })
  })
  it('defaults to the current file from the mirror', async () => {
    const bridge = new FakeBridge()
    bridge.attached.set(SID, 1)
    const harness = makeHarness(bridge)
    harness.store.apply(SID, {
      sessionId: SID, sidebarVisible: true, currentFile: join(root, 'a.md'), previousFile: null,
      openedFiles: [join(root, 'a.md')], expandedFolders: [], updatedAt: 1,
    }, root, 1)
    const result = await harness.run('close_file', {})
    expect(result).toMatchObject({ ok: true, path: join(root, 'a.md') })
  })
  it('reports NO_CURRENT_FILE when neither path nor current file exists', async () => {
    const { run } = makeHarness()
    const result = await run('close_file', {})
    expect(result).toMatchObject({ ok: false, code: 'NO_CURRENT_FILE' })
  })
  it('fences the path against the workspace', async () => {
    const { run } = makeHarness()
    const result = await run('close_file', { path: '..\\x.md' })
    expect(result).toMatchObject({ ok: false, code: 'PATH_OUTSIDE_WORKSPACE' })
  })
})

describe('activate_file', () => {
  it('dispatches activate_file', async () => {
    const bridge = new FakeBridge()
    bridge.attached.set(SID, 1)
    const { run } = makeHarness(bridge)
    const result = await run('activate_file', { path: 'a.md' })
    expect(result).toMatchObject({ ok: true, code: 'OK', path: join(root, 'a.md') })
    expect(bridge.sent.at(-1)?.command).toEqual({ name: 'activate_file', path: join(root, 'a.md') })
  })
  it('fences the path', async () => {
    const { run } = makeHarness()
    const result = await run('activate_file', { path: '../x.md' })
    expect(result).toMatchObject({ ok: false, code: 'PATH_OUTSIDE_WORKSPACE' })
  })
})

describe('reopen_previous_file', () => {
  it('dispatches open_file with the previous file', async () => {
    const bridge = new FakeBridge()
    bridge.attached.set(SID, 1)
    const harness = makeHarness(bridge)
    harness.store.apply(SID, {
      sessionId: SID, sidebarVisible: true, currentFile: join(root, 'b.md'), previousFile: join(root, 'a.md'),
      openedFiles: [], expandedFolders: [], updatedAt: 1,
    }, root, 1)
    const result = await harness.run('reopen_previous_file')
    expect(result).toMatchObject({ ok: true, code: 'OK', path: join(root, 'a.md') })
    expect(bridge.sent.at(-1)?.command).toEqual({ name: 'open_file', path: join(root, 'a.md') })
  })
  it('reports NO_PREVIOUS_FILE without one', async () => {
    const { run } = makeHarness()
    const result = await run('reopen_previous_file')
    expect(result).toMatchObject({ ok: false, code: 'NO_PREVIOUS_FILE' })
  })
})
