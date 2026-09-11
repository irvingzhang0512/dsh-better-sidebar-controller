function header(headers, name) {
    const value = headers[name];
    return typeof value === 'string' ? value : undefined;
}
/** Normalized URL of a Host-header authority, or undefined when unparsable. */
function parseAuthority(authority) {
    try {
        return new URL(`http://${authority}`);
    }
    catch {
        return undefined;
    }
}
/** Whether a normalized URL hostname names the local loopback authority. */
export function isLoopbackHostname(hostname) {
    if (hostname === 'localhost' || hostname === '[::1]')
        return true;
    const parts = hostname.split('.');
    return parts.length === 4
        && parts[0] === '127'
        && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/**
 * Whether the request authority matches a trustedHosts entry. A port-less
 * entry (e.g. `dev.example.com`) matches any port of that hostname; an entry
 * with an explicit port matches exactly.
 */
function isTrustedAuthority(hostUrl, trustedHosts) {
    return trustedHosts.some((entry) => {
        const entryUrl = parseAuthority(entry);
        if (entryUrl === undefined)
            return false;
        return entryUrl.port === '' || entryUrl.port === '80' || entryUrl.port === '443'
            ? entryUrl.hostname === hostUrl.hostname
            : entryUrl.host === hostUrl.host;
    });
}
/**
 * Decide whether one request may reach the controller bridge.
 * @param request - node HTTP request facts (headers).
 * @param trustedHosts - non-loopback authorities this deployment serves.
 * @returns true when the Host is ours (loopback or trusted) and browser markers are same-origin.
 */
export function isTrustedApiRequest(request, trustedHosts) {
    const host = header(request.headers, 'host');
    if (host === undefined)
        return false;
    const hostUrl = parseAuthority(host);
    if (hostUrl === undefined)
        return false;
    if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts))
        return false;
    if (header(request.headers, 'sec-fetch-site') === 'cross-site')
        return false;
    const origin = header(request.headers, 'origin');
    if (origin === undefined)
        return true;
    try {
        return new URL(origin).hostname === hostUrl.hostname;
    }
    catch {
        return false;
    }
}
