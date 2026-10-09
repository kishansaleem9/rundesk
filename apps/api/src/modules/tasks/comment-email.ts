/**
 * WHAT AN EMAIL FROM A TASK'S COMMENT BOX MAY BE, AND HOW ITS PARTS ARE READ
 * (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`). Pure, and
 * unit-tested in comment-email.test.ts; `CommentEmailService` sends.
 */

/** The most people one email goes to, To, CC and BCC together. */
export const EMAIL_MAX_RECIPIENTS = 50
export const EMAIL_SUBJECT_MAX = 255
export const EMAIL_BODY_MAX = 20_000
/**
 * The most an email's files may come to: 18 MB. Sent, they grow by a third
 * (base64), and 25 MB is what most mail servers take — Gmail's limit among them.
 */
export const EMAIL_ATTACHMENTS_MAX_BYTES = 18 * 1024 * 1024

export const COMMENT_EMAIL_REFUSALS = {
  off: 'Email is off in this workspace: an owner or admin turns it on in Settings → ClickApps',
  guest: 'Guests cannot send email from a task',
  unconfigured: 'This server has no mail server set up, so it cannot send email',
  noRecipient: 'An email needs somebody to go to',
  tooMany: `An email goes to ${EMAIL_MAX_RECIPIENTS} people at most`,
  empty: 'An email needs words or a file',
  subjectTooLong: `A subject is ${EMAIL_SUBJECT_MAX} characters at most`,
  bodyTooLong: `An email is ${EMAIL_BODY_MAX.toLocaleString('en-US')} characters at most`,
  filesTooBig: `An email's files come to ${EMAIL_ATTACHMENTS_MAX_BYTES / (1024 * 1024)} MB at most`,
  noStore: 'Files cannot be sent: this server has no file storage set up',
  notAReply: 'The comment answered is not on this task',
} as const

/*
 * An address as mail servers take it: something, an @, a domain with a dot.
 * No spaces, no angle brackets, quotes, commas or semicolons — a name or a
 * second address would ride in with them — and nothing that ends a header line.
 */
const ADDRESS = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\].]{2,}$/

/** An address as a person typed it, lower-cased; null when it is not one. */
export function emailAddress(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  return value.length <= 254 && ADDRESS.test(value) ? value : null
}

export type Recipients = { to: string[]; cc: string[]; bcc: string[] }

/**
 * To, CC and BCC as they go: each address once, in the first of the three that
 * names it (a person put in To and CC gets one copy, as To), and at least one
 * in To. Refused, with the words a person is told: an address that is not one,
 * by itself; no To; more than `EMAIL_MAX_RECIPIENTS` in all.
 */
export function emailRecipients(input: { to?: string[]; cc?: string[]; bcc?: string[] }): { ok: true; recipients: Recipients } | { ok: false; message: string } {
  const seen = new Set<string>()
  const out: Recipients = { to: [], cc: [], bcc: [] }
  for (const field of ['to', 'cc', 'bcc'] as const) {
    for (const raw of input[field] ?? []) {
      if (!raw.trim()) continue
      const address = emailAddress(raw)
      if (!address) return { ok: false, message: `“${raw.trim().slice(0, 100)}” is not an email address` }
      if (seen.has(address)) continue
      seen.add(address)
      out[field].push(address)
    }
  }
  if (out.to.length === 0) return { ok: false, message: COMMENT_EMAIL_REFUSALS.noRecipient }
  if (seen.size > EMAIL_MAX_RECIPIENTS) return { ok: false, message: COMMENT_EMAIL_REFUSALS.tooMany }
  return { ok: true, recipients: out }
}

/** A subject as it goes: one line, trimmed, and the task's title when none was given. */
export function emailSubject(given: string | undefined, taskTitle: string): string {
  const line = (s: string) => s.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  return line(given ?? '') || line(taskTitle).slice(0, EMAIL_SUBJECT_MAX)
}

/** The subject of an answer: "Re: " before the subject answered, once. */
export function replySubject(subject: string): string {
  const s = subject.trim()
  return /^re:/i.test(s) ? s : `Re: ${s}`.slice(0, EMAIL_SUBJECT_MAX)
}
