import type { ControllerCode } from './types.ts'

export const ANCHOR_ID = 'dsh-better-sidebar-controller:anchor'
export interface AccessState {
  available: boolean
  open: boolean
  control: boolean
  code?: ControllerCode
  message?: string
}
export function allowed(name: string, access: AccessState): boolean {
  if (!access.available) return false
  if (name === 'sync_state') return true
  if (name === 'better_sidebar_open' || name === 'open_file') return access.open
  if (name === 'reopen_previous_file') return access.open && access.control
  return access.control
}
export function accessFromPrefs(raw: unknown): AccessState {
  if (!raw || typeof raw !== 'object') return { available: false, open: false, control: false, code: 'SETTINGS_UNAVAILABLE', message: '无法读取侧边卡片设置。' }
  const prefs = raw as Record<string, unknown>
  const tabs = prefs.tabsEnabled as Record<string, unknown> | undefined
  const pluginSettings = prefs.pluginSettings as Record<string, Record<string, unknown>> | undefined
  const available = prefs.disabled !== true && tabs?.[ANCHOR_ID] !== false
  return { available, open: available && prefs.agentOpenTools === true, control: available && pluginSettings?.[ANCHOR_ID]?.agentControlTools === true }
}
export function refusal(name: string, access: AccessState): { ok: false; code: ControllerCode; message: string } | undefined {
  if (allowed(name, access)) return undefined
  return { ok: false, code: access.available ? 'TOOL_DISABLED' : access.code ?? 'SIDEBAR_UNAVAILABLE', message: access.available ? '对应侧边栏工具开关已关闭，请在设置 → 侧边卡片中开启。' : access.message ?? 'better-sidebar 或控制器扩展不可用。' }
}
