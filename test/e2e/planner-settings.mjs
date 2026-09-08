/**
 * §V2-02 — the Planner's settings, frame `14:10`.
 *
 * `[14:08]`–`[14:26]`: "yahan se ACCOUNTS aap add kar sakte ho. Yeh SIDEBAR
 * option hai ke aap ko kya kya cheezein yahan par chahiye … TIME BLOCK aap
 * chaho to kar sakte ho."
 *
 * WHAT THIS WATCHES FOR. A settings page is the easiest thing in a product to
 * fake: a switch that flips, saves, reads back, and changes nothing. So every
 * check here is a BEFORE/AFTER on the calendar itself — turn the setting on,
 * reload, and look at the grid. None of them assert that the switch moved.
 *
 * FOUR PAGES, NOT SEVEN — and it was three until §V2-14.
 *
 * Upcoming meeting, AI Notetaker and Automations are still deliberately absent;
 * the dialog's header says why each would be a page that does nothing. ACCOUNTS
 * has moved from that list to this one: it was excluded because a page here
 * "would be a read-only copy" of the workspace integration, and that reasoning
 * was wrong — the workspace connection was one for everybody, unique on
 * (workspace, provider), and a second Google account overwrote the first.
 * §V2-14 gives a person their own accounts with a default and a busy set, none
 * of which has an entry point anywhere else.
 *
 * The count is still asserted, because the rule has not changed: a nav page
 * that toggles nothing is a facade. Only the number of real ones has.
 *
 *   node test/e2e/planner-settings.mjs --dist apps/web/dist
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 9

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

const now = new Date()
const at = (hour) => { const d = new Date(now); d.setHours(hour, 0, 0, 0); return d.toISOString() }
const BLOCKS = [{
  id: 'b1', taskId: 't1', label: 'A task', startsAt: at(10), endsAt: at(11),
  isAllDay: false, taskStatus: 'todo', taskPriority: 'urgent',
}]

/*
 * A MUTABLE stub. The whole point of these checks is that saving a setting
 * changes what the grid draws, so the stub has to actually apply the PATCH —
 * a stub that accepts a write and keeps answering with the old value is the
 * second failure mode `lib/wait.mjs` was written about.
 */
let settings = {}

const envelope = (data) => JSON.stringify({ data, error: null })
const browser = await chromium.launch(LAUNCH)

try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' })
  await ctx.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    ['rundesk.auth', JSON.stringify(SESSION)],
  )
  await ctx.route('**/api/**', async (route) => {
    const req = route.request()
    const url = req.url()
    const reply = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: envelope(data) })
    if (url.includes('/users/me')) return reply(USER)
    if (url.includes('/planner/') && url.includes('/settings')) {
      if (req.method() === 'PATCH') {
        settings = { ...settings, ...JSON.parse(req.postData() ?? '{}') }
        return reply(settings)
      }
      return reply(settings)
    }
    if (url.includes('/planner/') && url.includes('/blocks')) return reply(BLOCKS)
    if (url.includes('/lists/workspace/')) return reply([{ id: 'l1', name: 'Inbox list' }])
    if (url.includes('/priorities')) return reply([])
    if (url.includes('/member/')) return reply([])
    return reply([])
  })

  const page = await ctx.newPage()
  await page.goto(`${BASE}/app/${WS}/calendar`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="planner-page"]', { timeout: 20_000 })

  console.log('\n▶ the gear opens the settings `[frame 14:10]`')
  await page.locator('[data-testid="planner-settings"]').click()
  await page.waitForSelector('[data-testid="planner-settings-dialog"]', { timeout: 10_000 })
  const navs = await page.locator('[data-testid^="planner-settings-nav-"]').count()
  chk(
    navs === 4,
    'the nav offers exactly the four pages that do something',
    `the nav had ${navs} pages — the frame shows seven, and three of them would toggle nothing here`,
  )

  console.log('\n▶ Appearance changes the grid, not just the switch')
  const weekendsBefore = await page.locator('[data-testid="planner-day-column"]').count()
  await page.locator('[data-testid="planner-show-weekends"]').click()
  const shrank = await waitUntil(
    async () => (await page.locator('[data-testid="planner-day-column"]').count()) === weekendsBefore - 2,
    { timeoutMs: 8000 },
  )
  chk(
    shrank,
    'turning weekends off removes two columns from the week',
    `the grid still has ${await page.locator('[data-testid="planner-day-column"]').count()} columns of ${weekendsBefore}`,
  )
  await page.locator('[data-testid="planner-show-weekends"]').click()
  await waitUntil(async () => (await page.locator('[data-testid="planner-day-column"]').count()) === weekendsBefore)

  /*
   * Colour-by. The block points at an URGENT task, so switching from "nothing"
   * to "priority" has to change the class the block is drawn with.
   */
  const toneBefore = await page.locator('[data-testid="planner-block"]').first().getAttribute('class')
  await page.locator('[data-testid="planner-color-by"]').selectOption('priority')
  const recoloured = await waitUntil(async () => {
    const c = await page.locator('[data-testid="planner-block"]').first().getAttribute('class')
    return c !== toneBefore
  }, { timeoutMs: 8000 })
  chk(
    recoloured,
    'colouring tasks by priority actually recolours an urgent block',
    'the block kept its class — the setting saved and the grid ignored it',
  )
  const urgentTone = await page.locator('[data-testid="planner-block"]').first().getAttribute('class')
  chk(
    /rose/.test(urgentTone ?? ''),
    'and an urgent task is drawn in the urgent colour',
    `the block was drawn as ${JSON.stringify(urgentTone)}`,
  )

  await page.locator('[data-testid="planner-style-solid"]').click()
  const wentSolid = await waitUntil(async () => {
    const c = await page.locator('[data-testid="planner-block"]').first().getAttribute('class')
    return (c ?? '').includes('bg-rose-500')
  }, { timeoutMs: 8000 })
  chk(wentSolid, 'and the Solid event style fills the block instead of tinting it',
    'switching to Solid changed nothing on the grid')

  console.log('\n▶ Sidebar decides what the rail shows')
  await page.locator('[data-testid="planner-settings-nav-sidebar"]').click()
  await page.waitForSelector('[data-testid="planner-settings-sidebar"]', { timeout: 10_000 })
  chk(
    (await page.locator('[data-testid="planner-priorities"]').count()) === 1,
    'Priorities is on the rail to begin with',
    'the control section was not there before it was turned off, so turning it off proves nothing',
  )
  await page.locator('[data-testid="planner-rail-priorities"]').click()
  const railShrank = await waitUntil(
    async () => (await page.locator('[data-testid="planner-priorities"]').count()) === 0,
    { timeoutMs: 8000 },
  )
  chk(railShrank, 'turning it off takes it off the rail',
    'the section was still on the rail after being switched off')

  console.log('\n▶ Time blocking holds the answer video 1 left open')
  await page.locator('[data-testid="planner-settings-nav-timeBlocking"]').click()
  await page.waitForSelector('[data-testid="planner-settings-time-blocking"]', { timeout: 10_000 })
  /*
   * Polled, not sampled. The lists query only fires when this page opens, so
   * reading the options the instant after the click reads them before the
   * request has landed — which is the same mistake this suite's siblings keep
   * being fixed for.
   */
  const gotLists = await waitUntil(async () => {
    const opts = await page.locator('[data-testid="planner-default-list"] option').allInnerTexts()
    return opts.some((o) => o.includes('Inbox list'))
  }, { timeoutMs: 8000 })
  const options = await page.locator('[data-testid="planner-default-list"] option').allInnerTexts()
  chk(
    gotLists,
    "the default-list picker offers the workspace's lists",
    `it offered ${JSON.stringify(options)} — a picker that can only say "personal" is a picker with one answer`,
  )
  await page.locator('[data-testid="planner-block-prefix"]').fill('Focus on')
  await page.locator('[data-testid="planner-block-prefix"]').blur()
  const reprefixed = await waitUntil(async () => {
    const texts = await page.locator('[data-testid="planner-block"]').allInnerTexts()
    return texts.some((x) => x.startsWith('Focus on '))
  }, { timeoutMs: 8000 })
  chk(
    reprefixed,
    'and changing the prefix re-titles the blocks already on the grid',
    'the blocks kept saying "Work on" — the prefix would be frozen at the moment of each drag',
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
