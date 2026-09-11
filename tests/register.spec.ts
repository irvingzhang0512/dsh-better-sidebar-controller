/**
 * Plugin-mount smoke test: mount the host half on a real cordis Context with
 * stubbed services (no browser, no real WebSocket server) and assert the
 * contract surface: the bridge upgrade path is registered, all eleven tools
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

async function mount() {
  const app = new Context()
  const tools: ToolDef[] = []
  const routes: UpgradeRoute[] = []
  const registeredSkills: SkillRegistration[] = []
  app.provide('tools', { register: (tool: ToolDef) => { tools.push(tool); return () => {} } })
  app.provide('webServer', { registerUpgrade: (route: UpgradeRoute) => { routes.push(route); return () => {} } })
  app.provide('sessions', { get: () => undefined })
  app.provide('webRuntime', { trustedHosts: [] })
  app.provide('skills', { register: (skill: SkillRegistration) => { registeredSkills.push(skill); return () => {} } })
  const fiber = app.plugin({ name, apply, inject })
  fibers.push(fiber)
  await fiber
  return { app, tools, routes, registeredSkills }
}

describe('plugin host mount', () => {
  it('exports the expected identity and bridge path', () => {
    expect(name).toBe('dsh-better-sidebar-controller')
    expect(inject.sort()).toEqual(['sessions', 'skills', 'tools', 'webRuntime', 'webServer'])
    expect(BRIDGE_PATH).toBe('/sidebar-controller/ws')
  })
  it('registers all eleven controller tools', async () => {
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
