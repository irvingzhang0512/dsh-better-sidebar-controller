/**
 * WebSocket ↔ bridge adapter: wraps one `ws` connection as the bridge's
 * minimal sender and routes its decoded messages back into the bridge.
 * Malformed messages are dropped (the socket stays alive); a closed or
 * errored socket detaches the sender.
 */
import { WebSocket } from 'ws';
import type { BridgeServer } from './bridge-server.ts';
import type { ClientToHostMessage } from '../shared/types.ts';
/** Attach one WebSocket as the bridge sender for a session. */
export declare function attachSocket(bridge: BridgeServer, ws: WebSocket, sessionId: string, parse: (text: string) => ClientToHostMessage): void;
