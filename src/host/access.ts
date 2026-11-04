import { accessFromPrefs, ANCHOR_ID, type AccessState } from '../shared/access.ts'
import { resolveListingSettings } from './listing-settings.ts'

export interface SidebarEntry {
  options: { id?: string; name?: string }
  disabled?: boolean
  fiber?: { state: number; config?: unknown }
  parent?: { tree: { ctx: { baseUrl?: string } } }
}
export interface AccessSource {
  entries(): Iterable<SidebarEntry>
  describe(): Array<{ ns: string; value: unknown }>
  versionOf(entry: SidebarEntry): string | undefined
}
/** Read the active upstream row, including aggregate bundle entry IDs. No client value authorizes tools. */
export function readSidebarAccess(source: AccessSource | undefined): AccessState & { listing: ReturnType<typeof resolveListingSettings> } {
  const unavailable = (code: AccessState['code'], message: string) => ({ available: false, open: false, control: false, code, message, listing: resolveListingSettings(undefined) })
  if (!source) return unavailable('SETTINGS_UNAVAILABLE', '侧边卡片设置服务尚未就绪。')
  try {
    // Cordis FiberState.ACTIVE is an ambient const enum (2), erased by its build.
    const entries = [...source.entries()].filter(e => e.options.name === 'dsh-better-sidebar' && e.disabled !== true && e.fiber?.state === 2)
    if (entries.length !== 1 || !entries[0]?.options.id) return unavailable('SIDEBAR_UNAVAILABLE', '需要一个实际启用的兼容 better-sidebar 实例。')
    const version = source.versionOf(entries[0])
    if (version !== '0.28.2') return unavailable('SIDEBAR_UNAVAILABLE', '无法确认兼容的 better-sidebar 0.28.2；增强工具暂不可用。')
    const views = source.describe()
    const value = views.find(d => d.ns === entries[0]!.options.id)?.value
    if (!value || typeof value !== 'object') return unavailable('SETTINGS_UNAVAILABLE', '无法读取启用的 better-sidebar 持久设置。')
    const prefs = value as Record<string, unknown>
    if (prefs.disabled === true || views.some(d => d.ns === 'aionui-panel' && (d.value as { rightPanel?: string } | null)?.rightPanel === 'aionui-panel')) return unavailable('SIDEBAR_UNAVAILABLE', 'better-sidebar 界面已停用。')
    const access = accessFromPrefs(prefs)
    const blobs = prefs.pluginSettings as Record<string, unknown> | undefined
    return { ...access, listing: resolveListingSettings(blobs?.[ANCHOR_ID]) }
  } catch {
    return unavailable('SETTINGS_UNAVAILABLE', '无法读取权威侧边卡片设置，工具暂时停用。')
  }
}
