export const ANCHOR_ID = 'dsh-better-sidebar-controller:anchor';
export function allowed(name, access) {
    if (!access.available)
        return false;
    if (name === 'sync_state')
        return true;
    if (name === 'better_sidebar_open' || name === 'open_file')
        return access.open;
    if (name === 'reopen_previous_file')
        return access.open && access.control;
    return access.control;
}
export function accessFromPrefs(raw) {
    if (!raw || typeof raw !== 'object')
        return { available: false, open: false, control: false, code: 'SETTINGS_UNAVAILABLE', message: '无法读取侧边卡片设置。' };
    const prefs = raw;
    const tabs = prefs.tabsEnabled;
    const pluginSettings = prefs.pluginSettings;
    const available = prefs.disabled !== true && tabs?.[ANCHOR_ID] !== false;
    return { available, open: available && prefs.agentOpenTools === true, control: available && pluginSettings?.[ANCHOR_ID]?.agentControlTools === true };
}
export function refusal(name, access) {
    if (allowed(name, access))
        return undefined;
    return { ok: false, code: access.available ? 'TOOL_DISABLED' : access.code ?? 'SIDEBAR_UNAVAILABLE', message: access.available ? '对应侧边栏工具开关已关闭，请在设置 → 侧边卡片中开启。' : access.message ?? 'better-sidebar 或控制器扩展不可用。' };
}
