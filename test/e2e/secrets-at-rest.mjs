/**
 * THE SECRETS RUNDESK KEEPS ARE KEPT SEALED (`found-13-oct/provider-grants-kept-in-the-clear`).
 *
 * The tokens kept for Google, Microsoft and the other providers, a person's
 * TOTP secret and a webhook's signing secret are each a lasting key to
 * somebody's account; they were kept in plain text, and the TOTP secret's
 * column said "encrypted at rest" when it was not. They are kept sealed now
 * (AES-256-GCM under TOKEN_ENCRYPTION_KEY, `sealed-text.ts`), read in the clear
 * by the code that uses them, and what was kept before still works.
 *
 * Measured before (13 October, lane 9 on batch 41's tree): a Gmail linked
 * through Google's consent was kept with `access_token` the token itself, and a
 * TOTP secret as its base32.
 *
 * A workspace of this run's own; the mailboxes and Google are the lane's stub
 * (`calendar-stub.mjs`), through the product's own consent flow; what is kept
 * is read back by SQL and opened with the lanes' key (`lib/sealed.mjs`).
 *
 *   node test/e2e/secrets-at-rest.mjs --api 3029
 */
import { createHmac } from 'node:crypto'
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, madeWorkspace } from './lib/fixture.mjs'
import { calendarBase, seedConsentCode, seedMailbox, readMailbox } from './lib/calendar.mjs'
import { isSealed, openKept } from './lib/sealed.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 5

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const STUB = calendarBase(API_PORT, argOf('--calendar', undefined))
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/** RFC 6238's code for a base32 secret, as an authenticator app reads it. */
function totp(base32, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const ch of base32.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)))
  const h = createHmac('sha1', key).update(counter).digest()
  const o = h[h.length - 1] & 0xf
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0')
}

const stamp = Date.now()
const TAG = `sar${stamp}`
const GM = `${TAG}-gmail`
const GM_ADDRESS = `olga-${TAG}@gmail.test`
const OLD = `${TAG}-old-gmail`
const OLD_ADDRESS = `old-${TAG}@gmail.test`
const PASSWORD = 'Secrets@12345!'

const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`

let sql = null
let WS = null
try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what is kept is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: `Secrets ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  madeWorkspace(WS)
  const [olga] = await sql`select id from users where email = ${ADMIN.email}`
  await sql`update workspaces set plan = 'business' where id = ${WS}`
  const on = await A('/feature-flags/tasks.email', { method: 'PUT', body: { enabled: true, scope: 'workspace', scopeId: WS, workspaceId: WS } })
  if (!on.ok) throw new Error(`could not turn the Email ClickApp on: ${said(on)}`)
  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space`, defaultPermission: 'admin' } })
  const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} project` } })
  const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} list` } })
  const task = await A('/tasks', { method: 'POST', body: { listId: list.data?.id, title: `Secrets ${TAG}` } })
  if (!task.ok) throw new Error(`could not make the task: ${said(task)}`)
  const emailRoute = `/tasks/${task.data.id}/comments/email`

  // ══ 1. A PROVIDER'S GRANT ════════════════════════════════════════════════════
  console.log('\n▶ a Gmail linked through Google’s consent')
  const start = await A(`/workspaces/${WS}/email-accounts/connect/gmail`, { method: 'POST' })
  const authUrl = start.data?.authUrl ? new URL(start.data.authUrl) : null
  const state = authUrl?.searchParams.get('state') ?? null
  const code = `${GM}-code`
  await seedConsentCode(STUB, { code, accessToken: GM, refreshToken: `${GM}-refresh`, email: GM_ADDRESS, sub: `${GM}-sub`, scopes: (authUrl?.searchParams.get('scope') ?? '').split(' '), name: 'Olga Gmail' })
  await seedMailbox(STUB, { token: GM, provider: 'gmail', address: GM_ADDRESS, name: 'Olga Gmail', refreshToken: `${GM}-refresh` })
  const back = state ? await fetch(`${API}/integrations/oauth/gmail/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, { redirect: 'manual' }) : null
  const [row] = await sql`select id, access_token, refresh_token from email_accounts where workspace_id = ${WS} and address = ${GM_ADDRESS}`
  const sent = await A(emailRoute, { method: 'POST', body: { to: [`client-${TAG}@example.com`], subject: `Kept ${TAG}`, body: `Sealed, ${TAG}.`, accountId: row?.id ?? null } })
  const box = ((await readMailbox(STUB, GM))?.messages ?? []).filter((m) => m.direction === 'sent')
  chk(
    back?.status === 302 && isSealed(row?.access_token) && isSealed(row?.refresh_token) && !String(row.access_token).includes(GM) && !String(row.refresh_token).includes(GM)
      && openKept(row.access_token, 'email_accounts.access_token') === GM && openKept(row.refresh_token, 'email_accounts.refresh_token') === `${GM}-refresh`
      && sent.ok && box.length === 1 && box[0].subject === `Kept ${TAG}`,
    'a Gmail linked through Google’s consent keeps both its tokens sealed — neither holds the token — and its email is sent with the token they open to (read by SQL)',
    JSON.stringify({ back: back?.status ?? null, access: (row?.access_token ?? '').slice(0, 12), refresh: (row?.refresh_token ?? '').slice(0, 12), sent: said(sent), box: box.length }),
  )

  // ══ 2. A TOTP SECRET ═════════════════════════════════════════════════════════
  console.log('\n▶ a TOTP secret, set up and verified')
  const email = `${TAG}-two-factor@rundesk.invalid`
  const signed = await signUpApi(API, { fullName: `Two Factor ${stamp}`, email, password: PASSWORD, organizationName: `Two Factor ${stamp}`, organizationSlug: `sar-${stamp}` })
  const T = apiAs(signed.accessToken)
  const setup = await T('/security/totp/setup', { method: 'POST' })
  const [me] = await sql`select id from users where email = ${email}`
  const [kept] = await sql`select secret from user_totp_secrets where user_id = ${me?.id ?? null}`
  const verified = setup.data?.secret ? await T('/security/totp/verify', { method: 'POST', body: { code: totp(setup.data.secret) } }) : { ok: false, status: 0 }
  const status = await T('/security/totp/status')
  chk(
    setup.ok && !!setup.data?.secret && isSealed(kept?.secret) && !String(kept.secret).includes(setup.data.secret)
      && openKept(kept.secret, 'user_totp_secrets.secret') === setup.data.secret && verified.ok && status.data?.enabled === true,
    'a TOTP secret is kept sealed, not as the base32 its column said was encrypted, and a code from the secret shown at setup still verifies (read by SQL)',
    JSON.stringify({ setup: said(setup), kept: (kept?.secret ?? '').slice(0, 12), verified: said(verified), enabled: status.data?.enabled ?? null }),
  )

  // ══ 3. A WEBHOOK'S SIGNING SECRET ════════════════════════════════════════════
  console.log('\n▶ a webhook’s signing secret')
  const hook = await A(`/workspaces/${WS}/webhooks`, { method: 'POST', body: { url: 'https://hooks.example.com/rundesk', events: ['task.created'], name: `${TAG} hook` } })
  const [hookRow] = await sql`select secret from webhooks where workspace_id = ${WS}`
  const listed = await A(`/workspaces/${WS}/webhooks`)
  const shownAgain = JSON.stringify(listed.data ?? null)
  chk(
    hook.ok && typeof hook.data?.secret === 'string' && isSealed(hookRow?.secret) && openKept(hookRow.secret, 'webhooks.secret') === hook.data.secret
      && !shownAgain.includes(hook.data.secret) && shownAgain.includes('"hasSecret":true'),
    'a webhook’s signing secret is shown once, kept sealed, and listed after only as there being one (read by SQL)',
    JSON.stringify({ hook: said(hook), kept: (hookRow?.secret ?? '').slice(0, 12), listedShowsIt: hook.data?.secret ? shownAgain.includes(hook.data.secret) : null }),
  )

  // ══ 4. WHAT WAS KEPT BEFORE ══════════════════════════════════════════════════
  console.log('\n▶ a grant kept in the clear before, still read')
  await seedMailbox(STUB, { token: OLD, provider: 'gmail', address: OLD_ADDRESS, name: 'Old Gmail', refreshToken: `${OLD}-refresh` })
  const [old] = await sql`insert into email_accounts (workspace_id, owner_id, provider, address, sender_name, access_token, refresh_token, token_expires_at, scopes, status)
    values (${WS}, ${olga.id}, 'gmail', ${OLD_ADDRESS}, 'Old Gmail', ${OLD}, ${`${OLD}-refresh`}, now() + interval '1 hour', ${['https://www.googleapis.com/auth/gmail.send']}, 'connected') returning id`
  const oldSent = await A(emailRoute, { method: 'POST', body: { to: [`client-${TAG}@example.com`], subject: `Old ${TAG}`, body: `Still read, ${TAG}.`, accountId: old.id } })
  const oldBox = ((await readMailbox(STUB, OLD))?.messages ?? []).filter((m) => m.direction === 'sent')
  chk(
    oldSent.ok && oldBox.length === 1 && oldBox[0].subject === `Old ${TAG}`,
    'a grant kept in the clear before the key was set is still read: its email goes with the token it holds',
    JSON.stringify({ sent: said(oldSent), box: oldBox.length }),
  )

  // ══ 5. NOTHING READ BACK IN THE CLEAR ════════════════════════════════════════
  const overview = await A(`/workspaces/${WS}/email-accounts`)
  const shown = JSON.stringify(overview.data ?? null)
  chk(
    overview.ok && !shown.includes(GM) && !shown.includes(OLD) && !/v1:[A-Za-z0-9_-]{8,}:/.test(shown),
    'what the Email settings give back holds neither a token nor a sealed one',
    `overview ${said(overview)}: ${shown.slice(0, 200)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${err?.stack ?? err}`)
} finally {
  if (sql) {
    if (WS) await sql`delete from workspaces where id = ${WS}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
}

const ran = passed + failed
if (ran !== EXPECTED_CHECKS) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${ran} checks, expected exactly ${EXPECTED_CHECKS}`)
}
console.log(`\n${passed} passed, ${failed} failed`)
process.exitCode = failed > 0 ? 1 : 0
