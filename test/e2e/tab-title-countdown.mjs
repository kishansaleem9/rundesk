/**
 * §V2-02f — **THE RUNNING BLOCK'S COUNTDOWN, IN THE BROWSER TAB.**
 *
 * Frames `15:20`, `15:35`, `15:50` show a pill in the APP HEADER, right of the
 * workspace switcher: **"Work on dbgdh 2h 56m left"**. By `16:00` the same
 * pill reads **"2h 55m left"** — one block, ten minutes later. Frame `16:05`
 * is the LIST page and it is still there, so it belongs to the app and not to
 * the planner. (The browser tab in those frames reads "Planner | Leo"; the tab
 * is where RUNDESK puts the countdown, because that is the surface this row
 * covers and the one that had nothing in it at all.)
 *
 * `grep -rn "document.title" apps/web/src` returned ZERO before this row.
 * `index.html` shipped one static string, so a Rundesk tab said the same words
 * whatever was happening in it.
 *
 * A TAB TITLE IS GLOBAL MUTABLE STATE, and it fails in two quiet ways. Both are
 * asserted here because either one alone passes a naive check:
 *
 *   IT NEVER UPDATES — set once from the first value it saw, a frozen
 *   countdown reads as a live one. Checks 5 and 6 take the title twice, seconds
 *   apart, and require it to have MOVED and to have moved DOWNWARD. A title set
 *   once fails them; so does one that counts up.
 *
 *   IT NEVER RESETS — written and never cleared, a stale countdown outlives the
 *   block and follows you onto pages that have nothing to do with it. Check 7
 *   waits for the block to END and requires the tab to return to the title
 *   `index.html` shipped; check 10 leaves the app entirely and requires the
 *   same. Check 8 sits between them so that "restored" cannot be satisfied by a
 *   hook that simply stopped working.
 *
 * NARROWED TO ITS OWN FIXTURES. The planner is per-person and this account is
 * shared by every suite in this directory: every block here is created by this
 * run, addressed by the id it was created with, and deleted at the end. Nothing
 * counts rows, and no assertion is about "the planner" — only about this task's
 * blocks.
 *
 * THE FIXTURE'S `apiClient` NEVER THROWS. It returns `{status, data, error}`,
 * so `.catch(() => {})` on it is inert and a 404 reads as success. Every call
 * that matters has its `status` checked before its `data` is believed.
 *
 *   node test/e2e/tab-title-countdown.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, pickWorkspace } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/**
 * Exact, with `!==`. With `<`, a branch that quietly skipped — a fixture that
 * never got made, a wait that timed out and returned early — becomes a shorter
 * run that still reports "0 failed".
 */
const EXPECTED_CHECKS = 10

const chromium = await resolveChromium()
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
}

/** "2m 3s" / "2h 55m" → seconds, or null when the title carries no countdown. */
const remainingSeconds = (title) => {
  const hm = /(\d+)h (\d+)m/.exec(title)
  if (hm) return Number(hm[1]) * 3600 + Number(hm[2]) * 60
  const ms = /(\d+)m (\d+)s/.exec(title)
  if (ms) return Number(ms[1]) * 60 + Number(ms[2])
  return null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let A = null
let workspaceId = null
const createdBlocks = []
let taskId = null

try {
  const auth = await login(API, ME.email, ME.password)
  A = apiClient(API, auth.accessToken)
  const workspace = await pickWorkspace(A)
  workspaceId = workspace.id

  // ── A task of this run's own, and blocks that point at it ────────────────
  const stamp = Date.now()
  const taskTitle = `Focus countdown ${stamp}`
  let listId = null
  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  for (const space of spaces) {
    for (const project of (await A(`/projects/space/${space.id}`)).data ?? []) {
      const lists = (await A(`/lists/project/${project.id}`)).data ?? []
      if (lists[0]?.id) { listId = lists[0].id; break }
    }
    if (listId) break
  }
  if (!listId) throw new Error('no list to hang a task off')

  const made = await A('/tasks', { method: 'POST', body: { listId, title: taskTitle } })
  if (made.status >= 300 || !made.data?.id) {
    throw new Error(`could not create the fixture task: ${made.status} ${JSON.stringify(made.error)}`)
  }
  taskId = made.data.id

  const addBlock = async (body) => {
    const res = await A(`/planner/${workspaceId}/blocks`, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) {
      throw new Error(`could not create a time block: ${res.status} ${JSON.stringify(res.error)}`)
    }
    createdBlocks.push(res.data.id)
    return res.data
  }

  // The prefix is the person's own setting, read from the server rather than
  // assumed: another suite may have changed it, and hardcoding "Work on" would
  // make this suite fail for a reason that has nothing to do with the title.
  const settings = await A(`/planner/${workspaceId}/settings`)
  if (settings.status >= 300) throw new Error(`planner settings unreadable: ${settings.status}`)
  const prefix = (settings.data?.blockPrefix ?? '').trim() || 'Work on'
  const expectedLabel = `${prefix} ${taskTitle}`

  /*
   * The tab title is ONE global value and this account is shared, so a block
   * another run left behind would be counting down in the very place this
   * suite is about to make claims about. That is not a product failure and it
   * must not be reported as one: say so, name the block, and stop.
   */
  const dayFrom = new Date(Date.now() - 86_400_000).toISOString()
  const dayTo = new Date(Date.now() + 86_400_000).toISOString()
  const mine = await A(`/planner/${workspaceId}/blocks?from=${dayFrom}&to=${dayTo}`)
  if (mine.status >= 300) throw new Error(`could not read this planner: ${mine.status}`)
  const strays = (mine.data ?? []).filter(
    (b) => !b.isAllDay && Date.parse(b.startsAt) <= Date.now() && Date.parse(b.endsAt) > Date.now(),
  )
  if (strays.length) {
    throw new Error(
      `a time block from another run is live on this account right now (${strays
        .map((b) => `${b.id} ${b.startsAt}→${b.endsAt}`)
        .join(', ')}) — the tab title is one global value, so this suite cannot tell ` +
        'its own countdown from that one. Delete it and re-run.',
    )
  }

  /*
   * An ALL-DAY block covering right now. It is the trap: it contains the
   * present instant, so anything that counts down "a block happening now"
   * without excluding all-day blocks will hijack the tab with a number that is
   * true and useless ("23h 41m left") for the whole day.
   */
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0)
  const nextMidnight = new Date(midnight.getTime() + 86_400_000)
  await addBlock({
    taskId,
    startsAt: midnight.toISOString(),
    endsAt: nextMidnight.toISOString(),
    isAllDay: true,
  })

  // ── The browser ──────────────────────────────────────────────────────────
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()

  // Prove the request, not just the render: the title can only be honest if
  // the app actually asked the server what is running.
  const blockCalls = []
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes(`/planner/${workspaceId}/blocks?`)) blockCalls.push(url)
  })

  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${workspaceId}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('workspace-sidebar').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})

  console.log('\n▶ §V2-02f — with nothing running, the tab says what it always said')
  await waitUntil(async () => blockCalls.length > 0, { timeoutMs: 20_000 })
  const baseTitle = await page.title()
  chk(
    baseTitle.length > 0 && !/left|\d+m \d+s/i.test(baseTitle),
    `an all-day block puts no countdown in the tab (it reads ${JSON.stringify(baseTitle)})`,
    `the tab reads ${JSON.stringify(baseTitle)} — an all-day block is not a countdown, ` +
      'and a whole-day "23h 41m left" holds the title hostage all day',
  )

  const windowed = blockCalls.some((url) => {
    const params = new URL(url).searchParams
    const from = Date.parse(params.get('from') ?? '')
    const to = Date.parse(params.get('to') ?? '')
    const now = Date.now()
    return Number.isFinite(from) && Number.isFinite(to) && from <= now && to > now
  })
  chk(
    windowed,
    'and it asked the server for a window that contains right now',
    `no /planner/${workspaceId}/blocks request spanned the present instant — ` +
      `saw ${JSON.stringify(blockCalls.slice(0, 3))}`,
  )

  console.log('\n▶ a block that is running now takes the tab over')
  // Long enough that a slow reload still lands inside it, short enough that
  // waiting for it to end is a wait and not a coffee break.
  const shortEnd = new Date(Date.now() + 45_000)
  await addBlock({
    taskId,
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    endsAt: shortEnd.toISOString(),
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const gotCountdown = await waitUntil(async () => (await page.title()).includes(taskTitle), {
    timeoutMs: 20_000,
  })
  const runningTitle = await page.title()
  chk(
    gotCountdown && runningTitle.includes(expectedLabel),
    `the tab names the block: ${JSON.stringify(runningTitle)}`,
    `the tab reads ${JSON.stringify(runningTitle)} — expected it to contain ${JSON.stringify(expectedLabel)}`,
  )
  chk(
    /\d+m \d+s/.test(runningTitle),
    "and carries the frame's own shape of a remainder (`2m 3s`)",
    `no "Xm Ys" remainder in ${JSON.stringify(runningTitle)}`,
  )

  /*
   * The two checks this row exists for. A title set once from whatever the
   * first render knew looks exactly like a live one in a screenshot, so it is
   * read twice, seconds apart.
   */
  const first = await page.title()
  const firstLeft = remainingSeconds(first)
  await sleep(2600)
  const second = await page.title()
  const secondLeft = remainingSeconds(second)
  chk(
    first !== second,
    `the countdown MOVES while you watch it (${JSON.stringify(first)} → ${JSON.stringify(second)})`,
    `the tab still reads ${JSON.stringify(second)} 2.6s later — a title set once is a screenshot, not a countdown`,
  )
  chk(
    firstLeft !== null && secondLeft !== null && secondLeft < firstLeft,
    `and it counts DOWN (${firstLeft}s → ${secondLeft}s left)`,
    `remaining went ${firstLeft} → ${secondLeft} — a countdown that does not decrease is a clock, ` +
      'and one of the two reads had no number in it at all',
  )

  console.log('\n▶ and it hands the tab back')
  const restored = await waitUntil(async () => (await page.title()) === baseTitle, { timeoutMs: 60_000 })
  const afterEnd = await page.title()
  chk(
    restored && afterEnd === baseTitle,
    'when the block ends the tab returns to the title index.html shipped',
    `the block ended at ${shortEnd.toISOString()} and the tab still reads ${JSON.stringify(afterEnd)} — ` +
      'a stale countdown is worse than no countdown, because it is read as live',
  )

  // Restored has to mean "handed back", not "the hook died": put a second
  // block on and require the countdown to come back before leaving.
  await addBlock({
    taskId,
    startsAt: new Date(Date.now() - 30_000).toISOString(),
    endsAt: new Date(Date.now() + 240_000).toISOString(),
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const secondRun = await waitUntil(async () => (await page.title()).includes(taskTitle), { timeoutMs: 20_000 })
  chk(
    secondRun,
    'a second block puts the countdown back, so "restored" was a hand-back and not a death',
    `after a fresh running block the tab reads ${JSON.stringify(await page.title())}`,
  )

  console.log('\n▶ leaving the app takes the countdown with it')
  /*
   * A CLIENT-SIDE navigation, not `page.goto`. A full load would fetch
   * index.html again and the title would be the static one no matter what this
   * hook does — the check would pass forever while the bug shipped.
   * `@tanstack/history` patches `window.history.pushState` and notifies the
   * router, so this is the same transition a link makes.
   */
  await page.evaluate(() => window.history.pushState({}, '', '/privacy'))
  const leftTheApp = await waitUntil(
    async () =>
      (await page.evaluate(() => window.location.pathname)) === '/privacy' &&
      (await page.getByRole('heading', { name: 'Privacy Policy' }).isVisible().catch(() => false)),
    { timeoutMs: 20_000 },
  )
  chk(
    leftTheApp,
    'the router really left /app for a page outside it',
    'the SPA navigation to /privacy never landed — the title check after this would prove nothing',
  )
  const awayTitle = await page.title()
  chk(
    awayTitle === baseTitle,
    `and the tab reads ${JSON.stringify(awayTitle)} again, not a countdown for a block on another page`,
    `on /privacy the tab still reads ${JSON.stringify(awayTitle)} — a countdown that outlives the app ` +
      'is a stale one on a page that knows nothing about it',
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  // Tidy up this run's own rows. `apiClient` never throws, so there is nothing
  // to catch — a failed cleanup shows up as a leftover, never as a pass.
  if (A && workspaceId) {
    for (const id of createdBlocks) await A(`/planner/${workspaceId}/blocks/${id}`, { method: 'DELETE' })
  }
  if (A && taskId) await A(`/tasks/${taskId}`, { method: 'DELETE' })
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — a run that skipped a branch is not a ` +
        'run that passed, however few failures it reports.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
