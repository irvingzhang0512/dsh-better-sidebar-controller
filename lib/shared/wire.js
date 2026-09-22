import { CONTROLLER_COMMAND_NAMES } from "./types.js";
/** Thrown when a wire message fails validation. */
export class WireError extends Error {
    constructor(message) {
        super(message);
        this.name = 'WireError';
    }
}
function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function requireString(record, key) {
    const value = record[key];
    if (typeof value !== 'string')
        throw new WireError(`missing or invalid "${key}"`);
    return value;
}
function requireBool(record, key) {
    const value = record[key];
    if (typeof value !== 'boolean')
        throw new WireError(`missing or invalid "${key}"`);
    return value;
}
/** Validate one command name + payload (the shape of {@link ControllerCommand}). */
export function parseCommand(raw) {
    if (!isRecord(raw) || typeof raw.name !== 'string')
        throw new WireError('invalid command');
    const name = raw.name;
    if (!CONTROLLER_COMMAND_NAMES.includes(name)) {
        throw new WireError(`unknown command "${name}"`);
    }
    switch (name) {
        case 'show_sidebar':
        case 'hide_sidebar':
        case 'refresh_tree':
        case 'reopen_previous_file':
        case 'sync_state':
            return { name };
        case 'expand_folder':
        case 'collapse_folder':
        case 'open_file':
        case 'activate_file': {
            const path = requireString(raw, 'path');
            if (name === 'open_file') {
                const title = typeof raw.title === 'string' && raw.title !== '' ? raw.title : undefined;
                return { name, path, ...(title !== undefined ? { title } : {}) };
            }
            return { name, path };
        }
        case 'close_file': {
            const path = typeof raw.path === 'string' && raw.path !== '' ? raw.path : undefined;
            return { name, ...(path !== undefined ? { path } : {}) };
        }
        default:
            throw new WireError(`unknown command "${name}"`);
    }
}
/** Decode a client→host message from its JSON text. */
export function parseClientMessage(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        throw new WireError('invalid JSON');
    }
    if (!isRecord(parsed) || typeof parsed.type !== 'string')
        throw new WireError('invalid message envelope');
    switch (parsed.type) {
        case 'hello': {
            const sessionId = requireString(parsed, 'sessionId');
            if (sessionId === '')
                throw new WireError('empty sessionId');
            return { type: 'hello', sessionId };
        }
        case 'state': {
            const state = parsed.state;
            if (!isRecord(state))
                throw new WireError('invalid state payload');
            const sessionId = requireString(state, 'sessionId');
            const wire = {
                sessionId,
                sidebarVisible: requireBool(state, 'sidebarVisible'),
                currentFile: typeof state.currentFile === 'string' ? state.currentFile : null,
                previousFile: typeof state.previousFile === 'string' ? state.previousFile : null,
                ...(Object.prototype.hasOwnProperty.call(state, 'fileCandidate') ? { fileCandidate: typeof state.fileCandidate === 'string' ? state.fileCandidate : null } : {}),
                ...(Object.prototype.hasOwnProperty.call(state, 'fileCandidateSource') ? { fileCandidateSource: state.fileCandidateSource === 'current' || state.fileCandidateSource === 'recent' ? state.fileCandidateSource : null } : {}),
                openedFiles: stringArray(state.openedFiles, 'openedFiles'),
                expandedFolders: stringArray(state.expandedFolders, 'expandedFolders'),
                updatedAt: typeof state.updatedAt === 'number' && Number.isFinite(state.updatedAt) ? state.updatedAt : 0,
            };
            return { type: 'state', state: wire };
        }
        case 'command-result': {
            const result = parsed.result;
            if (!isRecord(result))
                throw new WireError('invalid command-result payload');
            const ack = {
                id: requireString(result, 'id'),
                ok: requireBool(result, 'ok'),
                ...(typeof result.code === 'string' ? { code: result.code } : {}),
                ...(typeof result.message === 'string' ? { message: result.message } : {}),
                ...(isRecord(result.value) ? { value: result.value } : {}),
            };
            return { type: 'command-result', result: ack };
        }
        default:
            throw new WireError(`unknown message type "${parsed.type}"`);
    }
}
/** Decode a host→client message from its JSON text. */
export function parseHostMessage(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        throw new WireError('invalid JSON');
    }
    if (!isRecord(parsed) || parsed.type !== 'command')
        throw new WireError('invalid message envelope');
    const id = requireString(parsed, 'id');
    const command = parseCommand(parsed.command);
    return { type: 'command', id, command };
}
function stringArray(value, key) {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
        throw new WireError(`invalid "${key}"`);
    }
    return value;
}
/** Encode one host→client command message. */
export function encodeHostCommand(id, command) {
    return JSON.stringify({ type: 'command', id, command });
}
/** Encode one client→host state push. */
export function encodeClientState(state) {
    return JSON.stringify({ type: 'state', state });
}
/** Encode one client→host acknowledgment. */
export function encodeAck(result) {
    return JSON.stringify({ type: 'command-result', result });
}
/** Validate a code emitted by tools/acks (defensive; unknown codes pass through). */
export function isKnownCode(code) {
    return code in KNOWN_CODES;
}
const KNOWN_CODES = {
    OK: true,
    QUEUED: true,
    BRIDGE_NOT_CONNECTED: true,
    BRIDGE_TIMEOUT: true,
    SIDEBAR_UNAVAILABLE: true,
    NO_AGENT: true,
    NO_SESSION: true,
    INVALID_PATH: true,
    PATH_OUTSIDE_WORKSPACE: true,
    FILE_NOT_FOUND: true,
    FS_ERROR: true,
    NOT_A_DIRECTORY: true,
    NOT_A_FILE: true,
    FILE_NOT_OPEN: true,
    NO_CURRENT_FILE: true,
    NO_PREVIOUS_FILE: true,
    UNKNOWN_COMMAND: true,
    INTERNAL_ERROR: true,
};
