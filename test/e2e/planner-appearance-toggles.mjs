/**
 * §V2-02e — the five planner settings that were stored and read by nothing.
 *
 * Frame `14:10`'s Appearance page ends in an **Others** group headed "Choose
 * other settings for your calendar". Five switches sat under it in the schema:
 *
 *   showWeekNumbers · alwaysOpenAtStartOfWeek · darkenNonWorkingHours ·
 *   savePersonalEventsQuickly   (Appearance)
 *   showRecurring               (Time blocking)
 *
 * All five were declared in `PlannerSettings`, accepted by the controller,
 * written to `users.planner_settings` and round-tripped through Postgres. A
 * reference count across `apps/api/src`, `apps/web/src`, `packages/db/src` and
 * `packages/ui/src` — excluding the schema that declares them — returned ZERO
 * for every one of them, beside six working siblings in the same object:
 * `showWeekends` 24, `showAssigned` 17, `blockPrefix` 14, `showOverdue` 14,
 * `eventStyle` 11, `colorTasksBy` 10. That is why nobody noticed: every
 * neighbour worked.
 *
 * WHAT THIS SUITE REFUSES TO DO. It never asserts that a switch moved. A
 * switch moving is what the defect already did perfectly — it flipped, it
 * saved, it read back, and the calendar carried on exactly as before. Every
 * check below is a measurement of the GRID: how many columns are dimmed and
 * WHICH, what the header says, what date a column is for, what the page POSTs.
 * Giving these five keys a control would have been the same defect with a
 * nicer UI.
 *
 * It also covers the fourth instance of the duplicated-list defect found while
 * building this: `colorTasksBy` is a four-value union in the schema and was a
 * three-value one in the dialog's own copy of the type, so the select offered
 * three options to a server that has always accepted four.
 *
 *   node test/e2e/planner-appearance-toggles.mjs --dist apps/web/dist
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
const EXPECTED_CHECKS = 20

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
 * NARROWED TO THIS RUN'S OWN ROWS. The e2e database is shared and so is this
 * dist; every fixture here carries the tag and every assertion about a title
 * asks for it, so a check can never be satisfied by a neighbouring suite's
 * leftovers.
 */
const TAG = `apt-${Date.now().toString(36)}`

/** A local `YYYY-MM-DD`, which is what the grid puts in `data-day`. */
const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * The ISO-8601 week number, written out here on purpose.
 *
 * Deliberately NOT imported from the app: a check that reuses the function it
 * is checking agrees with it whatever either of them does. This is the
 * textbook algorithm — shift to the Thursday of the week, count from Jan 1 —
 * and if the two ever disagree, one of them is wrong and that is the finding.
 */
const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const isoDay = t.getUTCDay() === 0 ? 7 : t.getUTCDay()
  t.setUTCDate(t.getUTCDate() + 4 - isoDay)
  const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7)
}

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d, n) => { const o = new Date(d); o.setDate(o.getDate() + n); return o }
const startOfWeek = (d, weekStartsOn) => {
  const o = startOfDay(d)
  o.setDate(o.getDate() - ((o.getDay() - weekStartsOn + 7) % 7))
  return o
}

const now = new Date()
/* Monday-start for this half, so the seven drawn columns are exactly one ISO
 * week and the header's number is unambiguous whatever day this runs on. */
const MONDAY = startOfWeek(now, 1)
const at = (day, hour) => { const d = new Date(day); d.setHours(hour, 0, 0, 0); return d.toISOString() }

/*
 * Three blocks and one recurrence.
 *
 * The recurring one sits on MONDAY — the first drawn column — rather than on
 * today, so the number of projected occurrences is six on every day of the
 * week. A fixture pinned to "today" would project nothing at all on a Sunday
 * run and the check would pass by drawing nothing.
 */
const BLOCKS = [
  {
    id: 'b-rec', taskId: 't-rec', label: `Standup ${TAG}`,
    startsAt: at(MONDAY, 9), endsAt: at(MONDAY, 10), isAllDay: false,
    taskStatus: 'todo', taskPriority: 'normal', taskListId: 'L1',
    taskRecurrence: { rule: { mode: 'daily', interval: 1 } },
  },
  {
    id: 'b-l1', taskId: 't-l1', label: `Same list ${TAG}`,
    startsAt: at(addDays(MONDAY, 1), 13), endsAt: at(addDays(MONDAY, 1), 14), isAllDay: false,
    taskStatus: 'todo', taskPriority: 'normal', taskListId: 'L1', taskRecurrence: null,
  },
  {
    id: 'b-l2', taskId: 't-l2', label: `Other list ${TAG}`,
    startsAt: at(addDays(MONDAY, 2), 13), endsAt: at(addDays(MONDAY, 2), 14), isAllDay: false,
    taskStatus: 'todo', taskPriority: 'normal', taskListId: 'L2', taskRecurrence: null,
  },
]

/* Mon–Wed only, and the Tuesday of this week is a holiday. Chosen so that the
 * dimmed set can NOT be the weekend: Thursday and Friday are ordinary weekdays
 * and must be dimmed, Monday is a weekday and must not be. */
const WORK_DAYS = [1, 2, 3]
const HOLIDAY = dayKey(addDays(MONDAY, 1))
const SCHEDULE = { workDays: WORK_DAYS, holidays: [{ day: HOLIDAY, name: `Break ${TAG}` }] }

/*
 * THE HOLIDAYS CALENDAR STARTS OFF, and that is this suite's fixture rather
 * than an opinion about the product.
 *
 * `GET /workspaces/:id/work-schedule` has TWO readers on the planner: the
 * "Darken non-working hours" switch below, and frame `13:28`'s **Holidays**
 * calendar (§V2-14d), which draws the same `holidays` rows as chips and is on
 * by default. The page asks for the schedule when EITHER wants it — one query,
 * one condition, which is correct and is what the planner page says it does.
 *
 * The first check of the darkening group reads "the page has not even asked
 * for the work schedule", and that sentence is only evidence about THIS switch
 * while the other reader is quiet. With Holidays on, the request is the
 * Holidays calendar's and the check was measuring a feature it is not about.
 * Turning it off in the fixture is what keeps the clause meaning what it says:
 * a reader that never asks for the schedule cannot be honouring it.
 *
 * It costs the dimming nothing — `nonWorking()` reads `workSchedule.holidays`
 * whether or not the Holidays CALENDAR is drawn — so the Tuesday holiday below
 * is still expected to dim.
 */
let settings = { weekStart: 'monday', hiddenCalendarIds: ['workspace:holidays'] }
/** Every planner request the page made, so a reader can be proved to have read. */
const calls = []
/** Every POST /blocks body, for the personal-event half. */
const posted = []

const envelope = (data) => JSON.stringify({ data, error: null })
const browser = await chromium.launch(LAUNCH)

/** One `ctx.route` handler, shared by both contexts this suite opens. */
const install = async (ctx, state) => {
  await ctx.route('**/api/**', async (route) => {
    const req = route.request()
    const url = req.url()
    calls.push({ method: req.method(), url })
    const reply = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: envelope(data) })
    if (url.includes('/users/me')) return reply(USER)
    if (url.includes('/work-schedule')) return reply(SCHEDULE)
    if (url.includes('/planner/') && url.includes('/settings')) {
      // A MUTABLE stub. A stub that accepts a write and keeps answering with
      // the old value makes the page write, re-read, see no change and revert.
      if (req.method() === 'PATCH') {
        Object.assign(state, JSON.parse(req.postData() ?? '{}'))
        return reply(state)
      }
      return reply(state)
    }
    if (url.includes('/planner/') && url.includes('/blocks')) {
      if (req.method() === 'POST') {
        let body = null
        try { body = JSON.parse(req.postData() ?? '{}') } catch { body = { parseFailed: true } }
        posted.push(body)
        return reply({ id: `new-${posted.length}` })
      }
      return reply(BLOCKS)
    }
    if (url.includes('/lists/workspace/')) return reply([{ id: 'L1', name: `List one ${TAG}` }])
    if (url.includes('/priorities')) return reply([])
    if (/\/tasks\/workspace\/[^/]+\/members\//.test(url)) return reply([])
    return reply([])
  })
}

/** Bring the tall 24-hour grid home; a column's top is usually above the fold. */
const scrollGridHome = async (page) => {
  await page.evaluate(() => {
    let el = document.querySelector('[data-testid="planner-day-column"]')?.parentElement
    while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement
    if (el) el.scrollTop = 0
  })
  await page.waitForTimeout(150)
}

try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' })
  await ctx.addInitScript(
    ([k, v, vk]) => {
      window.localStorage.setItem(k, v)
      window.localStorage.setItem('rundesk.plannerView', vk)
    },
    ['rundesk.auth', JSON.stringify(SESSION), 'week'],
  )
  await install(ctx, settings)

  const page = await ctx.newPage()
  await page.goto(`${BASE}/app/${WS}/calendar`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="planner-page"]', { timeout: 20_000 })

  const openSettings = async (nav) => {
    if ((await page.locator('[data-testid="planner-settings-dialog"]').count()) === 0) {
      await page.locator('[data-testid="planner-settings"]').click()
      await page.waitForSelector('[data-testid="planner-settings-dialog"]', { timeout: 10_000 })
    }
    await page.locator(`[data-testid="planner-settings-nav-${nav}"]`).click()
  }
  const closeSettings = async () => {
    await page.keyboard.press('Escape')
    await waitUntil(async () => (await page.locator('[data-testid="planner-settings-dialog"]').count()) === 0)
  }
  const weekNumbers = () => page.locator('[data-testid="planner-week-number"]')
  const dims = () => page.locator('[data-testid="planner-nonworking"]')
  const projected = () => page.locator('[data-testid="planner-recurring-block"]')
  const realBlocks = () => page.locator('[data-testid="planner-block"]')

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Show week numbers — "in the header beside the month", week view only')

  chk(
    (await weekNumbers().count()) === 0,
    'the header carries no week number to begin with',
    'a week number was already there, so turning the setting on would prove nothing',
  )

  await openSettings('appearance')
  await page.locator('[data-testid="planner-show-week-numbers"]').click()
  const numberArrived = await waitUntil(async () => (await weekNumbers().count()) === 1, { timeoutMs: 8000 })
  const shown = await weekNumbers().first().getAttribute('data-week')
  const expectedWeek = isoWeek(now)
  chk(
    numberArrived && Number(shown) === expectedWeek,
    `turning it on puts THIS week's number in the header (ISO week ${expectedWeek})`,
    `the header showed ${JSON.stringify(shown)} where ISO-8601 says ${expectedWeek} — a number ` +
      'in the right place saying the wrong thing is worse than no number',
  )

  /*
   * "Only visible for the week view" is the helper text's second sentence, and
   * it is a requirement rather than a note: over a single Day column the number
   * is a different claim, and over a Month grid it is simply wrong.
   */
  await closeSettings()
  await page.getByTestId('planner-view-day').click()
  chk(
    await waitUntil(async () => (await weekNumbers().count()) === 0, { timeoutMs: 8000 }),
    'and Day view draws none of it, as the frame’s own helper text requires',
    `Day view still showed ${await weekNumbers().count()} week numbers`,
  )
  await page.getByTestId('planner-view-month').click()
  chk(
    await waitUntil(async () => (await weekNumbers().count()) === 0, { timeoutMs: 8000 }),
    'nor does Month, which spans five of them',
    `Month view showed ${await weekNumbers().count()} week numbers`,
  )
  await page.getByTestId('planner-view-week').click()
  await waitUntil(async () => (await weekNumbers().count()) === 1, { timeoutMs: 8000 })

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Darken non-working hours — the WORKSPACE schedule, not the weekend')

  chk(
    (await dims().count()) === 0 && !calls.some((c) => c.url.includes('/work-schedule')),
    'nothing is dimmed, and the page has not even asked for the work schedule',
    `${await dims().count()} dimmed columns before the switch, and ` +
      `${calls.filter((c) => c.url.includes('/work-schedule')).length} schedule requests`,
  )

  await openSettings('appearance')
  await page.locator('[data-testid="planner-darken-non-working"]').click()
  await closeSettings()
  await scrollGridHome(page)

  const columnDays = await page
    .locator('[data-testid="planner-day-column"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-day')))
  /*
   * Expected from the CALENDAR, not from the app: a day is non-working when
   * its ISO weekday is outside `workDays`, or when it is the holiday. Computed
   * here from the dates the columns say they are for.
   */
  const expectedDim = columnDays.filter((key) => {
    const [y, m, d] = key.split('-').map(Number)
    const js = new Date(y, m - 1, d)
    const iso = js.getDay() === 0 ? 7 : js.getDay()
    return !WORK_DAYS.includes(iso) || key === HOLIDAY
  })
  const dimmedArrived = await waitUntil(
    async () => (await dims().count()) === expectedDim.length,
    { timeoutMs: 10_000 },
  )
  const dimmedDays = await dims().evaluateAll((els) => els.map((el) => el.getAttribute('data-day')))
  chk(
    dimmedArrived && JSON.stringify(dimmedDays) === JSON.stringify(expectedDim),
    `exactly the ${expectedDim.length} days outside the schedule are dimmed, and they are the right ones`,
    `dimmed ${JSON.stringify(dimmedDays)}, expected ${JSON.stringify(expectedDim)}`,
  )

  /*
   * THE CHECK THAT SEPARATES THIS FROM THE WEEKEND SHADING the grid has always
   * had. Thursday is an ordinary weekday and is outside this workspace's
   * schedule; Monday is inside it. A reader that had simply reused the weekend
   * class would dim neither, and would still pass a count of "some columns are
   * dimmed" on a five-day team.
   */
  const thursday = dayKey(addDays(MONDAY, 3))
  const monday = dayKey(MONDAY)
  chk(
    dimmedDays.includes(thursday) && !dimmedDays.includes(monday),
    'a Thursday outside the schedule is dimmed while the Monday inside it is not — ' +
      'this is the schedule, not the weekend',
    `Thursday ${thursday} dimmed: ${dimmedDays.includes(thursday)}; Monday ${monday} dimmed: ` +
      `${dimmedDays.includes(monday)}`,
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Show recurring — the occurrences after the one that exists')

  const projectedDays = await projected().evaluateAll((els) =>
    els.map((el) => (el.getAttribute('data-starts-at') ?? '')),
  )
  const projectedKeys = projectedDays.map((iso) => dayKey(new Date(iso))).sort()
  const expectedProjected = columnDays.filter((k) => k !== dayKey(MONDAY)).sort()
  chk(
    projectedKeys.length === expectedProjected.length &&
      JSON.stringify(projectedKeys) === JSON.stringify(expectedProjected),
    'a daily-recurring block is projected onto every later day of the week, and only those',
    `projections landed on ${JSON.stringify(projectedKeys)}, expected ${JSON.stringify(expectedProjected)}`,
  )

  const realBefore = await realBlocks().count()
  await openSettings('timeBlocking')
  await page.locator('[data-testid="planner-show-recurring"]').click()
  const projectionsGone = await waitUntil(async () => (await projected().count()) === 0, { timeoutMs: 8000 })
  chk(
    projectionsGone && (await realBlocks().count()) === realBefore,
    'turning it off removes every projection and leaves the real blocks alone',
    `${await projected().count()} projections remained, and the real blocks went from ` +
      `${realBefore} to ${await realBlocks().count()}`,
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Colour tasks by LIST — the fourth option the select never offered')

  await openSettings('appearance')
  const colourOptions = await page.locator('[data-testid="planner-color-by"] option').evaluateAll((els) =>
    els.map((el) => el.getAttribute('value')),
  )
  const toneOf = (id) =>
    page.locator(`[data-testid="planner-block"][data-block-id="${id}"]`).getAttribute('class')
  const neutral = await toneOf('b-l1')
  await page.locator('[data-testid="planner-color-by"]').selectOption('list')
  const recoloured = await waitUntil(async () => (await toneOf('b-l1')) !== neutral, { timeoutMs: 8000 })
  chk(
    colourOptions.includes('list') && recoloured,
    'the picker offers `list`, and choosing it repaints the grid',
    `the options were ${JSON.stringify(colourOptions)} and the block kept the class ` +
      `${JSON.stringify(neutral)} — the server has accepted this value the whole time`,
  )

  const l1a = await toneOf('b-rec')
  const l1b = await toneOf('b-l1')
  const l2 = await toneOf('b-l2')
  chk(
    l1a === l1b && l1a !== l2,
    'two blocks on one list match, and a block on another list does not',
    `list L1 drew ${JSON.stringify(l1a)} and ${JSON.stringify(l1b)}, list L2 drew ${JSON.stringify(l2)}`,
  )
  await page.locator('[data-testid="planner-color-by"]').selectOption('none')
  await closeSettings()

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Save personal events quickly — the confirmation step it skips')

  await scrollGridHome(page)
  const column = page.locator('[data-testid="planner-day-column"]').first()
  const newEvent = async (title) => {
    // Re-measured every time: the grid is re-rendered between the two events
    // and a box captured before a toggle is a box from a different layout.
    const box = await column.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + 140)
    await page.waitForSelector('[data-testid="planner-event-title"]', { timeout: 8000 })
    await page.locator('[data-testid="planner-event-title"]').fill(title)
    await page.locator('[data-testid="planner-event-title"]').press('Enter')
  }

  const before = posted.length
  await newEvent(`Lunch ${TAG}`)
  const savedQuickly = await waitUntil(() => posted.length === before + 1, { timeoutMs: 8000 })
  const sent = posted.at(-1)
  chk(
    savedQuickly && sent?.title === `Lunch ${TAG}` && !sent?.taskId,
    'with the switch on, Enter posts the personal event — a title, no task',
    `the page sent ${JSON.stringify(sent ?? null)} after ${posted.length - before} posts`,
  )
  chk(
    (await page.locator('[data-testid="planner-event-confirm"]').count()) === 0,
    'and never asked to confirm it',
    'a confirmation appeared while the switch that removes it was on',
  )

  await openSettings('appearance')
  await page.locator('[data-testid="planner-save-personal-quickly"]').click()
  await closeSettings()
  await scrollGridHome(page)

  const beforeOff = posted.length
  await newEvent(`School run ${TAG}`)
  const asked = await waitUntil(
    async () => (await page.locator('[data-testid="planner-event-confirm"]').count()) === 1,
    { timeoutMs: 8000 },
  )
  chk(
    asked && posted.length === beforeOff,
    'with it off, Enter asks instead — and nothing has been posted yet',
    `confirm elements: ${await page.locator('[data-testid="planner-event-confirm"]').count()}, ` +
      `posts since: ${posted.length - beforeOff} (a confirmation that posts anyway is decoration)`,
  )

  await page.locator('[data-testid="planner-event-save"]').click()
  const confirmedSave = await waitUntil(() => posted.length === beforeOff + 1, { timeoutMs: 8000 })
  chk(
    confirmedSave && posted.at(-1)?.title === `School run ${TAG}`,
    'and confirming it posts the same event the draft was holding',
    `the page sent ${JSON.stringify(posted.at(-1) ?? null)}`,
  )

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n▶ §V2-15a Grid size, frame `14:05` — the first control on this page')

  /*
   * The ledger had `M | Appearance: Grid size`. Frame `14:05` puts it ABOVE
   * Event style with three previews — Default · Large · XL — under "Choose how
   * large events and time slots appear in the grid".
   *
   * IT IS MEASURED ON THE GRID, not on the button. A three-way picker that
   * remembers its choice and changes nothing is the easiest facade in this
   * audit to build, and the one the clip-setup panel's fourteen checks were
   * written to avoid; the same rule applies here.
   */
  await openSettings('appearance')
  const sizeIds = await page
    .locator('[data-testid="planner-settings-appearance"] [data-testid^="planner-grid-size-"]:not([data-testid*="preview"])')
    .evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute('data-testid'),
        px: Number(el.getAttribute('data-hour-px')),
        pressed: el.getAttribute('aria-pressed') === 'true',
      })),
    )
  chk(
    JSON.stringify(sizeIds.map((s) => s.id)) ===
      JSON.stringify(['planner-grid-size-default', 'planner-grid-size-large', 'planner-grid-size-xl']) &&
      sizeIds.filter((s) => s.pressed).length === 1 &&
      sizeIds[0].pressed,
    'it offers the frame\'s three sizes in the frame\'s order, with exactly one chosen',
    `the row held ${JSON.stringify(sizeIds)} — frame \`14:05\` draws Default, Large, XL`,
  )

  /*
   * The hour row's real height, taken from the GAP BETWEEN TWO CONSECUTIVE
   * hour labels rather than from a style attribute. A style says what was
   * asked for; the gap says what was drawn.
   */
  const hourGap = async () => {
    const tops = await page
      .locator('[data-testid="planner-hour-label"]')
      .evaluateAll((els) => els.slice(0, 3).map((el) => el.getBoundingClientRect().y))
    return tops.length >= 2 ? Math.round(tops[1] - tops[0]) : 0
  }
  await closeSettings()
  const defaultGap = await hourGap()

  await openSettings('appearance')
  await page.locator('[data-testid="planner-grid-size-large"]').click()
  await closeSettings()
  const grew = await waitUntil(async () => (await hourGap()) > defaultGap, { timeoutMs: 8000 })
  const largeGap = await hourGap()
  chk(
    grew && largeGap > defaultGap,
    `choosing Large makes an hour taller on the real grid — ${defaultGap}px became ${largeGap}px`,
    `the hour row measured ${defaultGap}px before and ${largeGap}px after; a size picker that ` +
      'changes no pixel is the mirror defect with a preview drawn on it',
  )

  /*
   * AND THE NUMBER THE SWATCH ADVERTISES IS THE NUMBER THE GRID USED.
   *
   * `data-hour-px` comes from `GRID_SIZES`, which the control and the planner
   * both import from one declaration. If somebody ever gives the page its own
   * copy of those numbers — the duplicated-list defect, with integers instead
   * of strings — the picker would go on looking right while setting a size the
   * grid does not draw, and only this comparison would notice.
   */
  const largeDeclared = sizeIds.find((s) => s.id === 'planner-grid-size-large')?.px
  chk(
    Number.isFinite(largeDeclared) && largeGap === largeDeclared,
    `and it is the size the swatch advertises — ${largeDeclared}px declared, ${largeGap}px drawn`,
    `the swatch declared ${largeDeclared}px and the grid drew ${largeGap}px — the control and its ` +
      'reader are meant to share one definition of what "Large" means',
  )

  await ctx.close()

  // ───────────────────────────────────────────────────────────────────────────
  /*
   * "Always open at the start of the week" is about the moment the planner
   * OPENS, so it needs its own load rather than a toggle on a page already
   * open. Day view, because Week and Month draw the whole span whatever the
   * anchor is — the setting is real there too and invisible, which is not the
   * same as broken.
   *
   * THE WEEK START IS CHOSEN SO IT IS NEVER TODAY. With a fixed start day this
   * check is vacuous one day in seven — "lands on the week start" and "lands
   * on today" are the same assertion on that day, and both would pass with the
   * reader deleted.
   */
  console.log('\n▶ Always open at the start of the week — on the load, not on the toggle')
  const WEEK_START_NAME = now.getDay() === 0 ? 'monday' : now.getDay() === 1 ? 'saturday' : 'sunday'
  const WEEK_START_NUM = { sunday: 0, monday: 1, saturday: 6 }[WEEK_START_NAME]
  const expectedStart = dayKey(startOfWeek(now, WEEK_START_NUM))

  const dayColumnKey = async (state) => {
    const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' })
    await ctx2.addInitScript(
      ([k, v]) => {
        window.localStorage.setItem(k, v)
        window.localStorage.setItem('rundesk.plannerView', 'day')
      },
      ['rundesk.auth', JSON.stringify(SESSION)],
    )
    await install(ctx2, state)
    const p2 = await ctx2.newPage()
    await p2.goto(`${BASE}/app/${WS}/calendar`, { waitUntil: 'networkidle' })
    await p2.waitForSelector('[data-testid="planner-day-column"]', { timeout: 20_000 })
    /*
     * SETTLED, NOT SAMPLED. The anchor moves when the settings land, which is
     * after mount — so reading the column the instant it exists reads the
     * value from before the setting was known, and the "on" case would fail
     * against a working reader on a slow machine. Two agreeing reads 300ms
     * apart, which is the same shape as `waitUntil` for a value rather than
     * for a condition.
     */
    const read = () => p2.locator('[data-testid="planner-day-column"]').first().getAttribute('data-day')
    let key = await read()
    for (let i = 0; i < 20; i += 1) {
      await p2.waitForTimeout(300)
      const again = await read()
      if (again === key && i >= 1) break
      key = again
    }
    await ctx2.close()
    return key
  }

  const offKey = await dayColumnKey({ weekStart: WEEK_START_NAME, alwaysOpenAtStartOfWeek: false })
  chk(
    offKey === dayKey(now),
    'with the setting off the planner opens on today, as it always has',
    `it opened on ${offKey}, and today is ${dayKey(now)}`,
  )

  const onKey = await dayColumnKey({ weekStart: WEEK_START_NAME, alwaysOpenAtStartOfWeek: true })
  chk(
    onKey === expectedStart && onKey !== dayKey(now),
    `with it on the planner opens on the start of the week (${expectedStart}), not on today`,
    `it opened on ${onKey}; the week starts on ${WEEK_START_NAME} (${expectedStart}) and today is ${dayKey(now)}`,
  )
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
