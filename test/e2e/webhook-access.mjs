/**
 * A WORKSPACE'S WEBHOOKS ARE READ BY THE PEOPLE WHO MANAGE THEM, AND THE
 * SIGNING SECRET IS SHOWN ONCE.
 *
 * NOT A FRAME ROW: found on 23 September while mapping which routes the
 * custom-role permissions guard. `GET /workspaces/:ws/webhooks` answered any
 * workspace member with every webhook's target URL and HMAC signing SECRET, and
 * `GET …/webhooks/:id/deliveries` with each delivery's payload — so a member
 * could copy a secret and sign requests the receiving system would trust as
 * coming from this workspace. And the routes that manage webhooks put an
 * admin-or-manager guard IN FRONT of the `webhook.manage` permission, so a
 * custom role granting that permission to anybody else could never be used.
 *
 * Measured as three people: the admin; a plain MEMBER; and a member given
 * `webhook.manage` through a custom role. Every refusal is checked by status
 * AND by what exists afterwards; every grant by what it produced.
 *
 * Then ON SCREEN, because hiding the secret moved a duty onto the pages: both
 * pages that make webhooks threw away the one answer that carries it, so a
 * webhook made in the browser signed with a secret nobody could ever read.
 * The secret shown is compared with the one STORED — a page that showed some
 * other string would pass any check that only looked for a string. And the
 * settings card said "No webhooks configured yet" while its list was still
 * loading, or had failed.
 *
 *   node test/e2e/webhook-access.mjs --api 3011
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, madeAccount } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 15

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `wha-${stamp}`
const SECRET = `whsec-${stamp}-do-not-show`
const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
let api = null
let WS = null
let browser = null
let sql = null

try {
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  // The fixture's apiClient NEVER THROWS — every call below is read off `status`.
  api = apiClient(`${B}/api/v1`, auth.accessToken)
  const made = await api('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id

  const signUp = async (label) => {
    const email = `wha-${label}-${stamp}@rundesk.invalid`
    // Registered, so the account is removed when the run ends (`lib/made.mjs`).
    madeAccount({ email })
    const res = await fetch(`${B}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fullName: `Hooks ${label}`, email, password: 'Member@12345!', organizationName: `Hooks ${label} ${stamp}`, organizationSlug: `hooks-${label}-${stamp}` }),
    })
    const data = (await res.json().catch(() => null))?.data
    if (!data?.accessToken) throw new Error(`signup of ${label} failed: ${res.status}`)
    const added = await api(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
    if (added.status >= 300) throw new Error(`could not add ${label}: ${added.status}`)
    return { client: apiClient(`${B}/api/v1`, data.accessToken), id: data.user?.id }
  }
  const member = await signUp('member')
  const keeper = await signUp('keeper')
  const M = member.client
  const K = keeper.client

  const role = await api(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} hooks`, permissions: ['webhook.manage'] } })
  if (role.status >= 300 || !role.data?.id) throw new Error(`could not make the role: ${role.status}`)
  const keeperRow = ((await api(`/workspaces/${WS}/members`)).data ?? []).find((m) => m.userId === keeper.id)
  const given = keeperRow
    ? await api(`/workspaces/${WS}/members/${keeperRow.workspaceMemberId}/roles/${role.data.id}`, { method: 'POST' })
    : { status: 0 }
  if (given.status >= 300 || given.status === 0) throw new Error(`could not give the keeper the role: ${given.status}`)

  const created = await api(`/workspaces/${WS}/webhooks`, {
    method: 'POST',
    body: { name: `${TAG} hook`, url: 'https://example.com/hook', events: ['task.created'], secret: SECRET },
  })
  if (created.status >= 300 || !created.data?.id) throw new Error(`could not make the webhook: ${created.status}`)
  const HOOK = created.data.id
  const hookCount = async () => ((await api(`/workspaces/${WS}/webhooks`)).data ?? []).length
  const carriesSecret = (body) => JSON.stringify(body ?? null).includes(SECRET)

  // ══ 1. A PLAIN MEMBER ════════════════════════════════════════════════════
  console.log('\n▶ a member who does not manage webhooks cannot read them')

  const memberList = await M(`/workspaces/${WS}/webhooks`)
  chk(
    memberList.status === 403 && !carriesSecret(memberList.data),
    'a plain member is refused the list — no URL, no secret',
    `it answered ${memberList.status}; the secret ${carriesSecret(memberList.data) ? 'WAS' : 'was not'} in the answer`,
  )
  const memberDeliveries = await M(`/workspaces/${WS}/webhooks/${HOOK}/deliveries`)
  chk(
    memberDeliveries.status === 403 && memberDeliveries.data == null,
    'nor the delivery log, whose payloads are the workspace’s data',
    `it answered ${memberDeliveries.status}`,
  )
  const before = await hookCount()
  const memberCreate = await M(`/workspaces/${WS}/webhooks`, {
    method: 'POST',
    body: { name: `${TAG} member's`, url: 'https://example.com/member', events: ['task.created'] },
  })
  chk(
    memberCreate.status === 403 && (await hookCount()) === before,
    'and may not make one — nothing is created',
    `it answered ${memberCreate.status}; ${(await hookCount()) - before} webhook(s) appeared`,
  )

  // ══ 2. THE GRANT ═════════════════════════════════════════════════════════
  console.log('\n▶ a member given `webhook.manage` by a custom role can use it')

  const keeperList = await K(`/workspaces/${WS}/webhooks`)
  chk(
    keeperList.status === 200 && (keeperList.data ?? []).some((h) => h.id === HOOK),
    'the member holding the grant lists the workspace’s webhooks',
    `it answered ${keeperList.status} with ${(keeperList.data ?? []).length} webhook(s)`,
  )
  const keeperCreate = await K(`/workspaces/${WS}/webhooks`, {
    method: 'POST',
    body: { name: `${TAG} keeper's`, url: 'https://example.com/keeper', events: ['task.created'] },
  })
  chk(
    keeperCreate.status < 300 && Boolean(keeperCreate.data?.id) && (await hookCount()) === before + 1,
    'and makes one — the admin-only guard in front of the permission is gone',
    `it answered ${keeperCreate.status} ${JSON.stringify(keeperCreate.error ?? '')}`,
  )
  const keeperDeliveries = await K(`/workspaces/${WS}/webhooks/${HOOK}/deliveries`)
  chk(
    keeperDeliveries.status === 200 && Array.isArray(keeperDeliveries.data),
    'and reads the delivery log',
    `it answered ${keeperDeliveries.status}`,
  )

  // ══ 3. THE SECRET ════════════════════════════════════════════════════════
  console.log('\n▶ the signing secret is shown once, when the webhook is made')

  const adminList = await api(`/workspaces/${WS}/webhooks`)
  const listed = (adminList.data ?? []).find((h) => h.id === HOOK)
  chk(
    carriesSecret(created.data) && Boolean(listed) && !carriesSecret(adminList.data) && listed?.hasSecret === true && !('secret' in (listed ?? {})),
    'the answer that makes a webhook carries its secret; the list, even the admin’s, says only that it has one',
    `created carried it: ${carriesSecret(created.data)}; list carried it: ${carriesSecret(adminList.data)}; hasSecret ${listed?.hasSecret}`,
  )
  const renamed = await api(`/workspaces/${WS}/webhooks/${HOOK}`, { method: 'PATCH', body: { name: `${TAG} renamed` } })
  chk(
    renamed.status < 300 && renamed.data?.name === `${TAG} renamed` && !carriesSecret(renamed.data),
    'and an edit answers without it',
    `it answered ${renamed.status}; the secret ${carriesSecret(renamed.data) ? 'WAS' : 'was not'} in it`,
  )

  // ══ 4. ON THE SETTINGS PAGE ══════════════════════════════════════════════
  const catalog = (await api(`/workspaces/${WS}/webhooks/events`)).data ?? []
  if (catalog.length < 10) throw new Error(`the server's event catalog came back with ${catalog.length} events`)
  // What a form offers: every chip's event id, and any chip that reads as an id.
  // The text is read for an absence (no chip labelled with a raw id), so every chip, hidden ones too.
  const offered = async (prefix) => {
    const chips = await tab.locator(`[data-testid^="${prefix}"]`).evaluateAll(
      (els, pre) => els.map((el) => ({ id: el.getAttribute('data-testid').slice(pre.length), text: el.innerText.trim() })), // text-read: absence — no chip labelled with a raw id
      prefix,
    ).catch(() => [])
    const ids = chips.map((c) => c.id).sort()
    return { ids, same: JSON.stringify(ids) === JSON.stringify([...catalog].sort()), raw: chips.filter((c) => /^[a-z]+\.[a-z_]+$/.test(c.text)).map((c) => c.text) }
  }
  console.log('\n▶ the settings card: an honest list, and the secret shown the once')

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the secret shown is compared with the one stored, and that cannot be skipped')
  browser = await chromium.launch(launchOptions())
  // The app's service worker answers API GETs itself (NetworkFirst), and a
  // page route never sees a request the worker handles — so without this the
  // list below is neither held nor failed, and both checks look at a list
  // that has already answered.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
  const tab = await ctx.newPage()
  await tab.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await tab.fill('input[type=email]', EMAIL)
  await tab.fill('input[type=password]', PASSWORD)
  await tab.click('button[type=submit]')
  await tab.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await tab.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  // The list call alone: not `/webhooks/events`, and not the POST that makes one.
  const LIST = (u) => u.pathname.endsWith(`/workspaces/${WS}/webhooks`)
  const isList = (req) => req.method() === 'GET' && LIST(new URL(req.url()))
  const NONE = 'No webhooks configured yet.'
  const noneShown = () => tab.getByText(NONE, { exact: true }).count()
  const rowsShown = () => tab.locator('[data-testid^="webhook-row-"]').count()
  const inPage = (text) => tab.evaluate((t) => document.documentElement.outerHTML.includes(t), text).catch(() => true)

  // The list is HELD until the check has looked — not for a fixed time: a
  // check that looks after the answer landed proves nothing about loading.
  let release
  const gate = new Promise((r) => { release = r })
  let held = false
  // A handler's promise is nobody's to await, so a rejection in it would end
  // the process outside the try — past the cleanup. Hence the catches.
  const hold = async (route) => {
    if (!isList(route.request())) return route.continue().catch(() => {})
    held = true
    await gate
    return route.continue().catch(() => {})
  }
  await tab.route(LIST, hold)
  await tab.goto(`${B}/app/${WS}/settings?tab=integrations`, { waitUntil: 'domcontentloaded' })
  await waitUntil(async () => held && (await tab.getByTestId('webhook-add').count()) > 0, { timeoutMs: 30_000 })
  const cardUp = await tab.getByTestId('webhook-add').isVisible().catch(() => false)
  const noneWhileLoading = await noneShown()
  const rowsWhileLoading = await rowsShown()
  release()
  await waitUntil(async () => (await rowsShown()) >= 2, { timeoutMs: 15_000 })
  await tab.unroute(LIST, hold).catch(() => {})
  chk(
    held && cardUp && noneWhileLoading === 0 && rowsWhileLoading === 0 && (await rowsShown()) === 2 && (await noneShown()) === 0,
    'while the list loads the card does not say there are none — and then shows the two there are',
    `held ${held}, card up ${cardUp}; loading: "${NONE}" ×${noneWhileLoading}, rows ${rowsWhileLoading}; answered: rows ${await rowsShown()}, "${NONE}" ×${await noneShown()}`,
  )

  const fail = (route) =>
    (isList(route.request())
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'failed by the suite' }) })
      : route.continue()
    ).catch(() => {})
  await tab.route(LIST, fail)
  await tab.reload({ waitUntil: 'domcontentloaded' })
  await waitUntil(async () => (await tab.getByTestId('webhooks-load-failed').count()) > 0, { timeoutMs: 20_000 })
  const failedSays = ((await tab.getByTestId('webhooks-load-failed').filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')) ?? '').trim()
  chk(
    failedSays === 'Could not load webhooks.' && (await noneShown()) === 0 && (await rowsShown()) === 0,
    'a list that fails says so — and not that there are none',
    `the card says ${JSON.stringify(failedSays)}; "${NONE}" ×${await noneShown()}`,
  )
  await tab.unroute(LIST, fail).catch(() => {})

  await tab.reload({ waitUntil: 'domcontentloaded' })
  await waitUntil(async () => (await rowsShown()) >= 2, { timeoutMs: 15_000 })
  const MADE = `${TAG} made on the page`
  await tab.getByTestId('webhook-add').click({ timeout: 10_000 }).catch(() => {})
  await waitUntil(async () => (await tab.locator('[data-testid^="webhook-form-event-"]').count()) >= catalog.length, { timeoutMs: 15_000 })
  const settingsForm = await offered('webhook-form-event-')
  chk(
    settingsForm.same && settingsForm.raw.length === 0,
    'the form offers every event the server lists, each by its name',
    `offered ${settingsForm.ids.length} of ${catalog.length}: ${JSON.stringify(settingsForm.ids)}; shown as raw ids: ${JSON.stringify(settingsForm.raw)}`,
  )
  await tab.getByTestId('webhook-form-name').fill(MADE, { timeout: 10_000 }).catch(() => {})
  await tab.getByTestId('webhook-form-url').fill('https://example.com/made-on-the-page', { timeout: 10_000 }).catch(() => {})
  await tab.getByTestId('webhook-form-save').click({ timeout: 10_000 }).catch(() => {})
  await waitUntil(async () => (await tab.getByTestId('webhook-secret-once').count()) > 0, { timeoutMs: 15_000 })
  const shown = ((await tab.getByTestId('webhook-secret-value').filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')) ?? '').trim()
  const [stored] = await sql`select id, secret from webhooks where workspace_id = ${WS} and name = ${MADE}`
  const madeRow = stored ? tab.getByTestId(`webhook-row-${stored.id}`) : null
  await waitUntil(async () => !madeRow || (await madeRow.count()) > 0, { timeoutMs: 10_000 })
  chk(
    Boolean(stored?.secret) && shown.length >= 32 && shown === stored.secret && (await madeRow?.count()) === 1,
    'a webhook made on the page shows its signing secret — the one stored — and joins the list',
    `shown ${shown ? `${shown.length} characters` : 'nothing'}; stored ${stored?.secret ? `${stored.secret.length} characters` : 'no row'}; the same: ${shown === stored?.secret}; listed ${(await madeRow?.count()) ?? 0}`,
  )

  await tab.getByTestId('webhook-secret-done').click({ timeout: 10_000 }).catch(() => {})
  await waitUntil(async () => (await tab.getByTestId('webhook-secret-once').count()) === 0, { timeoutMs: 5000 })
  const panelLeft = await tab.getByTestId('webhook-secret-once').count()
  const afterDone = shown ? await inPage(shown) : true
  const listAnswer = tab.waitForResponse((res) => isList(res.request()), { timeout: 15_000 }).catch(() => null)
  await tab.reload({ waitUntil: 'domcontentloaded' })
  const answered = await listAnswer
  const listBody = answered ? await answered.text().catch(() => '') : ''
  await waitUntil(async () => (await rowsShown()) >= 3, { timeoutMs: 15_000 })
  const afterReload = shown ? await inPage(shown) : true
  chk(
    shown.length > 0 && panelLeft === 0 && !afterDone && Boolean(answered) && !listBody.includes(shown) && (await rowsShown()) === 3 && !afterReload,
    'once dismissed it is gone — from the page, and from the list it reads after a reload',
    `panel left ${panelLeft}; in the page after dismissing: ${afterDone}; in the list answer: ${listBody.includes(shown)} (answered ${Boolean(answered)}); after reload: ${afterReload}; rows ${await rowsShown()}`,
  )

  // ══ 5. THE SUPER ADMIN'S PAGE ════════════════════════════════════════════
  console.log('\n▶ the super admin’s webhooks page shows the secret it makes, too')

  await tab.goto(`${B}/app/admin/webhooks`, { waitUntil: 'domcontentloaded' })
  await waitUntil(async () => (await tab.locator(`[data-testid="admin-webhook-workspace"] option[value="${WS}"]`).count()) > 0, { timeoutMs: 15_000 })
  await tab.getByTestId('admin-webhook-workspace').selectOption(WS, { timeout: 10_000 }).catch(() => {})
  await waitUntil(async () => (await tab.locator('[data-testid^="admin-webhook-event-"]').count()) >= catalog.length, { timeoutMs: 15_000 })
  const adminForm = await offered('admin-webhook-event-')
  chk(
    adminForm.same && adminForm.raw.length === 0,
    'this page offers the same events, each by its name',
    `offered ${adminForm.ids.length} of ${catalog.length}; shown as raw ids: ${JSON.stringify(adminForm.raw)}`,
  )
  const ADMIN_MADE = `${TAG} made by the super admin`
  await tab.getByTestId('admin-webhook-name').fill(ADMIN_MADE, { timeout: 10_000 }).catch(() => {})
  await tab.getByTestId('admin-webhook-url').fill('https://example.com/super-admin', { timeout: 10_000 }).catch(() => {})
  await tab.getByTestId('admin-webhook-event-task.created').click({ timeout: 10_000 }).catch(() => {})
  await tab.getByTestId('admin-webhook-create').click({ timeout: 10_000 }).catch(() => {})
  await waitUntil(async () => (await tab.getByTestId('webhook-secret-once').count()) > 0, { timeoutMs: 15_000 })
  const adminShown = ((await tab.getByTestId('webhook-secret-value').filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')) ?? '').trim()
  const [adminStored] = await sql`select secret from webhooks where workspace_id = ${WS} and name = ${ADMIN_MADE}`
  chk(
    Boolean(adminStored?.secret) && adminShown.length >= 32 && adminShown === adminStored.secret,
    'made there, the secret shown is the one stored',
    `shown ${adminShown ? `${adminShown.length} characters` : 'nothing'}; stored ${adminStored?.secret ? `${adminStored.secret.length} characters` : 'no row'}; the same: ${adminShown === adminStored?.secret}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  await sql?.end({ timeout: 5 }).catch(() => {})
  if (api && WS) {
    const res = await api(`/workspaces/${WS}`, { method: 'DELETE' })
    if (res.status >= 300) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${res.status}`)
  }
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
