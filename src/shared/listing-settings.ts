import { LISTING_SETTINGS_DEFAULTS, MAX_LISTED_ENTRIES_MIN, type ListingSettings } from './types.ts'

/** One effective-value normalizer shared by host reads and the settings UI. */
export function resolveListingSettings(raw: unknown): ListingSettings {
  const record = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const bound = record.maxListedEntries
  return {
    includeHiddenEntries: record.includeHiddenEntries === undefined ? LISTING_SETTINGS_DEFAULTS.includeHiddenEntries : record.includeHiddenEntries === true,
    maxListedEntries: typeof bound === 'number' && Number.isFinite(bound) ? Math.max(MAX_LISTED_ENTRIES_MIN, Math.floor(bound)) : LISTING_SETTINGS_DEFAULTS.maxListedEntries,
  }
}
