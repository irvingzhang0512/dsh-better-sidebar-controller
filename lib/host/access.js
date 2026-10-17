import { accessFromPrefs, ANCHOR_ID } from "../shared/access.js";
import { resolveListingSettings } from "./listing-settings.js";
/** Read the active upstream row, including aggregate bundle entry IDs. No client value authorizes tools. */
export function readSidebarAccess(source) {
    const unavailable = (code, message) => ({ available: false, open: false, control: false, code, message, listing: resolveListingSettings(undefined) });
    if (!source)
        return unavailable('SETTINGS_UNAVAILABLE', '侧边卡片设置服务尚未就绪。');
    try {
        // Cordis FiberState.ACTIVE is an ambient const enum (2), erased by its build.
        const entries = [...source.entries()].filter(e => e.options.name === 'dsh-better-sidebar' && e.disabled !== true && e.fiber?.state === 2);
        if (entries.length !== 1 || !entries[0]?.options.id)
            return unavailable('SIDEBAR_UNAVAILABLE', '需要一个实际启用的兼容 better-sidebar 实例。');
        const version = source.versionOf(entries[0]);
        if (version !== '0.28.0')
            return unavailable('SIDEBAR_UNAVAILABLE', '无法确认兼容的 better-sidebar 0.28.0；增强工具暂不可用。');
        const views = source.describe();
        const value = views.find(d => d.ns === entries[0].options.id)?.value;
        if (!value || typeof value !== 'object')
            return unavailable('SETTINGS_UNAVAILABLE', '无法读取启用的 better-sidebar 持久设置。');
        const prefs = value;
        if (prefs.disabled === true || views.some(d => d.ns === 'aionui-panel' && d.value?.rightPanel === 'aionui-panel'))
            return unavailable('SIDEBAR_UNAVAILABLE', 'better-sidebar 界面已停用。');
        const access = accessFromPrefs(prefs);
        const blobs = prefs.pluginSettings;
        return { ...access, listing: resolveListingSettings(blobs?.[ANCHOR_ID]) };
    }
    catch {
        return unavailable('SETTINGS_UNAVAILABLE', '无法读取权威侧边卡片设置，工具暂时停用。');
    }
}
