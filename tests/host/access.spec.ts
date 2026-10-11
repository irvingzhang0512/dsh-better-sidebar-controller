import { describe, expect, it } from 'vitest'
import { readSidebarAccess } from '../../src/host/access.ts'
import { ANCHOR_ID, refusal } from '../../src/shared/access.ts'
describe('authoritative upstream access', () => {
  const row = { options: { id: 'bundle:actual-upstream', name: 'dsh-better-sidebar' }, fiber: { state: 2 } }
  const prefs = { agentOpenTools: true, pluginSettings: { [ANCHOR_ID]: { agentControlTools: true, includeHiddenEntries: false, maxListedEntries: 5, future: 'keep' } } }
  const source = (entries = [row], value: unknown = prefs) => ({ entries: () => entries, describe: () => [{ ns: row.options.id, value }], versionOf: () => '0.25.0' })
  it('reads the actual active loader id and preserves unknown config', () => {
    expect(readSidebarAccess(source())).toMatchObject({ available: true, open: true, control: true, listing: { includeHiddenEntries: false, maxListedEntries: 5 } })
    expect(prefs.pluginSettings[ANCHOR_ID].future).toBe('keep')
  })
  it('fails closed without the dependency, active fiber, settings, or unique row', () => {
    for (const input of [undefined, source([]), source([{ ...row, fiber: { state: 0 } }]), source([row, row]), source([row], null), source([row], { disabled: true })]) expect(readSidebarAccess(input).available).toBe(false)
  })
  it('does not fall back to a hardcoded namespace', () => {
    expect(readSidebarAccess({ ...source(), describe: () => [{ ns: 'better-sidebar', value: prefs }] }).available).toBe(false)
  })
  it('rejects missing or incompatible package versions even with an active row', () => {
    for (const version of [undefined, '0.19.1', '0.26.0', '0.25.0-beta.1']) expect(readSidebarAccess({ ...source(), versionOf: () => version }).available).toBe(false)
  })
  it('both tool switches off keep sync_state available', () => {
    const access = readSidebarAccess(source([row], {}))
    expect(refusal('sync_state', access)).toBeUndefined()
    expect(refusal('open_file', access)?.code).toBe('TOOL_DISABLED')
  })
})
