import { LISTING_SETTINGS_DEFAULTS, MAX_LISTED_ENTRIES_MIN } from "./types.js";
/** One effective-value normalizer shared by host reads and the settings UI. */
export function resolveListingSettings(raw) {
    const record = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const bound = record.maxListedEntries;
    return {
        includeHiddenEntries: record.includeHiddenEntries === undefined ? LISTING_SETTINGS_DEFAULTS.includeHiddenEntries : record.includeHiddenEntries === true,
        maxListedEntries: typeof bound === 'number' && Number.isFinite(bound) ? Math.max(MAX_LISTED_ENTRIES_MIN, Math.floor(bound)) : LISTING_SETTINGS_DEFAULTS.maxListedEntries,
    };
}
