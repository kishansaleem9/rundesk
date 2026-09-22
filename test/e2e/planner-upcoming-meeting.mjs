/**
 * §V2-02e — **Upcoming meeting**, the settings page whose recorded reason for
 * not existing had gone stale.
 *
 * Frame `14:10`'s nav has seven entries and the dialog had four. Three were
 * recorded as deliberate omissions, which is the right way to record an
 * absence — but a recorded reason has to be re-checked before it is trusted,
 * because a reason that stopped being true suppresses exactly the
 * investigation that would find the bug. This one said:
 *
 *   "Upcoming meeting is mostly a desktop menubar and a quick-join window.
 *    Rundesk has no desktop app; two of its three switches would toggle
 *    nothing."
 *
 * The first half was never true. The countdown badge and the Join pill are on
 * the Meetings page — `workspace-meetings-page.tsx`, since §2.8, `[19:16]`
 * "yeh MEETINGS wali cheez hai" — and until this item there was nothing
 * anywhere in the product that could turn either of them off. The third
 * switch, "Show in desktop", is a desktop NOTIFICATION, which a browser raises
 * without anybody shipping a desktop app.
 *
 * SO THIS SUITE IS ABOUT THE MEETINGS PAGE, not about the dialog. The control
 * is in the planner's settings and every reader is somewhere else entirely,
 * which is the only arrangement in which "the switch moved" and "the product
 * changed" are different sentences. Each check flips a switch on the calendar
 * and then measures the Meetings page.
 *
 *   node test/e2e/planner-upcoming-meeting.mjs --dist apps/web/dist
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

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure. */
const EXPECTED_CHECKS = 8

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

/* This run's own rows. The e2e database is shared and so is this dist. */
const TAG = `upm-${Date.now().toString(36)}`

/*
 * TWO MEETINGS, AND THE DIFFERENCE BETWEEN THEM IS THE POINT.
 *
 * `SOON` is inside `isJoinable`'s ten-minute window; `LATER` is three hours
 * out. Both have a join link and both are upcoming, so both carry a countdown
 * and both carry a Join pill — but only one of them should ever raise a
 * desktop notification. A fixture with one meeting could not tell "notifies
 * for a joinable meeting" from "notifies for everything in the list".
 */
const minutes = (n) => new Date(Date.now() + n * 60_000).toISOString()
const SOON = {
  id: 'm-soon', title: `Standup ${TAG}`, startsAt: minutes(5), endsAt: minutes(35),
  provider: 'zoom', joinUrl: 'https://example.invalid/soon', recordingUrl: null,
  notes: null, taskId: null, createdById: 'u1', createdAt: new Date().toISOString(), attendees: [],
}
const LATER = {
  id: 'm-later', title: `Retro ${TAG}`, startsAt: minutes(180), endsAt: minutes(240),
  provider: 'zoom', joinUrl: 'https://example.invalid/later', recordingUrl: null,
  notes: null, taskId: null, createdById: 'u1', createdAt: new Date().toISOString(), attendees: [],
}
const UPCOMING = [SOON, LATER]

/** A MUTABLE stub: the dialog PATCHes it and the Meetings page reads it back. */
let settings = {}

const envelope = (data) => JSON.stringify({ data, error: null })
const browser = await chromium.launch(LAUNCH)

try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' })
  await ctx.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    ['rundesk.auth', JSON.stringify(SESSION)],
  )
  /*
   * A RECORDING `Notification`, installed before any app code runs.
   *
   * Headless Chromium's own notification permission is neither granted nor
   * denied, so the real constructor would make "did it notify" a question
   * about the browser's prompt rather than about the product. This records
   * every notification the page raises, which is a count a check can assert
   * on. `window.__notes` is re-created by each navigation, which is wanted:
   * the second visit starts from nothing.
   */
  await ctx.addInitScript(() => {
    window.__notes = []
    function FakeNotification(title, opts) {
      window.__notes.push({ title, body: opts?.body ?? null, tag: opts?.tag ?? null })
    }
    FakeNotification.permission = 'granted'
    FakeNotification.requestPermission = () => Promise.resolve('granted')
    Object.defineProperty(window, 'Notification', {
      value: FakeNotification, configurable: true, writable: true,
    })
  })

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
    if (url.includes('/meetings/upcoming')) return reply(UPCOMING)
    if (url.includes('/meetings')) return reply(UPCOMING)
    if (url.includes('/planner/') && url.includes('/blocks')) return reply([])
    if (url.includes('/priorities')) return reply([])
    if (/\/tasks\/workspace\/[^/]+\/members\//.test(url)) return reply([])
    return reply([])
  })

  const page = await ctx.newPage()

  const openMeetings = async () => {
    await page.goto(`${BASE}/app/${WS}/meetings`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="meetings-upcoming"]', { timeout: 20_000 })
    // The rows themselves, not the section: the section renders either way.
    await waitUntil(
      async () => (await page.locator('[data-testid^="meeting-upcoming-"]').count()) === UPCOMING.length,
      { timeoutMs: 15_000 },
    )
  }
  const countdowns = () => page.locator('[data-testid^="meeting-until-"]')
  const joins = () => page.locator('[data-testid^="meeting-join-"]')
  const rows = () => page.locator('[data-testid^="meeting-upcoming-"]')
  const notes = () => page.evaluate(() => window.__notes ?? [])

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ what the Meetings page draws before any of this can be turned off')

  await openMeetings()
  const soonBadge = await page.locator(`[data-testid="meeting-until-${SOON.id}"]`).innerText().catch(() => '')
  chk(
    (await countdowns().count()) === UPCOMING.length && /^(now|in \d+[mhd])$/.test(soonBadge.trim()),
    `both upcoming meetings carry a countdown, and the near one reads ${JSON.stringify(soonBadge.trim())}`,
    `there were ${await countdowns().count()} countdowns for ${UPCOMING.length} meetings, and the ` +
      `near one read ${JSON.stringify(soonBadge)}`,
  )
  chk(
    (await joins().count()) === UPCOMING.length,
    'and both carry a Join pill, because both have a link',
    `there were ${await joins().count()} Join pills for ${UPCOMING.length} meetings with links`,
  )
  chk(
    (await notes()).length === 0,
    'and nothing has been pushed to the desktop, because nobody asked for it',
    `${(await notes()).length} notifications were raised with the switch off — a notification ` +
      'nobody opted into is the one setting that cannot be undone after the fact',
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ the page that was missing, on the calendar')

  await page.goto(`${BASE}/app/${WS}/calendar`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="planner-page"]', { timeout: 20_000 })
  await page.locator('[data-testid="planner-settings"]').click()
  await page.waitForSelector('[data-testid="planner-settings-dialog"]', { timeout: 10_000 })
  await page.locator('[data-testid="planner-settings-nav-upcomingMeeting"]').click()
  await page.waitForSelector('[data-testid="planner-settings-upcoming-meeting"]', { timeout: 10_000 })

  const switchIds = await page
    .locator('[data-testid="planner-settings-upcoming-meeting"] [data-testid^="planner-upcoming-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')))
  chk(
    JSON.stringify(switchIds) ===
      JSON.stringify([
        'planner-upcoming-time-left',
        'planner-upcoming-quick-join',
        'planner-upcoming-desktop',
      ]),
    'the page carries the frame’s three switches, in order',
    `it carried ${JSON.stringify(switchIds)} — the recorded reason said two of the three ` +
      '"would toggle nothing"',
  )

  await page.locator('[data-testid="planner-upcoming-time-left"]').click()
  await waitUntil(() => settings.upcomingShowTimeLeft === false, { timeoutMs: 8000 })
  await page.locator('[data-testid="planner-upcoming-quick-join"]').click()
  await waitUntil(() => settings.upcomingQuickJoin === false, { timeoutMs: 8000 })
  await page.locator('[data-testid="planner-upcoming-desktop"]').click()
  await waitUntil(() => settings.upcomingDesktopNotify === true, { timeoutMs: 8000 })

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ and what the Meetings page draws now')

  await openMeetings()
  const stillTwo = (await rows().count()) === UPCOMING.length
  chk(
    (await countdowns().count()) === 0 && stillTwo,
    'the countdowns are gone, and both meetings are still listed',
    `${await countdowns().count()} countdowns remained across ${await rows().count()} rows — a ` +
      'switch that empties the list instead of the badge is a different feature',
  )
  chk(
    (await joins().count()) === 0 && stillTwo,
    'the Join pills are gone too, and the rows survived that as well',
    `${await joins().count()} Join pills remained across ${await rows().count()} rows`,
  )

  const raised = await waitUntil(async () => (await notes()).length === 1, { timeoutMs: 10_000 })
  const got = await notes()
  chk(
    raised,
    'exactly one desktop notification is raised — not one per meeting in the list',
    `${got.length} notifications were raised: ${JSON.stringify(got)}`,
  )
  chk(
    got[0]?.body === SOON.title && got[0]?.tag === `rundesk-meeting-${SOON.id}`,
    'and it is for the meeting that can actually be joined, not for the one three hours out',
    `the notification carried ${JSON.stringify(got[0] ?? null)}; the joinable meeting is ` +
      `${JSON.stringify(SOON.title)} and the other is ${JSON.stringify(LATER.title)}`,
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
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ ${ran} checks ran, ${EXPECTED_CHECKS} expected — this run did not do what it says, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
