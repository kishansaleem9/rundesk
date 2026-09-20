/**
 * Shared SSRF-hardened outbound fetch.
 *
 * Several features issue outbound HTTP to hosts influenced by user input
 * (outbound webhooks, GitLab self-hosted API refresh, ClickUp attachment
 * download). Each of those is an SSRF sink: without protection an attacker can
 * point the request at a private/loopback/link-local address (e.g. the cloud
 * metadata endpoint 169.254.169.254) or use DNS rebinding.
 *
 * The chat link-unfurl module (`modules/chat/link-unfurl.ts`) already ships a
 * correct, unit-tested guard for the *HTML-preview* case. This module reuses its
 * canonical, battle-tested `isPrivateOrReservedIp` classifier and layers a
 * GENERIC guarded request on top (any method/headers/body; returns status +
 * headers + text) so every outbound sink shares one hardened path:
 *
 *  1. Only http:/https: schemes are ever fetched.
 *  2. Literal-IP hosts in a private/reserved range are rejected synchronously.
 *  3. DNS resolves ALL addresses; if ANY is private/reserved the request fails,
 *     and the validated address is pinned as the socket target (defeats DNS
 *     rebinding — validation and connection share one resolution).
 *  4. Every redirect hop is re-validated through the same guard.
 *  5. Optional `allowedHostnames` allowlist for sinks that must only ever reach
 *     an operator-approved set of hosts (e.g. self-hosted GitLab).
 *  6. Timeout + response-size cap.
 */
import * as http from 'node:http';
import { URL } from 'node:url';
import { isPrivateOrReservedIp } from '../../modules/chat/link-unfurl';
export { isPrivateOrReservedIp };
export declare class SsrfBlockedError extends Error {
    constructor(message: string);
}
/**
 * Validate a URL for a guarded fetch: well-formed http/https with a host, a
 * public literal IP (if literal), and — when `allowedHostnames` is given — a
 * hostname on the allowlist. Throws {@link SsrfBlockedError} otherwise.
 */
export declare function assertSafeUrl(rawUrl: string, allowedHostnames?: ReadonlySet<string>): URL;
export type SafeFetchOptions = {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    /** When set, only these (lowercased) hostnames may be reached, on every hop. */
    allowedHostnames?: ReadonlySet<string>;
};
export type SafeFetchResponse = {
    status: number;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
    text: () => string;
};
/**
 * SSRF-hardened fetch: validates the URL (and every redirect hop) against
 * private/reserved IPs with DNS pinning, enforces scheme + optional host
 * allowlist, and caps time + size. Throws {@link SsrfBlockedError} on any
 * violation. Use for EVERY outbound request whose host is influenced by user
 * input.
 */
export declare function safeFetch(rawUrl: string, opts?: SafeFetchOptions): Promise<SafeFetchResponse>;
