"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SsrfBlockedError = exports.isPrivateOrReservedIp = void 0;
exports.assertSafeUrl = assertSafeUrl;
exports.safeFetch = safeFetch;
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
const http = __importStar(require("node:http"));
const https = __importStar(require("node:https"));
const dns = __importStar(require("node:dns"));
const net = __importStar(require("node:net"));
const node_url_1 = require("node:url");
const link_unfurl_1 = require("../../modules/chat/link-unfurl");
Object.defineProperty(exports, "isPrivateOrReservedIp", { enumerable: true, get: function () { return link_unfurl_1.isPrivateOrReservedIp; } });
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const DEFAULT_MAX_REDIRECTS = 3;
class SsrfBlockedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SsrfBlockedError';
    }
}
exports.SsrfBlockedError = SsrfBlockedError;
function unbracketHost(host) {
    return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}
/**
 * Validate a URL for a guarded fetch: well-formed http/https with a host, a
 * public literal IP (if literal), and — when `allowedHostnames` is given — a
 * hostname on the allowlist. Throws {@link SsrfBlockedError} otherwise.
 */
function assertSafeUrl(rawUrl, allowedHostnames) {
    let url;
    try {
        url = new node_url_1.URL(rawUrl);
    }
    catch {
        throw new SsrfBlockedError('Invalid URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new SsrfBlockedError(`Blocked scheme: ${url.protocol}`);
    }
    const host = unbracketHost(url.hostname).toLowerCase();
    if (!host)
        throw new SsrfBlockedError('URL has no host');
    if (allowedHostnames && !allowedHostnames.has(host)) {
        throw new SsrfBlockedError(`Host not on allowlist: ${host}`);
    }
    const literalIp = net.isIP(host) ? host : null;
    if (literalIp && (0, link_unfurl_1.isPrivateOrReservedIp)(literalIp)) {
        throw new SsrfBlockedError(`Blocked private/reserved IP: ${literalIp}`);
    }
    return url;
}
/**
 * DNS lookup hook: resolve ALL addresses, reject if any is private/reserved,
 * and pin the socket to the validated address (single resolution for validate +
 * connect → defeats rebinding).
 */
const guardedLookup = (hostname, options, callback) => {
    const opt = (typeof options === 'object' && options !== null ? options : {});
    const wantFamily = typeof options === 'number' ? options : opt.family;
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
        if (err) {
            callback(err, '', 4);
            return;
        }
        const list = Array.isArray(addresses) ? addresses : [];
        if (list.length === 0) {
            callback(new Error('ENOTFOUND'), '', 4);
            return;
        }
        for (const addr of list) {
            if ((0, link_unfurl_1.isPrivateOrReservedIp)(addr.address)) {
                callback(new SsrfBlockedError('resolved to a private/reserved address'), '', 4);
                return;
            }
        }
        if (opt.all) {
            callback(null, list);
            return;
        }
        const chosen = wantFamily === 4 || wantFamily === 6 ? (list.find((a) => a.family === wantFamily) ?? null) : list[0];
        if (!chosen) {
            callback(new Error('EAI_AGAIN'), '', 4);
            return;
        }
        callback(null, chosen.address, chosen.family);
    });
};
/** Issue one guarded request (no redirect following). Rejects on SSRF/timeout/oversize. */
function requestOnce(target, opts) {
    const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
        const client = target.protocol === 'https:' ? https : http;
        let settled = false;
        const fail = (e) => { if (!settled) {
            settled = true;
            reject(e);
        } };
        const req = client.request(target, {
            method: opts.method ?? 'GET',
            lookup: guardedLookup,
            headers: { 'User-Agent': 'RundeskBot/1.0', ...(opts.headers ?? {}) },
        }, (res) => {
            const status = res.statusCode ?? 0;
            const location = res.headers.location;
            if (status >= 300 && status < 400 && location) {
                res.destroy();
                if (!settled) {
                    settled = true;
                    resolve({ redirectTo: location });
                }
                return;
            }
            const chunks = [];
            let received = 0;
            res.on('data', (chunk) => {
                received += chunk.length;
                if (received > maxBytes) {
                    res.destroy();
                    fail(new SsrfBlockedError('response exceeded size cap'));
                    return;
                }
                chunks.push(chunk);
            });
            res.on('end', () => {
                if (settled)
                    return;
                settled = true;
                const body = Buffer.concat(chunks);
                resolve({ response: { status, headers: res.headers, body, text: () => body.toString('utf8') } });
            });
            res.on('error', fail);
        });
        req.setTimeout(timeoutMs, () => { req.destroy(); fail(new SsrfBlockedError('request timed out')); });
        req.on('error', fail);
        if (opts.body)
            req.write(opts.body);
        req.end();
    });
}
/**
 * SSRF-hardened fetch: validates the URL (and every redirect hop) against
 * private/reserved IPs with DNS pinning, enforces scheme + optional host
 * allowlist, and caps time + size. Throws {@link SsrfBlockedError} on any
 * violation. Use for EVERY outbound request whose host is influenced by user
 * input.
 */
async function safeFetch(rawUrl, opts = {}) {
    const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    let current = rawUrl;
    for (let hop = 0; hop <= maxRedirects; hop++) {
        const target = assertSafeUrl(current, opts.allowedHostnames);
        const { redirectTo, response } = await requestOnce(target, opts);
        if (response)
            return response;
        if (!redirectTo)
            throw new SsrfBlockedError('no response');
        // Re-validate the redirect target (relative → resolved against current).
        current = new node_url_1.URL(redirectTo, target).toString();
    }
    throw new SsrfBlockedError('too many redirects');
}
//# sourceMappingURL=safe-fetch.js.map