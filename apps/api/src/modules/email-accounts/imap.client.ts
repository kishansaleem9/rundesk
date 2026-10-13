import * as net from 'node:net'
import * as tls from 'node:tls'
import { mailTlsCa, type MailServer } from './mail-server'

/**
 * THE PART OF IMAP (RFC 3501) A LINKED MAILBOX IS READ WITH
 * (`found-12-oct/task-email-imap-unbuilt`).
 *
 * ClickUp links "another mailbox over IMAP" by its servers and its password.
 * Rundesk signs in to it to read the answers to the emails sent from it, and to
 * leave the AI's drafts in its Drafts: CAPABILITY, STARTTLS, LOGIN (or
 * AUTHENTICATE PLAIN for a password a quoted string cannot carry), LIST,
 * SELECT, UID SEARCH, UID FETCH, APPEND and LOGOUT — and nothing that changes
 * what is in the mailbox but the drafts it is asked to leave. "Requires SSL"
 * is TLS from the first byte on port 993, and STARTTLS before signing in on any
 * other; without it the session is in the clear, as the person chose.
 */

export class ImapRefused extends Error {
  constructor(
    readonly said: string,
    /** The sign-in itself was refused: only linking again mends it. */
    readonly signIn: boolean,
  ) {
    super(said)
    this.name = 'ImapRefused'
  }
}

export type ImapAccount = { server: MailServer; useSsl: boolean; user: string; password: string }

type Response = { text: string; literals: Buffer[] }
type Done = { status: 'OK' | 'NO' | 'BAD'; text: string; untagged: Response[] }

const COMMAND_MS = 20_000

/** A string as IMAP takes it: quoted when it can be, else a literal (sent after the server's "+"). */
export type Part = string | { literal: Buffer }
export function astring(value: string): Part {
  if (/^[\x20-\x7e]*$/.test(value)) return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  return { literal: Buffer.from(value, 'utf8') }
}

/**
 * ONE RESPONSE OUT OF WHAT THE SERVER SENT: a line, and every literal it
 * carries (`{n}` then n bytes, then the line goes on). Each literal's place in
 * the text is marked `{#i}`. Null until the whole response is in.
 */
export function takeResponse(buf: Buffer): { response: Response; rest: Buffer } | null {
  let pos = 0
  let text = ''
  const literals: Buffer[] = []
  for (;;) {
    const eol = buf.indexOf('\r\n', pos)
    if (eol < 0) return null
    const line = buf.subarray(pos, eol).toString('utf8')
    const m = /\{(\d+)\+?\}$/.exec(line)
    if (!m) {
      text += line
      return { response: { text, literals }, rest: buf.subarray(eol + 2) }
    }
    const n = Number(m[1])
    const start = eol + 2
    if (buf.length < start + n) return null
    text += `${line.slice(0, -m[0].length)}{#${literals.length}}`
    literals.push(Buffer.from(buf.subarray(start, start + n)))
    pos = start + n
  }
}

export class ImapSession {
  private buf: Buffer = Buffer.alloc(0)
  private queue: Response[] = []
  private wake: (() => void) | null = null
  private closed: Error | null = null
  private tag = 0
  capabilities = new Set<string>()

  private constructor(private socket: net.Socket) {
    this.listen(socket)
  }

  private listen(socket: net.Socket) {
    socket.on('data', (chunk: Buffer) => {
      this.buf = Buffer.concat([this.buf, chunk])
      for (let got = takeResponse(this.buf); got; got = takeResponse(this.buf)) {
        this.buf = got.rest
        this.queue.push(got.response)
      }
      this.wake?.()
    })
    const end = (err?: Error) => {
      if (!this.closed) this.closed = err ?? new Error('the server closed the connection')
      this.wake?.()
    }
    socket.on('error', end)
    socket.on('close', () => end())
  }

  private async next(deadline: number): Promise<Response> {
    for (;;) {
      const r = this.queue.shift()
      if (r) return r
      if (this.closed) throw this.closed
      const left = deadline - Date.now()
      if (left <= 0) throw new Error('the server did not answer in time')
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left)
        this.wake = () => {
          clearTimeout(t)
          this.wake = null
          resolve()
        }
      })
    }
  }

  /** A command, its literals sent as the server asks for them; what it answered. */
  async run(...parts: Part[]): Promise<Done> {
    const tag = `R${++this.tag}`
    const deadline = Date.now() + COMMAND_MS
    const untagged: Response[] = []
    let line = `${tag} `
    for (const p of parts) {
      if (typeof p === 'string') {
        line += p
        continue
      }
      this.socket.write(`${line}{${p.literal.length}}\r\n`)
      line = ''
      for (;;) {
        const r = await this.next(deadline)
        if (r.text.startsWith('+')) break
        if (r.text.startsWith(`${tag} `)) return this.done(r, untagged)
        untagged.push(r)
      }
      this.socket.write(p.literal)
    }
    this.socket.write(`${line}\r\n`)
    for (;;) {
      const r = await this.next(deadline)
      if (r.text.startsWith(`${tag} `)) return this.done(r, untagged)
      if (r.text.startsWith('+')) continue
      untagged.push(r)
    }
  }

  private done(r: Response, untagged: Response[]): Done {
    const m = /^\S+ (OK|NO|BAD)\b ?(.*)$/i.exec(r.text)
    return { status: (m?.[1]?.toUpperCase() as Done['status']) ?? 'BAD', text: m?.[2] ?? r.text, untagged }
  }

  /** OK, or the server's words. */
  async ok(what: string, ...parts: Part[]): Promise<Done> {
    const d = await this.run(...parts)
    if (d.status !== 'OK') throw new ImapRefused(`The IMAP server refused ${what}: ${d.text || d.status}`, false)
    return d
  }

  private async readCapabilities() {
    const d = await this.ok('CAPABILITY', 'CAPABILITY')
    const line = d.untagged.find((u) => /^\* CAPABILITY /i.test(u.text))?.text ?? ''
    this.capabilities = new Set(line.replace(/^\* CAPABILITY /i, '').toUpperCase().split(/\s+/).filter(Boolean))
  }

  /** Connected, encrypted as asked, and signed in; or refused, in the server's words. */
  static async open(a: ImapAccount): Promise<ImapSession> {
    const ca = mailTlsCa()
    const tlsOptions = {
      servername: a.server.servername,
      ca: ca ? [...tls.rootCertificates, ca] : undefined,
      rejectUnauthorized: true,
    }
    const implicit = a.useSsl && a.server.port === 993
    const socket: net.Socket = await new Promise((resolve, reject) => {
      const s: net.Socket = implicit
        ? tls.connect({ host: a.server.address, port: a.server.port, ...tlsOptions, ...(a.server.servername ? {} : { host: a.server.host }) }, () => resolve(s))
        : net.connect({ host: a.server.address, port: a.server.port }, () => resolve(s))
      s.setTimeout(COMMAND_MS, () => s.destroy(new Error('the server did not answer in time')))
      s.once('error', (err) => reject(new ImapRefused(`Could not reach ${a.server.host}:${a.server.port}: ${err.message}`, false)))
    })
    let session = new ImapSession(socket)
    try {
      const greeting = await session.next(Date.now() + COMMAND_MS)
      if (/^\* BYE/i.test(greeting.text)) throw new ImapRefused(`The IMAP server turned the connection away: ${greeting.text.slice(6)}`, false)
      await session.readCapabilities()
      if (a.useSsl && !implicit) {
        if (!session.capabilities.has('STARTTLS')) {
          throw new ImapRefused(`${a.server.host}:${a.server.port} offers no TLS, and this mailbox requires SSL`, false)
        }
        await session.ok('STARTTLS', 'STARTTLS')
        const upgraded: tls.TLSSocket = await new Promise((resolve, reject) => {
          const t = tls.connect({ socket, ...tlsOptions, ...(a.server.servername ? {} : { host: a.server.host }) }, () => resolve(t))
          t.once('error', (err) => reject(new ImapRefused(`TLS with ${a.server.host} failed: ${err.message}`, false)))
        })
        socket.removeAllListeners('data')
        session = new ImapSession(upgraded)
        await session.readCapabilities()
      }
      const quoted = /^[\x20-\x7e]*$/.test(a.user) && /^[\x20-\x7e]*$/.test(a.password)
      const signedIn =
        quoted && !session.capabilities.has('LOGINDISABLED')
          ? await session.run('LOGIN ', astring(a.user), ' ', astring(a.password))
          : await session.authenticatePlain(a.user, a.password)
      if (signedIn.status !== 'OK') throw new ImapRefused(`The IMAP server refused the sign-in: ${signedIn.text || signedIn.status}`, true)
      return session
    } catch (err) {
      session.close()
      if (err instanceof ImapRefused) throw err
      throw new ImapRefused(`${a.server.host}:${a.server.port}: ${err instanceof Error ? err.message : String(err)}`, false)
    }
  }

  /** SASL PLAIN (RFC 4616): the server asks with "+", and is answered with the user and password in base64. */
  private async authenticatePlain(user: string, password: string): Promise<Done> {
    const tag = `R${++this.tag}`
    const deadline = Date.now() + COMMAND_MS
    this.socket.write(`${tag} AUTHENTICATE PLAIN\r\n`)
    const untagged: Response[] = []
    for (;;) {
      const r = await this.next(deadline)
      if (r.text.startsWith(`${tag} `)) return this.done(r, untagged)
      if (r.text.startsWith('+')) {
        this.socket.write(`${Buffer.from(`\0${user}\0${password}`, 'utf8').toString('base64')}\r\n`)
        continue
      }
      untagged.push(r)
    }
  }

  close() {
    this.socket.destroy()
  }

  async logout() {
    await this.run('LOGOUT').catch(() => null)
    this.close()
  }

  /** The mailbox opened read-only for what follows, and its UIDVALIDITY. */
  async examine(mailbox: string): Promise<{ uidValidity: string }> {
    const d = await this.ok(`to open ${mailbox}`, 'EXAMINE ', astring(mailbox))
    const v = d.untagged.map((u) => /\[UIDVALIDITY (\d+)\]/i.exec(u.text)?.[1]).find(Boolean)
    return { uidValidity: v ?? '0' }
  }

  /** The UIDs a search finds. */
  async uidSearch(...criteria: Part[]): Promise<number[]> {
    const d = await this.ok('the search', 'UID SEARCH ', ...criteria)
    return d.untagged
      .filter((u) => /^\* SEARCH\b/i.test(u.text))
      .flatMap((u) => u.text.replace(/^\* SEARCH/i, '').trim().split(/\s+/))
      .filter((x) => /^\d+$/.test(x))
      .map(Number)
  }

  /** For each UID, the section asked for (`BODY.PEEK[]` and the like), as bytes. */
  async uidFetch(uids: number[], section: string): Promise<Map<number, Buffer>> {
    const out = new Map<number, Buffer>()
    if (uids.length === 0) return out
    const d = await this.ok('to give the messages', `UID FETCH ${uids.join(',')} (UID ${section})`)
    for (const u of d.untagged) {
      const uid = /\bUID (\d+)/i.exec(u.text)?.[1]
      const lit = /\{#(\d+)\}/.exec(u.text)?.[1]
      if (uid && lit !== undefined) out.set(Number(uid), u.literals[Number(lit)])
    }
    return out
  }

  /** The mailboxes, with their attributes (`\Drafts` among them, RFC 6154). */
  async list(): Promise<Array<{ name: string; flags: string[] }>> {
    const d = await this.ok('to list its folders', 'LIST "" "*"')
    const out: Array<{ name: string; flags: string[] }> = []
    for (const u of d.untagged) {
      const m = /^\* LIST \(([^)]*)\) (?:"(?:[^"\\]|\\.)*"|NIL) (.*)$/i.exec(u.text)
      if (!m) continue
      const raw = m[2].trim()
      const lit = /^\{#(\d+)\}$/.exec(raw)?.[1]
      const name = lit !== undefined ? u.literals[Number(lit)].toString('utf8') : raw.startsWith('"') ? raw.slice(1, -1).replace(/\\(.)/g, '$1') : raw
      out.push({ name, flags: m[1].split(/\s+/).filter(Boolean) })
    }
    return out
  }

  /** A message added to a mailbox, with its flags. */
  async append(mailbox: string, flags: string[], message: Buffer): Promise<void> {
    await this.ok(`to keep the message in ${mailbox}`, 'APPEND ', astring(mailbox), ` (${flags.join(' ')}) `, { literal: message })
  }
}

/** Signed in, `fn` run, signed out — whatever `fn` did. */
export async function withImap<T>(a: ImapAccount, fn: (s: ImapSession) => Promise<T>): Promise<T> {
  const s = await ImapSession.open(a)
  try {
    return await fn(s)
  } finally {
    await s.logout()
  }
}
