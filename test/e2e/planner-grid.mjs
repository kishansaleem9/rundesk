/**
 * §V2-02 — the Planner surface, frame `13:08`.
 *
 * `[12:34]` "Ab yahan se main jaa rahi hoon PLANNER wale option par." The
 * route is `/calendar` while the rail is headed "Planner" — the video's
 * address bar and its tab title disagree on purpose, and the audit's summary
 * said `/planner`, which is the wrong address.
 *
 * WHAT THIS WATCHES FOR. A week grid is easy to draw and easy to draw wrongly:
 * seven columns of nothing photograph exactly like seven columns of somebody's
 * week. So the checks are that the grid is showing REAL BLOCKS from the API,
 * that today is marked, that the red now-line is on today's column and nowhere
 * else, and that the backlog holds the tasks that are NOT on the grid — which
 * is what makes the drag in `[14:52]` have somewhere to start.
 *
 *   node test/e2e/planner-grid.mjs --dist apps/web/dist
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 23

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const WEB = path.join(ROOT, 'apps/web')

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
}

const chromium = await resolveChromium()
const LAUNCH = launchOptions()

let DIST = argOf('--dist')
if (!DIST) {
  console.log('building apps/web…')
  execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd: WEB, stdio: 'pipe' })
  DIST = path.join(WEB, 'dist')
}
if (!path.isAbsolute(DIST)) DIST = path.join(ROOT, DIST)

const TYPES = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.join(DIST, rel)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}`

const WS = '5a842aa9-cede-423a-ae26-bb4ba074849f'
const USER = { id: 'u1', email: 'admin@rundesk.test', displayName: 'Admin', role: 'owner', avatarUrl: null }
const SESSION = {
  state: {
    user: USER,
    organizations: [{ id: 'o1', name: 'Aura', slug: 'aura', role: 'owner' }],
    workspaces: [{ id: WS, name: 'Rundesk', slug: 'rundesk', organizationId: 'o1', role: 'owner' }],
  },
  version: 0,
}

/*
 * Blocks are built around the RUNNING clock rather than a fixed date, because
 * the page renders the week containing "now" and a hard-coded August 2026
 * would only be on screen during that week.
 */
const now = new Date()
const at = (hour, minute = 0) => {
  const d = new Date(now)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}
const SCHEDULED_TASK = 'task-scheduled'
const BACKLOG_TASK = 'task-backlog'

const BLOCKS = [
  {
    /*
     * The label the API returns is the TASK'S TITLE, with no prefix — the
     * prefix is applied at render. The first version of this fixture said
     * "Work on the scheduled one" here, which made the prefix check vacuous:
     * deleting the prefix from the component still passed, because the
     * fixture had already written it.
     */
    id: 'b1', taskId: SCHEDULED_TASK, label: 'The scheduled one',
    startsAt: at(10), endsAt: at(11), isAllDay: false,
    taskStatus: 'todo', taskPriority: 'normal',
  },
  { id: 'b2', taskId: null, label: 'An all-day thing', startsAt: at(0), endsAt: at(23, 59), isAllDay: true },
]
const ASSIGNED = [
  { id: SCHEDULED_TASK, title: 'The scheduled one' },
  { id: BACKLOG_TASK, title: 'The unscheduled one' },
]

/* §V2-02 `[14:41]` — the roster the Meet-with search filters, and one
 * person's real busy time for the week on screen. */
const MEMBERS = [
  { userId: 'u-sara', displayName: 'Sara Ahmed', email: 'sara@rundesk.test' },
  { userId: 'u-omar', displayName: 'Omar Iqbal', email: 'omar@rundesk.test' },
]
const THEIR_CALENDAR = {
  tasks: [],
  meetings: [{ id: 'm1', title: 'Standup', startsAt: at(14), endsAt: at(15) }],
}

const envelope = (data) => JSON.stringify({ data, error: null })
const browser = await chromium.launch(LAUNCH)
/** Every request the page made, so the drag is asserted on what it sent. */
const calls = []

try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' })
  await ctx.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    ['rundesk.auth', JSON.stringify(SESSION)],
  )
  await ctx.route('**/api/**', (route) => {
    const req = route.request()
    const url = req.url()
    calls.push({ method: req.method(), url, body: req.postData() ?? '' })
    const reply = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: envelope(data) })
    if (req.method() === 'POST' && url.includes('/blocks')) return reply({ id: 'new-block' })
    if (url.includes('/users/me')) return reply(USER)
    if (url.includes('/planner/') && url.includes('/blocks')) return reply(BLOCKS)
    if (url.includes('/planner/') && url.includes('/settings')) return reply({})
    if (url.includes('/priorities')) return reply([])
    if (url.includes('/calendar')) return reply(THEIR_CALENDAR)
    /*
     * `/tasks/workspace/:ws/members/:userId` — PLURAL, and matched in full.
     *
     * This stub used to match `/member/`, singular: a path the client asked for
     * and the API answered 404 to, so every check below passed against a route
     * that did not exist. Matching the whole shape rather than the word matters
     * as much as the spelling — a bare `/members/` test is caught by the
     * workspace-members branch on the next line, which hands the Backlog a list
     * of PEOPLE and leaves it rendering rows with no title and no task id.
     */
    if (/\/tasks\/workspace\/[^/]+\/members\//.test(url)) return reply(ASSIGNED)
    if (url.includes('/members')) return reply(MEMBERS)
    return reply([])
  })

  const page = await ctx.newPage()
  await page.goto(`${BASE}/app/${WS}/calendar`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="planner-page"]', { timeout: 20_000 })

  console.log('\n▶ the Planner lives at /calendar `[frame 13:08]`')
  chk(page.url().endsWith('/calendar'), 'the address is /calendar, not /planner',
    `the page settled at ${page.url()}`)
  for (const [testId, label] of [
    ['planner-priorities', 'Priorities'],
    ['planner-meet-with', 'Meet with'],
    ['planner-backlog', 'Backlog'],
    ['planner-allday-row', 'an All day row'],
  ]) {
    chk(
      (await page.locator(`[data-testid="${testId}"]`).count()) === 1,
      `the rail has ${label}`,
      `${label} is missing from the surface the frame shows`,
    )
  }

  console.log('\n▶ and it is drawing what the API returned, not a picture of a week')
  const blockTexts = await page.locator('[data-testid="planner-block"]').allInnerTexts()
  chk(
    blockTexts.some((b) => b.includes('The scheduled one')),
    'a timed block from the API is on the grid',
    `the grid showed ${JSON.stringify(blockTexts)} — seven empty columns look identical to a real week`,
  )
  chk(
    blockTexts.some((b) => b.includes('An all-day thing')),
    'and an all-day block is in the all-day row',
    `the all-day block did not render: ${JSON.stringify(blockTexts)}`,
  )

  console.log('\n▶ the grid covers the whole day, not just office hours')
  /*
   * THE CHECK THIS BLOCK EXISTS FOR, and it was written after CI found the bug
   * rather than before. The grid used to run 6am–11pm, so `nowOffset` was null
   * between midnight and six and NO now-line was drawn — the assertion below
   * passed every daytime run and failed the first run that crossed midnight.
   *
   * Counting the hour labels pins the cause directly, so a future change back
   * to a "working day" grid fails here with a reason, at any hour, instead of
   * failing the now-line check six hours a night.
   */
  const hourLabels = await page.locator('[data-testid="planner-hour-label"]').count()
  chk(
    hourLabels === 24,
    'every hour of the day has a row',
    `the gutter drew ${hourLabels} hours — a grid that stops at 6am has nowhere to put ` +
      'work done before it, and draws no now-line at all between midnight and then',
  )

  console.log('\n▶ today is marked, and the now-line is on today only')
  const todays = await page.locator('[data-testid="planner-day-header"][data-today="true"]').count()
  chk(todays === 1, 'exactly one day is marked as today',
    `${todays} columns claimed to be today`)
  const nowLines = await page.locator('[data-testid="planner-now-line"]').count()
  chk(
    nowLines === 1,
    'and the red now-line is drawn once',
    `${nowLines} now-lines were drawn — one per column would make every day look like now`,
  )

  console.log('\n▶ the Backlog is what is NOT on the grid `[14:52]`')
  const backlog = await page.locator('[data-testid="planner-backlog-item"]').allInnerTexts()
  chk(
    backlog.some((b) => b.includes('The unscheduled one')),
    'an unscheduled assigned task waits in the Backlog',
    `the backlog held ${JSON.stringify(backlog)}`,
  )
  chk(
    !backlog.some((b) => b.includes('The scheduled one')),
    'and a task already on the grid is not offered again',
    `the backlog still listed a task that has a block: ${JSON.stringify(backlog)} — dragging it would double-book it`,
  )

  console.log('\n▶ the block is titled with the prefix `[frame 14:45]`')
  chk(
    blockTexts.some((b) => b === 'Work on The scheduled one'),
    'a task-backed block reads "Work on <task>"',
    `the blocks read ${JSON.stringify(blockTexts)} — the frame's block is titled "Work on dbgdh"`,
  )
  chk(
    blockTexts.some((b) => b === 'An all-day thing'),
    'while a block that is not about a task keeps its own words',
    `a typed block was prefixed too: ${JSON.stringify(blockTexts)}`,
  )

  console.log('\n▶ dragging a backlog task onto the grid makes a block `[14:52]`')
  const item = page.locator('[data-testid="planner-backlog-item"]').first()
  const column = page.locator('[data-testid="planner-day-column"]').first()

  /*
   * SCROLL THE GRID HOME FIRST, and this is not tidying.
   *
   * The grid runs a full 24 hours and jumps to the current hour on arrival, so
   * a column is taller than the viewport and its top is usually ABOVE it: at
   * 12:43 the box measured `y: -152`, which put the drop point below at
   * `y: -25` — off the page. `mouse.up()` then landed on nothing and no block
   * was posted, so three checks failed for a reason that had nothing to do
   * with dragging.
   *
   * It failed by the CLOCK, not by the code — before about 1am the grid has not
   * scrolled and the same test passes. That is the exact fault the 24-hour grid
   * was built to fix, reappearing in the test that guards it, so the fix is the
   * same in spirit: do not assume the hours on screen are the hours you want.
   */
  await page.evaluate(() => {
    let el = document.querySelector('[data-testid="planner-day-column"]')?.parentElement
    while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement
    if (el) el.scrollTop = 0
  })
  await page.waitForTimeout(150)

  /*
   * `boundingBox()` THROWS when the locator matches nothing — it waits for the
   * element first — and returns null only for one that exists with no box.
   *
   * THIS SITE IS NOT LIKE THE OTHERS, and the note I first stamped on it said
   * it was: the drag DEREFERENCES both boxes to pick its coordinates, so null
   * would be a TypeError six seconds in rather than a reported failure. The
   * drag is skipped when either box is missing, and the three checks below then
   * report what a drag that never happened leaves behind — no ghost, no POST,
   * no block — which is the honest account of a grid with nothing to drag.
   */
  const from = await item.boundingBox({ timeout: 6000 }).catch(() => null)
  const to = await column.boundingBox({ timeout: 6000 }).catch(() => null)
  const draggable = !!from && !!to
  if (draggable) {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
  }
  /*
   * 127px, not 120. At HOUR_PX 48 a drop 120px down is exactly two and a half
   * hours in, which is already on a quarter — so the rounding check passed
   * with the rounding deleted. 127px lands at :38 unrounded and :45 rounded,
   * which is a question the two answer differently.
   */
  if (draggable) await page.mouse.move(to.x + to.width / 2, to.y + 127, { steps: 8 })
  chk(
    (await page.locator('[data-testid="planner-drag-ghost"]').count()) === 1,
    'the drag shows what is being dragged',
    'nothing followed the pointer — a drag with no feedback is one people do not believe is happening',
  )
  if (draggable) await page.mouse.up()
  await page.waitForTimeout(900)

  const post = calls.filter((c) => c.method === 'POST' && c.url.includes('/blocks')).at(-1)
  let sent = null
  try { sent = JSON.parse(post?.body ?? '{}') } catch { /* reported below */ }
  chk(
    !!post && sent?.taskId === BACKLOG_TASK,
    'dropping it posts a block for that task',
    `the page sent ${JSON.stringify(sent)} — the grid would be a picture you can drag onto`,
  )
  chk(
    typeof sent?.startsAt === 'string' && !Number.isNaN(Date.parse(sent.startsAt)),
    'with a start time worked out from where it landed',
    `startsAt was ${JSON.stringify(sent?.startsAt)}`,
  )
  /*
   * Quarter-hour rounding. A calendar that starts a block at 10:07 is
   * recording where a pointer happened to be, not what anybody meant.
   */
  chk(
    sent?.startsAt ? new Date(sent.startsAt).getMinutes() % 15 === 0 : false,
    'rounded to the quarter hour, not to pointer precision',
    `it started at ${sent?.startsAt} — that is where the mouse was, not what was meant`,
  )

  console.log('\n▶ Meet with searches real people `[14:41]`')
  chk(
    (await page.locator('[data-testid="planner-busy-block"]').count()) === 0,
    'nobody else\'s time is on the grid to begin with',
    'busy blocks were drawn before anyone was picked, so the next checks prove nothing',
  )
  await page.locator('[data-testid="planner-meet-with"]').fill('sar')
  const matched = await waitUntil(async () => {
    const names = await page.locator('[data-testid="planner-meet-result"]').allInnerTexts()
    return names.some((n) => n.includes('Sara Ahmed')) && !names.some((n) => n.includes('Omar'))
  }, { timeoutMs: 8000 })
  chk(
    matched,
    'typing a name narrows the workspace to the people who match it',
    `the search offered ${JSON.stringify(await page.locator('[data-testid="planner-meet-result"]').allInnerTexts())} — this input used to read nothing you typed`,
  )

  await page.locator('[data-testid="planner-meet-result"]').first().click()
  const busyShown = await waitUntil(
    async () => (await page.locator('[data-testid="planner-busy-block"]').count()) > 0,
    { timeoutMs: 8000 },
  )
  chk(
    busyShown,
    'and picking them puts their busy time on the week you are looking at',
    'no busy block appeared — searching a person that changes nothing is the facade this replaced',
  )
  chk(
    (await readText(page.locator('[data-testid="planner-meet-selected"]'))).includes('Sara Ahmed'),
    'with a chip saying whose calendar you are seeing',
    'the hatched blocks had no explanation on screen',
  )
  await page.locator('[data-testid="planner-meet-clear"]').click()
  const cleared = await waitUntil(
    async () => (await page.locator('[data-testid="planner-busy-block"]').count()) === 0,
    { timeoutMs: 8000 },
  )
  chk(cleared, 'and clearing them takes it away again',
    'their time stayed on the grid after they were cleared')

  await ctx.close()
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close().catch(() => {})
  server.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
