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
}

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
