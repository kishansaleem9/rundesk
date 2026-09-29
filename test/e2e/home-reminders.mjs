/**
 * HOME › REMINDERS — the reminders a person has set, where they can see them,
 * follow them, and take them back.
 *
 * NOT A FRAME ROW: the open-work item `standalone-reminders-invisible`. `+ Create
 * › Reminder` made a standalone reminder and refreshed `['reminders', ws]`, and
 * no screen held that key. `GET /workspaces/:ws/reminders` answered and nothing
 * asked, so a reminder made there could be neither seen nor deleted until it
 * went off; a task's reminders were listed only from inside that task. ClickUp
 * keeps reminders with the rest of a person's own work on Home, so that is where
 * they are listed now.
 *
 * WHAT MAKES IT A TEST AND NOT A DEMO:
 *
 *   · the first reminder is made through the MODAL, the path that was broken,
 *     and must appear under Home › Reminders without a reload — the key the
 *     modal refreshes is the key the list reads, or it does not;
 *   · a second member's reminder in the same workspace is made too, and must
 *     NOT appear: the list is the caller's own, and a list of everybody's is
 *     the obvious wrong version;
 *   · one reminder is marked as already gone off, by SQL, and must not be
 *     listed as waiting;
 *   · deleting is checked in the row, not only on the screen, and the empty
 *     state is checked once nothing is left — a blank panel and "nothing here"
 *     look alike until one is asked for.
 *
 *   node test/e2e/home-reminders.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 9

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
const TAG = `hr-${stamp}`
const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
let browser = null
let sql = null
let api = null
let WS = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — deletions are checked in the row')
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  // The fixture's apiClient NEVER THROWS — it answers {status, data, error} —
  // so every call below is read off `status`.
  api = apiClient(`${B}/api/v1`, auth.accessToken)
  const made = await api('/workspaces', { method: 'POST', body: { name: `${TAG}` } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const me = (await api('/users/me')).data?.id
  if (!me) throw new Error('could not read the account')

  // A task to hang a reminder on, and a second member with one of their own.
  const space = (await api('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })).data?.id
  const project = (await api('/projects', { method: 'POST', body: { spaceId: space, name: `${TAG} project` } })).data?.id
  const list = (await api('/lists', { method: 'POST', body: { projectId: project, name: `${TAG} list` } })).data?.id
  const TASK_TITLE = `${TAG} the task`
  const task = (await api('/tasks', { method: 'POST', body: { listId: list, title: TASK_TITLE } })).data?.id
  if (!task) throw new Error('could not make the task')
  const inHours = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString()
  const onTask = await api(`/workspaces/${WS}/reminders`, { method: 'POST', body: { taskId: task, remindAt: inHours(48) } })
  if (onTask.status >= 300) throw new Error(`could not set the task reminder: ${onTask.status}`)
  const GONE_OFF = `${TAG} already went off`
  const goneOff = await api(`/workspaces/${WS}/reminders`, { method: 'POST', body: { remindAt: inHours(72), note: GONE_OFF } })
  if (goneOff.status >= 300 || !goneOff.data?.id) throw new Error(`could not set the fired reminder: ${goneOff.status}`)
  await sql`update reminders set notified_at = now() where id = ${goneOff.data.id}`

  const other = { email: `hr-${stamp}@rundesk.invalid`, password: 'Member@12345!' }
  // Plain fetch: the fixture client always sends a bearer token, and a signup
  // is made by somebody who has none.
  const signupRes = await fetch(`${B}/api/v1/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: `Reminder ${stamp}`, email: other.email, password: other.password, organizationName: `Reminder ${stamp}`, organizationSlug: `reminder-${stamp}` }),
  })
  const signup = { status: signupRes.status, data: (await signupRes.json().catch(() => null))?.data }
  if (!signup.data?.accessToken) throw new Error(`signup failed: ${signup.status}`)
  const added = await api(`/workspaces/${WS}/members`, { method: 'POST', body: { email: other.email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${added.status}`)
  const THEIRS = `${TAG} somebody else's`
  const theirs = await apiClient(`${B}/api/v1`, signup.data.accessToken)(`/workspaces/${WS}/reminders`, {
    method: 'POST',
    body: { remindAt: inHours(24), note: THEIRS },
  })
  if (theirs.status >= 300) throw new Error(`could not set the other member's reminder: ${theirs.status}`)

  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${WS}?section=reminders`, { waitUntil: 'domcontentloaded' })
  const panel = page.getByTestId('home-section-reminders')
  await panel.waitFor({ timeout: 25_000 }).catch(() => {})

  // ══ 1. MADE FROM + CREATE, AND THERE ═════════════════════════════════════
  console.log('\n▶ a reminder made from + Create is listed under Home › Reminders')

  const NOTE = `${TAG} call the printer`
  await page.getByTestId('quick-create-open').click({ timeout: 20_000 }).catch(() => {})
  await page.getByTestId('create-tab-reminder').click({ timeout: 15_000 }).catch(() => {})
  await page.getByTestId('reminder-note').fill(NOTE, { timeout: 10_000 }).catch(() => {})
  await page.getByTestId('quick-create-reminder').locator('button[type=submit]').click({ timeout: 10_000 }).catch(() => {})
  // The labels DRAWN — for the same reason as the empty state below; a hidden row is not listed.
  const labels = () => page.getByTestId('home-reminder-label').filter({ visible: true }).allInnerTexts().catch(() => [])
  const listed = await waitUntil(async () => (await labels()).includes(NOTE), { timeoutMs: 15_000 })
  const row = (await sql`select id from reminders where workspace_id = ${WS} and user_id = ${me} and note = ${NOTE}`)[0]
  chk(
    listed && !!row,
    'the reminder made in the modal is stored and appears in the list without a reload',
    `stored: ${row ? 'yes' : 'no'}; the list shows ${JSON.stringify(await labels())} — the modal refreshes ` +
      "['reminders', ws], and until now nothing on any screen held that key",
  )

  const countText = await page.getByTestId('home-nav-reminders-count').filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => null)
  chk(
    countText?.trim() === '2',
    'and the Reminders entry counts what is waiting — the modal’s and the task’s, not the one that went off',
    `the entry's count reads ${JSON.stringify(countText)}`,
  )

  // ══ 2. WHAT IS LISTED ════════════════════════════════════════════════════
  console.log('\n▶ the caller’s own waiting reminders, soonest first')

  const shown = await labels()
  chk(
    shown.includes(TASK_TITLE),
    'a reminder on a task is listed by the task’s title',
    `the list shows ${JSON.stringify(shown)}`,
  )
  chk(
    shown.indexOf(NOTE) !== -1 && shown.indexOf(TASK_TITLE) !== -1 && shown.indexOf(NOTE) < shown.indexOf(TASK_TITLE),
    'soonest first — the one due in an hour above the one due in two days',
    `the order is ${JSON.stringify(shown)}`,
  )
  chk(
    !shown.includes(THEIRS),
    'and another member’s reminder in the same workspace is not in it',
    `the list shows ${JSON.stringify(shown)} — reminders are the person's own`,
  )
  chk(
    !shown.includes(GONE_OFF),
    'nor one that has already gone off',
    `the list shows ${JSON.stringify(shown)}`,
  )

  // ══ 3. FOLLOWING AND TAKING BACK ═════════════════════════════════════════
  console.log('\n▶ a reminder leads to what it is about, and can be deleted')

  await page.getByTestId('home-reminder').filter({ hasText: TASK_TITLE }).first().click({ timeout: 8000 }).catch(() => {})
  const opened = await waitUntil(() => page.url().includes(`task=${task}`), { timeoutMs: 15_000 })
  chk(opened, 'pressing a task’s reminder opens that task', `the page went to ${page.url()}`)

  await page.goto(`${B}/app/${WS}?section=reminders`, { waitUntil: 'domcontentloaded' })
  await panel.waitFor({ timeout: 20_000 }).catch(() => {})
  await waitUntil(async () => (await labels()).includes(NOTE), { timeoutMs: 10_000 })
  await page.getByTestId('home-reminder').filter({ hasText: NOTE }).getByTestId('home-reminder-delete').click({ timeout: 8000 }).catch(() => {})
  const goneFromList = await waitUntil(async () => !(await labels()).includes(NOTE), { timeoutMs: 10_000 })
  const goneFromRows = row ? (await sql`select id from reminders where id = ${row.id}`).length === 0 : false
  chk(
    goneFromList && goneFromRows,
    'deleting one takes it off the list and out of the database',
    `list: ${goneFromList ? 'gone' : 'still there'}; row: ${goneFromRows ? 'gone' : 'still there'}`,
  )

  await page.getByTestId('home-reminder').filter({ hasText: TASK_TITLE }).getByTestId('home-reminder-delete').click({ timeout: 8000 }).catch(() => {})
  // `innerText`, not `textContent`: what is RENDERED. textContent includes
  // hidden elements, so a panel whose empty state was present but hidden —
  // blank to anybody looking — read as saying "No reminders" (hr-9 ran green).
  // And of a SHOWN panel: a hidden element's own innerText is its whole text.
  const empty = await waitUntil(
    async () => (await page.getByTestId('home-reminder').count()) === 0 && ((await panel.filter({ visible: true }).innerText({ timeout: 3000 }).catch(() => '')) ?? '').length > 0,
    { timeoutMs: 10_000 },
  )
  const panelText = (await panel.filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')) ?? ''
  chk(
    empty && /no reminders/i.test(panelText),
    'and with none left, the panel says there are none rather than going blank',
    `the panel reads ${JSON.stringify(panelText.slice(0, 120))}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  if (api && WS) {
    const res = await api(`/workspaces/${WS}`, { method: 'DELETE' })
    if (res.status >= 300) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${res.status}`)
  }
  await sql?.end?.({ timeout: 5 })
  await browser?.close().catch(() => {})
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
