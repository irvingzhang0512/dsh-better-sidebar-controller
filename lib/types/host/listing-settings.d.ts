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
import { type ListingSettings } from '../shared/types.ts';
/**
 * Normalize an untrusted settings blob into the effective listing settings.
 *
 * Used for whatever the browser pushed (already wire-validated) AND for
 * directly reading better-sidebar's `pluginSettings` blob, whose shape is an
 * open map the plugin does not control — hence the fully defensive reads.
 * An ABSENT key falls back to the documented default; a PRESENT value that is
 * not literally `true` counts as OFF (SPEC F009 取值防御).
 */
export declare function resolveListingSettings(raw: unknown): ListingSettings;
/**
 * The per-session listing-settings mirror.
 *
 * A session with no applied settings reports the defaults, so a host with no
 * browser attached keeps listing with the pre-F009 behavior.
 */
export declare class ListingSettingsStore {
    private settings;
    /** Record the settings a session's client last pushed (normalized). */
    apply(sessionId: string, settings: unknown): void;
    /** Effective settings for a session (defaults when nothing was pushed). */
    get(sessionId: string): ListingSettings;
    /** Drop one session's mirror (client detached / teardown). */
    clear(sessionId: string): void;
    /** Drop every mirror. */
    dispose(): void;
}
