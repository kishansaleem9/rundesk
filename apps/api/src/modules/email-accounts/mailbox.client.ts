import { addressIn, addressesIn, buildMime, gmailHeader, gmailText, htmlToText, toBase64Url, type OutgoingMail } from './mail-message'

/**
 * A LINKED MAILBOX, SPOKEN TO IN ITS PROVIDER'S OWN API
 * (`found-9-oct/task-email-sends-from-the-server`).
 *
 * Gmail: `messages.send` takes the whole message, and `threadId` with the
 * answered email's headers keeps an answer in its thread; `threads.get` gives
 * the thread back, answers and all. Graph: a draft is made — or, for an answer,
 * `createReply` makes it in the answered email's conversation — its files are
 * put on it, and it is sent; the conversation's messages are read by its id.
 * The bases are the ones the rest of the API already reads (`GMAIL_API_URL`,
 * `MICROSOFT_GRAPH_API_URL`), which a lane points at its stub.
 */

export type MailboxGrant = { provider: 'gmail' | 'outlook'; accessToken: string }

/** The provider refused; `reconnect` when the grant itself is gone, which only linking again mends. */
export class MailboxRefused extends Error {
  constructor(
    readonly said: string,
    readonly reconnect: boolean,
  ) {
    super(said)
  }
}

export type SentMail = {
  /** Gmail's thread, or Graph's conversation: where the answers are read from. */
  threadId: string
  /** The provider's id of the message sent. */
  providerMessageId: string
  /** Its Message-ID header, when the provider says it. */
  internetMessageId: string | null
}

export type ThreadMessage = {
  providerMessageId: string
  internetMessageId: string | null
  from: string | null
  to: string[]
  subject: string
  text: string
  at: number
}

const gmailBase = () => (process.env.GMAIL_API_URL ?? 'https://gmail.googleapis.com/gmail/v1').replace(/\/$/, '')
const graphBase = () => (process.env.MICROSOFT_GRAPH_API_URL ?? 'https://graph.microsoft.com/v1.0').replace(/\/$/, '')

/** What a provider's error says, in its own words where it gave any. */
async function refusalOf(res: Response, provider: 'gmail' | 'outlook'): Promise<MailboxRefused> {
  const raw = await res.text().catch(() => '')
  let said = ''
  try {
    const body = JSON.parse(raw) as { error?: { message?: string } | string; error_description?: string }
    said = typeof body.error === 'string' ? body.error_description ?? body.error : body.error?.message ?? ''
  } catch {
    said = raw.slice(0, 200)
  }
  const name = provider === 'gmail' ? 'Gmail' : 'Outlook'
  const reconnect = res.status === 401 || res.status === 403
  return new MailboxRefused(`${name} refused it (${res.status})${said ? `: ${said}` : ''}`, reconnect)
}

async function call(grant: MailboxGrant, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${grant.accessToken}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw await refusalOf(res, grant.provider)
  return res
}

const graphRecipients = (xs: string[]) => xs.map((address) => ({ emailAddress: { address } }))

/**
 * SEND, AS THE MAILBOX. `answering`: the provider's thread and message of the
 * email answered, and its Message-ID, so the answer is in its thread on both
 * sides.
 */
export async function sendFromMailbox(
  grant: MailboxGrant,
  mail: OutgoingMail,
  answering?: { threadId: string; providerMessageId: string | null; internetMessageId: string | null } | null,
): Promise<SentMail> {
  if (grant.provider === 'gmail') {
    const raw = toBase64Url(buildMime({ ...mail, inReplyTo: answering?.internetMessageId ?? undefined }))
    const res = await call(grant, `${gmailBase()}/users/me/messages/send`, {
      method: 'POST',
      body: JSON.stringify({ raw, ...(answering?.threadId ? { threadId: answering.threadId } : {}) }),
    })
    const sent = (await res.json()) as { id?: string; threadId?: string }
    if (!sent.id || !sent.threadId) throw new MailboxRefused('Gmail did not say what it sent', false)
    // The Message-ID Gmail sent it with: what the other side's answer names.
    const meta = await call(grant, `${gmailBase()}/users/me/messages/${encodeURIComponent(sent.id)}?format=metadata&metadataHeaders=Message-ID`)
      .then((r) => r.json() as Promise<{ payload?: { headers?: Array<{ name: string; value: string }> } }>)
      .catch(() => null)
    return { threadId: sent.threadId, providerMessageId: sent.id, internetMessageId: gmailHeader(meta?.payload, 'Message-ID') }
  }

  const message = {
    subject: mail.subject,
    body: { contentType: 'Text', content: mail.text },
    toRecipients: graphRecipients(mail.to),
    ccRecipients: graphRecipients(mail.cc),
    bccRecipients: graphRecipients(mail.bcc),
  }
  const files = mail.attachments.map((a) => ({
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: a.filename,
    contentType: a.contentType || 'application/octet-stream',
    contentBytes: a.content.toString('base64'),
  }))
  let draft: { id?: string; conversationId?: string; internetMessageId?: string }
  if (answering?.providerMessageId) {
    // An answer is made in the answered email's conversation, and its files put on it after.
    const res = await call(grant, `${graphBase()}/me/messages/${encodeURIComponent(answering.providerMessageId)}/createReply`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
    draft = (await res.json()) as typeof draft
    if (!draft.id) throw new MailboxRefused('Outlook did not make the answer', false)
    for (const f of files) {
      await call(grant, `${graphBase()}/me/messages/${encodeURIComponent(draft.id)}/attachments`, { method: 'POST', body: JSON.stringify(f) })
    }
  } else {
    const res = await call(grant, `${graphBase()}/me/messages`, { method: 'POST', body: JSON.stringify({ ...message, attachments: files }) })
    draft = (await res.json()) as typeof draft
  }
  if (!draft.id || !draft.conversationId) throw new MailboxRefused('Outlook did not make the email', false)
  await call(grant, `${graphBase()}/me/messages/${encodeURIComponent(draft.id)}/send`, { method: 'POST' })
  return { threadId: draft.conversationId, providerMessageId: draft.id, internetMessageId: draft.internetMessageId ?? null }
}

/**
 * A DRAFT, LEFT IN THE MAILBOX'S OWN DRAFTS (`ledger-rows/row-2294`): Gmail's
 * `drafts.create`; on Graph a message made and not sent, which is what a draft
 * is there. Its id, and the id of the message the draft is.
 */
export async function draftInMailbox(grant: MailboxGrant, mail: OutgoingMail): Promise<{ id: string; messageId: string }> {
  if (grant.provider === 'gmail') {
    const raw = toBase64Url(buildMime(mail))
    const res = await call(grant, `${gmailBase()}/users/me/drafts`, { method: 'POST', body: JSON.stringify({ message: { raw } }) })
    const draft = (await res.json()) as { id?: string; message?: { id?: string } }
    if (!draft.id) throw new MailboxRefused('Gmail did not say what it saved', false)
    return { id: draft.id, messageId: draft.message?.id ?? draft.id }
  }
  const res = await call(grant, `${graphBase()}/me/messages`, {
    method: 'POST',
    body: JSON.stringify({
      subject: mail.subject,
      body: { contentType: 'Text', content: mail.text },
      toRecipients: graphRecipients(mail.to),
      ccRecipients: graphRecipients(mail.cc),
      bccRecipients: graphRecipients(mail.bcc),
    }),
  })
  const draft = (await res.json()) as { id?: string }
  if (!draft.id) throw new MailboxRefused('Outlook did not say what it saved', false)
  return { id: draft.id, messageId: draft.id }
}

/** Every message of a thread (Gmail) or conversation (Graph), oldest first. */
export async function readMailboxThread(grant: MailboxGrant, threadId: string): Promise<ThreadMessage[]> {
  if (grant.provider === 'gmail') {
    const res = await call(grant, `${gmailBase()}/users/me/threads/${encodeURIComponent(threadId)}?format=full`)
    const thread = (await res.json()) as { messages?: Array<{ id: string; internalDate?: string; payload?: Parameters<typeof gmailText>[0] }> }
    return (thread.messages ?? [])
      .map((m) => ({
        providerMessageId: m.id,
        internetMessageId: gmailHeader(m.payload, 'Message-ID'),
        from: addressIn(gmailHeader(m.payload, 'From')),
        to: addressesIn(gmailHeader(m.payload, 'To')),
        subject: gmailHeader(m.payload, 'Subject') ?? '',
        text: gmailText(m.payload),
        at: Number(m.internalDate ?? 0),
      }))
      .sort((a, b) => a.at - b.at)
  }
  const filter = encodeURIComponent(`conversationId eq '${threadId.replace(/'/g, "''")}'`)
  const res = await call(grant, `${graphBase()}/me/messages?$filter=${filter}&$top=50`)
  const page = (await res.json()) as {
    value?: Array<{
      id: string
      internetMessageId?: string
      subject?: string
      isDraft?: boolean
      receivedDateTime?: string
      from?: { emailAddress?: { address?: string } }
      toRecipients?: Array<{ emailAddress?: { address?: string } }>
      body?: { contentType?: string; content?: string }
    }>
  }
  return (page.value ?? [])
    .filter((m) => !m.isDraft)
    .map((m) => ({
      providerMessageId: m.id,
      internetMessageId: m.internetMessageId ?? null,
      from: m.from?.emailAddress?.address?.toLowerCase() ?? null,
      to: (m.toRecipients ?? []).map((r) => r.emailAddress?.address?.toLowerCase()).filter((a): a is string => !!a),
      subject: m.subject ?? '',
      text: m.body?.contentType?.toLowerCase() === 'html' ? htmlToText(m.body?.content ?? '') : m.body?.content ?? '',
      at: Date.parse(m.receivedDateTime ?? '') || 0,
    }))
    .sort((a, b) => a.at - b.at)
}

/**
 * A NEW ACCESS TOKEN FROM THE REFRESH TOKEN, at the provider's token address
 * (the one the calendar refresh reads). `invalid_grant` — revoked, expired —
 * is a mailbox to link again.
 */
export async function refreshMailboxGrant(provider: 'gmail' | 'outlook', refreshToken: string): Promise<{ accessToken: string; expiresAt: Date | null }> {
  const google = provider === 'gmail'
  const url = google
    ? process.env.GOOGLE_TOKEN_URL ?? 'https://oauth2.googleapis.com/token'
    : process.env.MICROSOFT_TOKEN_URL ?? 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: (google ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID) ?? '',
    client_secret: (google ? process.env.GOOGLE_CLIENT_SECRET : process.env.MICROSOFT_CLIENT_SECRET) ?? '',
  })
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    const refusal = await refusalOf(res, provider)
    throw new MailboxRefused(refusal.said, res.status === 400 || res.status === 401)
  }
  const raw = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!raw.access_token) throw new MailboxRefused(`${google ? 'Google' : 'Microsoft'} gave no access token`, true)
  return { accessToken: raw.access_token, expiresAt: raw.expires_in ? new Date(Date.now() + raw.expires_in * 1000) : null }
}
