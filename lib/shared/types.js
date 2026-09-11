/**
 * Wire / API vocabulary shared by the host and client halves of
 * dsh-better-sidebar-controller.
 *
 * Everything here is plain JSON-serializable data — the bridge moves it over
 * a WebSocket and tools return it as structured results — so no module here
 * may import Node or browser runtime APIs.
 */
/** Every command name (kept in sync with the union above; used for
 *  validation and for SKILL/docs contract tests). */
export const CONTROLLER_COMMAND_NAMES = [
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
