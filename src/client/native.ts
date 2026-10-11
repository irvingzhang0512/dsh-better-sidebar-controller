/** Public native inventory face; no private stores or cross-plugin value imports. */
export interface NativeSidebar {
  mounted: { getSnapshot(): string | undefined; subscribe(listener: () => void): () => void }
  openTabs: { getSnapshot(): readonly NativeTab[]; subscribe(listener: () => void): () => void }
  active(): { id: string; contentId: string; kind: string } | undefined
  isExpanded(): boolean
  toggleExpanded(): void
  focus(id: string): void
  close(id: string): void
  openTab(kind: string, options?: { params?: Record<string, unknown> }): void
}
export interface NativeTab { sessionId: string; tabId: string; contentId: string; kind: string }
/** HTTP stays on the desktop page's forwarding scheme; WebSocket uses the public shell transport. */
export function bridgeUrl(httpRoute: string, streamBaseUrl?: string): URL {
  const url = streamBaseUrl ? new URL('sidebar-controller/ws', `${streamBaseUrl.split(/[?#]/)[0]!.replace(/\/+$/, '')}/`) : new URL(httpRoute)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('desktop 未提供有效的 Host WebSocket 地址。')
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url
}
export function pathKey(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//') ? normalized.toLowerCase() : normalized
}
export function resourcePath(address: string, sessionId: string, cwd?: string): string | undefined {
  if (!address.startsWith('dsh-resource://file/')) return undefined
  try {
    const [scope, ...segments] = address.slice('dsh-resource://file/'.length).split(/[?#]/)[0]!.split('/').map(decodeURIComponent)
    let path: string
    if (scope === 'session') {
      if (segments.shift() !== sessionId) return undefined
      path = segments.join('/')
      if (!path.startsWith('/') && !/^[A-Za-z]:\//.test(path)) {
        if (!cwd) return undefined
        path = `${cwd.replace(/\\/g, '/').replace(/\/+$/, '')}/${path}`
      }
    } else if (scope === 'absolute') {
      path = segments.join('/')
      path = path.startsWith('/') ? `/${path}` : /^[A-Za-z]:\//.test(path) ? path : `/${path}`
    } else return undefined
    return path
  } catch { return undefined }
}
