import * as dns from 'node:dns'
import * as net from 'node:net'
import { readFileSync } from 'node:fs'
import { isPrivateOrReservedIp } from '../../common/http/safe-fetch'

/**
 * WHERE A MAILBOX LINKED OVER IMAP IS REACHED (`found-12-oct/task-email-imap-unbuilt`).
 *
 * Its IMAP and SMTP servers are typed by whoever links it, so the server
 * connects wherever they say — the SSRF sink `safe-fetch.ts` guards for HTTP.
 * The same rule here: the name is resolved once, a server on a private,
 * loopback, link-local or otherwise reserved address is refused, and the
 * connection goes to the address that was checked (a second resolution could
 * answer differently). TLS still checks the certificate against the name typed.
 *
 * The operator may let a private mail server through — a company's own, on its
 * network — by naming it in `MAILBOX_PRIVATE_SERVERS` ("host:port", spaces or
 * commas between), and may trust a private certificate authority for mail
 * servers in `MAILBOX_TLS_CA_FILE` (PEM). A lane names its stub in both.
 */

export class MailServerRefused extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MailServerRefused'
  }
}

export type MailServer = {
  /** The name as typed, in lower case: what TLS checks the certificate against. */
  host: string
  port: number
  /** The address checked, and the one connected to. */
  address: string
  /** For TLS: the name to ask for, absent for an address typed as one (SNI carries names only). */
  servername?: string
}

const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/

/** A server name or address as typed, in lower case, or null when it is neither. */
export function mailHostOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const host = raw.trim().toLowerCase().replace(/^\[(.*)\]$/, '$1').replace(/\.$/, '')
  if (!host) return null
  if (net.isIP(host)) return host
  return HOSTNAME.test(host) ? host : null
}

/** A port as typed: a whole number from 1 to 65535, or null. */
export function mailPortOf(raw: unknown): number | null {
  const n = typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null
}

/** The private servers the operator lets through, as `host:port`. */
export function privateServersAllowed(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.MAILBOX_PRIVATE_SERVERS ?? '')
      .split(/[\s,]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  )
}

type Lookup = (host: string) => Promise<Array<{ address: string; family: number }>>
const systemLookup: Lookup = (host) => dns.promises.lookup(host, { all: true, verbatim: true })

/**
 * The server to connect to, checked: refused in words when the name does not
 * resolve, or resolves to an address that is not on the internet and the
 * operator has not let it through.
 */
export async function resolveMailServer(hostRaw: string, port: number, opts: { env?: NodeJS.ProcessEnv; lookup?: Lookup } = {}): Promise<MailServer> {
  const host = mailHostOf(hostRaw)
  if (!host) throw new MailServerRefused(`“${String(hostRaw).slice(0, 100)}” is not a server name`)
  const allowed = privateServersAllowed(opts.env)
  let addresses: Array<{ address: string; family: number }>
  if (net.isIP(host)) {
    addresses = [{ address: host, family: net.isIP(host) }]
  } else {
    try {
      addresses = await (opts.lookup ?? systemLookup)(host)
    } catch {
      throw new MailServerRefused(`${host} was not found`)
    }
    if (addresses.length === 0) throw new MailServerRefused(`${host} was not found`)
  }
  const letThrough = allowed.has(`${host}:${port}`)
  for (const a of addresses) {
    if (isPrivateOrReservedIp(a.address) && !letThrough && !allowed.has(`${a.address}:${port}`)) {
      throw new MailServerRefused(`${host} is on a private network: Rundesk reaches mail servers on the internet, or those this server's operator names`)
    }
  }
  return { host, port, address: addresses[0].address, ...(net.isIP(host) ? {} : { servername: host }) }
}

/** The certificate authorities a mailbox's TLS trusts beyond the system's: the operator's, when named. */
export function mailTlsCa(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const file = (env.MAILBOX_TLS_CA_FILE ?? '').trim()
  if (!file) return undefined
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}
