/**
 * IP allowlist matching for the workspace security policy.
 *
 * Supports plain IPv4/IPv6 and CIDR ranges, with no external dependency.
 * IPv4-mapped IPv6 (e.g. `::ffff:203.0.113.42`, which is how a dual-stack
 * server often reports an IPv4 client) is normalised to its IPv4 form so a
 * plain `203.0.113.42` rule still matches.
 *
 * Everything is intentionally fail-closed at the matcher level (an unparseable
 * rule or address simply does not match); the *fail-open* safety decisions
 * (empty list, missing client IP, admin exemption) live in the caller.
 */

type ParsedIp = { version: 4 | 6; value: bigint }

function parseIpv4(str: string): bigint | null {
  const parts = str.split('.')
  if (parts.length !== 4) return null
  let value = 0n
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const n = Number(p)
    if (n > 255) return null
    value = (value << 8n) | BigInt(n)
  }
  return value
}

function expandEmbeddedV4(groups: string[]): string[] | null {
  if (groups.length === 0) return groups
  const last = groups[groups.length - 1]
  if (last.includes('.')) {
    const v4 = parseIpv4(last)
    if (v4 === null) return null
    const hi = (v4 >> 16n) & 0xffffn
    const lo = v4 & 0xffffn
    return [...groups.slice(0, -1), hi.toString(16), lo.toString(16)]
  }
  return groups
}

function groupsToBig(groups: string[]): bigint | null {
  let v = 0n
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null
    v = (v << 16n) | BigInt(parseInt(g, 16))
  }
  return v
}

function parseIpv6(str: string): bigint | null {
  const dc = str.split('::')
  if (dc.length > 2) return null

  if (dc.length === 2) {
    let head = dc[0] === '' ? [] : dc[0].split(':')
    let tail = dc[1] === '' ? [] : dc[1].split(':')
    const he = expandEmbeddedV4(head)
    const te = expandEmbeddedV4(tail)
    if (he === null || te === null) return null
    head = he
    tail = te
    const fill = 8 - (head.length + tail.length)
    if (fill < 1) return null
    const groups = [...head, ...Array(fill).fill('0'), ...tail]
    return groupsToBig(groups)
  }

  const expanded = expandEmbeddedV4(str.split(':'))
  if (expanded === null || expanded.length !== 8) return null
  return groupsToBig(expanded)
}

/** Parse an address, normalising IPv4-mapped IPv6 down to IPv4. */
export function parseIp(input: string): ParsedIp | null {
  let str = input.trim().replace(/^\[/, '').replace(/\]$/, '')
  const pct = str.indexOf('%') // drop zone id (fe80::1%eth0)
  if (pct >= 0) str = str.slice(0, pct)
  if (str === '') return null

  if (str.includes(':')) {
    const v6 = parseIpv6(str)
    if (v6 === null) return null
    // ::ffff:a.b.c.d → treat as IPv4 a.b.c.d
    if (v6 >> 32n === 0xffffn) return { version: 4, value: v6 & 0xffffffffn }
    return { version: 6, value: v6 }
  }
  const v4 = parseIpv4(str)
  if (v4 === null) return null
  return { version: 4, value: v4 }
}

/** True if `ip` falls inside the single rule (plain address or CIDR range). */
export function ipMatches(rule: string, ip: string): boolean {
  const trimmed = rule.trim()
  const slash = trimmed.indexOf('/')
  let addr = trimmed
  let prefix: number | null = null
  if (slash >= 0) {
    addr = trimmed.slice(0, slash)
    const ps = trimmed.slice(slash + 1)
    if (!/^\d{1,3}$/.test(ps)) return false
    prefix = Number(ps)
  }

  const r = parseIp(addr)
  const t = parseIp(ip)
  if (!r || !t || r.version !== t.version) return false

  const bits = r.version === 4 ? 32 : 128
  const p = prefix === null ? bits : prefix
  if (!Number.isInteger(p) || p < 0 || p > bits) return false
  if (p === 0) return true

  const fullMask = (1n << BigInt(bits)) - 1n
  const mask = fullMask ^ ((1n << BigInt(bits - p)) - 1n)
  return (r.value & mask) === (t.value & mask)
}

/** True if `ip` matches any rule in the list. Empty list / missing ip → false. */
export function isIpAllowed(ip: string | null | undefined, rules: string[]): boolean {
  if (!ip) return false
  return rules.some((rule) => ipMatches(rule, ip))
}

/**
 * Canonical display form of a client IP: dotted-quad for IPv4 (including
 * IPv4-mapped IPv6), otherwise the trimmed address with brackets/zone removed.
 * Used when auto-adding the requester's IP to an allowlist so it reads cleanly.
 */
export function canonicalIp(input: string): string | null {
  const parsed = parseIp(input)
  if (!parsed) return null
  if (parsed.version === 4) {
    const v = parsed.value
    return `${(v >> 24n) & 0xffn}.${(v >> 16n) & 0xffn}.${(v >> 8n) & 0xffn}.${v & 0xffn}`
  }
  return input.trim().replace(/^\[/, '').replace(/\]$/, '').split('%')[0]
}

/** Validate a rule string for the admin UI / API (plain IP or CIDR). */
export function isValidIpRule(rule: string): boolean {
  const trimmed = rule.trim()
  if (!trimmed) return false
  const slash = trimmed.indexOf('/')
  let addr = trimmed
  let prefix: number | null = null
  if (slash >= 0) {
    addr = trimmed.slice(0, slash)
    const ps = trimmed.slice(slash + 1)
    if (!/^\d{1,3}$/.test(ps)) return false
    prefix = Number(ps)
  }
  const parsed = parseIp(addr)
  if (!parsed) return false
  if (prefix !== null) {
    const bits = parsed.version === 4 ? 32 : 128
    if (prefix < 0 || prefix > bits) return false
  }
  return true
}
