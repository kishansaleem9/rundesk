/**
 * §V2-06 — **THE LIVE FOCUS COUNTDOWN, IN THE APP HEADER.**
 *
 * THE ROW WAS MARKED BUILT AND THE PILL DID NOT EXIST. `use-focus-tab-title.ts`
 * computed the countdown and its only consumer anywhere was `routes/app.tsx`,
 * which writes `document.title`; the `Moon` glyph in `app-topbar.tsx` was the
 * theme toggle. So the ledger said "in the header" and the header had nothing
 * in it — the evidence for the feature was a hook that no header ever read.
 *
 * WHAT THE FRAMES DRAW, re-extracted rather than remembered:
 *
 *   `15:20` `15:35` `15:50`  a pill immediately right of the workspace
 *                            switcher: a moon glyph, "Work on dbgdh", then
 *                            "2h 56m left" in a lighter weight
 *   `16:00` `16:10` `16:20`  the same pill reading "2h 55m left" — one block,
 *                            ten minutes later, counting down
 *   `16:05`                  the page behind it is the LIST view, not the
 *                            planner: the pill belongs to the app shell
 *   `16:10`                  a hover fill and a pointer cursor, so it is a
 *                            control and not a caption
 *   `19:05`                  still there, "2h 52m left", on the AI Analytics
 *                            page fourteen minutes later
 *
 * `docs/video2-frame-observations.md:383-384` puts this countdown in the
 * BROWSER TAB and quotes "2m 3s left". Neither is in any frame of the 23:53 —
 * the tab at `15:20` reads "vjgkgkg | #86eyjd2jb". This suite is written to the
 * frames.
 *
 * THE TWO WAYS A COUNTDOWN LIES, both asserted, because either alone passes a
 * naive check:
 *
 *   SET ONCE — a pill painted from the first value it saw is a screenshot that
 *   reads as live. Checks 7 and 8 read the pill's text twice, seconds apart,
 *   and require it to have MOVED and to have moved DOWNWARD.
 *
 *   NEVER CLEARED — a pill written and never removed outlives its block.
 *   Check 14 lets a short block END with the page still open (no reload, so
 *   nothing is re-mounted into a clean state) and requires the pill to go.
 *   Check 15 puts a fresh block on afterwards so that "gone" cannot be
 *   satisfied by a component that simply died.
 *
 * AND THE ONE THIS ROW COULD MOST EASILY GET WRONG: a SECOND countdown. The
 * tab title and the pill are two surfaces for one fact, and given a fetch each
 * they drift. Check 9 counts the requests for the running blocks after a fresh
 * load and requires exactly ONE; check 10 requires the two surfaces to agree on
 * the number.
 *
 * NARROWED TO ITS OWN FIXTURES. The planner is per-person and this account is
 * shared by every suite here: every block is created by this run, addressed by
 * its own id, and deleted at the end. Nothing counts rows and no assertion is
 * about "the planner".
 *
 * THE FIXTURE'S `apiClient` NEVER THROWS — it returns `{status, data, error}`,
 * so a `.catch(() => {})` on it is inert. Every call that matters has its
 * `status` checked before its `data` is believed.
 *
 *   node test/e2e/focus-pill.mjs --api 3011 --dist apps/web/dist
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
 * never got made, a `waitUntil` that timed out and returned early — becomes a
 * shorter run that still reports "0 failed".
 */
const EXPECTED_CHECKS = 15

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

/** "2m 3s" / "2h 55m" → seconds, or null when there is no remainder in the text. */
const remainingSeconds = (text) => {
  const hm = /(\d+)h (\d+)m/.exec(text ?? '')
  if (hm) return Number(hm[1]) * 3600 + Number(hm[2]) * 60
  const ms = /(\d+)m (\d+)s/.exec(text ?? '')
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

  // ── a task of this run's own, and the list page it lives on ──────────────
  const stamp = Date.now()
  const taskTitle = `Focus pill ${stamp}`
  let spaceId = null
  let projectId = null
  let listId = null
  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  for (const space of spaces) {
    for (const project of (await A(`/projects/space/${space.id}`)).data ?? []) {
      const lists = (await A(`/lists/project/${project.id}`)).data ?? []
      if (lists[0]?.id) {
        spaceId = space.id
        projectId = project.id
        listId = lists[0].id
        break
      }
    }
    if (listId) break
  }
  // Thrown, not skipped: frame `16:05` is the List page, so a run that cannot
  // reach one has not tested the thing this row is about.
  if (!listId) throw new Error('no list to hang a task off, so frame 16:05 cannot be reproduced')

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
  const dropBlock = async (id) => {
    const res = await A(`/planner/${workspaceId}/blocks/${id}`, { method: 'DELETE' })
    if (res.status >= 300) throw new Error(`could not delete block ${id}: ${res.status}`)
    const at = createdBlocks.indexOf(id)
    if (at !== -1) createdBlocks.splice(at, 1)
  }

  // The prefix is this person's own setting. Read rather than assumed: another
  // suite may have changed it, and hardcoding "Work on" would fail this suite
  // for a reason that has nothing to do with the pill.
  const settings = await A(`/planner/${workspaceId}/settings`)
  if (settings.status >= 300) throw new Error(`planner settings unreadable: ${settings.status}`)
  const prefix = (settings.data?.blockPrefix ?? '').trim() || 'Work on'
  const expectedLabel = `${prefix} ${taskTitle}`

  /*
   * The planner is per-person and this account is shared. A block another run
   * left running would be drawing a pill in the exact place this suite is about
   * to claim there is none. That is not a product failure and must not be
   * reported as one: name it and stop.
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
        .join(', ')}) — this suite cannot tell its own pill from that one. Delete it and re-run.`,
    )
  }

  // ── the browser ──────────────────────────────────────────────────────────
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()

  let blockCalls = []
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes(`/planner/${workspaceId}/blocks?`)) blockCalls.push(url)
  })

  const pill = () => page.getByTestId('focus-block-pill')
  const pillRemaining = () =>
    page.getByTestId('focus-block-pill-remaining').textContent().catch(() => null)

  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${workspaceId}/calendar`, { waitUntil: 'domcontentloaded' })
  /*
   * Tolerated rather than thrown on: if the header never renders, check 1 below
   * — which waits for the app to ASK the server for the running blocks — is the
   * one that should say so, and it says it in a sentence. Throwing here would
   * end the run before any check reported anything.
   */
  await page
    .getByTestId('topbar-breadcrumbs')
    .waitFor({ state: 'visible', timeout: 25_000 })
    .catch(() => {})

  console.log('\n▶ with nothing running, the header carries no pill')
  /*
   * PROVE THE REQUEST, not just the render. "No pill" is also what a page that
   * never asked the server looks like, and that is the version of this check
   * that can never fail.
   */
  const askedForNow = await waitUntil(
    async () =>
      blockCalls.some((url) => {
        const params = new URL(url).searchParams
        const from = Date.parse(params.get('from') ?? '')
        const to = Date.parse(params.get('to') ?? '')
        const now = Date.now()
        return Number.isFinite(from) && Number.isFinite(to) && from <= now && to > now
      }),
    { timeoutMs: 25_000 },
  )
  chk(
    askedForNow,
    'the shell asked the server for a window that contains right now',
    `no /planner/${workspaceId}/blocks request spanned the present instant — ` +
      `saw ${JSON.stringify(blockCalls.slice(0, 3))}. "No pill" would prove nothing here`,
  )
  chk(
    (await pill().count()) === 0,
    'and draws no pill — the frames show none before a block is dropped on the grid',
    `${await pill().count()} focus pill(s) on a header with nothing running — ` +
      'a control that is present but empty is the hardest kind of stale to notice',
  )

  console.log('\n▶ frames `15:20`–`16:20` — a running block draws it in the header')
  /*
   * Ten minutes, so the remainder is in the "Xm Ys" shape that changes every
   * second (`formatRemaining` only shows seconds inside the last hour). An
   * "Xh Ym" remainder would change once a minute and checks 7 and 8 would be a
   * sixty-second wait rather than a test.
   */
  const long = await addBlock({
    taskId,
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    endsAt: new Date(Date.now() + 600_000).toISOString(),
  })
  // A FULL RELOAD, so the query cache is empty by construction rather than by
  // waiting out `staleTime: 30_000`. Timing is not a way to force a cache miss.
  blockCalls = []
  await page.reload({ waitUntil: 'domcontentloaded' })
  const appeared = await waitUntil(async () => (await pill().count()) === 1, { timeoutMs: 25_000 })
  /*
   * Captured HERE, the moment the pill exists, and asserted further down.
   * Reading `blockCalls.length` at the point of the assertion would put the
   * 2.6-second wait and everything after it inside the window, and a slow
   * machine would eventually cross the 30-second `refetchInterval` and fail
   * for a reason that is not the bug.
   */
  const fetchesForFirstPaint = blockCalls.length
  const labelText = appeared
    ? await page.getByTestId('focus-block-pill-label').textContent().catch(() => null)
    : null
  chk(
    appeared && (labelText ?? '').trim() === expectedLabel,
    `the pill names the block: ${JSON.stringify(labelText)}`,
    `the header pill read ${JSON.stringify(labelText)} — expected ${JSON.stringify(expectedLabel)}`,
  )

  const firstText = await pillRemaining()
  chk(
    /\d+m \d+s/.test(firstText ?? '') && /left|quedan|باقی|يتبقى/.test(firstText ?? ''),
    `and carries the frame's own remainder beside it: ${JSON.stringify(firstText)}`,
    `the remainder read ${JSON.stringify(firstText)} — the frames draw "2h 56m left" next to the name`,
  )

  /*
   * WHERE it is, measured. Frame `15:20` puts the pill inside the app header,
   * immediately right of the workspace switcher — not with the tools on the
   * right, and not somewhere on the page below. `topbar-breadcrumbs` is
   * Rundesk's workspace identity in that row.
   */
  const geometry = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="focus-block-pill"]')
    const crumbs = document.querySelector('[data-testid="topbar-breadcrumbs"]')
    const header = el?.closest('header')
    if (!el || !crumbs || !header) return null
    const p = el.getBoundingClientRect()
    const c = crumbs.getBoundingClientRect()
    const h = header.getBoundingClientRect()
    return { p: { left: p.left, right: p.right, top: p.top, bottom: p.bottom },
             c: { right: c.right },
             h: { left: h.left, right: h.right, top: h.top, bottom: h.bottom } }
  })
  chk(
    !!geometry &&
      geometry.p.top >= geometry.h.top - 1 &&
      geometry.p.bottom <= geometry.h.bottom + 1 &&
      geometry.p.left >= geometry.c.right - 1 &&
      geometry.p.right <= geometry.h.left + (geometry.h.right - geometry.h.left) * 0.6,
    'it sits in the app header, right of the workspace identity and in its left half',
    `geometry was ${JSON.stringify(geometry)} — frame 15:20 puts it immediately right of the ` +
      'workspace switcher, not among the tools on the right',
  )

  chk(
    (await pill().count()) === 1,
    'and there is exactly one of it',
    `${await pill().count()} focus pills on screen — two pills is two countdowns`,
  )

  console.log('\n▶ `15:50` → `16:00` — it is live')
  await sleep(2600)
  const secondText = await pillRemaining()
  chk(
    !!firstText && !!secondText && firstText !== secondText,
    `the pill MOVES while you watch it (${JSON.stringify(firstText)} → ${JSON.stringify(secondText)})`,
    `the pill still reads ${JSON.stringify(secondText)} 2.6s later — painted once, it is a ` +
      'screenshot that reads as live',
  )
  const firstLeft = remainingSeconds(firstText)
  const secondLeft = remainingSeconds(secondText)
  chk(
    firstLeft !== null && secondLeft !== null && secondLeft < firstLeft,
    `and counts DOWN (${firstLeft}s → ${secondLeft}s left)`,
    `remaining went ${firstLeft} → ${secondLeft} — a countdown that does not decrease is a clock, ` +
      'and one of the two reads carried no number at all',
  )

  console.log('\n▶ one countdown, not two')
  /*
   * The pill and the tab title are two surfaces for the same fact. Given a
   * fetch each they are two countdowns, and two countdowns drift. Counted from
   * the reload above, before any wait long enough for the 30s refetch to fire.
   */
  chk(
    fetchesForFirstPaint === 1,
    `the running blocks were fetched once for both surfaces (${fetchesForFirstPaint} request)`,
    `${fetchesForFirstPaint} requests for /planner/${workspaceId}/blocks between the reload and the ` +
      'pill appearing — a second fetch is a second countdown waiting to disagree with the first',
  )
  const titleLeft = remainingSeconds(await page.title())
  const pillLeft = remainingSeconds(await pillRemaining())
  chk(
    titleLeft !== null && pillLeft !== null && Math.abs(titleLeft - pillLeft) <= 1,
    `and the tab and the pill agree (${titleLeft}s vs ${pillLeft}s)`,
    `the tab says ${titleLeft}s left and the pill says ${pillLeft}s — one fact, two answers`,
  )

  console.log('\n▶ frame `16:05` — it follows you off the planner')
  /*
   * A CLIENT-SIDE navigation. `page.goto` would remount the whole app and the
   * pill would be rebuilt from scratch, which proves nothing about whether it
   * belongs to the shell or to the planner page. `@tanstack/history` patches
   * `pushState`, so this is the transition a link makes.
   */
  const listPath = `/app/${workspaceId}/${spaceId}/${projectId}/${listId}`
  await page.evaluate((to) => window.history.pushState({}, '', to), listPath)
  const landed = await waitUntil(
    async () => (await page.evaluate(() => window.location.pathname)) === listPath,
    { timeoutMs: 20_000 },
  )
  chk(
    landed,
    'the router really left the planner for the List page',
    `the SPA navigation to ${listPath} never landed — the pill check after this would prove nothing`,
  )
  chk(
    (await pill().count()) === 1 && (await pill().isVisible().catch(() => false)),
    'and the pill is still there — it belongs to the app, not to the planner',
    'the pill vanished when the planner did, so it is a planner control wearing a header',
  )

  console.log('\n▶ frame `16:10` — a control, not a caption')
  await pill().click()
  const openedPlanner = await waitUntil(
    async () => (await page.evaluate(() => window.location.pathname)) === `/app/${workspaceId}/calendar`,
    { timeoutMs: 20_000 },
  )
  chk(
    openedPlanner,
    'clicking it opens the planner — the frame draws a hover fill and a pointer on it',
    `the click left the page on ${await page.evaluate(() => window.location.pathname)}`,
  )

  console.log('\n▶ and it goes away when the block does')
  await dropBlock(long.id)
  const short = await addBlock({
    taskId,
    startsAt: new Date(Date.now() - 30_000).toISOString(),
    endsAt: new Date(Date.now() + 45_000).toISOString(),
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const showedShort = await waitUntil(async () => (await pill().count()) === 1, { timeoutMs: 25_000 })
  if (!showedShort) throw new Error('the short block never drew a pill, so its ending proves nothing')
  /*
   * NO RELOAD between here and the assertion. A reload would re-mount into a
   * clean state and "gone" would be free; the bug this catches is a pill that
   * was painted once and never cleared, and that pill survives its block
   * exactly as long as nothing re-mounts.
   */
  const cleared = await waitUntil(async () => (await pill().count()) === 0, { timeoutMs: 60_000 })
  chk(
    cleared,
    'when the block ends the pill disappears, with no reload to hide behind',
    `the block ended and ${await pill().count()} pill(s) are still in the header — ` +
      'a countdown that outlives its block is read as live',
  )
  await dropBlock(short.id)

  const again = await addBlock({
    taskId,
    startsAt: new Date(Date.now() - 30_000).toISOString(),
    endsAt: new Date(Date.now() + 300_000).toISOString(),
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const cameBack = await waitUntil(async () => (await pill().count()) === 1, { timeoutMs: 25_000 })
  chk(
    cameBack,
    'and a fresh block brings it back, so "gone" was a clear and not a death',
    'after a new running block the header is still empty — the pill stopped working rather than clearing',
  )
  await dropBlock(again.id)
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  // This run's own rows. `apiClient` never throws, so there is nothing to
  // catch — a failed cleanup shows up as a leftover, never as a pass.
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
