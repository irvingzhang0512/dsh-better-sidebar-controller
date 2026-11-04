/**
 * Plugin-mount smoke test: mount the host half on a real cordis Context with
 * stubbed services (no browser, no real WebSocket server) and assert the
 * contract surface: the bridge upgrade path is registered, all twelve tools
 * are registered with the documented names, and the bundled SKILL.md is
 * self-registered on `ctx.skills` (installing the plugin installs its skill).
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BRIDGE_PATH, apply, inject, name } from '../src/index.ts'
import { CONTROLLER_TOOL_NAMES } from '../src/host/tools.ts'
import type { SkillRegistration } from '@deepseek-ai/dsh-skill'
import type { UpgradeRoute } from '../src/context-types.ts'

interface ToolDef {
  name: string
}

const fibers: Array<{ dispose: () => Promise<void> }> = []

afterEach(async () => {
  for (const fiber of fibers.splice(0)) {
    await fiber.dispose()
  }
})

async function mount(open = true, control = true) {
  const app = new Context()
  const tools: ToolDef[] = []
  const prefs = { agentOpenTools: open, pluginSettings: { 'dsh-better-sidebar-controller:anchor': { agentControlTools: control } } }
  app.provide('configEditor', { entries: () => [{ options: { id: 'aggregate:sidebar', name: 'dsh-better-sidebar' }, fiber: { state: 2 }, parent: { tree: { ctx: { baseUrl: 'file:///profile/cordis.yml' } } } }] })
  app.provide('pluginPackages', { packageOf: () => ({ version: '0.28.2' }) })
  app.provide('settings', { describe: () => [{ ns: 'aggregate:sidebar', value: prefs }] })
  const routes: UpgradeRoute[] = []
  const registeredSkills: SkillRegistration[] = []
  app.provide('tools', { register: (tool: ToolDef) => { tools.push(tool); return () => { const at = tools.indexOf(tool); if (at >= 0) tools.splice(at, 1) } } })
  app.provide('webServer', { registerUpgrade: (route: UpgradeRoute) => { routes.push(route); return () => {} } })
  app.provide('sessions', { get: () => undefined })
  app.provide('sessionController', { inspect: async () => ({ meta: { cwd: process.cwd() } }) })
  app.provide('connection', { requestRejection: () => undefined })
  app.provide('skills', { register: (skill: SkillRegistration) => { registeredSkills.push(skill); return () => {} } })
  const fiber = app.plugin({ name, apply, inject })
  fibers.push(fiber)
  await fiber
  return { app, tools, routes, registeredSkills, prefs }
}

describe('plugin host mount', () => {
  it.each([[false, false, 0], [true, false, 2], [false, true, 9], [true, true, 12]])('gates tools with open=%s control=%s', async (open, control, count) => {
    const { tools, app } = await mount(Boolean(open), Boolean(control))
    expect(tools).toHaveLength(count as number)
    expect(app.get('sidebarController')).toBeDefined()
  })
  it('dynamically unregisters and registers from persistent settings', async () => {
    const { tools, prefs } = await mount(false, false)
    prefs.agentOpenTools = true
    await vi.waitFor(() => expect(tools.map(t => t.name).sort()).toEqual(['better_sidebar_open', 'open_file']), { timeout: 1500 })
    prefs.pluginSettings['dsh-better-sidebar-controller:anchor'].agentControlTools = true
    await vi.waitFor(() => expect(tools).toHaveLength(12), { timeout: 1500 })
    const retained = tools.find(t => t.name === 'better_sidebar_open') as unknown as { execute(args: object, exec: object): Promise<unknown> }
    prefs.agentOpenTools = false
    expect(await retained.execute({ target: 'https://example.com' }, {})).toMatchObject({ ok: false, code: 'TOOL_DISABLED' })
    await vi.waitFor(() => expect(tools).toHaveLength(9), { timeout: 1500 })
  })
  it('exports the expected identity and bridge path', () => {
    expect(name).toBe('dsh-better-sidebar-controller')
    expect([...inject].sort()).toEqual(['connection', 'sessionController', 'sessions', 'skills', 'tools', 'webServer'])
    expect(BRIDGE_PATH).toBe('/sidebar-controller/ws')
  })
  it('registers all twelve controller tools', async () => {
    const { tools } = await mount()
    const names = tools.map(t => t.name).sort()
    expect(names).toEqual([...CONTROLLER_TOOL_NAMES].sort())
    expect(new Set(names).size).toBe(names.length)
  })
  it('registers the bridge upgrade route', async () => {
    const { routes } = await mount()
    expect(routes.map(r => r.path)).toContain(BRIDGE_PATH)
  })
  it('self-registers the bundled skill on ctx.skills', async () => {
    const { registeredSkills } = await mount()
    await vi.waitFor(() => expect(registeredSkills.length).toBe(1))
    const skill = registeredSkills[0]!
    expect(skill.name).toBe('sidebar-controller')
    expect(skill.description.length).toBeGreaterThan(20)
    expect(skill.content).toContain('`get_sidebar_state`')
    expect(skill.content).toContain('`reopen_previous_file`')
  })
})
