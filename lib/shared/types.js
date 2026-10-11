/**
 * Wire / API vocabulary shared by the host and client halves of
 * dsh-better-sidebar-controller.
 *
 * Everything here is plain JSON-serializable data — the bridge moves it over
 * a WebSocket and tools return it as structured results — so no module here
 * may import Node or browser runtime APIs.
 */
/** Fallback listing settings: current behavior (hidden rows on, bound 1000). */
export const LISTING_SETTINGS_DEFAULTS = {
    includeHiddenEntries: true,
    maxListedEntries: 1000,
};
/** Lower bound of `maxListedEntries` (mirrors the settings row's `min: 1`). */
export const MAX_LISTED_ENTRIES_MIN = 1;
/** Every command name (kept in sync with the union above; used for
 *  validation and for SKILL/docs contract tests). */
export const CONTROLLER_COMMAND_NAMES = [
    'better_sidebar_open',
    'show_sidebar',
    'hide_sidebar',
    'expand_folder',
    'collapse_folder',
    'refresh_tree',
    'open_file',
    'close_file',
    'activate_file',
    'reopen_previous_file',
    'sync_state',
];
