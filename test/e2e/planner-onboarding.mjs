/**
 * §V2-15c — the **planner onboarding screen**, frames `12:40`–`12:50`.
 *
 * The ledger carried this as `M | Planner onboarding screen`, one line, and a
 * one-line row is how a four-card carousel with a working pager gets estimated
 * as a headline. Going back to the frames is what this suite is written
 * against:
 *
 *   · `12:40` — **"You, but better organized"**, a line of explanation,
 *     **"Get started with"** over **Google Calendar** and **Microsoft
 *     Outlook**, and to the right two feature cards with `←` `→` beneath them.
 *   · `12:45` — THE SAME SCREEN WITH THE CARDS MOVED ALONG. That is the fact
 *     the row was missing: the pager is real. A carousel verified from one
 *     frame is a carousel that could be three static cards.
 *   · `12:48`/`12:50` — the third and fourth cards, **Block time for your
 *     tasks** and **Team schedules**.
 *
 * WHAT THIS SUITE DELIBERATELY ASSERTS ABOUT THE GRID. ClickUp's planner has
 * nothing to show before a calendar is connected, so its onboarding replaces
 * the whole surface. Rundesk's does: time blocks, priorities and the backlog
 * all work with no external calendar at all. Hiding a working calendar behind
 * a connect screen would take a feature away in order to advertise a
 * different one, so the panel sits ABOVE the grid — and check 10 asserts the
 * grid is still there, because that is a decision and decisions have to be
 * held by something or they quietly get "fixed".
 *
 *   node test/e2e/planner-onboarding.mjs --dist apps/web/dist
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
const EXPECTED_CHECKS = 12

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

/** The frame's own words, so a re-worded headline fails rather than passes. */
const HEADLINE = 'You, but better organized'
/*
 * In the frames' order. The fourth is the one §V2-15b actually builds.
 *
 * THE SECOND ONE WAS WRONG, and this list's own comment is what makes that
 * worth recording: it said "the frame's own words, so a re-worded headline
 * fails rather than passes". The frame at `12:40` and `12:45` draws
 * **"Automate your meeting notes"**. This read "Keep your meeting notes", and
 * so did the product — so the check was green against copy the specification
 * does not contain, which is the one thing this constant exists to prevent.
 * Found by extracting the two frames and reading them, which is step 1.
 */
const CARD_TITLES = [
  'Join your next meeting',
  'Automate your meeting notes',
  'Block time for your tasks',
  'Team schedules',
]

/**
 * What the fixture's `oauth/start` answers with, and where the browser ends up.
 *
 * `about:blank` because it has no network and no origin worth landing on — NOT
 * because the browser declines to follow it. IT FOLLOWS IT. This was written
 * believing otherwise, and the belief cost the whole suite: the page assigns
 * `window.location.href`, the browser began a real navigation to `about:blank`,
 * and the `page.goto` on the next line was aborted by it — `net::ERR_ABORTED`,
 * thrown out of the process with four checks run and eight never reached.
 *
 * Named here because check 4 now asserts the landing as well as the request.
 */
const AUTH_URL = 'about:blank#oauth'

const envelope = (data) => JSON.stringify({ data, error: null })
const browser = await chromium.launch(LAUNCH)

try {
  /*
   * TWO PIECES OF MUTABLE FIXTURE STATE, and they are the two halves of the
   * gate. `accounts` is what `calendar-sync/accounts` returns; `settings` is
   * the blob the dismiss button PATCHes. The panel appears only when the first
   * is empty AND the second has not been dismissed, so a suite that varied
   * only one of them could not tell a working gate from a panel that is
   * always on.
   */
  let accounts = []
  let settings = {}
  /** Every OAuth start the page asked for, so check 4 can assert the request
   *  rather than assert that a button was clickable. */
  const oauthStarts = []

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' })
  await ctx.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    ['rundesk.auth', JSON.stringify(SESSION)],
  )
  await ctx.route('**/api/**', async (route) => {
    const req = route.request()
    const url = req.url()
    const reply = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: envelope(data) })
    if (url.includes('/users/me')) return reply(USER)
    const oauth = url.match(/\/integrations\/connections\/([^/]+)\/oauth\/start/)
    if (oauth && req.method() === 'POST') {
      oauthStarts.push(oauth[1])
      /* An inert destination rather than an inert URL: the page assigns
       * `window.location` and the browser really goes there, so this has to be
       * somewhere harmless rather than somewhere unreachable. See `AUTH_URL`. */
      return reply({ authUrl: AUTH_URL })
    }
    if (url.includes('/calendar-sync/accounts')) return reply(accounts)
    if (url.includes('/planner/') && url.includes('/settings')) {
      if (req.method() === 'PATCH') {
        settings = { ...settings, ...JSON.parse(req.postData() ?? '{}') }
        return reply(settings)
      }
      return reply(settings)
    }
    if (url.includes('/planner/') && url.includes('/calendars')) return reply({ groups: [] })
    if (url.includes('/planner/') && url.includes('/blocks')) return reply([])
    if (url.includes('/priorities')) return reply([])
    if (url.includes('/members')) return reply([])
    return reply([])
  })

  const page = await ctx.newPage()
  const openPlanner = async () => {
    await page.goto(`${BASE}/app/${WS}/calendar`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="planner-page"]', { timeout: 20_000 })
  }
  const panel = () => page.locator('[data-testid="planner-onboarding"]')
  const cardTitle = () => page.locator('[data-testid="planner-onboarding-card-title"]')
  const readCard = async () => (await cardTitle().textContent())?.trim() ?? ''

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ the screen frames `12:40`–`12:50` draw')

  await openPlanner()
  /*
   * NOT A GATE THAT THROWS — the check immediately below asserts the very thing
   * this waits for. `po-1-panel-never-shows` removes the panel, and with the
   * wait unqualified and no `catch` on the outer try, the process died on an
   * uncaught TimeoutError: no totals, no short-run line, nothing said about the
   * patch at all.
   */
  const panelUp = await page
    .waitForSelector('[data-testid="planner-onboarding"]', { timeout: 15_000 })
    .then(() => true)
    .catch(() => false)
  chk(
    panelUp && (await panel().count()) === 1,
    'a person with no calendar connected gets the onboarding panel',
    'the planner drew no onboarding panel for an account with nothing connected — ' +
      'the whole row was that this screen does not exist',
  )

  const headline = (
    await page.locator('[data-testid="planner-onboarding-title"]').textContent().catch(() => null)
  )?.trim()
  chk(
    headline === HEADLINE,
    `with frame \`12:40\`'s own headline, ${JSON.stringify(HEADLINE)}`,
    `the headline read ${JSON.stringify(headline)} — the frame's words are the specification, ` +
      'and a panel that says something else is a different panel',
  )

  /*
   * COUNTED, not "both are present". `12:40` offers exactly two providers, and
   * a check that only asserted Google exists would pass on a panel that had
   * quietly grown a third — or lost Outlook.
   */
  const providerIds = await page
    .locator('[data-testid="planner-onboarding"] [data-testid^="planner-onboarding-connect-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')))
  chk(
    JSON.stringify(providerIds) ===
      JSON.stringify(['planner-onboarding-connect-gcal', 'planner-onboarding-connect-outlook']),
    'over "Get started with" and exactly the frame\'s two providers, in its order',
    `the panel offered ${JSON.stringify(providerIds)} — frame \`12:40\` has Google Calendar ` +
      'then Microsoft Outlook and nothing else',
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ the buttons reach the OAuth flow the rest of the product uses')

  await page.locator('[data-testid="planner-onboarding-connect-gcal"]').click()
  /*
   * BOTH HALVES OF PRESSING IT, and the second half is not decoration.
   *
   * `oauthStarts` is pushed by the ROUTE HANDLER — before the answer has even
   * reached the page, let alone before the page has done anything with it. So
   * waiting on it alone returns in the middle of the behaviour, with the
   * redirect still in flight; that is what aborted the navigation below.
   *
   * Waiting for the landing waits for the whole behaviour, and asserting it
   * closes a gap the request-only version left wide open: a button that fires
   * `oauth/start` and then DROPS the `authUrl` it is handed leaves the person
   * on the planner with nothing happening, which is the dead-control defect
   * arriving one step later than expected — and it too photographs exactly
   * like a working one.
   */
  const started = await waitUntil(async () => oauthStarts.length > 0, { timeoutMs: 8000 })
  const landed = await waitUntil(async () => page.url() === AUTH_URL, { timeoutMs: 8000 })
  chk(
    started && oauthStarts.length === 1 && oauthStarts[0] === 'gcal' && landed,
    `pressing Google Calendar asks the server to start OAuth for ${JSON.stringify(oauthStarts[0])}, ` +
      'and sends the browser to the URL it answers with',
    `the page made ${oauthStarts.length} OAuth start request(s) ${JSON.stringify(oauthStarts)} and ` +
      `ended on ${JSON.stringify(page.url())} rather than ${JSON.stringify(AUTH_URL)} — a connect ` +
      'button that renders and requests nothing, or requests and then never follows the URL it was ' +
      'given, is the dead-control defect, and it photographs exactly like a working one',
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ the carousel, which frame `12:45` proves is not three static cards')

  await openPlanner()
  await page.waitForSelector('[data-testid="planner-onboarding-card"]', { timeout: 15_000 })
  const first = await readCard()
  chk(
    first === CARD_TITLES[0] &&
      (await page.locator('[data-testid="planner-onboarding-position"]').textContent())?.trim() ===
        `1/${CARD_TITLES.length}`,
    `it opens on ${JSON.stringify(CARD_TITLES[0])}, card 1 of ${CARD_TITLES.length}`,
    `it opened on ${JSON.stringify(first)} at position ` +
      `${JSON.stringify((await page.locator('[data-testid="planner-onboarding-position"]').textContent())?.trim())}`,
  )

  await page.locator('[data-testid="planner-onboarding-next"]').click()
  /*
   * WAITS FOR THE TITLE TO CHANGE, and asserts the title — not the index.
   *
   * A pager that incremented a counter and left the card alone would satisfy
   * "the position changed", and that is precisely the facade worth catching
   * here: `12:40` and `12:45` differ in the CARDS, not in a number.
   */
  const moved = await waitUntil(async () => (await readCard()) === CARD_TITLES[1], { timeoutMs: 8000 })
  chk(
    moved,
    `pressing → moves it to ${JSON.stringify(CARD_TITLES[1])}, which is what changes between \`12:40\` and \`12:45\``,
    `after → the card still read ${JSON.stringify(await readCard())} — a pager that moves a counter ` +
      'and not the card is the dead control this frame pair exists to rule out',
  )

  /* Back again, so ← is exercised rather than assumed to be →'s mirror. */
  await page.locator('[data-testid="planner-onboarding-prev"]').click()
  const backAgain = await waitUntil(async () => (await readCard()) === CARD_TITLES[0], { timeoutMs: 8000 })
  chk(
    backAgain,
    'and ← brings it back, so the two arrows are two behaviours rather than one',
    `after ← the card read ${JSON.stringify(await readCard())}`,
  )

  /*
   * WRAPPING, walked the whole way round. An arrow that stops dead at the last
   * card is one people press twice and conclude is broken — and walking all
   * four also proves the set is the frames' four rather than two repeated.
   */
  const walked = []
  for (let i = 0; i < CARD_TITLES.length; i += 1) {
    walked.push(await readCard())
    await page.locator('[data-testid="planner-onboarding-next"]').click()
    await waitUntil(async () => (await readCard()) !== walked[walked.length - 1], { timeoutMs: 8000 })
  }
  chk(
    JSON.stringify(walked) === JSON.stringify(CARD_TITLES) && (await readCard()) === CARD_TITLES[0],
    `→ walks all four cards ${JSON.stringify(CARD_TITLES)} and wraps back to the first`,
    `→ walked ${JSON.stringify(walked)} and landed on ${JSON.stringify(await readCard())}`,
  )

  /*
   * THE FOURTH CARD IS A FEATURE THIS PRODUCT HAS. Frame `12:48` promises
   * "see calendars for anyone in your team", and §V2-15b is the side-by-side
   * grid that answers it. A carousel advertising something absent is worse
   * than no carousel, so this check ties the two rows together: if Team
   * schedules is ever removed, this reddens.
   */
  chk(
    CARD_TITLES.includes('Team schedules') && walked.includes('Team schedules'),
    'and the card frame `12:48` ends on is Team schedules, which §V2-15b builds',
    'the carousel did not carry the Team schedules card the frame draws',
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ the panel is above the calendar, not instead of it')

  /*
   * MEASURED, and this is the recorded decision's guard.
   *
   * ClickUp hides the planner behind this screen because its planner has
   * nothing to show yet. Rundesk's has time blocks, priorities and a backlog,
   * all of which work with no calendar connected. So the panel is drawn ABOVE
   * the grid and the grid still works — and both halves are asserted, because
   * "the panel is present" alone would pass on a full-screen takeover.
   *
   * THE GRID IS BROUGHT HOME FIRST, and without that this check measures the
   * clock instead of the layout.
   *
   * A day column is 24 hours tall and lives inside a scroll container the
   * planner deliberately scrolls to the current hour on mount ("arrive at the
   * current hour, not at midnight"). So `boundingBox()` reports where the
   * column's 00:00 edge is, which at 16:00 is several hundred pixels ABOVE the
   * container — measured cold, the calendar appears to start above a panel it
   * is in fact entirely below. It read `panel ends at 266, first day column
   * starts at 13` against a container whose own top is 266: the same number
   * the panel ends on. The comparison would only have been true between
   * midnight and 01:00, when there is nothing to scroll past.
   *
   * `planner-appearance-toggles.mjs` carries the same helper for the same
   * reason. Scrolling changes nothing about what is being asserted — the panel
   * is still above the grid, or it is not.
   */
  await page.evaluate(() => {
    let el = document.querySelector('[data-testid="planner-day-column"]')?.parentElement
    while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement
    if (el) el.scrollTop = 0
  })
  await page.waitForTimeout(150)
  const box = await panel().boundingBox()
  const gridBox = await page.locator('[data-testid="planner-day-column"]').first().boundingBox()
  chk(
    box !== null &&
      gridBox !== null &&
      box.y + box.height <= gridBox.y + 1,
    `the panel sits above the grid (panel ends at y=${Math.round((box?.y ?? 0) + (box?.height ?? 0))}, ` +
      `first day column starts at y=${Math.round(gridBox?.y ?? 0)}) and the calendar still draws`,
    `panel box ${JSON.stringify(box)} against first day column ${JSON.stringify(gridBox)} — ` +
      'a connect screen that hides a working calendar removes a feature to advertise another',
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ both halves of the gate')

  await page.locator('[data-testid="planner-onboarding-dismiss"]').click()
  const gone = await waitUntil(async () => (await panel().count()) === 0, { timeoutMs: 8000 })
  chk(
    gone && settings.plannerOnboardingDismissed === true,
    'dismissing it stores the dismissal on the account and takes the panel away',
    `the panel count was ${await panel().count()} and the stored settings were ` +
      `${JSON.stringify(settings)} — a panel that hides locally and comes back on the next ` +
      'device has not been dismissed, it has been postponed',
  )

  /*
   * THE OTHER HALF. Reset the dismissal and connect an account instead: the
   * panel must stay away for the *other* reason. Without this, a gate wired
   * only to the dismissal flag would pass everything above.
   */
  settings = {}
  accounts = [{ id: 'acct-1', status: 'connected' }]
  await openPlanner()
  /* Positive wait first — the grid is proof the page finished — so the
   * absence below is an absence rather than a page that had not rendered. */
  await page.waitForSelector('[data-testid="planner-day-column"]', { timeout: 15_000 })
  chk(
    (await panel().count()) === 0,
    'and a person who already has a calendar connected never sees it, dismissal or not',
    'the onboarding panel was drawn for an account with a connected calendar — it is an ' +
      'invitation to connect one, and it has no reason to exist once that is done',
  )
  await ctx.close()
} catch (e) {
  /*
   * A CATCH, BECAUSE WITHOUT ONE THIS SUITE COULD NOT REPORT A FAILURE AT ALL.
   *
   * This was `try { … } finally { … }` with no catch, so anything that threw
   * left the process on an uncaught exception — before the totals line, before
   * the `EXPECTED_CHECKS` guard, before anything. `po-1-panel-never-shows`
   * produced exactly that: `wt-break.sh` recorded `NO SUMMARY: the run printed
   * no 'N passed, M failed' line — it died before the totals`, which is the one
   * outcome that says nothing whatsoever about the patch.
   *
   * Every other suite here records the throw as a failure and lets the totals
   * and the short-run guard print. Three did not: `planner-onboarding`,
   * `planner-command-bar` and `team-schedules`.
   */
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close()
  server.close()
}

console.log(`\n${passed} passed, ${failed} failed`)
if (passed + failed !== EXPECTED_CHECKS) {
  console.log(
    `\n\x1b[31m✗\x1b[0m ${passed + failed} checks ran, ${EXPECTED_CHECKS} expected — this run did ` +
      'not do what it says, and a short green run is the failure this number exists to catch.',
  )
  process.exit(1)
}
process.exit(failed === 0 ? 0 : 1)
