/**
 * §V2-15b — **Team schedules**, frame `12:48`.
 *
 * The onboarding carousel's fourth card: **"Team schedules — See calendars for
 * anyone in your team, find a time, and schedule a call in seconds"**, over a
 * preview with a ROW OF AVATARS, several of them carrying a tick. The ledger
 * had this as `P | "Team schedules" — one person at a time, no side-by-side
 * grid`, which is accurate and is the smaller half of the story: the planner's
 * "Meet with" takes ONE person and paints their busy time as an OVERLAY on
 * your own week.
 *
 * AN OVERLAY CANNOT BE MADE TO DO THIS BY RAISING A NUMBER. Four people
 * overlaid on one column is four sets of hatching stacked on each other — a
 * picture of nobody's schedule. The card's question ("when are the four of us
 * free") needs a column each, which is why this is a build rather than a
 * parameter change, and why the overlay is left exactly as it was — check 13
 * holds that, because deleting the old feature while adding the new one is the
 * cheapest way to make this suite green and the worst outcome for the product.
 *
 * THE FIXTURE IS TWO PEOPLE WITH DIFFERENT SCHEDULES, ON PURPOSE. Sara is busy
 * in the MORNING with three windows; Omar is busy in the AFTERNOON with one.
 * Every property of that is load-bearing:
 *
 *   · different COUNTS, so a grid that draws `columns[0]` in every column
 *     fails check 8 on the numbers;
 *   · different TIMES OF DAY, so the same bug fails check 9 on the geometry,
 *     independently of the counts;
 *   · and each window carries its owner's id, so check 7 fails on identity
 *     even if a future fixture accidentally gave them the same shape.
 *
 * One person, or two people with matching calendars, would let the commonest
 * implementation bug in a grid like this — mapping every column to the first
 * person — pass every check while being completely wrong.
 *
 *   node test/e2e/team-schedules.mjs --dist apps/web/dist
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
const EXPECTED_CHECKS = 13

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

/* This run's own people. The e2e database and this dist are both shared, and
 * a suite that searched for "Sara" would find everybody else's Saras. */
const TAG = `team-${Date.now().toString(36)}`
const SARA = { userId: 'u-sara', displayName: `Sara ${TAG}`, email: `sara.${TAG}@rundesk.test` }
const OMAR = { userId: 'u-omar', displayName: `Omar ${TAG}`, email: `omar.${TAG}@rundesk.test` }
/**
 * A third, never picked: the columns must come from the selection, not from the
 * roster. Without them, "draws a column per member" would pass.
 *
 * AND NEVER PICKED IS NOT ENOUGH ON ITS OWN. Noor guards against a column per
 * ROSTER member; a column per PAYLOAD entry is a different mistake, and the
 * stub answering exactly the ids it was asked for made the two indistinguishable.
 * The stub volunteers Noor in every answer now — see the note there.
 */
const NOOR = { userId: 'u-noor', displayName: `Noor ${TAG}`, email: `noor.${TAG}@rundesk.test` }
const MEMBERS = [SARA, OMAR, NOOR]

/*
 * The grid draws `days[0]`, which in Week view is the first day of the week on
 * screen. Anchoring the fixture to that same day — rather than to "today" —
 * keeps the windows inside the band the component draws whichever day of the
 * week this run happens on.
 */
const at = (day, h, m = 0) => {
  const d = new Date(day)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

/** Sara: three MORNING windows. Omar: one AFTERNOON window. */
const scheduleFor = (day) => ({
  [SARA.userId]: [
    { startsAt: at(day, 8), endsAt: at(day, 9), source: 'rundesk' },
    { startsAt: at(day, 9, 30), endsAt: at(day, 10, 30), source: 'external' },
    { startsAt: at(day, 11), endsAt: at(day, 12), source: 'rundesk' },
  ],
  [OMAR.userId]: [
    { startsAt: at(day, 15), endsAt: at(day, 17), source: 'rundesk' },
  ],
  [NOOR.userId]: [],
})

const envelope = (data) => JSON.stringify({ data, error: null })
const browser = await chromium.launch(LAUNCH)

try {
  let settings = {}
  /** Every team-schedules URL the page asked for, for check 9. */
  const teamRequests = []
  /** Flipped by check 10 so one column comes back unreadable. */
  let breakOmar = false

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
    if (url.includes('/team-schedules')) {
      teamRequests.push(url)
      const params = new URL(url).searchParams
      const ids = (params.get('userIds') ?? '').split(',').filter(Boolean)
      const from = new Date(params.get('from') ?? Date.now())
      const table = scheduleFor(from)
      /*
       * ANSWERS THE IDS IT WAS ASKED FOR, in the order asked, keyed by id.
       *
       * A stub that returned a fixed pair would hide the very bug this suite
       * exists for: the browser could ignore `userIds` entirely and still be
       * handed the right two people. Here a page that asks for the wrong set
       * gets the wrong set back, and the checks notice.
       */
      return reply({
        people: [
          ...ids.map((id) => ({
            userId: id,
            meetings: [],
            busy: breakOmar && id === OMAR.userId ? [] : (table[id] ?? []),
            error: breakOmar && id === OMAR.userId ? 'Could not read that calendar' : null,
          })),
          /*
           * AND ONE PERSON THE SERVER VOLUNTEERS, WHICH IS THE OTHER HALF.
           *
           * Answering the asked-for ids catches a page that ignores `userIds`.
           * It cannot catch a page that draws its COLUMNS from this payload
           * instead of from the selection, because a faithful answer makes the
           * two identical — `ts-3-columns-from-roster` swapped `order.map` for
           * `columns.map` and ran GREEN for exactly that reason, against a
           * check whose sentence is "in the order they were picked".
           *
           * Noor is never picked and is always in here now, so the selection
           * and the payload differ by one and the two readings are told apart.
           * A page reading the payload draws three columns where two were
           * chosen; a page reading the selection is unaffected, which is why
           * every other check in this suite is unchanged by this line.
           */
          { userId: NOOR.userId, meetings: [], busy: table[NOOR.userId] ?? [], error: null },
        ],
      })
    }
    if (url.includes('/calendar-sync/accounts')) return reply([{ id: 'acct-1', status: 'connected' }])
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
    /* `people/:id/calendar` is Meet-with's endpoint — a DIFFERENT read, kept
     * answering so check 12 can prove the overlay still works. */
    const solo = url.match(/\/people\/([^/]+)\/calendar/)
    if (solo) {
      const from = new Date(new URL(url).searchParams.get('from') ?? Date.now())
      return reply({ meetings: [], busy: scheduleFor(from)[solo[1]] ?? [] })
    }
    if (url.includes('/members')) return reply(MEMBERS)
    return reply([])
  })

  const page = await ctx.newPage()
  const openPlanner = async () => {
    await page.goto(`${BASE}/app/${WS}/calendar`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="planner-page"]', { timeout: 20_000 })
    await page.waitForSelector('[data-testid="planner-day-column"]', { timeout: 20_000 })
  }
  const columns = () => page.locator('[data-testid="planner-team-column"]')
  const grid = () => page.locator('[data-testid="planner-team-grid"]')
  const pick = async (person) => {
    await page.locator('[data-testid="planner-team-search"]').fill(person.displayName)
    await page.locator(`[data-testid="planner-team-result"][data-user-id="${person.userId}"]`).click()
    await waitUntil(
      async () => (await page.locator(`[data-testid="planner-team-chip"][data-user-id="${person.userId}"]`).count()) === 1,
      { timeoutMs: 10_000 },
    )
  }
  /** Every busy rectangle, with the person the DOM says owns it and its box. */
  const busyBoxes = () =>
    page.locator('[data-testid="planner-team-busy"]').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { userId: el.getAttribute('data-user-id'), x: r.x, y: r.y, w: r.width, h: r.height }
      }),
    )

  await openPlanner()

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ before anybody is picked')

  chk(
    (await grid().count()) === 0 && (await columns().count()) === 0,
    'no team grid is drawn until somebody is chosen',
    `${await columns().count()} columns were drawn with nobody selected, so every check below ` +
      'would be measuring something that was there anyway',
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ picking people, frame `12:48`\'s row of avatars')

  await page.locator('[data-testid="planner-team-search"]').fill(`Sara ${TAG}`)
  const narrowed = await waitUntil(async () => {
    const names = await page.locator('[data-testid="planner-team-result"]').filter({ visible: true }).allInnerTexts()
    return names.length === 1 && names[0].includes(SARA.displayName)
  }, { timeoutMs: 10_000 })
  chk(
    narrowed,
    'typing a name narrows the roster to exactly the people who match it',
    `the search offered ${JSON.stringify(await page.locator('[data-testid="planner-team-result"]').allInnerTexts())} ` +
      `for ${JSON.stringify(SARA.displayName)} — three people are seeded and one matches`,
  )

  await page.locator(`[data-testid="planner-team-result"][data-user-id="${SARA.userId}"]`).click()
  const oneColumn = await waitUntil(async () => (await columns().count()) === 1, { timeoutMs: 15_000 })
  chk(
    oneColumn &&
      (await columns().first().getAttribute('data-user-id')) === SARA.userId,
    'choosing one person draws one column, and it is theirs',
    `${await columns().count()} column(s) appeared, the first belonging to ` +
      `${JSON.stringify(await columns().first().getAttribute('data-user-id'))}`,
  )

  await pick(OMAR)
  const twoColumns = await waitUntil(async () => (await columns().count()) === 2, { timeoutMs: 15_000 })
  const ids = await columns().evaluateAll((els) => els.map((el) => el.getAttribute('data-user-id')))
  chk(
    twoColumns && JSON.stringify(ids) === JSON.stringify([SARA.userId, OMAR.userId]),
    'choosing a second adds a second column, in the order they were picked',
    `the columns belonged to ${JSON.stringify(ids)} — and a third person is seeded and was never ` +
      'picked, so a grid drawing one column per member would show here',
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ SIDE BY SIDE, measured')

  const boxes = await columns().evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { id: el.getAttribute('data-user-id'), x: r.x, y: r.y, w: r.width, h: r.height }
    }),
  )
  const [a, b] = boxes
  /*
   * Three claims, and all three are needed. Same top = they are a row, not a
   * stack. b starts right of a = they are ordered across. b starts at or after
   * a's right edge = they do not overlap, which is the difference between
   * "side by side" and "one on top of the other with a gap".
   */
  chk(
    boxes.length === 2 &&
      Math.abs(a.y - b.y) <= 2 &&
      b.x > a.x &&
      b.x >= a.x + a.w - 2,
    `the two columns are side by side — same top (${Math.round(a?.y)} vs ${Math.round(b?.y)}), ` +
      `${Math.round(a?.x)}+${Math.round(a?.w)} then ${Math.round(b?.x)}`,
    `column boxes ${JSON.stringify(boxes)} — the row is that these are beside each other, which ` +
      'is the thing an overlay on one column can never be',
  )

  const names = await page
    .locator('[data-testid="planner-team-column-name"]')
    .filter({ visible: true })
    .allInnerTexts()
  chk(
    names.length === 2 &&
      names[0].includes(SARA.displayName) &&
      names[1].includes(OMAR.displayName) &&
      names[0] !== names[1],
    'each column is headed with its own person, and the two headings differ',
    `the headings read ${JSON.stringify(names)} — two columns under one name is the grid drawing ` +
      'the same person twice, which is what this fixture exists to catch',
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ each column draws ITS OWN person')

  const drawn = await busyBoxes()
  const saraBoxes = drawn.filter((w) => w.userId === SARA.userId)
  const omarBoxes = drawn.filter((w) => w.userId === OMAR.userId)
  /*
   * IDENTITY FIRST. Every rectangle inside Sara's column must be Sara's, by
   * the attribute the component writes — not by where it happens to sit.
   * Column membership is decided by x, so a grid that put Sara's windows in
   * both columns would still have them inside a column.
   */
  const inColumn = (box, col) => box.x >= col.x - 1 && box.x + box.w <= col.x + col.w + 1
  chk(
    drawn.length > 0 &&
      drawn.every((w) => {
        const col = boxes.find((c) => inColumn(w, c))
        return col && col.id === w.userId
      }),
    `all ${drawn.length} busy windows sit in the column of the person they belong to`,
    `the windows were ${JSON.stringify(drawn.map((w) => ({ u: w.userId, x: Math.round(w.x) })))} ` +
      `against columns ${JSON.stringify(boxes.map((c) => ({ id: c.id, x: Math.round(c.x) })))} — ` +
      'a window under the wrong heading is a meeting booked over the wrong person',
  )

  /*
   * THE COUNTS DIFFER, AS SEEDED. Sara has three windows and Omar one; a grid
   * mapping every column to `columns[0]` draws three and three. This is not
   * "asserting a count the fixture produced": the fixture decided the
   * schedules, and what is being asserted is that they were ROUTED to the
   * right columns — which the fixture cannot make true on its own.
   */
  const perColumnCounts = await columns().evaluateAll((els) =>
    els.map((el) => Number(el.getAttribute('data-busy-count'))),
  )
  chk(
    saraBoxes.length === 3 &&
      omarBoxes.length === 1 &&
      JSON.stringify(perColumnCounts) === JSON.stringify([3, 1]),
    `they carry different amounts of work — ${saraBoxes.length} windows and ${omarBoxes.length}`,
    `Sara had ${saraBoxes.length} and Omar ${omarBoxes.length}, with the columns reporting ` +
      `${JSON.stringify(perColumnCounts)} — two equal counts is what drawing one person twice looks like`,
  )

  /*
   * AND THEY ARE AT DIFFERENT TIMES, which catches the same bug a second way.
   * Sara's windows are all morning and Omar's is mid-afternoon, so Sara's
   * lowest rectangle must finish above Omar's highest. A grid drawing person
   * one in both columns produces two identical vertical patterns, and this
   * fails on geometry even if a later fixture gave them matching counts.
   */
  const saraBottom = Math.max(...saraBoxes.map((w) => w.y + w.h))
  const omarTop = Math.min(...omarBoxes.map((w) => w.y))
  chk(
    saraBoxes.length > 0 && omarBoxes.length > 0 && saraBottom < omarTop,
    `and at different times of day — Sara's morning ends at y=${Math.round(saraBottom)}, ` +
      `Omar's afternoon starts at y=${Math.round(omarTop)}`,
    `Sara's windows ended at y=${Math.round(saraBottom)} and Omar's began at y=${Math.round(omarTop)} — ` +
      'two columns with the same vertical pattern is one person drawn twice',
  )

  /*
   * PROVE THE REQUEST. `query.ts` holds results for 30 seconds, so a check
   * that only read the DOM could be describing a cache. The key includes the
   * joined ids, so picking a second person is a key this run has never
   * fetched — a miss forced by construction rather than by waiting.
   */
  const bothAsked = teamRequests.some((u) => {
    const ids2 = (new URL(u).searchParams.get('userIds') ?? '').split(',')
    return ids2.includes(SARA.userId) && ids2.includes(OMAR.userId)
  })
  chk(
    teamRequests.length > 0 && bothAsked,
    `the server was asked for both people in one request (${teamRequests.length} went out)`,
    `${teamRequests.length} team-schedule request(s) were made and none named both people: ` +
      `${JSON.stringify(teamRequests.map((u) => new URL(u).searchParams.get('userIds')))}`,
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ a column that could not be read')

  /*
   * THE CONFIDENT ZERO, on the screen where it would do real damage. A
   * calendar the server could not reach and a person with nothing booked must
   * not draw the same, or somebody books a meeting over a morning they could
   * not see. Reached by picking a THIRD person, which mints a cache key this
   * run has never used — flipping the flag alone would leave the warm result
   * on screen for thirty seconds.
   */
  breakOmar = true
  await pick(NOOR)
  const saidSo = await waitUntil(
    async () => (await page.locator('[data-testid="planner-team-error"]').count()) === 1,
    { timeoutMs: 15_000 },
  )
  const omarColumn = page.locator(`[data-testid="planner-team-column"][data-user-id="${OMAR.userId}"]`)
  chk(
    saidSo && (await omarColumn.locator('[data-testid="planner-team-free"]').count()) === 0,
    'a calendar that could not be read says so, instead of being drawn as a free day',
    `the unreadable column showed ${await page.locator('[data-testid="planner-team-error"]').count()} ` +
      `error(s) and ${await omarColumn.locator('[data-testid="planner-team-free"]').count()} "free" label(s) — ` +
      '"nothing booked" and "could not ask" are the same picture, and that is the confident zero',
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ taking somebody out, and the feature this did not replace')

  /*
   * THE MIDDLE ONE, NOT THE FIRST. This removed Sara — the first person picked
   * — and `ts-7-remove-drops-the-wrong-one` replaces the remove with
   * `teamUserIds.slice(1)`, which drops the first. The two are the same answer
   * whenever the first is the one being removed, so the patch ran GREEN against
   * the sentence that says the others are left where they were; its own header
   * had predicted exactly that ("looks correct whenever the first is the one
   * being removed"). Taking Omar out of the middle tells them apart: dropping
   * the first leaves [Omar, Noor] where removing Omar leaves [Sara, Noor].
   */
  await page.locator(`[data-testid="planner-team-remove-${OMAR.userId}"]`).click({ timeout: 8000 }).catch(() => {})
  const removed = await waitUntil(async () => {
    const left = await columns().evaluateAll((els) => els.map((el) => el.getAttribute('data-user-id')))
    return JSON.stringify(left) === JSON.stringify([SARA.userId, NOOR.userId])
  }, { timeoutMs: 15_000 })
  chk(
    removed,
    'removing one person takes their column away and leaves the others where they were',
    `the remaining columns were ` +
      `${JSON.stringify(await columns().evaluateAll((els) => els.map((el) => el.getAttribute('data-user-id'))))} — ` +
      'removing somebody from the MIDDLE must not renumber the rest onto the wrong calendars',
  )

  /*
   * MEET-WITH IS UNTOUCHED. The cheapest way to make everything above green
   * would have been to rewrite the one-person overlay into this grid, and the
   * product would have lost the answer to "is Sara free on Thursday" — a
   * different question, on a different surface, that `planner-grid.mjs` also
   * asserts. Held here too, because a suite named for the new feature is where
   * somebody deleting the old one will be looking.
   */
  await page.locator('[data-testid="planner-meet-with"]').fill(`Sara ${TAG}`)
  await page.locator('[data-testid="planner-meet-result"]').first().click()
  const overlay = await waitUntil(
    async () => (await page.locator('[data-testid="planner-busy-block"]').count()) > 0,
    { timeoutMs: 15_000 },
  )
  chk(
    overlay && (await page.locator('[data-testid="planner-meet-selected"]').count()) === 1,
    'and "Meet with" still overlays one person on your own week, which is a different question',
    'the one-person overlay stopped working — this row adds a grid beside it and replaces nothing',
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
