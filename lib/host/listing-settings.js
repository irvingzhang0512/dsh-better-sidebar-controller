/**
 * The host half's mirror of the side-card listing settings (SPEC F009).
 *
 * The values themselves belong to better-sidebar's USER settings (a browser
 * document), while the listing runs here on the host — so the client half
 * reads them through the public service snapshot and pushes them over the
 * bridge. This module keeps the last known values per session and, more
 * importantly, owns the DEFENSIVE normalization contract:
 *
 * - a non-number / non-finite `maxListedEntries` falls back to the default 1000;
 * - a number below the minimum is clamped to it;
 * - `includeHiddenEntries` counts as ON only when it is literally `true`
 *   (so `undefined` from an unset settings key means "hidden rows off").
 *
 * Sessions with no mirror (no client ever attached) simply read the defaults,
 * so listing never fails without a browser.
 */
import { LISTING_SETTINGS_DEFAULTS, MAX_LISTED_ENTRIES_MIN } from "../shared/types.js";
/**
 * Normalize an untrusted settings blob into the effective listing settings.
 *
 * Used for whatever the browser pushed (already wire-validated) AND for
 * directly reading better-sidebar's `pluginSettings` blob, whose shape is an
 * open map the plugin does not control — hence the fully defensive reads.
 * An ABSENT key falls back to the documented default; a PRESENT value that is
 * not literally `true` counts as OFF (SPEC F009 取值防御).
 */
export function resolveListingSettings(raw) {
    const record = (raw !== null && typeof raw === 'object' && !Array.isArray(raw))
        ? raw
        : {};
    const bound = record.maxListedEntries;
    const maxListedEntries = typeof bound === 'number' && Number.isFinite(bound)
        ? Math.max(MAX_LISTED_ENTRIES_MIN, Math.floor(bound))
        : LISTING_SETTINGS_DEFAULTS.maxListedEntries;
    return {
        includeHiddenEntries: record.includeHiddenEntries === undefined
            ? LISTING_SETTINGS_DEFAULTS.includeHiddenEntries
            : record.includeHiddenEntries === true,
        maxListedEntries,
    };
}
/**
 * The per-session listing-settings mirror.
 *
 * A session with no applied settings reports the defaults, so a host with no
 * browser attached keeps listing with the pre-F009 behavior.
 */
export class ListingSettingsStore {
    settings = new Map();
    /** Record the settings a session's client last pushed (normalized). */
    apply(sessionId, settings) {
        this.settings.set(sessionId, resolveListingSettings(settings));
    }
    /** Effective settings for a session (defaults when nothing was pushed). */
    get(sessionId) {
        return this.settings.get(sessionId) ?? LISTING_SETTINGS_DEFAULTS;
    }
    /** Drop one session's mirror (client detached / teardown). */
    clear(sessionId) {
        this.settings.delete(sessionId);
    }
    /** Drop every mirror. */
    dispose() {
        this.settings.clear();
    }
}
