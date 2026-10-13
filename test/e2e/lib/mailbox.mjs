/**
 * THE LANE'S MAILBOX SERVER, as a suite reaches it (`scripts/e2e-lanes/mailbox-stub.mjs`,
 * `found-12-oct/task-email-imap-unbuilt`): a person's own provider, spoken to
 * over IMAP and SMTP by a mailbox linked by its servers and its password. Lane
 * k's API is on 302k; its IMAP on 98k, its SMTP on 98(k+50), its control seam
 * on 99k. CI sets the three `E2E_MAILBOX_*` ports at job level, as it does the
 * mail stub's.
 *
 * Every lane's suites share it, so a suite makes up its own addresses and
 * forgets them when it is done.
 */

/** Where it listens: the env first, else the lane formula. */
export function mailboxServer(apiPort, env = process.env) {
  const k = apiPort - 3020
  return {
    imapPort: Number(env.E2E_MAILBOX_IMAP_PORT ?? 9800 + k),
    smtpPort: Number(env.E2E_MAILBOX_SMTP_PORT ?? 9850 + k),
    base: `http://127.0.0.1:${Number(env.E2E_MAILBOX_CONTROL_PORT ?? 9900 + k)}`,
  }
}

const call = async (base, path, body) => {
  const res = await fetch(`${base}${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`the mailbox stub answered ${res.status} to ${path}: ${await res.text().catch(() => '')}`)
  return res.json()
}

/** A mailbox with this password, or its password changed. */
export const makeMailbox = (base, address, password) => call(base, '/__control/mailbox/accounts', { address, password })

/** A message into its inbox, as a client sent it: `{ to, from, subject, text, inReplyTo?, references? }` → `{ uid, messageId }`. */
export const deliverTo = (base, message) => call(base, '/__control/mailbox/deliver', message)

/** What went out through SMTP signed in as `address`: `[{ envelope, tls, headers, text }]`. */
export const sentFrom = async (base, address) => (await call(base, `/__control/mailbox/sent?from=${encodeURIComponent(address)}`)).messages

/** Each sign-in as `address`: `[{ protocol, how, tls, ok }]`. */
export const loginsOf = async (base, address) => (await call(base, `/__control/mailbox/logins?user=${encodeURIComponent(address)}`)).logins

/** Each whole message an IMAP client signed in as `address` was given: `[{ uid }]`. */
export const fetchesOf = async (base, address) => (await call(base, `/__control/mailbox/fetches?user=${encodeURIComponent(address)}`)).fetches

/** What a folder holds: `[{ uid, flags, headers, text }]`, or null when there is no such folder. */
export const folderOf = async (base, address, name) => {
  const res = await fetch(`${base}/__control/mailbox/folder?address=${encodeURIComponent(address)}&name=${encodeURIComponent(name)}`)
  return res.ok ? (await res.json()).messages : null
}

/** Forget the mailbox, what it sent and every sign-in to it. */
export const forgetMailbox = (base, address) => call(base, '/__control/mailbox/reset', { address })
