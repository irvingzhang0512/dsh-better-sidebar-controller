/**
 * Browser-trust fence for the controller bridge, behaviorally identical to
 * the /api gateway's fence in @deepseek-ai/dsh-client-connection and to
 * dsh-better-sidebar's own trust-fence (copied here because the package does
 * not export it and the plugin must not depend on its internals).
 *
 * Host-header loopback or a configured trusted authority passes; cross-site
 * browser markers refuse. This is a DNS-rebinding / cross-site defense, not
 * authentication.
 */
import type { IncomingHttpHeaders } from 'node:http';
/** The request facts the fence reads (structural subset of IncomingMessage). */
interface TrustRequest {
    headers: IncomingHttpHeaders;
}
/** Whether a normalized URL hostname names the local loopback authority. */
export declare function isLoopbackHostname(hostname: string): boolean;
/**
 * Decide whether one request may reach the controller bridge.
 * @param request - node HTTP request facts (headers).
 * @param trustedHosts - non-loopback authorities this deployment serves.
 * @returns true when the Host is ours (loopback or trusted) and browser markers are same-origin.
 */
export declare function isTrustedApiRequest(request: TrustRequest, trustedHosts: readonly string[]): boolean;
export {};
