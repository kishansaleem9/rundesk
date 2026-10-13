import { randomBytes } from 'node:crypto'

/**
 * AN EMAIL AS A MAILBOX TAKES IT AND GIVES IT BACK
 * (`found-9-oct/task-email-sends-from-the-server`).
 *
 * Gmail sends what it is given as a whole message — RFC 5322 headers and a MIME
 * body, base64url-encoded — and gives a message back as parts; Graph takes and
 * gives JSON. These are the pure halves: building the message Gmail sends, and
 * reading the words, the sender and the ids out of what either gives back.
 * Unit-tested without a mailbox.
 */

export type OutgoingMail = {
  fromName: string
  fromAddress: string
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  text: string
  /** The email answered, for the other side's client to thread on. */
  inReplyTo?: string
  references?: string[]
  attachments: Array<{ filename: string; contentType?: string; content: Buffer }>
  /**
   * Its own Message-ID and Date, written by whoever sends it: Gmail and Graph
   * write both themselves, and an SMTP server writes neither for a client
   * (`found-12-oct/task-email-imap-unbuilt`).
   */
  messageId?: string
  date?: Date
}

/** RFC 5322's date: `Tue, 13 Oct 2026 12:00:00 +0000`. */
export const mailDate = (d: Date) => d.toUTCString().replace(/GMT$/, '+0000')

/** A header's words, in RFC 2047's base64 when they are not plain ASCII. */
export function encodeHeaderWords(value: string): string {
  const clean = value.replace(/[\r\n]+/g, ' ')
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`
}

/** `"Name" <address>`, the name quoted and encoded as it needs to be. */
export function mailbox(name: string, address: string): string {
  const n = name.replace(/[\r\n"<>\\]+/g, ' ').trim()
  if (!n) return `<${address}>`
  return /^[\x20-\x7e]*$/.test(n) ? `"${n}" <${address}>` : `${encodeHeaderWords(n)} <${address}>`
}

/** Base64 in lines of 76, as a MIME body is written. */
const base64Lines = (buf: Buffer) => buf.toString('base64').replace(/.{76}(?=.)/g, '$&\r\n')

/** A file's name for `Content-Disposition`, in RFC 2231's form when it is not plain ASCII. */
function dispositionName(filename: string): string {
  const safe = filename.replace(/[\r\n"\\]+/g, '_')
  return /^[\x20-\x7e]*$/.test(safe) ? `filename="${safe}"` : `filename*=UTF-8''${encodeURIComponent(safe)}`
}

/**
 * The whole message Gmail's `messages.send` takes as `raw`: the headers — Bcc
 * among them, which Gmail sends to and strips — and the words, with each file
 * as a part beside them.
 */
export function buildMime(mail: OutgoingMail, boundary = `rd-${randomBytes(12).toString('hex')}`): string {
  const headers = [
    mail.date ? `Date: ${mailDate(mail.date)}` : null,
    mail.messageId ? `Message-ID: ${mail.messageId}` : null,
    `From: ${mailbox(mail.fromName, mail.fromAddress)}`,
    mail.to.length ? `To: ${mail.to.join(', ')}` : null,
    mail.cc.length ? `Cc: ${mail.cc.join(', ')}` : null,
    mail.bcc.length ? `Bcc: ${mail.bcc.join(', ')}` : null,
    `Subject: ${encodeHeaderWords(mail.subject)}`,
    mail.inReplyTo ? `In-Reply-To: ${mail.inReplyTo}` : null,
    mail.references?.length ? `References: ${mail.references.join(' ')}` : mail.inReplyTo ? `References: ${mail.inReplyTo}` : null,
    'MIME-Version: 1.0',
  ].filter((h): h is string => h !== null)
  const textPart = ['Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', base64Lines(Buffer.from(mail.text, 'utf8'))]
  if (mail.attachments.length === 0) return [...headers, ...textPart].join('\r\n')
  const parts = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    ...textPart,
  ]
  for (const a of mail.attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${(a.contentType || 'application/octet-stream').replace(/[\r\n]+/g, '')}`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; ${dispositionName(a.filename)}`,
      '',
      base64Lines(a.content),
    )
  }
  parts.push(`--${boundary}--`, '')
  return parts.join('\r\n')
}

/** base64url, as Gmail takes `raw` and gives a part's `body.data`. */
export const toBase64Url = (s: string | Buffer) => Buffer.from(s).toString('base64url')
export const fromBase64Url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')

/** The address in `Name <address>`, or the bare one, in lower case; null when there is none. */
export function addressIn(header: string | null | undefined): string | null {
  if (!header) return null
  const angled = /<([^<>\s]+@[^<>\s]+)>/.exec(header)?.[1]
  const bare = angled ?? /([^\s<>"',;]+@[^\s<>"',;]+)/.exec(header)?.[1]
  return bare ? bare.trim().toLowerCase() : null
}

/** Every address in a To or Cc header. */
export function addressesIn(header: string | null | undefined): string[] {
  if (!header) return []
  return header.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((p) => addressIn(p)).filter((a): a is string => !!a)
}

type GmailPart = { mimeType?: string; filename?: string; body?: { data?: string }; parts?: GmailPart[]; headers?: Array<{ name: string; value: string }> }

/** A Gmail message's header, by name, whatever its case. */
export function gmailHeader(payload: GmailPart | undefined, name: string): string | null {
  const h = payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())
  return h?.value ?? null
}

/** The words of a Gmail message: its plain part, else its HTML part as text. */
export function gmailText(payload: GmailPart | undefined): string {
  const find = (p: GmailPart | undefined, type: string): string | null => {
    if (!p) return null
    if (p.mimeType === type && p.body?.data && !p.filename) return fromBase64Url(p.body.data)
    for (const c of p.parts ?? []) {
      const got = find(c, type)
      if (got !== null) return got
    }
    return null
  }
  const plain = find(payload, 'text/plain')
  if (plain !== null) return plain
  const html = find(payload, 'text/html')
  return html !== null ? htmlToText(html) : ''
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>(\r?\n)?/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * An answer's own words: what was written above the quote of the email it
 * answers — "On … wrote:", "-----Original Message-----", a quoted "From: …",
 * or the `>` lines that close it.
 */
export function withoutQuote(text: string): string {
  if (!text) return ''
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const cutAt = lines.findIndex(
    (l) => /^On .* wrote:$/i.test(l.trim()) || /^-+\s*Original Message\s*-+$/i.test(l.trim()) || /^From: .+@/i.test(l.trim()),
  )
  const kept = cutAt > 0 ? lines.slice(0, cutAt) : lines
  while (kept.length && /^\s*(>.*)?$/.test(kept[kept.length - 1])) kept.pop()
  return kept.join('\n').trimEnd()
}

/*
 * A WHOLE MESSAGE AS AN IMAP SERVER GIVES IT (`found-12-oct/task-email-imap-unbuilt`).
 *
 * Gmail and Graph give a message already taken apart; IMAP gives its bytes,
 * RFC 5322 headers and a MIME body. What the answers' reader needs of them:
 * the ids it threads by, who it is from and to, its subject — encoded words
 * decoded — and its words, read as a mail client reads them: the plain part,
 * else the HTML part as text; quoted-printable or base64, in its charset.
 */

export type ParsedMail = {
  messageId: string | null
  inReplyTo: string | null
  references: string[]
  from: string | null
  to: string[]
  cc: string[]
  subject: string
  /** Its Date header, in milliseconds; 0 when it has none that reads. */
  at: number
  text: string
}

type Head = Map<string, string[]>

function splitHead(raw: Buffer): { head: string; body: Buffer } {
  const crlf = raw.indexOf('\r\n\r\n')
  const lf = raw.indexOf('\n\n')
  const at = crlf >= 0 && (lf < 0 || crlf < lf) ? { i: crlf, n: 4 } : lf >= 0 ? { i: lf, n: 2 } : null
  if (!at) return { head: raw.toString('latin1'), body: Buffer.alloc(0) }
  return { head: raw.subarray(0, at.i).toString('latin1'), body: raw.subarray(at.i + at.n) }
}

function readHead(head: string): Head {
  const out: Head = new Map()
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = /^([!-9;-~]+):\s*(.*)$/.exec(line)
    if (!m) continue
    const name = m[1].toLowerCase()
    out.set(name, [...(out.get(name) ?? []), m[2].trim()])
  }
  return out
}

const first = (h: Head, name: string) => h.get(name)?.[0] ?? null

function decodeCharset(bytes: Buffer, charset: string | null): string {
  const label = (charset ?? 'utf-8').trim().toLowerCase() || 'utf-8'
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    return bytes.toString('utf8')
  }
}

/** Quoted-printable's bytes: soft line breaks joined, `=XX` read as a byte. */
export function quotedPrintableBytes(text: string, underscoreIsSpace = false): Buffer {
  const s = text.replace(/=\r?\n/g, '')
  const bytes: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '=' && /^[0-9a-f]{2}$/i.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16))
      i += 2
    } else if (underscoreIsSpace && c === '_') {
      bytes.push(0x20)
    } else {
      bytes.push(c.charCodeAt(0) & 0xff)
    }
  }
  return Buffer.from(bytes)
}

/** A header's words with RFC 2047's encoded words decoded, whitespace between two of them dropped. */
export function decodeHeaderWords(value: string): string {
  return value
    .replace(/(=\?[^?\s]+\?[bq]\?[^?\s]*\?=)\s+(?==\?)/gi, '$1')
    .replace(/=\?([^?\s]+)\?([bq])\?([^?\s]*)\?=/gi, (_, charset: string, how: string, data: string) => {
      const bytes = how.toLowerCase() === 'b' ? Buffer.from(data, 'base64') : quotedPrintableBytes(data, true)
      return decodeCharset(bytes, charset.replace(/\*.*$/, ''))
    })
}

/** `type/subtype` and its parameters, names in lower case. */
function contentTypeOf(h: Head): { type: string; params: Map<string, string> } {
  const raw = first(h, 'content-type') ?? 'text/plain; charset=us-ascii'
  const [type, ...rest] = raw.split(';')
  const params = new Map<string, string>()
  for (const p of rest) {
    const m = /^\s*([^=\s]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;\s]*))/.exec(p)
    if (m) params.set(m[1].toLowerCase(), (m[2] ?? m[3] ?? '').replace(/\\(.)/g, '$1'))
  }
  return { type: type.trim().toLowerCase(), params }
}

function bodyBytes(h: Head, body: Buffer): Buffer {
  const cte = (first(h, 'content-transfer-encoding') ?? '7bit').toLowerCase()
  if (cte === 'base64') return Buffer.from(body.toString('latin1').replace(/[^A-Za-z0-9+/=]/g, ''), 'base64')
  if (cte === 'quoted-printable') return quotedPrintableBytes(body.toString('latin1'))
  return body
}

/** The part a client shows: plain text first, else HTML read as text; never a file. */
function wordsOf(h: Head, body: Buffer, depth = 0): { plain: string | null; html: string | null } {
  const ct = contentTypeOf(h)
  const disposition = (first(h, 'content-disposition') ?? '').toLowerCase()
  if (disposition.startsWith('attachment')) return { plain: null, html: null }
  if (ct.type.startsWith('multipart/') && depth < 8) {
    const boundary = ct.params.get('boundary')
    if (!boundary) return { plain: null, html: null }
    const text = body.toString('latin1')
    const marker = `--${boundary}`
    const pieces = text.split(new RegExp(`\\r?\\n?${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?[ \\t]*\\r?\\n?`))
    let plain: string | null = null
    let html: string | null = null
    for (const piece of pieces.slice(1)) {
      if (!piece.trim()) continue
      const part = splitHead(Buffer.from(piece, 'latin1'))
      const got = wordsOf(readHead(part.head), part.body, depth + 1)
      plain ??= got.plain
      html ??= got.html
    }
    return { plain, html }
  }
  if (ct.type === 'text/plain' || ct.type === '') return { plain: decodeCharset(bodyBytes(h, body), ct.params.get('charset') ?? null), html: null }
  if (ct.type === 'text/html') return { plain: null, html: decodeCharset(bodyBytes(h, body), ct.params.get('charset') ?? null) }
  return { plain: null, html: null }
}

const idsIn = (v: string | null) => (v ? [...v.matchAll(/<[^<>\s]+>/g)].map((m) => m[0]) : [])

export function parseRawMail(raw: Buffer): ParsedMail {
  const { head, body } = splitHead(raw)
  const h = readHead(head)
  const words = wordsOf(h, body)
  const at = Date.parse(first(h, 'date') ?? '')
  return {
    messageId: idsIn(first(h, 'message-id'))[0] ?? null,
    inReplyTo: idsIn(first(h, 'in-reply-to'))[0] ?? null,
    references: idsIn((h.get('references') ?? []).join(' ')),
    from: addressIn(decodeHeaderWords(first(h, 'from') ?? '')),
    to: (h.get('to') ?? []).flatMap((v) => addressesIn(decodeHeaderWords(v))),
    cc: (h.get('cc') ?? []).flatMap((v) => addressesIn(decodeHeaderWords(v))),
    subject: decodeHeaderWords(first(h, 'subject') ?? ''),
    at: Number.isFinite(at) ? at : 0,
    text: (words.plain ?? (words.html !== null ? htmlToText(words.html) : '')).replace(/\r\n/g, '\n'),
  }
}
