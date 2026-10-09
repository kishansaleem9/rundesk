/**
 * THE LANE'S MAIL SERVER, as a suite reaches it — in one place, as the photo
 * library's address is (`lib/media.mjs`). Lane k runs its API on 302k and its
 * mail stub (`scripts/e2e-lanes/mail-stub.mjs`) with its control seam on 97k;
 * CI sets `E2E_MAIL_CONTROL_PORT` once, at job level.
 *
 * Every mail the lane's API sends is taken there, other suites' among them, so
 * a suite reads and resets only the addresses it made up, and a refusal is
 * staged for one address (`failMailTo`), never for the lane.
 */

/** Where the stub's control seam listens: `--mail`, then `E2E_MAIL_CONTROL_PORT`, then the lane formula. */
export function mailBase(apiPort, override) {
  const port = Number(override ?? process.env.E2E_MAIL_CONTROL_PORT ?? 9700 + (apiPort - 3020))
  return `http://127.0.0.1:${port}`
}

const post = async (base, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) throw new Error(`the mail stub answered ${res.status} to ${path}`)
  return res.json()
}

/**
 * What went to `to`, in order: `[{ envelope: { from, to }, headers: { subject,
 * from, to, cc, bcc, replyTo, messageId, inReplyTo, references }, text, html,
 * attachments: [{ filename, contentType, size, sha1 }] }]`.
 */
export async function mailTo(base, to) {
  const res = await fetch(`${base}/__control/mail/messages?to=${encodeURIComponent(to)}`)
  if (!res.ok) throw new Error(`the mail stub answered ${res.status} to its messages`)
  return (await res.json()).messages
}

/** The next `count` messages to `to` are refused `code` at the end of DATA. */
export const failMailTo = (base, to, code = 554, count = 1) => post(base, '/__control/mail/fail', { to, code, count })

/** Forget what went to `to`, and any refusal staged for it. */
export const resetMailTo = (base, to) => post(base, '/__control/mail/reset', { to })
