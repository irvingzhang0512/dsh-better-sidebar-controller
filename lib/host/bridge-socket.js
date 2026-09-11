/**
 * WebSocket ↔ bridge adapter: wraps one `ws` connection as the bridge's
 * minimal sender and routes its decoded messages back into the bridge.
 * Malformed messages are dropped (the socket stays alive); a closed or
 * errored socket detaches the sender.
 */
import { WebSocket } from 'ws';
/** Attach one WebSocket as the bridge sender for a session. */
export function attachSocket(bridge, ws, sessionId, parse) {
    const sender = (message) => {
        if (ws.readyState === WebSocket.OPEN)
            ws.send(message);
    };
    const detach = bridge.attach(sessionId, sender);
    ws.on('message', (data) => {
        const text = data.toString();
        try {
            bridge.handleClientMessage(sessionId, parse(text));
        }
        catch {
            // Malformed message: drop it, keep the socket.
        }
    });
    ws.on('close', () => detach());
    ws.on('error', () => detach());
}
