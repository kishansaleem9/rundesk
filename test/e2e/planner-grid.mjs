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

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 11

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const WEB = path.join(ROOT, 'apps/web')

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
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
    id: 'b1', taskId: SCHEDULED_TASK, label: 'Work on the scheduled one',
    startsAt: at(10), endsAt: at(11), isAllDay: false,
    taskStatus: 'todo', taskPriority: 'normal',
  },
  { id: 'b2', taskId: null, label: 'An all-day thing', startsAt: at(0), endsAt: at(23, 59), isAllDay: true },
]
const ASSIGNED = [
  { id: SCHEDULED_TASK, title: 'The scheduled one' },
  { id: BACKLOG_TASK, title: 'The unscheduled one' },
]

const envelope = (data) => JSON.stringify({ data, error: null })
const browser = await chromium.launch(LAUNCH)

try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' })
  await ctx.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    ['rundesk.auth', JSON.stringify(SESSION)],
  )
  await ctx.route('**/api/**', (route) => {
    const url = route.request().url()
    const reply = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: envelope(data) })
    if (url.includes('/users/me')) return reply(USER)
    if (url.includes('/planner/') && url.includes('/blocks')) return reply(BLOCKS)
    if (url.includes('/planner/') && url.includes('/settings')) return reply({})
    if (url.includes('/priorities')) return reply([])
    if (url.includes('/member/')) return reply(ASSIGNED)
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
    blockTexts.some((b) => b.includes('Work on the scheduled one')),
    'a timed block from the API is on the grid',
    `the grid showed ${JSON.stringify(blockTexts)} — seven empty columns look identical to a real week`,
  )
  chk(
    blockTexts.some((b) => b.includes('An all-day thing')),
    'and an all-day block is in the all-day row',
    `the all-day block did not render: ${JSON.stringify(blockTexts)}`,
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

  await ctx.close()
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close().catch(() => {})
  server.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran < EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
