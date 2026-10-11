import { describe, expect, it } from 'vitest'
import { bridgeUrl, resourcePath, pathKey } from '../../src/client/native.ts'
describe('native desktop transport and addresses', () => {
  it('uses HTTP injection for desktop WebSocket and preserves proxy prefixes', () => {
    expect(bridgeUrl('dsh-app://app/sidebar-controller/ws', 'http://127.0.0.1:19387').href).toBe('ws://127.0.0.1:19387/sidebar-controller/ws')
    expect(bridgeUrl('https://host/prefix/sidebar-controller/ws').href).toBe('wss://host/prefix/sidebar-controller/ws')
    expect(bridgeUrl('dsh-app://app/sidebar-controller/ws', 'https://host/prefix/?token=test').href).toBe('wss://host/prefix/sidebar-controller/ws')
  })
  it('decodes session, absolute and Chinese resources without confusing other sessions', () => {
    expect(resourcePath('dsh-resource://file/session/a/docs/%E4%BC%9A%E8%AE%AE.md', 'a', 'F:/workspace')).toBe('F:/workspace/docs/会议.md')
    expect(resourcePath('dsh-resource://file/session/a/F:/outside/a.md', 'a')).toBe('F:/outside/a.md')
    expect(resourcePath('dsh-resource://file/absolute/home/a.md', 'a')).toBe('/home/a.md')
    expect(resourcePath('dsh-resource://file/absolute//server/share/a.md', 'a')).toBe('//server/share/a.md')
    expect(resourcePath('dsh-resource://file/session/b/a.md', 'a', '/root')).toBeUndefined()
    expect(pathKey('F:\\资料\\A.md')).toBe(pathKey('f:/资料/a.md'))
  })
})
