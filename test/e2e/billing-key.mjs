/**
 * THE WORKSPACE'S BILLING IS `workspace.billing`'S: ITS INVOICES, ITS PLAN
 * CHANGES AND ITS PAYMENT PORTAL.
 *
 * NOT A FRAME ROW: `found-25-sep/billing-open-to-managers-and-every-member`.
 * The catalog files "View invoices, change plan, manage payment method" under
 * `workspace.billing`, which only admins hold, and the web shows billing on
 * an admin's settings tab. The API asked neither:
 *   - checkout and the billing portal were behind `WorkspaceAdminGuard`, which
 *     admits managers, and refused a member granted the key;
 *   - the billing status gave every member — guests too — the last twenty
 *     invoices with their Stripe hosted and PDF links, and the subscription.
 *
 * ClickUp (search snippets, "Owner, admin, and member-type user roles"): billing
 * is the owner's and the admins'. The plan's name stays readable by every
 * member, since the web gates features by it.
 *
 *   node test/e2e/billing-key.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 3

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
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

/* NEVER THROWS — `{status, data, error, text}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' }, text: '' }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(text) } catch { /* no body */ }
  return { status: res.status, data: json?.data, error: json?.error, text }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `bil${stamp}`
const HOSTED = `https://invoice.stripe.com/i/${TAG}`
const PDF = `https://pay.stripe.com/invoice/${TAG}/pdf`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const API = `${stack.base}/api/v1`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the invoice is staged by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key, role) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Billing ${key}`, email, password: 'BillingKey@12345!', organizationName: `Billing ${key} ${stamp}`, organizationSlug: `billing-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    const [row] = await sql`select m.id from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${WS} and u.email = ${email}`
    return { memberId: row.id, as: apiAs(signed.accessToken) }
  }
  const manager = await person('manager', 'manager')
  const guest = await person('guest', 'guest')
  const delegate = await person('delegate', 'member')
  const role = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} billing`, permissions: ['workspace.billing'] } })
  const granted = role.data?.id ? await A(`/workspaces/${WS}/members/${delegate.memberId}/roles/${role.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
  if (granted.status >= 300) throw new Error(`could not grant the delegate: ${said(role)} ${said(granted)}`)
  // One paid invoice, as the Stripe webhook records it.
  await sql`insert into invoices (workspace_id, stripe_invoice_id, amount, currency, status, hosted_url, pdf_url) values (${WS}, ${`in_${TAG}`}, 4900, 'usd', 'paid', ${HOSTED}, ${PDF})`

  // ══ 1. WHO IS SHOWN THE INVOICES ═════════════════════════════════════════
  console.log('\n▶ the billing status: the guest, the manager, the member granted workspace.billing, the admin')
  const statusOf = async (as) => {
    const r = await as(`/workspaces/${WS}/billing`)
    return { r, links: r.text.includes(HOSTED) || r.text.includes(PDF), invoices: (r.data?.invoices ?? []).length, plan: r.data?.plan?.id ?? null }
  }
  const guestSees = await statusOf(guest.as)
  const managerSees = await statusOf(manager.as)
  const delegateSees = await statusOf(delegate.as)
  const adminSees = await statusOf(A)
  const line = (s) => `${s.r.status}, plan ${s.plan}, ${s.invoices} invoice(s)${s.links ? ', the invoice LINKS' : ''}`
  chk(
    guestSees.r.status === 200 && guestSees.plan !== null && !guestSees.links && guestSees.invoices === 0
      && managerSees.r.status === 200 && !managerSees.links && managerSees.invoices === 0
      && delegateSees.links && delegateSees.invoices === 1 && adminSees.links && adminSees.invoices === 1,
    'the guest and the manager are shown the plan and no invoice or its links — the member granted workspace.billing and the admin are shown the invoice',
    `guest ${line(guestSees)}; manager ${line(managerSees)}; delegate ${line(delegateSees)}; admin ${line(adminSees)}`,
  )

  // ══ 2. CHANGING THE PLAN ═════════════════════════════════════════════════
  // Stripe is not configured on the lanes, so one who passes the gate is told
  // that (400); the gate's own answer is 403.
  console.log('\n▶ starting a checkout: the manager, the guest, the member granted workspace.billing')
  const checkoutAs = (as) => as(`/workspaces/${WS}/billing/checkout`, { method: 'POST', body: { tier: 'pro' } })
  const managerCheckout = await checkoutAs(manager.as)
  const guestCheckout = await checkoutAs(guest.as)
  const delegateCheckout = await checkoutAs(delegate.as)
  chk(
    managerCheckout.status === 403 && guestCheckout.status === 403 && delegateCheckout.status !== 403 && delegateCheckout.status !== 0,
    'a manager and a guest start no checkout (403) — the member granted workspace.billing passes the gate, to be told billing is not configured here',
    `manager ${said(managerCheckout)}; guest ${said(guestCheckout)}; delegate ${said(delegateCheckout)}`,
  )

  // ══ 3. THE PAYMENT PORTAL ════════════════════════════════════════════════
  console.log('\n▶ opening the billing portal')
  const portalAs = (as) => as(`/workspaces/${WS}/billing/portal`, { method: 'POST', body: {} })
  const managerPortal = await portalAs(manager.as)
  const delegatePortal = await portalAs(delegate.as)
  chk(
    managerPortal.status === 403 && delegatePortal.status !== 403 && delegatePortal.status !== 0,
    'a manager opens no billing portal (403) — the member granted workspace.billing passes the gate',
    `manager ${said(managerPortal)}; delegate ${said(delegatePortal)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  stack.close()
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
