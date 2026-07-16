/**
 * Server-side link unfurl (Plan §6.3 "Auto-rendered link previews").
 *
 * Fetches a URL's Open-Graph / Twitter-card metadata so the web client can show
 * an inline preview card. The dangerous part of unfurling is SSRF: a user can
 * paste any URL and make the server issue an outbound request. This module keeps
 * the URL-safety decision in small PURE, unit-tested functions and layers a
 * hardened fetch (guarded DNS, redirect re-validation, timeout + size caps) on
 * top.
 *
 * SSRF defense in depth:
 *  1. Only http:/https: schemes are ever fetched.
 *  2. Literal-IP hosts are rejected synchronously if they fall in a
 *     private/reserved range (see `isPrivateOrReservedIp`).
 *  3. Hostnames are resolved with `dns.lookup(..., { all: true })` and EVERY
 *     resolved address must be public. The validated address is then pinned as
 *     the socket target via the request's `lookup` hook, so the connection uses
 *     exactly the address we validated (defends against DNS rebinding — the
 *     validation and the connection share one resolution).
 *  4. Each redirect target is re-run through the same guard.
 */
import * as http from 'node:http'
import * as https from 'node:https'
import * as dns from 'node:dns'
import * as net from 'node:net'
import { URL } from 'node:url'

/** Metadata returned to the client. Every field is optional; an empty object
 *  means "nothing to preview" (unknown, disallowed, or fetch failed). */
export type UnfurlResult = {
  url?: string
  title?: string
  description?: string
  image?: string
  siteName?: string
}

const USER_AGENT = 'RundeskBot/1.0 (+https://rundesk.app; link-preview)'
const REQUEST_TIMEOUT_MS = 5_000
const MAX_RESPONSE_BYTES = 1024 * 1024 // 1 MB
const MAX_REDIRECTS = 3

// ── Pure IP classification ───────────────────────────────────────────────────

/** Parse a dotted-quad IPv4 string to an unsigned 32-bit integer, or null. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const v = Number(part)
    if (v > 255) return null
    n = n * 256 + v
  }
  return n >>> 0
}

/** True if an unsigned-32-bit IPv4 is inside `network/bits`. */
function ipv4InCidr(n: number, network: string, bits: number): boolean {
  const base = ipv4ToInt(network)
  if (base === null) return false
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return ((n & mask) >>> 0) === ((base & mask) >>> 0)
}

/** Private, loopback, link-local, unspecified, CGNAT, multicast, reserved and
 *  documentation IPv4 ranges — everything that must never be fetched. */
function isBlockedIpv4(n: number): boolean {
  return (
    ipv4InCidr(n, '0.0.0.0', 8) || // "this" network (incl. 0.0.0.0 unspecified)
    ipv4InCidr(n, '10.0.0.0', 8) || // private
    ipv4InCidr(n, '100.64.0.0', 10) || // CGNAT / shared address space
    ipv4InCidr(n, '127.0.0.0', 8) || // loopback
    ipv4InCidr(n, '169.254.0.0', 16) || // link-local (incl. 169.254.169.254 metadata)
    ipv4InCidr(n, '172.16.0.0', 12) || // private
    ipv4InCidr(n, '192.0.0.0', 24) || // IETF protocol assignments
    ipv4InCidr(n, '192.0.2.0', 24) || // TEST-NET-1
    ipv4InCidr(n, '192.168.0.0', 16) || // private
    ipv4InCidr(n, '198.18.0.0', 15) || // benchmarking
    ipv4InCidr(n, '198.51.100.0', 24) || // TEST-NET-2
    ipv4InCidr(n, '203.0.113.0', 24) || // TEST-NET-3
    ipv4InCidr(n, '224.0.0.0', 4) || // multicast
    ipv4InCidr(n, '240.0.0.0', 4) // reserved (incl. 255.255.255.255 broadcast)
  )
}

/** Expand a (Node-validated) IPv6 string into its eight 16-bit groups. Handles
 *  `::` compression, an embedded trailing IPv4 dotted-quad, and a zone id. */
function expandIpv6Groups(ip: string): number[] | null {
  let s = ip
  const zone = s.indexOf('%')
  if (zone !== -1) s = s.slice(0, zone)

  // Fold a trailing embedded IPv4 (e.g. ::ffff:127.0.0.1) into two hextets.
  if (s.includes('.')) {
    const lastColon = s.lastIndexOf(':')
    if (lastColon === -1) return null
    const v4 = ipv4ToInt(s.slice(lastColon + 1))
    if (v4 === null) return null
    const hi = ((v4 >>> 16) & 0xffff).toString(16)
    const lo = (v4 & 0xffff).toString(16)
    s = `${s.slice(0, lastColon + 1)}${hi}:${lo}`
  }

  const halves = s.split('::')
  if (halves.length > 2) return null

  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []

  let groups: string[]
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length
    if (missing < 0) return null
    groups = [...head, ...new Array(missing).fill('0'), ...tail]
  } else {
    if (head.length !== 8) return null
    groups = head
  }

  const out: number[] = []
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null
    out.push(parseInt(g, 16))
  }
  return out.length === 8 ? out : null
}

function isBlockedIpv6(groups: number[]): boolean {
  const zeroThrough = (end: number) => groups.slice(0, end).every((g) => g === 0)

  // IPv4-mapped (::ffff:a.b.c.d) → classify the embedded IPv4.
  if (zeroThrough(5) && groups[5] === 0xffff) {
    return isBlockedIpv4((((groups[6] << 16) | groups[7]) >>> 0))
  }
  // ::  / ::1 / IPv4-compatible (::a.b.c.d, deprecated).
  if (zeroThrough(6)) {
    const low = ((groups[6] << 16) | groups[7]) >>> 0
    if (low === 0) return true // :: unspecified
    if (low === 1) return true // ::1 loopback
    return isBlockedIpv4(low)
  }
  const first = groups[0]
  if ((first & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local (fc00/fd00)
  return false
}

/**
 * PURE. Given an IP literal, return true if it is private/reserved and must not
 * be fetched. Anything that is not a parseable public IP fails closed (blocked).
 * Covers loopback, private, link-local, unspecified, CGNAT, multicast, reserved
 * and cloud-metadata (169.254.169.254) addresses for both IPv4 and IPv6.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip)
    return n === null ? true : isBlockedIpv4(n)
  }
  if (net.isIPv6(ip)) {
    const groups = expandIpv6Groups(ip)
    return groups === null ? true : isBlockedIpv6(groups)
  }
  return true // not a valid IP literal → fail closed
}

// ── Pure URL safety ──────────────────────────────────────────────────────────

export type UnfurlUrlCheck =
  | { ok: true; url: URL; hostname: string; literalIp: string | null }
  | { ok: false; reason: 'invalid-url' | 'scheme' | 'no-host' | 'blocked-ip' }

/** Strip the surrounding brackets WHATWG URL keeps on IPv6 literal hosts. */
function unbracketHost(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
}

/**
 * PURE. Validate a candidate URL for unfurling: it must be a well-formed
 * http:/https: URL with a host, and if the host is a literal IP that IP must be
 * public. Hostnames still need DNS validation at fetch time — that lives in the
 * (impure) fetch path, which reuses `isPrivateOrReservedIp` on every resolved
 * address.
 */
export function checkUnfurlUrl(rawUrl: string): UnfurlUrlCheck {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'invalid-url' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'scheme' }
  }
  const host = unbracketHost(url.hostname)
  if (!host) return { ok: false, reason: 'no-host' }
  const literalIp = net.isIP(host) ? host : null
  if (literalIp && isPrivateOrReservedIp(literalIp)) {
    return { ok: false, reason: 'blocked-ip' }
  }
  return { ok: true, url, hostname: host, literalIp }
}

// ── Hardened fetch ───────────────────────────────────────────────────────────

/**
 * DNS lookup hook that (a) resolves ALL addresses for the host, (b) rejects if
 * any is private/reserved, and (c) pins the socket to a validated address. Node
 * uses the address we return for the actual connection, so validation and
 * connection share a single resolution — this is what defeats DNS rebinding.
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
        callback(new Error('SSRF blocked: resolved to a private/reserved address') as NodeJS.ErrnoException, '', 4)
        return
      }
    }
    if (opt.all) {
      callback(null, list)
      return
    }
    const chosen =
      wantFamily === 4 || wantFamily === 6 ? (list.find((a) => a.family === wantFamily) ?? null) : list[0]
    if (!chosen) {
      callback(new Error('EAI_AGAIN') as NodeJS.ErrnoException, '', 4)
      return
    }
    callback(null, chosen.address, chosen.family)
  })
}

type RequestOutcome =
  | { kind: 'html'; body: string }
  | { kind: 'redirect'; location: string }
  | { kind: 'none' }

/** Issue a single guarded GET. Never rejects — failures resolve to `none`. */
function requestOnce(target: URL): Promise<RequestOutcome> {
  return new Promise((resolve) => {
    const client = target.protocol === 'https:' ? https : http
    let settled = false
    const done = (out: RequestOutcome) => {
      if (settled) return
      settled = true
      resolve(out)
    }

    const req = client.request(
      target,
      {
        method: 'GET',
        lookup: guardedLookup as unknown as net.LookupFunction,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.destroy()
          done({ kind: 'redirect', location: res.headers.location })
          return
        }
        if (status < 200 || status >= 300) {
          res.destroy()
          done({ kind: 'none' })
          return
        }
        const contentType = String(res.headers['content-type'] ?? '')
        if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
          res.destroy()
          done({ kind: 'none' })
          return
        }
        const chunks: Buffer[] = []
        let received = 0
        res.on('data', (chunk: Buffer) => {
          if (received >= MAX_RESPONSE_BYTES) return
          const room = MAX_RESPONSE_BYTES - received
          if (chunk.length > room) {
            chunks.push(chunk.subarray(0, room))
            received = MAX_RESPONSE_BYTES
            res.destroy()
            done({ kind: 'html', body: Buffer.concat(chunks).toString('utf8') })
            return
          }
          chunks.push(chunk)
          received += chunk.length
        })
        res.on('end', () => done({ kind: 'html', body: Buffer.concat(chunks).toString('utf8') }))
        res.on('error', () => done({ kind: 'none' }))
      },
    )

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy()
      done({ kind: 'none' })
    })
    req.on('error', () => done({ kind: 'none' }))
    req.end()
  })
}

/** Follow up to MAX_REDIRECTS hops, re-validating each target. Returns the HTML
 *  of the first non-redirect text/html response, or null. */
async function fetchHtml(rawUrl: string): Promise<{ html: string; finalUrl: string } | null> {
  let current = rawUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = checkUnfurlUrl(current)
    if (!check.ok) return null
    const outcome = await requestOnce(check.url)
    if (outcome.kind === 'html') return { html: outcome.body, finalUrl: check.url.toString() }
    if (outcome.kind === 'none') return null
    // redirect: resolve (possibly relative) Location and loop to re-validate.
    let next: URL
    try {
      next = new URL(outcome.location, check.url)
    } catch {
      return null
    }
    current = next.toString()
  }
  return null // too many redirects
}

// ── HTML metadata parsing ────────────────────────────────────────────────────

function safeFromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return ''
  try {
    return String.fromCodePoint(cp)
  } catch {
    return ''
  }
}

/** Decode the handful of HTML entities that show up in OG/title text. `&amp;`
 *  is decoded last so `&amp;lt;` does not turn into `<`. */
function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&(?:apos|#39);/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
}

/** Read one attribute value out of a single tag string (quoted or bare). */
function readAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
  const m = tag.match(re)
  if (!m) return null
  return m[2] ?? m[3] ?? m[4] ?? ''
}

/** Map of lower-cased meta name/property → decoded content, first-wins. */
function extractMetaTags(head: string): Map<string, string> {
  const map = new Map<string, string>()
  const tags = head.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const key = (readAttr(tag, 'property') ?? readAttr(tag, 'name'))?.toLowerCase()
    const content = readAttr(tag, 'content')
    if (key && content != null && !map.has(key)) {
      map.set(key, decodeEntities(content))
    }
  }
  return map
}

function extractTitleTag(head: string): string | null {
  const m = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? decodeEntities(m[1]) : null
}

/** Collapse whitespace, trim, and cap length with an ellipsis. */
function clean(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? `${collapsed.slice(0, max - 1).trimEnd()}…` : collapsed
}

/** Resolve a possibly-relative asset URL against the page and keep it only if it
 *  is an http(s) URL that is not an obvious private-IP literal. */
function resolveImageUrl(raw: string, pageUrl: string): string | undefined {
  let abs: string
  try {
    abs = new URL(raw, pageUrl).toString()
  } catch {
    return undefined
  }
  return checkUnfurlUrl(abs).ok ? abs : undefined
}

/**
 * PURE. Parse OG / Twitter / <title> metadata out of an HTML document. Only the
 * <head> is scanned. Returns `{}` when nothing useful is present.
 */
export function parseOgMetadata(html: string, pageUrl: string): UnfurlResult {
  const headEnd = html.search(/<\/head>|<body[\s>]/i)
  const head = headEnd === -1 ? html.slice(0, 200_000) : html.slice(0, headEnd)
  const meta = extractMetaTags(head)

  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = meta.get(k)
      if (v && v.trim()) return v
    }
    return undefined
  }

  const rawTitle = pick('og:title', 'twitter:title') ?? extractTitleTag(head) ?? undefined
  const rawDescription = pick('og:description', 'twitter:description', 'description')
  const rawImage = pick('og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src')
  const rawSiteName = pick('og:site_name', 'application-name')

  const result: UnfurlResult = {}
  if (rawTitle && rawTitle.trim()) result.title = clean(rawTitle, 200)
  if (rawDescription) result.description = clean(rawDescription, 300)
  if (rawSiteName) result.siteName = clean(rawSiteName, 100)
  if (rawImage) {
    const img = resolveImageUrl(rawImage.trim(), pageUrl)
    if (img) result.image = img
  }
  return result
}

/**
 * Best-effort unfurl. Validates + fetches + parses. Never throws; any
 * disallowed URL, network error, timeout, non-HTML body, or absence of metadata
 * yields `{}`. On success returns `{ url, title?, description?, image?,
 * siteName? }` with `url` set to the final (post-redirect) URL.
 */
export async function fetchLinkPreview(rawUrl: string): Promise<UnfurlResult> {
  const check = checkUnfurlUrl(rawUrl)
  if (!check.ok) return {}

  const fetched = await fetchHtml(rawUrl)
  if (!fetched) return {}

  const parsed = parseOgMetadata(fetched.html, fetched.finalUrl)
  if (!parsed.title && !parsed.description && !parsed.image && !parsed.siteName) return {}
  return { url: fetched.finalUrl, ...parsed }
}
