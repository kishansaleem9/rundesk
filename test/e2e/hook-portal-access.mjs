/**
 * AN INBOUND WEBHOOK'S ADDRESS STAYS WITH ITS CREATOR, AND A CLIENT PORTAL IS
 * NOT MINTED WHERE PUBLIC SHARING IS BLOCKED.
 *
 * NOT A FRAME ROW: found on 23 September by a read-only sweep of every column
 * that holds a secret, and measured on lane 1 before the fix:
 *
 *   - `GET /lists/:id/inbound-webhooks` gave every member who could open the
 *     list — guests too — every hook's token, and the token is the whole
 *     credential for `POST /inbound/webhook/:token`, which adds tasks AS THE
 *     HOOK'S CREATOR. Any member could delete anybody's hook, and a hook kept
 *     adding tasks in its creator's name after they had left.
 *   - With "Block public sharing" on, a member still made a client portal whose
 *     anonymous `/portal/:token` view answered — the switch stopped docs and not
 *     portals — and a guest listed every portal's token.
 *
 * Every refusal is paired with the grant that makes the same request succeed,
 * and checked against the rows it leaves; then the same rules ON SCREEN, where
 * the list's panel built each address from a token it will no longer receive.
 *
 *   node test/e2e/hook-portal-access.mjs --api 3011
 */
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 11

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const PERSON_PASSWORD = 'Member@12345!'

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `hpa-${stamp}`
const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
let api = null
let WS = null
let sql = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — every refusal here is checked against the rows it leaves')
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  // The fixture's apiClient NEVER THROWS — every call below is read off `status`.
  api = apiClient(`${B}/api/v1`, auth.accessToken)
  const made = await api('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id

  const signUp = async (label, role) => {
    const email = `${TAG}-${label}@rundesk.invalid`
    const res = await fetch(`${B}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fullName: `Hooks ${label}`, email, password: PERSON_PASSWORD, organizationName: `Hooks ${label} ${stamp}`, organizationSlug: `hooks-${label}-${stamp}` }),
    })
    const data = (await res.json().catch(() => null))?.data
    if (!data?.accessToken) throw new Error(`signup of ${label} failed: ${res.status}`)
    const added = await api(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add ${label}: ${added.status}`)
    return { email, id: data.user?.id, client: apiClient(`${B}/api/v1`, data.accessToken) }
  }
  const member = await signUp('member', 'member')
  const guest = await signUp('guest', 'guest')
  const M = member.client
  const G = guest.client

  const make = async (route, body, what) => {
    const res = await api(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${res.status}`)
    return res.data.id
  }
  const SPACE = await make('/spaces', { workspaceId: WS, name: `${TAG} space`, defaultPermission: 'edit' }, 'the space')
  const PROJECT = await make('/projects', { spaceId: SPACE, name: `${TAG} project` }, 'the project')
  const LIST = await make('/lists', { projectId: PROJECT, name: `${TAG} list` }, 'the list')
  const HOOKS = `/lists/${LIST}/inbound-webhooks`
  const hookRows = async () => (await sql`select id from inbound_webhooks where list_id = ${LIST}`).map((r) => r.id)
  const portalRows = async () => (await sql`select id from client_portals where project_id = ${PROJECT}`).map((r) => r.id)

  /*
   * THE ADMIN'S HOOK IS WRITTEN BY SQL, not made through the route this suite
   * measures. It was `POST …/inbound-webhooks`, so `hpa-2` (nobody may add a
   * hook) broke the fixture too: the run died making the admin's hook, before
   * the check the patch names, and a short run is a measurement no plan can
   * settle (`found-23-sep/fixtures-built-through-the-route-under-test`). The
   * token is minted as the service mints one.
   */
  const [adminUser] = await sql`select id from users where email = ${EMAIL}`
  const [A] = await sql`
    insert into inbound_webhooks (list_id, token, name, created_by_id)
    values (${LIST}, ${randomBytes(24).toString('hex')}, ${`${TAG} admin's hook`}, ${adminUser.id})
    returning id, token`

  // ══ 1. INBOUND WEBHOOKS ══════════════════════════════════════════════════
  console.log('\n▶ a hook’s address is its creator’s, and the workspace admins’')

  const before = (await hookRows()).length
  const guestMakes = await G(HOOKS, { method: 'POST', body: { name: `${TAG} guest's hook` } })
  const afterGuest = (await hookRows()).length
  const memberMakes = await M(HOOKS, { method: 'POST', body: { name: `${TAG} member's hook` } })
  const MH = memberMakes.data
  chk(
    guestMakes.status === 403 && afterGuest === before && memberMakes.status < 300 && Boolean(MH?.token) && (await hookRows()).length === before + 1,
    'a guest may not add a hook — none is made — while a member may, and is given its address',
    `guest ${guestMakes.status} (${afterGuest - before} made); member ${memberMakes.status}, token ${Boolean(MH?.token)}`,
  )

  const memberList = await M(HOOKS)
  const guestList = await G(HOOKS)
  const inList = (res, id) => (res.data ?? []).find((h) => h.id === id)
  chk(
    memberList.status === 200 && guestList.status === 200 &&
      Boolean(inList(memberList, A.id)) && Boolean(inList(guestList, A.id)) &&
      !('token' in (inList(memberList, A.id) ?? {})) && !('token' in (inList(guestList, A.id) ?? {})) &&
      !JSON.stringify(memberList.data).includes(A.token) && !JSON.stringify(guestList.data).includes(A.token),
    'a member and a guest see the admin’s hook listed — by name, with no token',
    `member ${memberList.status}, guest ${guestList.status}; admin's token in either: ${JSON.stringify(memberList.data).includes(A.token) || JSON.stringify(guestList.data).includes(A.token)}`,
  )
  const adminList = await api(HOOKS)
  chk(
    inList(adminList, A.id)?.token === A.token && inList(adminList, MH?.id)?.token === MH?.token &&
      inList(memberList, MH?.id)?.token === MH?.token && inList(memberList, MH?.id)?.canManage === true,
    'while the admin reads every hook’s address, and the member reads the one they made',
    `admin sees ${[A.id, MH?.id].filter((id) => inList(adminList, id)?.token).length} of 2 tokens; member sees their own: ${inList(memberList, MH?.id)?.token === MH?.token}`,
  )

  const memberDeletes = await M(`${HOOKS}/${A.id}`, { method: 'DELETE' })
  const spare = (await M(HOOKS, { method: 'POST', body: { name: `${TAG} member's spare` } })).data
  const adminDeletes = spare?.id ? await api(`${HOOKS}/${spare.id}`, { method: 'DELETE' }) : { status: 0 }
  const rowsNow = await hookRows()
  chk(
    memberDeletes.status === 403 && rowsNow.includes(A.id) && adminDeletes.status < 300 && !rowsNow.includes(spare?.id),
    'a member may not delete the admin’s hook — it stays — while the admin may delete a member’s',
    `member delete ${memberDeletes.status} (admin's hook still there: ${rowsNow.includes(A.id)}); admin delete ${adminDeletes.status} (gone: ${!rowsNow.includes(spare?.id)})`,
  )

  // ══ 2. CLIENT PORTALS ════════════════════════════════════════════════════
  console.log('\n▶ portals are not a guest’s, and not minted while public sharing is blocked')

  const PORTALS = `/projects/${PROJECT}/portal`
  // The member's first portal, by SQL for the same reason as the admin's hook:
  // `hpa-12` refuses every portal, and the run died here making it.
  const [P1] = await sql`
    insert into client_portals (workspace_id, project_id, token, name, created_by_id)
    values (${WS}, ${PROJECT}, ${randomBytes(18).toString('base64url')}, ${`${TAG} before the switch`}, ${member.id ?? null})
    returning id, token`
  const portalsBefore = (await portalRows()).length
  const guestLists = await G(PORTALS)
  const guestPortal = await G(PORTALS, { method: 'POST', body: { name: `${TAG} guest's` } })
  chk(
    guestLists.status === 403 && !JSON.stringify(guestLists.data ?? null).includes(P1.token) &&
      guestPortal.status === 403 && (await portalRows()).length === portalsBefore,
    'a guest may neither list the project’s portals nor make one',
    `guest list ${guestLists.status} (token in it: ${JSON.stringify(guestLists.data ?? null).includes(P1.token)}); guest make ${guestPortal.status}`,
  )

  const blocked = await api(`/workspaces/${WS}`, { method: 'PATCH', body: { blockPublicSharing: true } })
  if (blocked.status >= 300) throw new Error(`could not block public sharing: ${blocked.status}`)
  const memberBlocked = await M(PORTALS, { method: 'POST', body: { name: `${TAG} while blocked` } })
  const adminBlocked = await api(PORTALS, { method: 'POST', body: { name: `${TAG} admin while blocked` } })
  const disabled = await M(`/portals/${P1.id}`, { method: 'PATCH', body: { isEnabled: false } })
  chk(
    memberBlocked.status === 403 && adminBlocked.status === 403 && (await portalRows()).length === portalsBefore &&
      disabled.status < 300 && disabled.data?.isEnabled === false,
    'with public sharing blocked no new portal is made, by a member or the admin — and an existing one can still be switched off',
    `member ${memberBlocked.status}, admin ${adminBlocked.status}, ${(await portalRows()).length - portalsBefore} made; disabling answered ${disabled.status}`,
  )
  const unblocked = await api(`/workspaces/${WS}`, { method: 'PATCH', body: { blockPublicSharing: false } })
  const memberAgain = await M(PORTALS, { method: 'POST', body: { name: `${TAG} after the switch` } })
  chk(
    unblocked.status < 300 && memberAgain.status < 300 && Boolean(memberAgain.data?.token) && (await portalRows()).length === portalsBefore + 1,
    'and once sharing is allowed again, the member makes one',
    `unblock ${unblocked.status}; member ${memberAgain.status}`,
  )

  // ══ 3. ON SCREEN ═════════════════════════════════════════════════════════
  console.log('\n▶ the list’s panel and the project page say the same')

  browser = await chromium.launch(launchOptions())
  const pageFor = async (email) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
    const tab = await ctx.newPage()
    await tab.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await tab.fill('input[type=email]', email)
    await tab.fill('input[type=password]', PERSON_PASSWORD)
    await tab.click('button[type=submit]')
    await tab.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await tab.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return tab
  }
  const openPanel = async (tab) => {
    await tab.goto(`${B}/app/${WS}/${SPACE}/${PROJECT}/${LIST}`, { waitUntil: 'domcontentloaded' })
    await tab.getByTestId('list-email-button').click({ timeout: 20_000 }).catch(() => {})
    await waitUntil(async () => (await tab.getByTestId(`inbound-webhook-${A.id}`).count()) > 0, { timeoutMs: 15_000 })
  }
  const rowOf = (tab, id) => tab.getByTestId(`inbound-webhook-${id}`)

  const mt = await pageFor(member.email)
  await openPanel(mt)
  const adminRowText = ((await rowOf(mt, A.id).innerText({ timeout: 5000 }).catch(() => '')) ?? '').trim()
  const adminRowInputs = await rowOf(mt, A.id).locator('input').count()
  const adminRowDelete = await rowOf(mt, A.id).getByRole('button').count()
  const ownValue = await rowOf(mt, MH?.id).locator('input').inputValue({ timeout: 5000 }).catch(() => '')
  const ownDelete = await rowOf(mt, MH?.id).locator('button[title]').count()
  const pageHasAdminToken = await mt.evaluate((t) => document.documentElement.outerHTML.includes(t), A.token).catch(() => true)
  chk(
    adminRowText.includes(`${TAG} admin's hook`) && adminRowInputs === 0 && adminRowDelete === 0 && !pageHasAdminToken &&
      ownValue.endsWith(`/api/v1/inbound/webhook/${MH?.token}`) && ownDelete === 1,
    'in the member’s panel the admin’s hook is listed by name, with no address and no delete — and their own shows its address',
    `admin's row ${JSON.stringify(adminRowText.slice(0, 80))}, inputs ${adminRowInputs}, buttons ${adminRowDelete}, token in page ${pageHasAdminToken}; own address ${ownValue ? 'shown' : 'missing'}, delete ${ownDelete}`,
  )

  const gt = await pageFor(guest.email)
  await openPanel(gt)
  const guestNew = await gt.getByTestId('inbound-webhook-new').count()
  const guestAdminInputs = await rowOf(gt, A.id).locator('input').count()
  const memberNew = await mt.getByTestId('inbound-webhook-new').count()
  chk(
    (await rowOf(gt, A.id).count()) === 1 && guestAdminInputs === 0 && guestNew === 0 && memberNew === 1,
    'a guest’s panel lists the hooks without their addresses and offers no New webhook, which the member’s does',
    `guest: row ${await rowOf(gt, A.id).count()}, inputs ${guestAdminInputs}, New ${guestNew}; member New ${memberNew}`,
  )

  const reblocked = await api(`/workspaces/${WS}`, { method: 'PATCH', body: { blockPublicSharing: true } })
  if (reblocked.status >= 300) throw new Error(`could not block public sharing again: ${reblocked.status}`)
  await mt.goto(`${B}/app/${WS}/${SPACE}/${PROJECT}`, { waitUntil: 'domcontentloaded' })
  await waitUntil(async () => (await mt.getByTestId('client-portal-blocked').count()) > 0, { timeoutMs: 15_000 })
  const createDisabled = await mt.getByTestId('client-portal-create').isDisabled({ timeout: 5000 }).catch(() => false)
  const blockedNote = await mt.getByTestId('client-portal-blocked').isVisible().catch(() => false)
  await gt.goto(`${B}/app/${WS}/${SPACE}/${PROJECT}`, { waitUntil: 'domcontentloaded' })
  // The guest's page is up once its project name is; only then does "no
  // portal section" mean something.
  await waitUntil(async () => (await gt.getByText(`${TAG} project`, { exact: false }).count()) > 0, { timeoutMs: 20_000 })
  const guestSection = await gt.getByTestId('client-portal-section').count()
  const guestPageUp = (await gt.getByText(`${TAG} project`, { exact: false }).count()) > 0
  chk(
    createDisabled && blockedNote && guestPageUp && guestSection === 0,
    'on the project page, blocked sharing disables making a portal and says why — and a guest has no portal section',
    `create disabled ${createDisabled}, note ${blockedNote}; guest page up ${guestPageUp}, portal section ${guestSection}`,
  )

  // ══ 4. A HOOK OUTLIVES NOBODY ════════════════════════════════════════════
  console.log('\n▶ a hook stops when its creator can no longer add tasks')

  const receive = (title) =>
    fetch(`${B}/api/v1/inbound/webhook/${MH?.token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    })
  const tasksTitled = async (title) => (await sql`select id from tasks where list_id = ${LIST} and title = ${title}`).length
  const whileMember = await receive(`${TAG} while a member`)
  const removed = await api(`/workspaces/${WS}/members/${member.id}`, { method: 'DELETE' })
  const afterLeaving = await receive(`${TAG} after leaving`)
  chk(
    whileMember.status < 300 && (await tasksTitled(`${TAG} while a member`)) === 1 &&
      removed.status < 300 && afterLeaving.status === 403 && (await tasksTitled(`${TAG} after leaving`)) === 0,
    'the member’s hook adds a task while they are a member — and none once they have left',
    `while a member ${whileMember.status}; removal ${removed.status}; after leaving ${afterLeaving.status}, ${await tasksTitled(`${TAG} after leaving`)} task(s)`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (api && WS) {
    const res = await api(`/workspaces/${WS}`, { method: 'DELETE' })
    if (res.status >= 300) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${res.status}`)
  }
  await sql?.end({ timeout: 5 }).catch(() => {})
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
