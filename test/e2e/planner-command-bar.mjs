/**
 * §V2-15d — the **planner bottom command bar**, frame `14:45`.
 *
 * The frame draws a rounded bar floating over the lower middle of the grid,
 * reading **"Search events, teammates, commands…"**. It is there at `13:05`,
 * `14:00`, `14:25`, `14:35` and `14:45` — every planner frame in the video —
 * so it is furniture, not a transient.
 *
 * THE ROW'S REAL QUESTION WAS NOT "CAN WE DRAW A BAR". It was whether this
 * product should grow a second command surface. Rundesk already has a palette
 * that searches tasks, docs, files, PEOPLE and MEETINGS and takes `/`
 * commands — which is every one of the three things the placeholder promises.
 * A planner-local search box beside it would have been two result lists, two
 * sets of filters and two ideas of what a command is: the duplicated-list
 * defect at the largest scale this codebase has seen it, the same shape as the
 * three field-type pickers that each offered a different subset.
 *
 * So the bar is a LAUNCHER, and this suite's job is to hold that. Checks 6–9
 * assert that what opens is the shared palette — by looking for controls only
 * that component renders — rather than asserting "a search box appeared",
 * which a second implementation would satisfy perfectly.
 *
 *   node test/e2e/planner-command-bar.mjs --dist apps/web/dist
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
const EXPECTED_CHECKS = 10

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

/** Frame `14:45`'s own placeholder, to the character. */
const PLACEHOLDER = 'Search events, teammates, commands…'
/** This run's own row, so the search assertion is about a person we seeded. */
const TAG = `cmd-${Date.now().toString(36)}`
const MATE = { userId: 'u-mate', displayName: `Sara ${TAG}`, email: `sara.${TAG}@rundesk.test` }

const envelope = (data) => JSON.stringify({ data, error: null })
const browser = await chromium.launch(LAUNCH)

try {
  /** Every search the palette asked the server for, so check 8 can assert the
   *  REQUEST carried the query rather than that a box accepted typing. */
  const searches = []

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
    if (url.includes('/search')) {
      searches.push(url)
      const q = new URL(url).searchParams.get('q') ?? ''
      /* Answers only when the query actually reached the server, so a palette
       * that rendered a stale list would show nothing and the check would
       * fail rather than pass on somebody else's results. */
      const hits = q && MATE.displayName.toLowerCase().includes(q.toLowerCase())
        ? [{ id: MATE.userId, type: 'user', title: MATE.displayName, subtitle: MATE.email, url: '/' }]
        : []
      return reply({ hits, total: hits.length })
    }
    if (url.includes('/calendar-sync/accounts')) {
      /* Connected, so §V2-15c's onboarding panel stays away and the geometry
       * below is about the bar against the grid rather than against a banner. */
      return reply([{ id: 'acct-1', status: 'connected' }])
    }
    if (url.includes('/planner/') && url.includes('/settings')) return reply({})
    if (url.includes('/planner/') && url.includes('/calendars')) return reply({ groups: [] })
    if (url.includes('/planner/') && url.includes('/blocks')) return reply([])
    if (url.includes('/priorities')) return reply([])
    if (url.includes('/members')) return reply([MATE])
    return reply([])
  })

  const page = await ctx.newPage()
  await page.goto(`${BASE}/app/${WS}/calendar`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="planner-page"]', { timeout: 20_000 })
  await page.waitForSelector('[data-testid="planner-day-column"]', { timeout: 20_000 })

  const bar = () => page.locator('[data-testid="planner-command-bar"]')
  /* The palette's OWN dialog, not "a dialog": the planner also mounts the
   * settings dialog, and `[role=dialog]` would count either. */
  const palette = () => page.locator('[data-testid="palette-filters-toggle"]')

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ the bar frame `14:45` draws')

  chk(
    (await bar().count()) === 1,
    'the planner carries exactly one command bar',
    `there were ${await bar().count()} command bars — the row was that the planner has none, ` +
      'and two would mean the launcher was added twice',
  )

  const placeholder = (
    await page.locator('[data-testid="planner-command-bar-placeholder"]').textContent()
  )?.trim()
  chk(
    placeholder === PLACEHOLDER,
    `reading ${JSON.stringify(PLACEHOLDER)}, the frame's own three promises`,
    `it read ${JSON.stringify(placeholder)} — the placeholder is the specification of what the ` +
      'bar has to be able to find, and a fourth noun in it would be a facade in a sentence',
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ where it sits, measured')

  const barBox = await bar().boundingBox()
  const pageBox = await page.locator('[data-testid="planner-page"]').boundingBox()
  const firstCol = await page.locator('[data-testid="planner-day-column"]').first().boundingBox()
  const lastCol = await page.locator('[data-testid="planner-day-column"]').last().boundingBox()

  /*
   * CENTRED OVER THE GRID, NOT OVER THE VIEWPORT. In the frame the bar's
   * middle sits under the grid's middle, to the right of the rail — the rail
   * is 264px of the 1400 here, so a bar centred on the window would be
   * measurably left of where the frame puts it. The tolerance is a sixteenth
   * of the grid's width: far more than a rounding or a scrollbar, far less
   * than the ~130px a viewport-centred bar would be out by.
   */
  const gridLeft = firstCol?.x ?? 0
  const gridRight = (lastCol?.x ?? 0) + (lastCol?.width ?? 0)
  const gridMid = (gridLeft + gridRight) / 2
  const barMid = (barBox?.x ?? 0) + (barBox?.width ?? 0) / 2
  const tolerance = (gridRight - gridLeft) / 16
  chk(
    barBox !== null && Math.abs(barMid - gridMid) <= tolerance,
    `it is centred over the grid — bar middle ${Math.round(barMid)}px against grid middle ` +
      `${Math.round(gridMid)}px, inside ${Math.round(tolerance)}px`,
    `bar middle ${Math.round(barMid)}px against grid middle ${Math.round(gridMid)}px — ` +
      'a bar centred on the window instead of the calendar sits under the rail',
  )

  /*
   * AND IT DOES NOT COVER THE RAIL. `14:45` has the bar clear of the rail,
   * which matters because the rail's "+ Add priority" and the backlog rows are
   * at the same height. A full-width bar would photograph the same and swallow
   * clicks on both.
   */
  const railRight = (await page.locator('[data-testid="planner-priorities"]').boundingBox())?.x ?? 0
  chk(
    barBox !== null && barBox.x > railRight,
    `its left edge (${Math.round(barBox?.x ?? 0)}px) is clear of the rail`,
    `the bar started at ${Math.round(barBox?.x ?? 0)}px, over the rail — a floating bar that ` +
      'covers the backlog takes clicks away from the rows underneath it',
  )

  /* In the lower part of the calendar, which is what "bottom bar" means. */
  const barBottomGap = (pageBox?.y ?? 0) + (pageBox?.height ?? 0) - ((barBox?.y ?? 0) + (barBox?.height ?? 0))
  chk(
    barBox !== null && barBottomGap >= 0 && barBottomGap <= (pageBox?.height ?? 0) / 4,
    `and it sits near the bottom — ${Math.round(barBottomGap)}px of clearance below it`,
    `the bar sat ${Math.round(barBottomGap)}px above the bottom of a ` +
      `${Math.round(pageBox?.height ?? 0)}px surface, which is not a bottom bar`,
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ what it opens is the palette this product already has')

  chk(
    (await palette().count()) === 0,
    'nothing is mounted before the bar is pressed',
    'the palette was already mounted with the bar untouched — it registers its own ⌘K listener, ' +
      'so a second always-mounted copy makes one keypress toggle two palettes',
  )

  await bar().click()
  const opened = await waitUntil(async () => (await palette().count()) > 0, { timeoutMs: 15_000 })
  chk(
    opened && (await palette().count()) === 1,
    'pressing it opens exactly one palette',
    `after the click there were ${await palette().count()} palettes — the launcher must open the ` +
      'shell\'s component, not a second instance beside it',
  )

  /*
   * THE ANTI-DUPLICATION CHECK, and the reason this suite exists.
   *
   * `palette-sources` and `palette-more-types` are rendered by
   * `command-palette.tsx` and by nothing else in the product. A planner-local
   * search box written from scratch would satisfy "a search field appeared"
   * and would fail this, which is exactly the discrimination wanted: the row
   * is not "a bar that searches", it is "the bar reuses the one palette".
   */
  const sharedBits = await page
    .locator('[data-testid="palette-sources"], [data-testid="palette-more-types"]')
    .count()
  chk(
    sharedBits >= 2,
    'and what opened is the shared palette — its source tabs and type picker are both there',
    `only ${sharedBits} of the shared palette's own controls were found; a second search surface ` +
      'built beside the existing one is the duplicated-list defect this row was written to avoid',
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ the placeholder\'s three promises, exercised')

  /*
   * `[cmdk-input]`, which is what `command-palette.mjs` already drives — and it
   * has to be, not "the first text input on the page". The planner behind the
   * palette carries its own Meet-with and Team-schedules search boxes, so a
   * bare `input` selector would type into the page under the dialog and every
   * check below would be about the rail.
   */
  const typeInto = async (text) => {
    const box = page.locator('[cmdk-input]').first()
    await box.fill(text)
    return box
  }

  await typeInto(`Sara ${TAG}`)
  /*
   * ASSERTS THE REQUEST, not the rendering. `query.ts` sets a 30-second
   * `staleTime`, so a check that only looked at rows could be reading a cache
   * this run never filled. The query string is unique to this run by
   * construction — the tag is minted at start-up — so it cannot have been
   * fetched before, which forces the miss rather than waiting for one.
   */
  const askedForMate = await waitUntil(
    async () => searches.some((u) => decodeURIComponent(u).includes(TAG)),
    { timeoutMs: 15_000 },
  )
  chk(
    searches.length > 0 && askedForMate,
    `"teammates" is real — the palette asked the server for ${JSON.stringify(TAG)}`,
    `${searches.length} search request(s) went out and none carried ${JSON.stringify(TAG)}; ` +
      'a negative here with no requests at all would mean the box is not wired, not that it filtered',
  )

  /*
   * "commands". `/` puts the palette into command mode, which is a different
   * list from the search results — `command-palette.tsx` branches on it at
   * `commandMode`. Asserting the results merely changed would pass on a search
   * for the literal character.
   */
  await typeInto('/')
  const commandMode = await waitUntil(
    async () => (await page.locator('[data-testid="palette-sources"]').count()) === 0,
    { timeoutMs: 10_000 },
  )
  chk(
    commandMode,
    'and "commands" is real — `/` drops the source tabs and shows the command list instead',
    'typing `/` left the palette in search mode; the bar promises commands, and a placeholder ' +
      'that names something the surface cannot do is the facade this audit keeps finding',
  )

  await ctx.close()
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
