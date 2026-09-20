import { URL } from 'node:url';
/** Metadata returned to the client. Every field is optional; an empty object
 *  means "nothing to preview" (unknown, disallowed, or fetch failed). */
export type UnfurlResult = {
    url?: string;
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
};
/**
 * PURE. Given an IP literal, return true if it is private/reserved and must not
 * be fetched. Anything that is not a parseable public IP fails closed (blocked).
 * Covers loopback, private, link-local, unspecified, CGNAT, multicast, reserved
 * and cloud-metadata (169.254.169.254) addresses for both IPv4 and IPv6.
 */
export declare function isPrivateOrReservedIp(ip: string): boolean;
export type UnfurlUrlCheck = {
    ok: true;
    url: URL;
    hostname: string;
    literalIp: string | null;
} | {
    ok: false;
    reason: 'invalid-url' | 'scheme' | 'no-host' | 'blocked-ip';
};
/**
 * PURE. Validate a candidate URL for unfurling: it must be a well-formed
 * http:/https: URL with a host, and if the host is a literal IP that IP must be
 * public. Hostnames still need DNS validation at fetch time — that lives in the
 * (impure) fetch path, which reuses `isPrivateOrReservedIp` on every resolved
 * address.
 */
export declare function checkUnfurlUrl(rawUrl: string): UnfurlUrlCheck;
/**
 * PURE. Parse OG / Twitter / <title> metadata out of an HTML document. Only the
 * <head> is scanned. Returns `{}` when nothing useful is present.
 */
export declare function parseOgMetadata(html: string, pageUrl: string): UnfurlResult;
/**
 * Best-effort unfurl. Validates + fetches + parses. Never throws; any
 * disallowed URL, network error, timeout, non-HTML body, or absence of metadata
 * yields `{}`. On success returns `{ url, title?, description?, image?,
 * siteName? }` with `url` set to the final (post-redirect) URL.
 */
export declare function fetchLinkPreview(rawUrl: string): Promise<UnfurlResult>;
