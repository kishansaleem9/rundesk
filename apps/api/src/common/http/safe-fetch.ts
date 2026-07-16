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
import * as http from 'node:http'
import * as https from 'node:https'
import * as dns from 'node:dns'
import * as net from 'node:net'
import { URL } from 'node:url'
import { isPrivateOrReservedIp } from '../../modules/chat/link-unfurl'

export { isPrivateOrReservedIp }

const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const DEFAULT_MAX_REDIRECTS = 3

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SsrfBlockedError'
  }
}

function unbracketHost(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

/**
 * Validate a URL for a guarded fetch: well-formed http/https with a host, a
 * public literal IP (if literal), and — when `allowedHostnames` is given — a
 * hostname on the allowlist. Throws {@link SsrfBlockedError} otherwise.
 */
export function assertSafeUrl(rawUrl: string, allowedHostnames?: ReadonlySet<string>): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new SsrfBlockedError('Invalid URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError(`Blocked scheme: ${url.protocol}`)
  }
  const host = unbracketHost(url.hostname).toLowerCase()
  if (!host) throw new SsrfBlockedError('URL has no host')
  if (allowedHostnames && !allowedHostnames.has(host)) {
    throw new SsrfBlockedError(`Host not on allowlist: ${host}`)
  }
  const literalIp = net.isIP(host) ? host : null
  if (literalIp && isPrivateOrReservedIp(literalIp)) {
    throw new SsrfBlockedError(`Blocked private/reserved IP: ${literalIp}`)
  }
  return url
}

/**
 * DNS lookup hook: resolve ALL addresses, reject if any is private/reserved,
 * and pin the socket to the validated address (single resolution for validate +
 * connect → defeats rebinding).
 */
const guardedLookup = (
  hostname: string,
  options: unknown,
  callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void,
): void => {
  const opt = (typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {}) as {
    all?: boolean
    family?: number
  }
  const wantFamily = typeof options === 'number' ? options : opt.family
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) {
      callback(err, '', 4)
      return
    }
    const list: dns.LookupAddress[] = Array.isArray(addresses) ? addresses : []
    if (list.length === 0) {
      callback(new Error('ENOTFOUND') as NodeJS.ErrnoException, '', 4)
      return
    }
    for (const addr of list) {
      if (isPrivateOrReservedIp(addr.address)) {
        callback(new SsrfBlockedError('resolved to a private/reserved address') as NodeJS.ErrnoException, '', 4)
        return
      }
    }
    if (opt.all) {
      callback(null, list)
      return
    }
    const chosen = wantFamily === 4 || wantFamily === 6 ? (list.find((a) => a.family === wantFamily) ?? null) : list[0]
    if (!chosen) {
      callback(new Error('EAI_AGAIN') as NodeJS.ErrnoException, '', 4)
      return
    }
    callback(null, chosen.address, chosen.family)
  })
}

export type SafeFetchOptions = {
  method?: string
  headers?: Record<string, string>
  body?: string | Buffer
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  /** When set, only these (lowercased) hostnames may be reached, on every hop. */
  allowedHostnames?: ReadonlySet<string>
}

export type SafeFetchResponse = {
  status: number
  headers: http.IncomingHttpHeaders
  body: Buffer
  text: () => string
}

/** Issue one guarded request (no redirect following). Rejects on SSRF/timeout/oversize. */
function requestOnce(target: URL, opts: SafeFetchOptions): Promise<{ redirectTo?: string; response?: SafeFetchResponse }> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return new Promise((resolve, reject) => {
    const client = target.protocol === 'https:' ? https : http
    let settled = false
    const fail = (e: Error) => { if (!settled) { settled = true; reject(e) } }
    const req = client.request(
      target,
      {
        method: opts.method ?? 'GET',
        lookup: guardedLookup as unknown as net.LookupFunction,
        headers: { 'User-Agent': 'RundeskBot/1.0', ...(opts.headers ?? {}) },
      },
      (res) => {
        const status = res.statusCode ?? 0
        const location = res.headers.location
        if (status >= 300 && status < 400 && location) {
          res.destroy()
          if (!settled) { settled = true; resolve({ redirectTo: location }) }
          return
        }
        const chunks: Buffer[] = []
        let received = 0
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          if (received > maxBytes) { res.destroy(); fail(new SsrfBlockedError('response exceeded size cap')); return }
          chunks.push(chunk)
        })
        res.on('end', () => {
          if (settled) return
          settled = true
          const body = Buffer.concat(chunks)
          resolve({ response: { status, headers: res.headers, body, text: () => body.toString('utf8') } })
        })
        res.on('error', fail)
      },
    )
    req.setTimeout(timeoutMs, () => { req.destroy(); fail(new SsrfBlockedError('request timed out')) })
    req.on('error', fail)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

/**
 * SSRF-hardened fetch: validates the URL (and every redirect hop) against
 * private/reserved IPs with DNS pinning, enforces scheme + optional host
 * allowlist, and caps time + size. Throws {@link SsrfBlockedError} on any
 * violation. Use for EVERY outbound request whose host is influenced by user
 * input.
 */
export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResponse> {
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  let current = rawUrl
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const target = assertSafeUrl(current, opts.allowedHostnames)
    const { redirectTo, response } = await requestOnce(target, opts)
    if (response) return response
    if (!redirectTo) throw new SsrfBlockedError('no response')
    // Re-validate the redirect target (relative → resolved against current).
    current = new URL(redirectTo, target).toString()
  }
  throw new SsrfBlockedError('too many redirects')
}
