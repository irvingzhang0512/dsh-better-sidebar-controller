/**
 * Wire encoding/decoding for the controller bridge. Messages are small JSON
 * documents; decoding validates the envelope strictly (defensive against
 * malformed or spoofed traffic) and throws {@link WireError} on failure —
 * callers drop the message and keep the socket.
 */
import type { ClientToHostMessage, CommandAck, ControllerCommand, ControllerCode, HostToClientMessage, SidebarStateWire } from './types.ts';
/** Thrown when a wire message fails validation. */
export declare class WireError extends Error {
    constructor(message: string);
}
/** Validate one command name + payload (the shape of {@link ControllerCommand}). */
export declare function parseCommand(raw: unknown): ControllerCommand;
/** Decode a client→host message from its JSON text. */
export declare function parseClientMessage(text: string): ClientToHostMessage;
/** Decode a host→client message from its JSON text. */
export declare function parseHostMessage(text: string): HostToClientMessage;
/** Encode one host→client command message. */
export declare function encodeHostCommand(id: string, command: ControllerCommand): string;
/** Encode one client→host state push. */
export declare function encodeClientState(state: SidebarStateWire): string;
/** Encode one client→host acknowledgment. */
export declare function encodeAck(result: CommandAck): string;
/** Validate a code emitted by tools/acks (defensive; unknown codes pass through). */
export declare function isKnownCode(code: string): code is ControllerCode;
