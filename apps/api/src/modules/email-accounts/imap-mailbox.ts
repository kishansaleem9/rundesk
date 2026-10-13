import { randomUUID } from 'node:crypto'
import * as tls from 'node:tls'
import nodemailer from 'nodemailer'
import { ImapRefused, withImap, type ImapAccount, type ImapSession } from './imap.client'
import { buildMime, parseRawMail, type OutgoingMail } from './mail-message'
import { mailTlsCa, MailServerRefused, resolveMailServer, type MailServer } from './mail-server'
import { MailboxRefused, type SentMail, type ThreadMessage } from './mailbox.client'

/**
 * A MAILBOX LINKED BY ITS SERVERS AND ITS PASSWORD, AS CLICKUP'S "SIGN IN WITH
 * IMAP" LINKS ONE (`found-12-oct/task-email-imap-unbuilt`).
 *
 * The email goes out through its SMTP server, signed in as the mailbox, with a
 * Message-ID of its own — the thread's, when it starts one — and its Bcc only
 * in the envelope (an SMTP server sends the headers as they are given). The
 * answers are read from its IMAP inbox, found by that Message-ID in their
 * References or In-Reply-To. A draft is left in its Drafts (`\Drafts`, RFC
 * 6154; else the folder named so). Each use resolves the servers again and
 * checks them as `mail-server.ts` does.
 */

export type ImapGrant = {
  provider: 'imap'
  address: string
  password: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  useSsl: boolean
}

/** A refusal of the servers' own, or of where they are, in the words the person reads. */
function refusalOf(err: unknown, where: string): MailboxRefused {
  if (err instanceof MailboxRefused) return err
  if (err instanceof MailServerRefused) return new MailboxRefused(err.message, false)
  if (err instanceof ImapRefused) return new MailboxRefused(err.said, err.signIn)
  const e = err as { code?: string; response?: string; responseCode?: number; message?: string }
  if (e?.code === 'EAUTH') return new MailboxRefused(`The SMTP server refused the sign-in: ${(e.response ?? e.message ?? '').slice(0, 200)}`, true)
  if (e?.responseCode) return new MailboxRefused(`The SMTP server refused the email (${e.responseCode}): ${(e.response ?? '').slice(0, 200)}`, false)
  return new MailboxRefused(`Could not reach ${where}: ${(e?.message ?? String(err)).slice(0, 200)}`, false)
}

async function imapAccountOf(g: ImapGrant): Promise<ImapAccount> {
  const server = await resolveMailServer(g.imapHost, g.imapPort)
  return { server, useSsl: g.useSsl, user: g.address, password: g.password }
}

function smtpTransport(g: ImapGrant, server: MailServer) {
  const ca = mailTlsCa()
  // "Requires SSL": TLS from the first byte on 465, STARTTLS before signing in on any other port.
  const implicit = g.useSsl && server.port === 465
  return nodemailer.createTransport({
    host: server.address,
    port: server.port,
    // The name typed, for SNI and the certificate's check, though the address checked is what is dialled.
    ...(server.servername ? { servername: server.servername } : {}),
    secure: implicit,
    requireTLS: g.useSsl && !implicit,
    ignoreTLS: !g.useSsl,
    auth: { user: g.address, pass: g.password },
    tls: { ca: ca ? [...tls.rootCertificates, ca] : undefined, rejectUnauthorized: true },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })
}

/** A Message-ID of the mailbox's own domain. */
export function newMessageId(address: string): string {
  const domain = address.split('@')[1] || 'rundesk.invalid'
  return `<rd.${randomUUID()}@${domain}>`
}

/**
 * SIGNED IN BOTH WAYS BEFORE IT IS KEPT: its inbox opened over IMAP, and SMTP
 * signed in to. A mailbox that cannot send or cannot be read is not linked.
 */
export async function verifyImapMailbox(g: ImapGrant): Promise<void> {
  try {
    await withImap(await imapAccountOf(g), async (s) => {
      await s.examine('INBOX')
    })
  } catch (err) {
    throw refusalOf(err, `${g.imapHost}:${g.imapPort}`)
  }
  try {
    const server = await resolveMailServer(g.smtpHost, g.smtpPort)
    const t = smtpTransport(g, server)
    try {
      await t.verify()
    } finally {
      t.close()
    }
  } catch (err) {
    throw refusalOf(err, `${g.smtpHost}:${g.smtpPort}`)
  }
}

/** Sent through the mailbox's SMTP server; an answer threads on what it answers and on the thread's first email. */
export async function sendFromImap(
  g: ImapGrant,
  mail: OutgoingMail,
  answering?: { threadId: string; providerMessageId: string | null; internetMessageId: string | null } | null,
): Promise<SentMail> {
  const messageId = newMessageId(g.address)
  const references = [...new Set([answering?.threadId, answering?.internetMessageId].filter((x): x is string => !!x && x.startsWith('<')))]
  const raw = buildMime({
    ...mail,
    bcc: [],
    messageId,
    date: new Date(),
    inReplyTo: answering?.internetMessageId ?? undefined,
    references: references.length ? references : undefined,
  })
  try {
    const server = await resolveMailServer(g.smtpHost, g.smtpPort)
    const t = smtpTransport(g, server)
    try {
      await t.sendMail({ envelope: { from: g.address, to: [...mail.to, ...mail.cc, ...mail.bcc] }, raw })
    } finally {
      t.close()
    }
  } catch (err) {
    throw refusalOf(err, `${g.smtpHost}:${g.smtpPort}`)
  }
  // An answer in another mailbox's thread (`threadId: ''`) starts a thread of this mailbox's own.
  return { threadId: answering?.threadId || messageId, providerMessageId: `imap:${messageId}`, internetMessageId: messageId }
}

/** The bare id a header search finds whichever way a client wrote it. */
const bare = (id: string) => id.replace(/^<|>$/g, '').replace(/["\\\r\n]/g, '')

async function readThreadsIn(s: ImapSession, threadIds: string[], known: (ids: string[]) => Promise<Set<string>>): Promise<Map<string, ThreadMessage[]>> {
  const out = new Map<string, ThreadMessage[]>()
  const { uidValidity } = await s.examine('INBOX')
  for (const threadId of threadIds) {
    const id = bare(threadId)
    out.set(threadId, [])
    if (!id) continue
    const uids = await s.uidSearch(`OR HEADER References "${id}" HEADER In-Reply-To "${id}"`)
    if (uids.length === 0) continue
    // Each message's id first, and the whole of only those not already in their task.
    const heads = await s.uidFetch(uids, 'BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)]')
    const idOf = new Map<number, string>()
    for (const uid of uids) {
      const mid = /<[^<>\s]+>/.exec(heads.get(uid)?.toString('latin1') ?? '')?.[0]
      idOf.set(uid, mid ? `imap:${mid}` : `imap-uid:${uidValidity}:${uid}`)
    }
    const seen = await known([...idOf.values()])
    const fresh = uids.filter((u) => !seen.has(idOf.get(u)!))
    const bodies = await s.uidFetch(fresh, 'BODY.PEEK[]')
    const messages: ThreadMessage[] = []
    for (const uid of fresh) {
      const raw = bodies.get(uid)
      if (!raw) continue
      const m = parseRawMail(raw)
      messages.push({ providerMessageId: idOf.get(uid)!, internetMessageId: m.messageId, from: m.from, to: m.to, subject: m.subject, text: m.text, at: m.at || uid })
    }
    out.set(threadId, messages.sort((a, b) => a.at - b.at))
  }
  return out
}

/**
 * THE ANSWERS TO THESE THREADS, read from the inbox in one sign-in: each
 * message whose References or In-Reply-To names a thread's first email. What
 * `known` says is already in its task is not read again.
 */
export async function readImapThreads(g: ImapGrant, threadIds: string[], known: (ids: string[]) => Promise<Set<string>>): Promise<Map<string, ThreadMessage[]>> {
  try {
    return await withImap(await imapAccountOf(g), (s) => readThreadsIn(s, threadIds, known))
  } catch (err) {
    throw refusalOf(err, `${g.imapHost}:${g.imapPort}`)
  }
}

/** A draft left in the mailbox's Drafts, for its owner to send from their own mail client. */
export async function draftInImap(g: ImapGrant, mail: OutgoingMail): Promise<{ id: string; messageId: string }> {
  const messageId = newMessageId(g.address)
  const raw = Buffer.from(buildMime({ ...mail, messageId, date: new Date() }), 'utf8')
  try {
    await withImap(await imapAccountOf(g), async (s) => {
      const folders = await s.list()
      const drafts =
        folders.find((f) => f.flags.some((x) => x.toLowerCase() === '\\drafts')) ??
        folders.find((f) => /^(inbox[./])?drafts$/i.test(f.name))
      if (!drafts) throw new MailboxRefused('This mailbox has no Drafts folder to leave the draft in', false)
      await s.append(drafts.name, ['\\Draft', '\\Seen'], raw)
    })
  } catch (err) {
    throw refusalOf(err, `${g.imapHost}:${g.imapPort}`)
  }
  return { id: `imap:${messageId}`, messageId }
}
