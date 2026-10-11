import { describe, expect, it } from 'vitest'
import { BridgeServer } from '../../src/host/bridge-server.ts'
import { ControllerStateStore } from '../../src/host/controller-state.ts'
import { refusal } from '../../src/shared/access.ts'
describe('queue authorization and isolation', () => {
  const setup = () => {
    const access = { available: true, open: true, control: true }
    const bridge = new BridgeServer({ store: new ControllerStateStore(), resolveWorkspaceRoot: async () => '/w', authorize: name => refusal(name, access) })
    return { access, bridge }
  }
  it('reports the 65th command as QUEUE_FULL without losing the first 64', async () => {
    const { bridge } = setup()
    for (let n = 0; n < 64; n++) expect((await bridge.dispatch('a', { name: 'open_file', path: `/w/${n}` })).queued).toBe(true)
    expect(await bridge.dispatch('a', { name: 'hide_sidebar' })).toMatchObject({ queued: false, error: { code: 'QUEUE_FULL' } })
    const sent: string[] = []; bridge.attach('a', msg => sent.push(msg)); bridge.handleClientMessage('a', { type: 'hello', sessionId: 'a' })
    expect(sent).toHaveLength(64); bridge.dispose()
  })
  it('prunes only revoked capabilities and rechecks at replay', async () => {
    const { access, bridge } = setup()
    await bridge.dispatch('a', { name: 'open_file', path: '/w/a' }); await bridge.dispatch('a', { name: 'hide_sidebar' })
    access.open = false; bridge.prune(); access.open = true
    const sent: string[] = []; bridge.attach('a', msg => sent.push(msg)); access.control = false
    bridge.handleClientMessage('a', { type: 'hello', sessionId: 'a' }); expect(sent).toHaveLength(0)
    expect(await bridge.dispatch('a', { name: 'hide_sidebar' })).toMatchObject({ error: { code: 'TOOL_DISABLED' }, queued: false }); bridge.dispose()
  })
  it('does not accept a different session hello or acknowledgment', async () => {
    const { bridge } = setup()
    await bridge.dispatch('a', { name: 'hide_sidebar' })
    const sent: string[] = []; bridge.attach('b', msg => sent.push(msg)); bridge.handleClientMessage('b', { type: 'hello', sessionId: 'a' }); expect(sent).toHaveLength(0)
    bridge.attach('a', msg => sent.push(msg)); const pending = bridge.dispatch('a', { name: 'show_sidebar' }, 20)
    const id = JSON.parse(sent[0]!).id
    bridge.handleClientMessage('b', { type: 'command-result', result: { id, ok: true, code: 'OK' } }); expect((await pending).ack).toBeNull(); bridge.dispose()
  })
  it('does not queue with unavailable dependency', async () => {
    const { access, bridge } = setup(); access.available = false
    expect(await bridge.dispatch('a', { name: 'open_file', path: '/w/a' })).toMatchObject({ queued: false, error: { code: 'SIDEBAR_UNAVAILABLE' } }); bridge.dispose()
  })
})
