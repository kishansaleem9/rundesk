/**
 * THE INBOX IS ONE WORKSPACE'S, EVERY ROW OF IT IS REACHABLE, AND WHAT IT
 * COUNTS IS THE SERVER'S COUNT.
 *
 * NOT A FRAME ROW: the open-work items `workspace-inbox-unscoped-by-workspace`
 * and `inbox-capped-confident-zero`, and the siblings found closing them.
 * `GET /notifications` took no workspace, no page and no type; the service read
 * the newest fifty, full stop. Every screen then filtered and counted those
 * fifty in the browser:
 *
 *   - workspace A's Inbox, Home, bell and sidebar badge listed, counted and
 *     "marked all read" workspace B's rows;
 *   - the Inbox showed fifty rows, counted fifty, and said "You're all caught
 *     up" when those fifty were read and the fifty-first was not;
 *   - the Replies page kept the replies among the newest fifty notifications of
 *     every type, so fifty newer assignments emptied it;
 *   - Home › Assigned Comments listed MENTIONS, and never a comment assigned
 *     to you.
 *
 * THE FIXTURE MAKES EVERY WRONG ANSWER A DIFFERENT NUMBER. A fresh account `R`
 * — so nothing but this suite has ever notified it — is given, in workspace A,
 * two replies and an assigned comment, THEN fifty-five newer assignments; three
 * assignments in workspace B; and one account-level notification, which
 * belongs to no workspace and so is shown in both. Sixty rows in A's scope:
 * fifty on the first page and ten behind it, the replies among the ten.
 *
 * Two page boundaries are staged by SQL — the only thing here that is — because
 * the order of rows written a millisecond apart is not something a test can ask
 * the API for: two rows in one millisecond, and two rows at one instant. A
 * cursor that compared at millisecond precision, or that ignored ties, drops
 * the second row of each pair between two pages.
 *
 *   node test/e2e/inbox-scope.mjs --api 3011 --dist apps/web/dist
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
const EXPECTED_CHECKS = 23

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
const TAG = `ibx-${stamp}`
const R_EMAIL = `ibx-${stamp}@rundesk.invalid`
const R_PASSWORD = 'Member@12345!'
const MANY = 55
const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
let browser = null
let api = null
let sql = null
const workspaces = []

/** A workspace with one list in it, made by the admin. */
async function workspaceWithList(name) {
  const made = await api('/workspaces', { method: 'POST', body: { name } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make ${name}: ${made.status}`)
  workspaces.push(made.data.id)
  const space = (await api('/spaces', { method: 'POST', body: { workspaceId: made.data.id, name: `${name} space` } })).data?.id
  const project = (await api('/projects', { method: 'POST', body: { spaceId: space, name: `${name} project` } })).data?.id
  const list = (await api('/lists', { method: 'POST', body: { projectId: project, name: `${name} list` } })).data?.id
  if (!list) throw new Error(`could not make a list in ${name}`)
  return { id: made.data.id, list }
}

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the page boundaries are staged in Postgres and cannot be skipped')
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  // The fixture's apiClient NEVER THROWS — every call below is read off `status`.
  api = apiClient(`${B}/api/v1`, auth.accessToken)

  // Registered, so the account is removed when the run ends (`lib/made.mjs`).
  madeAccount({ email: R_EMAIL })
  const signupRes = await fetch(`${B}/api/v1/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fullName: `Inbox ${stamp}`,
      email: R_EMAIL,
      password: R_PASSWORD,
      organizationName: `Inbox ${stamp}`,
      organizationSlug: `inbox-${stamp}`,
    }),
  })
  const signup = (await signupRes.json().catch(() => null))?.data
  if (!signup?.accessToken) throw new Error(`signup failed: ${signupRes.status}`)
  const R = apiClient(`${B}/api/v1`, signup.accessToken)
  const rId = signup.user?.id ?? (await R('/users/me')).data?.id

  const A = await workspaceWithList(`${TAG} A`)
  const W2 = await workspaceWithList(`${TAG} B`)
  for (const ws of [A.id, W2.id]) {
    const added = await api(`/workspaces/${ws}/members`, { method: 'POST', body: { email: R_EMAIL, role: 'member' } })
    if (added.status >= 300) throw new Error(`could not add R to ${ws}: ${added.status}`)
  }

  const mine = (params) => R(`/notifications?${params}`)
  const rowsOf = (res) => res.data ?? []
  const countOf = async (params) => (await R(`/notifications/unread-count?${params}`)).data?.count
  const countsOf = async (ws) => (await R(`/notifications/counts?workspaceId=${ws}`)).data
  const settle = (params, n) =>
    waitUntil(async () => rowsOf(await mine(`${params}&limit=100`)).length === n, { timeoutMs: 20_000 })

  const task = async (list, title) => {
    const res = await api('/tasks', { method: 'POST', body: { listId: list, title } })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make "${title}": ${res.status}`)
    return res.data.id
  }
  const assignR = async (taskId) => {
    const res = await api(`/tasks/${taskId}/assignees`, { method: 'POST', body: { userId: rId } })
    if (res.status >= 300) throw new Error(`could not assign R: ${res.status} ${JSON.stringify(res.error ?? '')}`)
  }

  // ── The oldest rows in A: an assignment, two replies, an assigned comment ──
  const T0 = await task(A.list, `${TAG} replied-on`)
  await assignR(T0)
  const follow = await R(`/tasks/${T0}/watchers`, { method: 'POST', body: { userId: rId } })
  if (follow.status >= 300) throw new Error(`R could not follow the task: ${follow.status}`)
  await settle(`workspaceId=${A.id}`, 1)
  const comments = []
  for (const body of [`${TAG} first reply`, `${TAG} second reply`]) {
    const c = await api(`/tasks/${T0}/comments`, { method: 'POST', body: { body } })
    if (c.status >= 300 || !c.data?.id) throw new Error(`could not comment: ${c.status}`)
    comments.push(c.data.id)
    await settle(`workspaceId=${A.id}`, comments.length + 1)
  }
  const assigned = await api(`/tasks/${T0}/comments/${comments[0]}/assign`, { method: 'POST', body: { userId: rId } })
  if (assigned.status >= 300) throw new Error(`could not assign the comment: ${assigned.status}`)
  await settle(`workspaceId=${A.id}`, 4)

  // ── B's three, then A's fifty-five newer ones, then one that has no workspace ──
  for (let i = 1; i <= 3; i++) await assignR(await task(W2.list, `${TAG} B task ${i}`))
  await settle(`workspaceId=${W2.id}`, 3)
  for (let i = 1; i <= MANY; i++) await assignR(await task(A.list, `${TAG} A task ${String(i).padStart(2, '0')}`))
  await settle(`workspaceId=${A.id}`, 4 + MANY)
  const sentTest = await R('/notifications/test', { method: 'POST', body: {} })
  if (sentTest.status >= 300) throw new Error(`could not send the account-level notification: ${sentTest.status}`)
  const IN_A = 4 + MANY + 1
  await settle(`workspaceId=${A.id}`, IN_A)
  // One notification that is NOT R's: the admin's own test, in A.
  const adminTest = await api('/notifications/test', { method: 'POST', body: { workspaceId: A.id } })
  if (adminTest.status >= 300) throw new Error(`could not send the admin a notification: ${adminTest.status}`)

  // ══ 1. SCOPE ═════════════════════════════════════════════════════════════
  console.log('\n▶ a workspace’s notifications are that workspace’s')

  const inA = rowsOf(await mine(`workspaceId=${A.id}&limit=100`))
  const inB = rowsOf(await mine(`workspaceId=${W2.id}&limit=100`))
  const everywhere = rowsOf(await mine('limit=100'))
  const accountLevel = inA.filter((n) => n.workspaceId === null)
  chk(
    inA.length === IN_A && inA.every((n) => n.workspaceId === A.id || n.workspaceId === null) && accountLevel.length === 1,
    'A’s list holds A’s fifty-nine and the one account-level row — nothing of B’s',
    `it holds ${inA.length} rows from ${JSON.stringify([...new Set(inA.map((n) => n.workspaceId))])}`,
  )
  chk(
    inB.length === 4 && inB.every((n) => n.workspaceId === W2.id || n.workspaceId === null) && inB.some((n) => n.id === accountLevel[0]?.id),
    'B’s list holds B’s three and the same account-level row — nothing of A’s',
    `it holds ${inB.length} rows from ${JSON.stringify([...new Set(inB.map((n) => n.workspaceId))])}`,
  )
  chk(
    everywhere.length >= IN_A + 3 && inB.every((n) => everywhere.some((e) => e.id === n.id)),
    'while the view outside any workspace still has both workspaces’ rows',
    `the unscoped read holds ${everywhere.length} rows`,
  )
  const cA = await countsOf(A.id)
  const cB = await countsOf(W2.id)
  chk(
    cA?.inbox === IN_A && cA?.unread === IN_A && cB?.inbox === 4 && cB?.unread === 4,
    'and the counts are each workspace’s own: 60 and 4, all unread',
    `A counts ${JSON.stringify(cA)}, B ${JSON.stringify(cB)}`,
  )
  const replyCount = rowsOf(await mine(`workspaceId=${A.id}&types=task_commented,doc_commented,chat_reply`)).length
  const assignedCount = rowsOf(await mine(`workspaceId=${A.id}&types=comment_assigned`)).length
  const taskCount = rowsOf(await mine(`workspaceId=${A.id}&types=task_assigned&limit=100`)).length
  chk(
    replyCount === 2 && assignedCount === 1 && taskCount === MANY + 1,
    'a type filter is the server’s: two replies, one assigned comment, fifty-six assignments',
    `replies ${replyCount}, assigned comments ${assignedCount}, assignments ${taskCount}`,
  )

  // ══ 2. PAGES ═════════════════════════════════════════════════════════════
  console.log('\n▶ every row is on exactly one page, even two written in one millisecond')

  /*
   * A strictly decreasing series, one second apart, newest first — then rows
   * 50 and 51 (the last of page one and the first of page two) put into one
   * millisecond, 400µs apart, still in the same order.
   */
  await sql`
    with ordered as (
      select id, row_number() over (order by created_at desc, id desc) as rn
      from notifications
      where user_id = ${rId} and (workspace_id = ${A.id} or workspace_id is null)
    )
    update notifications n
       set created_at = timestamptz '2026-01-01 12:00:00+00' - (o.rn * interval '1 second')
      from ordered o
     where n.id = o.id`
  const series = rowsOf(await mine(`workspaceId=${A.id}&limit=100`)).map((n) => n.id)
  await sql`update notifications set created_at = timestamptz '2026-01-01 11:59:10.000700+00' where id = ${series[49]}`
  await sql`update notifications set created_at = timestamptz '2026-01-01 11:59:10.000300+00' where id = ${series[50]}`
  const pageOne = rowsOf(await mine(`workspaceId=${A.id}&limit=50`)).map((n) => n.id)
  const pageTwo = rowsOf(await mine(`workspaceId=${A.id}&limit=50&before=${pageOne[pageOne.length - 1]}`)).map((n) => n.id)
  const union = new Set([...pageOne, ...pageTwo])
  chk(
    pageOne.length === 50 && pageTwo[0] === series[50] && union.size === IN_A && pageTwo.length === IN_A - 50,
    'the row a few hundred microseconds older than the last of page one opens page two',
    `page one ${pageOne.length}, page two ${pageTwo.length} starting ${pageTwo[0]} (expected ${series[50]}), ${union.size} distinct`,
  )

  // The same two rows at one instant: only the id orders them.
  await sql`update notifications set created_at = timestamptz '2026-01-01 11:59:10.000500+00' where id in (${series[49]}, ${series[50]})`
  const tied = rowsOf(await mine(`workspaceId=${A.id}&limit=100`)).map((n) => n.id)
  const tieOne = rowsOf(await mine(`workspaceId=${A.id}&limit=50`)).map((n) => n.id)
  const tieTwo = rowsOf(await mine(`workspaceId=${A.id}&limit=50&before=${tieOne[tieOne.length - 1]}`)).map((n) => n.id)
  chk(
    tieOne[49] === tied[49] && tieTwo[0] === tied[50] && new Set([...tieOne, ...tieTwo]).size === IN_A,
    'and when two rows share an instant, the one ordered second opens page two',
    `page two starts ${tieTwo[0]} (expected ${tied[50]}); ${new Set([...tieOne, ...tieTwo]).size} distinct of ${IN_A}`,
  )

  // ══ 3. WHAT IS REFUSED, AND THAT A REFUSAL ANSWERS WITH NOTHING ══════════
  console.log('\n▶ a bad scope, type, size or cursor is refused — never answered with everything')

  const badScope = await mine('workspaceId=not-a-workspace')
  chk(
    badScope.status === 400 && badScope.data == null,
    'a malformed workspace is refused with nothing listed, not answered unscoped',
    `it answered ${badScope.status} with ${rowsOf(badScope).length} rows`,
  )
  const badType = await mine(`workspaceId=${A.id}&types=task_assigned,nonsense`)
  chk(
    badType.status === 400 && badType.data == null && /nonsense/.test(badType.error?.message ?? ''),
    'an unknown type is refused by name',
    `it answered ${badType.status}: ${JSON.stringify(badType.error?.message ?? rowsOf(badType).length)}`,
  )
  const tooMany = await mine(`workspaceId=${A.id}&limit=101`)
  chk(
    tooMany.status === 400 && tooMany.data == null,
    'a page larger than a hundred is refused',
    `limit=101 answered ${tooMany.status} with ${rowsOf(tooMany).length} rows`,
  )
  const adminRows = rowsOf(await api(`/notifications?workspaceId=${A.id}&types=test_notification`))
  const foreign = adminRows[0]?.id
  const foreignCursor = foreign ? await mine(`workspaceId=${A.id}&before=${foreign}`) : { status: 0 }
  chk(
    Boolean(foreign) && foreignCursor.status === 400 && foreignCursor.data == null,
    'and a cursor that is somebody else’s notification is refused — it would date their row',
    foreign ? `it answered ${foreignCursor.status}` : 'the admin had no notification to use as the cursor',
  )

  // ══ 4. THE PAGE, AS R SEES IT ════════════════════════════════════════════
  console.log('\n▶ A’s Inbox shows a page, counts them all, and is not "caught up" until it is')

  // Page one read — as it stands now, after the tie — and the ten behind it,
  // the replies among them, not.
  for (const id of tieOne) await R(`/notifications/${id}/read`, { method: 'POST' })
  const unreadA = IN_A - 50
  const unreadB = 3
  // The bell is not in a new account's top bar; R pins it, as the picker does.
  const pinned = await R('/users/me', { method: 'PATCH', body: { topbarPinned: ['create', 'timer', 'theme', 'notifications'] } })
  if (pinned.status >= 300) throw new Error(`could not pin the bell: ${pinned.status}`)

  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', R_EMAIL)
  await page.fill('input[type=password]', R_PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${A.id}/inbox`, { waitUntil: 'domcontentloaded' })

  // A row is the card carrying `data-unread`; other test ids inside it start
  // with "notif-" too.
  const rows = page.locator('[data-testid^="notif-"][data-unread]')
  // Read as DRAWN, here and below: a count in the page but hidden is a count nobody is shown.
  const text = (id) => page.getByTestId(id).filter({ visible: true }).innerText({ timeout: 4000 }).then((t) => t?.trim() ?? null, () => null)
  await waitUntil(async () => (await rows.count()) >= 50, { timeoutMs: 20_000 })
  const firstPage = await rows.count()
  chk(
    firstPage === 50 && (await page.getByTestId('inbox-load-more').count()) === 1,
    'the first page is fifty rows, with "Load older" under them',
    `${firstPage} rows, ${await page.getByTestId('inbox-load-more').count()} load button(s)`,
  )
  // BOTH chips, as the check below reads both. Waiting on "All" alone raced
  // "Primary", whose count lands a moment later: on 24 September this failed
  // with the right numbers in its own message ("All reads 60, Primary 59"),
  // read a moment after the condition had read Primary still loading.
  await waitUntil(
    async () => (await text('inbox-chip-count-all')) === String(IN_A) && (await text('inbox-chip-count-primary')) === String(IN_A - 1),
    { timeoutMs: 10_000 },
  )
  chk(
    (await text('inbox-chip-count-all')) === String(IN_A) && (await text('inbox-chip-count-primary')) === String(IN_A - 1),
    'the chips count what the server holds — 60 and 59 — not the fifty loaded',
    `All reads ${JSON.stringify(await text('inbox-chip-count-all'))}, Primary ${JSON.stringify(await text('inbox-chip-count-primary'))}`,
  )
  await waitUntil(async () => (await text('inbox-unread-badge')) !== null, { timeoutMs: 10_000 })
  chk(
    (await page.getByTestId('inbox-caught-up').count()) === 0 && /\b10\b/.test((await text('inbox-unread-badge')) ?? ''),
    'every row on screen is read, ten behind them are not — so it is not "all caught up", and says 10 new',
    `caught-up shown: ${(await page.getByTestId('inbox-caught-up').count()) > 0}, badge ${JSON.stringify(await text('inbox-unread-badge'))}`,
  )
  await waitUntil(async () => (await text('sidebar-inbox-unread')) === String(unreadA), { timeoutMs: 10_000 })
  chk(
    (await text('sidebar-inbox-unread')) === String(unreadA) && (await text('bell-unread')) === String(unreadA),
    `the sidebar and the bell count A’s ${unreadA}, not A’s and B’s ${unreadA + unreadB}`,
    `sidebar ${JSON.stringify(await text('sidebar-inbox-unread'))}, bell ${JSON.stringify(await text('bell-unread'))}`,
  )

  await page.getByTestId('inbox-load-more').scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
  await waitUntil(async () => (await rows.count()) === IN_A - 1, { timeoutMs: 15_000 })
  const titles = (await rows.filter({ visible: true }).allInnerTexts().catch(() => [])).join('\n')
  chk(
    (await rows.count()) === IN_A - 1 &&
      titles.includes(`${TAG} replied-on`) &&
      !titles.includes(`${TAG} B task`) &&
      (await page.getByTestId('inbox-load-more').count()) === 0,
    'scrolling to the end loads the rest — 59 rows, the oldest included — and "Load older" goes away',
    `${await rows.count()} rows; oldest present: ${titles.includes(`${TAG} replied-on`)}; any of B's: ${titles.includes(`${TAG} B task`)}`,
  )

  // ══ 5. REPLIES AND HOME ══════════════════════════════════════════════════
  console.log('\n▶ Replies and Home find what is older than fifty other notifications')

  await page.goto(`${B}/app/${A.id}/replies`, { waitUntil: 'domcontentloaded' })
  const replyRows = page.locator('[data-testid^="reply-resolve-"]')
  await waitUntil(async () => (await replyRows.count()) === 2, { timeoutMs: 15_000 })
  chk(
    (await replyRows.count()) === 2 && (await text('replies-unread-badge')) === '2 new',
    'the Replies page lists both unread replies, and its badge says 2',
    `${await replyRows.count()} reply row(s); badge ${JSON.stringify(await text('replies-unread-badge'))}`,
  )

  await page.goto(`${B}/app/${A.id}?section=replies`, { waitUntil: 'domcontentloaded' })
  const count = (id) => text(`${id}-count`)
  await waitUntil(async () => (await count('home-nav-replies')) === '2', { timeoutMs: 15_000 })
  chk(
    (await count('home-nav-inbox')) === String(unreadA) &&
      (await count('home-nav-replies')) === '2' &&
      (await count('home-nav-assigned-comments')) === '1',
    `Home counts A’s ${unreadA} unread, 2 replies and 1 assigned comment`,
    `Inbox ${JSON.stringify(await count('home-nav-inbox'))}, Replies ${JSON.stringify(await count('home-nav-replies'))}, Assigned ${JSON.stringify(await count('home-nav-assigned-comments'))}`,
  )
  const homeRows = page.locator('[data-testid^="home-notification-"]')
  await waitUntil(async () => (await homeRows.count()) === 2, { timeoutMs: 10_000 })
  const homeReplies = await homeRows.count()
  await page.goto(`${B}/app/${A.id}?section=assigned-comments`, { waitUntil: 'domcontentloaded' })
  await waitUntil(async () => (await homeRows.count()) === 1, { timeoutMs: 10_000 })
  const assignedText = (await homeRows.first().filter({ visible: true }).innerText({ timeout: 3000 }).catch(() => '')) ?? ''
  chk(
    homeReplies === 2 && (await homeRows.count()) === 1 && /assigned a comment/i.test(assignedText),
    'and its panels list the two replies, and under Assigned Comments the comment assigned to R',
    `replies panel ${homeReplies} row(s); assigned panel ${await homeRows.count()}: ${JSON.stringify(assignedText.slice(0, 80))}`,
  )

  // ══ 6. THE BULK VERBS STAY IN THEIR WORKSPACE ═══════════════════════════
  console.log('\n▶ mark-all-read and clear-all touch one workspace')

  const markedB = await R('/notifications/mark-all-read', { method: 'POST', body: { workspaceId: W2.id } })
  const afterMarkB = { a: await countOf(`workspaceId=${A.id}`), b: await countOf(`workspaceId=${W2.id}`) }
  chk(
    markedB.status < 300 && afterMarkB.b === 0 && afterMarkB.a === unreadA,
    'marking B all read reads B’s rows and leaves A’s ten unread',
    `it answered ${markedB.status}; A ${afterMarkB.a}, B ${afterMarkB.b}`,
  )
  const badMark = await R('/notifications/mark-all-read', { method: 'POST', body: { workspaceId: 'nope' } })
  chk(
    badMark.status === 400 && (await countOf(`workspaceId=${A.id}`)) === unreadA,
    'a malformed workspace is refused, and nothing anywhere is marked read',
    `it answered ${badMark.status}; A still has ${await countOf(`workspaceId=${A.id}`)} unread`,
  )

  await page.goto(`${B}/app/${A.id}/inbox`, { waitUntil: 'domcontentloaded' })
  const markAll = page.getByRole('button', { name: /mark all read/i })
  await markAll.first().click({ timeout: 10_000 }).catch(() => {})
  await waitUntil(async () => (await page.getByTestId('inbox-caught-up').count()) === 1, { timeoutMs: 15_000 })
  chk(
    (await page.getByTestId('inbox-caught-up').count()) === 1 && (await countOf(`workspaceId=${A.id}`)) === 0,
    'and once A’s last unread is read from its own Inbox, it IS all caught up',
    `caught-up shown: ${(await page.getByTestId('inbox-caught-up').count()) > 0}; A unread ${await countOf(`workspaceId=${A.id}`)}`,
  )

  const clearedB = await R('/notifications/clear-all', { method: 'POST', body: { workspaceId: W2.id } })
  const cA2 = await countsOf(A.id)
  const cB2 = await countsOf(W2.id)
  chk(
    clearedB.status < 300 && clearedB.data?.cleared === 4 && cB2?.inbox === 0 && cA2?.inbox === IN_A - 1,
    'clearing B clears B’s three and the account-level row, and not one of A’s own',
    `it cleared ${clearedB.data?.cleared}; B's inbox ${cB2?.inbox}, A's ${cA2?.inbox} (expected ${IN_A - 1})`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  for (const ws of workspaces) {
    const res = await api?.(`/workspaces/${ws}`, { method: 'DELETE' })
    if (res && res.status >= 300) console.log(`  \x1b[33mnote\x1b[0m cleanup of ${ws} answered ${res.status}`)
  }
  await sql?.end({ timeout: 5 }).catch(() => {})
  await browser?.close().catch(() => {})
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
