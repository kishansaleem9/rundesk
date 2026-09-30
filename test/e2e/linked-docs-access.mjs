/**
 * A TASK'S LINKED DOCS ARE LISTED TO WHOEVER MAY OPEN THE TASK, AND THE SECTION SAYS WHAT HAPPENED.
 *
 * NOT A FRAME ROW: `found-24-sep/linked-docs-read-needs-write-access`. Listing a
 * task's linked docs asked the task's WRITE rule (its creator, an assignee or a
 * manager), under a comment that said read. So a member who could open the
 * task, and had not made it and was not on it, was refused (403), and the
 * References tab said "No linked docs." — a confident zero. A read that failed
 * for any reason said the same, and so did one still loading; and a link the
 * server refused said nothing.
 *
 * The docs are planted by SQL, one in an open space and one in a private space
 * the member is not in, and linked by SQL; the member's list is read from the
 * API and from the screen, beside the admin's.
 *
 *   node test/e2e/linked-docs-access.mjs --api 3021
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 5

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

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
const stamp = Date.now()
const TAG = `lda-${stamp}`
let browser = null
let sql = null
let WS = null
let A = null

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the docs and their links are planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const password = 'Member@12345!'
  const signed = await signUpApi(API, {
    fullName: 'Linked docs member', email, password,
    organizationName: `Linked docs ${stamp}`, organizationSlug: `linked-docs-${stamp}`,
  })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (!added.ok) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)

  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (!res.ok || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  // Comment-only: the member opens everything here and may link nothing. A
  // task's level is its space's now, not whether they made it or are on it
  // (`found-24-sep/task-edits-narrower-than-clickup`), so that is the refusal
  // section 5 reads.
  const space = await make('/spaces', { workspaceId: WS, name: `${TAG} open`, defaultPermission: 'comment' }, 'the open space')
  const hidden = await make('/spaces', { workspaceId: WS, name: `${TAG} private`, visibility: 'private' }, 'the private space')
  const project = await make('/projects', { spaceId: space, name: `${TAG} project` }, 'the project')
  const list = await make('/lists', { projectId: project, name: `${TAG} list` }, 'the list')
  const task = await make('/tasks', { listId: list, title: `${TAG} a task the member did not make` }, 'the task')
  const doc = async (spaceId, title) =>
    (await sql`insert into docs (workspace_id, space_id, title, created_by_id) values (${WS}, ${spaceId}, ${title}, ${adminId}) returning id`)[0].id
  const OPEN = `${TAG} open doc`
  const PRIVATE = `${TAG} private doc`
  const SPARE = `${TAG} spare doc`
  const openDoc = await doc(space, OPEN)
  const privateDoc = await doc(hidden, PRIVATE)
  await doc(space, SPARE)
  for (const d of [openDoc, privateDoc]) {
    await sql`insert into task_doc_links (task_id, doc_id, created_by_id) values (${task}, ${d}, ${adminId})`
  }
  const opened = await M(`/tasks/${task}`)
  if (opened.status !== 200) throw new Error(`the member cannot open the task at all (${said(opened)}), so there is nothing to tell apart`)

  // ══ 1. THE LIST, FROM THE API ════════════════════════════════════════════
  console.log('\n▶ a member who may open the task, and did not make it and is not on it')
  const theirs = await M(`/tasks/${task}/linked-docs`)
  const admins = await A(`/tasks/${task}/linked-docs`)
  const titles = (res) => (res.data ?? []).map((d) => d.title)
  chk(
    theirs.status === 200 && titles(theirs).includes(OPEN) && !titles(theirs).includes(PRIVATE) &&
      titles(admins).includes(OPEN) && titles(admins).includes(PRIVATE),
    'a member who may open a task lists its linked docs — the open space’s, not the private space’s — and the admin both',
    `the member's list answered ${said(theirs)} ${JSON.stringify(titles(theirs))}; the admin's ${said(admins)} ${JSON.stringify(titles(admins))}`,
  )

  // ══ 2. THE LIST, ON SCREEN ═══════════════════════════════════════════════
  console.log('\n▶ the task’s References tab, as the member')
  browser = await chromium.launch(launchOptions())
  // The service worker is blocked so the routes below see the requests.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  const openReferences = async () => {
    await page.goto(`${B}/app/${WS}/${space}/${project}/${list}?task=${task}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('task-tab-dependencies').click({ timeout: 20_000 }).catch(() => {})
    await page.getByTestId('related-tab-references').click({ timeout: 15_000 }).catch(() => {})
  }
  const panel = () => page.getByTestId('related-items-panel')
  const panelText = async () => ((await panel().filter({ visible: true }).innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ')
  await openReferences()
  await waitUntil(async () => (await panelText()).includes(OPEN) || (await panelText()).includes('No linked docs.'), { timeoutMs: 20_000 })
  const shown = await panelText()
  chk(
    shown.includes(OPEN) && !shown.includes(PRIVATE) && !shown.includes('No linked docs.'),
    'and the task’s References tab names the open doc for them — not “No linked docs.”',
    `the tab read ${JSON.stringify(shown.slice(0, 160))}`,
  )

  // ══ 3. A READ STILL LOADING ══════════════════════════════════════════════
  // HELD until the tab has been read — not for a fixed time: a read after the
  // answer landed proves nothing about loading.
  console.log('\n▶ a list still loading')
  const LINKED = (u) => u.pathname.endsWith(`/tasks/${task}/linked-docs`)
  let releaseList
  const listGate = new Promise((r) => { releaseList = r })
  let listHeld = false
  // A handler's promise is nobody's to await, so its rejections are caught here.
  const holdList = async (route) => {
    if (route.request().method() !== 'GET') return route.continue().catch(() => {})
    listHeld = true
    await listGate
    return route.continue().catch(() => {})
  }
  await page.route(LINKED, holdList)
  await openReferences()
  await waitUntil(async () => listHeld && (await panel().count()) > 0, { timeoutMs: 20_000 })
  const whileHeld = await panelText()
  releaseList()
  const landed = await waitUntil(async () => (await panelText()).includes(OPEN), { timeoutMs: 20_000 })
  await page.unroute(LINKED, holdList).catch(() => {})
  chk(
    listHeld && !whileHeld.includes('No linked docs.') && landed,
    'while the list loads the tab does not say there are none — and then names the open doc',
    `held ${listHeld}; while held the tab read ${JSON.stringify(whileHeld.slice(0, 120))}; the open doc shown after: ${landed}`,
  )

  // ══ 4. A READ THAT FAILS ═════════════════════════════════════════════════
  console.log('\n▶ a list that fails to load')
  const failList = (route) => (route.request().method() === 'GET'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'failed by the suite' }) })
    : route.continue()
  ).catch(() => {})
  await page.route(LINKED, failList)
  await openReferences()
  await waitUntil(async () => (await page.getByTestId('task-linked-docs-failed').count()) > 0 || (await panelText()).includes('No linked docs.'), { timeoutMs: 20_000 })
  const failedSays = ((await page.getByTestId('task-linked-docs-failed').filter({ visible: true }).innerText({ timeout: 3000 }).catch(() => '')) ?? '').trim()
  const saidNone = (await panelText()).includes('No linked docs.')
  await page.unroute(LINKED, failList).catch(() => {})
  chk(
    failedSays === 'Linked docs could not be loaded.' && !saidNone,
    'a list that fails to load says so — and not that there are none',
    `the tab says ${JSON.stringify(failedSays)}; "No linked docs." shown: ${saidNone}`,
  )

  // ══ 5. A LINK THE SERVER REFUSES ═════════════════════════════════════════
  console.log('\n▶ a link the server refuses')
  const refusal = await M(`/tasks/${task}/linked-docs`, { method: 'POST', body: { docId: openDoc } })
  const reason = String(refusal.error?.message ?? '')
  await openReferences()
  await waitUntil(async () => (await panelText()).includes(OPEN), { timeoutMs: 20_000 })
  await panel().getByRole('button', { name: /^Link$/ }).first().click({ timeout: 10_000 }).catch(() => {})
  await page.getByRole('button', { name: new RegExp(SPARE) }).first().click({ timeout: 10_000 }).catch(() => {})
  const toast = page.locator('[data-sonner-toast]')
  const toasted = await toast.first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false)
  const told = toasted ? ((await toast.first().innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim() : ''
  const [linkedAnyway] = await sql`select count(*)::int as n from task_doc_links l join docs d on d.id = l.doc_id where l.task_id = ${task} and d.title = ${SPARE}`
  chk(
    refusal.status === 403 && reason.length > 0 && told.includes(reason) && linkedAnyway.n === 0,
    'a link the server refuses says why, in the server’s words',
    `the refusal was ${said(refusal)}; the page said ${JSON.stringify(told)}; the spare doc linked: ${linkedAnyway.n}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
