/**
 * Wire / API vocabulary shared by the host and client halves of
 * dsh-better-sidebar-controller.
 *
 * Everything here is plain JSON-serializable data — the bridge moves it over
 * a WebSocket and tools return it as structured results — so no module here
 * may import Node or browser runtime APIs.
 */

/** Stable status / error codes returned inside tool results. */
export type ControllerCode =
  | 'OK'
  | 'QUEUED'
  | 'BRIDGE_NOT_CONNECTED'
  | 'BRIDGE_TIMEOUT'
  | 'SIDEBAR_UNAVAILABLE'
  | 'NO_AGENT'
  | 'NO_SESSION'
  | 'INVALID_PATH'
  | 'PATH_OUTSIDE_WORKSPACE'
  | 'FILE_NOT_FOUND'
  | 'FS_ERROR'
  | 'NOT_A_DIRECTORY'
  | 'NOT_A_FILE'
  | 'FILE_NOT_OPEN'
  | 'NO_CURRENT_FILE'
  | 'NO_PREVIOUS_FILE'
  | 'UNKNOWN_COMMAND'
  | 'INTERNAL_ERROR'

/**
 * The per-session controller state mirror (what `get_sidebar_state` reports
 * and what every natural-language operation leans on).
 */
export interface ControllerState {
  /** The session this state belongs to. */
  sessionId: string
  /** Whether the right sidebar panel is currently shown. */
  sidebarVisible: boolean
  /** The file the user/agent is currently working on (null when none). */
  currentFile: string | null
  /** The file that was current before `currentFile` (for “回到刚才那个文件”). */
  previousFile: string | null
  /** All currently open files (editor tabs with a path, deduplicated). */
  openedFiles: string[]
  /** Directories currently expanded in the file tree (absolute paths). */
  expandedFolders: string[]
  /** The session workspace root (its cwd). */
  workspaceRoot: string | null
  /** Whether the sidebar client is currently attached for this session. */
  connected: boolean
  /** Epoch ms of the last state update. */
  updatedAt: number
}

/** State pushed by the client (no host bookkeeping, unlike {@link ControllerState}). */
export interface SidebarStateWire {
  sessionId: string
  sidebarVisible: boolean
  currentFile: string | null
  previousFile: string | null
  openedFiles: string[]
  expandedFolders: string[]
  updatedAt: number
}

/**
 * One command the host sends to the client. Every command is small and
 * purpose-specific — there is deliberately no catch-all `workspace(action)`
 * tool.
 */
export type ControllerCommand =
  | { name: 'show_sidebar' }
  | { name: 'hide_sidebar' }
  | { name: 'expand_folder'; path: string }
  | { name: 'collapse_folder'; path: string }
  | { name: 'refresh_tree' }
  | { name: 'open_file'; path: string; title?: string }
  | { name: 'close_file'; path?: string }
  | { name: 'activate_file'; path: string }
  | { name: 'reopen_previous_file' }
  /** Internal: ask the client to re-push its current state (used by
   *  `get_sidebar_state` to force a fresh mirror before answering). */
  | { name: 'sync_state' }

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
] as const

/** Acknowledgment the client returns for exactly one dispatched command. */
export interface CommandAck {
  /** The command id this ack answers. */
  id: string
  ok: boolean
  code?: string
  message?: string
  /** Tool-specific data (the new state etc.), JSON-serializable. */
  value?: Record<string, unknown>
}

/** Client → host wire messages. */
export type ClientToHostMessage =
  | { type: 'hello'; sessionId: string }
  | { type: 'state'; state: SidebarStateWire }
  | { type: 'command-result'; result: CommandAck }

/** Host → client wire messages. */
export type HostToClientMessage =
  | { type: 'command'; id: string; command: ControllerCommand }

/**
 * Result of trying to deliver one command to a session's sidebar client.
 *
 * - `delivered` — a client was attached and received the command;
 * - `queued` — no client was attached, so the command was queued and will be
 *   replayed the next time that session's sidebar attaches (mirror of
 *   better-sidebar's `sidebar_open` consume-on-send + replay semantics);
 * - `ack` — the client's acknowledgment (null on queue, or when the ack did
 *   not arrive within the wait budget).
 */
export interface DispatchOutcome {
  delivered: boolean
  queued: boolean
  ack: CommandAck | null
}
