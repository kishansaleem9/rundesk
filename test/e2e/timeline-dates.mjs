/**
 * A BAR ON A TIMELINE MOVES A TASK'S DATES ONLY WHEN IT IS DRAGGED, BY WHOLE
 * DAYS, KEEPING THEIR TIMES; A DATE-ONLY DAY IS DRAWN AS THAT DAY IN ANY ZONE;
 * A BAR IS OFFERED ONLY TO WHOEVER MAY CHANGE ITS TASK; AND A REFUSED DRAG IS
 * SAID IN THE SERVER'S WORDS.
 *
 * NOT A FRAME ROW: `found-5-oct/timeline-press-moves-dates` and
 * `found-30-sep/timeline-drags-refused-silently`, both reproduced on lane 4 on
 * 5 October and on lane 5 on 6 October.
 *
 *   · The workspace timeline saved `startOfDay` of each date on every mouseup,
 *     moved or not: a press on a task due 9 October 17:30 left it due at
 *     midnight, and in Los Angeles a press on a date-only task of 12–14 October
 *     moved it to 11–13 October. A drag dropped the times, gave a task with only
 *     a due date a start, and the handles dropped the time of the date they
 *     moved.
 *   · The list's Gantt sent `yyyy-MM-dd`, so a drag of a task of 16 October
 *     09:00 to 17 October 15:00 saved 17 and 18 October at midnight; and it drew
 *     `startOfDay` of each instant, so in Los Angeles a date-only task of 19–21
 *     October read "Oct 18 – Oct 20" and a day's drag of it saved nothing.
 *   · A drag the server refused snapped back, or the bar vanished, without a
 *     word (the reason reached only the console), and the drag and both handles
 *     were offered to a member who may only view the list.
 *
 * And what the review of that work found, measured on lane 5 on 6 October:
 *
 *   · The timeline asked each LIST what the reader may do, so a member or a
 *     guest given a task at Edit, in a list they may only view, was offered no
 *     drag, while the PATCH took it from them (200): the write rule reads a
 *     share on the task first. Each task now carries the write rule's answer.
 *   · Every pixel of travel was rounded to days: at Auto fit, three pixels a
 *     day, a press with two pixels of tremor moved a task a day. A press is a
 *     press now until the mouse has travelled as far as on the list's Gantt.
 *   · The list's Calendar and Table read a date-only day as the local day of its
 *     UTC midnight, so in Los Angeles a task due the 19th was drawn on the 18th
 *     while the Gantt drew it on the 19th; and a Calendar drop wrote `yyyy-MM-dd`,
 *     dropping a task's time as the Gantt's drag had.
 *
 * ClickUp (help centre, "Rescheduling dependencies"): "To reschedule tasks from
 * a Gantt view, you can drag and drop a task to an earlier or later date, or
 * click and drag the right end of a task to adjust the due date." And
 * ("Permissions in detail") View changes nothing.
 *
 * Measured in three zones, a browser each: UTC, America/Los_Angeles (west) and
 * Asia/Karachi (east). Every date is read back by SQL.
 *
 *   node test/e2e/timeline-dates.mjs --api 3011 --dist apps/web/dist
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 17

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
/** West of UTC, UTC, and east of it. In October 2026 Los Angeles is UTC−7 and Karachi UTC+5. */
const ZONES = ['UTC', 'America/Los_Angeles', 'Asia/Karachi']

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `tld${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`, status 0 when nothing answers (lib/fixture.mjs's one client). */
const apiAs = apiAsAt(API)
let sql = null
let WS = null
let A = null
let browser = null

/** A calendar day `n` days after `ymd`, as `YYYY-MM-DD`. */
const addDaysYmd = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
const iso = (v) => (v == null ? null : new Date(v).toISOString())

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — every date is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  /* A refused write stops the suite, naming what could not be staged. */
  const must = (what, res) => {
    if (!res.ok) throw new Error(`could not ${what}: ${said(res)}`)
    return res.data
  }
  WS = must('make the workspace', await A('/workspaces', { method: 'POST', body: { name: TAG } }))?.id
  const space = async (name, level) =>
    must(`make the ${name} space`, await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(level ? { defaultPermission: level } : {}) } }))?.id
  const FULL = await space('full')
  const VIEW = await space('view', 'view')
  /** A project and a list in it, their ids. */
  const place = async (spaceId, name) => {
    const project = must(`make the ${name} project`, await A('/projects', { method: 'POST', body: { spaceId, name: `${TAG} ${name}` } }))?.id
    const list = must(`make the ${name} list`, await A('/lists', { method: 'POST', body: { projectId: project, name: `${TAG} ${name}` } }))?.id
    if (!project || !list) throw new Error(`the ${name} project or list came back without an id`)
    return { project, list }
  }
  const task = async (listId, title, startDate, dueDate) =>
    must(`make the task ${title}`, await A('/tasks', { method: 'POST', body: { listId, title, ...(startDate ? { startDate } : {}), ...(dueDate ? { dueDate } : {}) } }))?.id
  const rowOf = async (id) => {
    const [r] = await sql`select start_date, due_date, is_archived from tasks where id = ${id}`
    return r ? { start: iso(r.start_date), due: iso(r.due_date), binned: r.is_archived } : null
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  // Section 9's and 10's reads, one browser each.
  const timelineFar = []
  const ganttFar = []
  const dstLabel = []

  // The member, and what each zone's browser works on.
  const memberEmail = `${TAG}-member@rundesk.invalid`
  const memberPassword = 'TimelineDates@12345!'
  const memberId = (await signUpApi(API, { fullName: 'Timeline reader', email: memberEmail, password: memberPassword, organizationName: `Timeline ${stamp}`, organizationSlug: `timeline-${stamp}` }))?.user?.id
  must('add the member', await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email: memberEmail, role: 'member' } }))
  // A guest, who holds only what is shared with them.
  const guestEmail = `${TAG}-guest@rundesk.invalid`
  const guestId = (await signUpApi(API, { fullName: 'Timeline guest', email: guestEmail, password: memberPassword, organizationName: `Timeline guest ${stamp}`, organizationSlug: `timeline-guest-${stamp}` }))?.user?.id
  must('add the guest', await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email: guestEmail, role: 'guest' } }))
  if (!memberId || !guestId) throw new Error('the member or the guest came back without an id')

  const TIMED = { start: '2026-10-07T09:00:00.000Z', due: '2026-10-09T17:30:00.000Z' }
  const DATE_ONLY = { start: '2026-10-12T00:00:00.000Z', due: '2026-10-14T00:00:00.000Z' }
  const work = {}
  for (const zone of ZONES) {
    const tl = await place(FULL, `timeline ${zone}`)
    const gantt = await place(FULL, `gantt ${zone}`)
    work[zone] = {
      tl,
      gantt,
      pressTimed: await task(tl.list, `${TAG} press timed ${zone}`, TIMED.start, TIMED.due),
      pressDateOnly: await task(tl.list, `${TAG} press date-only ${zone}`, DATE_ONLY.start, DATE_ONLY.due),
      dragTimed: await task(tl.list, `${TAG} drag timed ${zone}`, TIMED.start, TIMED.due),
      dragDateOnly: await task(tl.list, `${TAG} drag date-only ${zone}`, DATE_ONLY.start, DATE_ONLY.due),
      dragDueOnly: await task(tl.list, `${TAG} drag due-only ${zone}`, null, '2026-10-15T17:30:00.000Z'),
      leftHandle: await task(tl.list, `${TAG} left handle ${zone}`, TIMED.start, TIMED.due),
      rightHandle: await task(tl.list, `${TAG} right handle ${zone}`, TIMED.start, TIMED.due),
      ganttTimedTitle: `${TAG} gantt timed ${zone}`,
      ganttDateTitle: `${TAG} gantt date-only ${zone}`,
    }
    work[zone].ganttTimed = await task(gantt.list, work[zone].ganttTimedTitle, '2026-10-16T09:00:00.000Z', '2026-10-17T15:00:00.000Z')
    work[zone].ganttDateOnly = await task(gantt.list, work[zone].ganttDateTitle, '2026-10-19T00:00:00.000Z', '2026-10-21T00:00:00.000Z')
  }
  const viewPlace = await place(VIEW, 'view-only')
  const fullPlace = await place(FULL, 'refused')
  const viewTask = await task(viewPlace.list, `${TAG} view-only`, TIMED.start, TIMED.due)
  const editTask = await task(fullPlace.list, `${TAG} editable`, TIMED.start, TIMED.due)
  const binnedTask = await task(fullPlace.list, `${TAG} binned meanwhile`, TIMED.start, TIMED.due)
  // Given at Edit, each in a list its person may only view: the member's in the view-only space, the guest's
  // in a list of the Full edit space, where a guest holds nothing that is not shared with them.
  const sharedTask = await task(viewPlace.list, `${TAG} shared with the member`, TIMED.start, TIMED.due)
  const guestPlace = await place(FULL, 'guest')
  const guestTask = await task(guestPlace.list, `${TAG} shared with the guest`, TIMED.start, TIMED.due)
  must('share a task with the member at Edit', await A(`/shares/task/${sharedTask}`, { method: 'POST', body: { userId: memberId, level: 'edit' } }))
  must('share a task with the guest at Edit', await A(`/shares/task/${guestTask}`, { method: 'POST', body: { userId: guestId, level: 'edit' } }))
  // A task beside one more than a year away, so that Auto fit draws a day in three pixels or so.
  const jitterPlace = await place(FULL, 'jitter')
  const jitterTask = await task(jitterPlace.list, `${TAG} pressed with a tremor`, TIMED.start, TIMED.due)
  await task(jitterPlace.list, `${TAG} a year on`, '2027-12-01T09:00:00.000Z', '2027-12-31T17:30:00.000Z')
  /*
   * The list's Calendar and Table, in each zone: a task due the 15th with no time and one due the 15th at
   * 17:30 UTC, in the month the zone's browser shows (the Calendar opens on the current one).
   */
  const CAL_ZONES = ['UTC', 'America/Los_Angeles']
  const monthIn = (zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit' }).format(new Date())
  const calendarWork = {}
  for (const zone of CAL_ZONES) {
    const ym = monthIn(zone)
    const cal = await place(FULL, `calendar ${zone}`)
    calendarWork[zone] = {
      ym,
      cal,
      dateOnlyTitle: `${TAG} calendar date-only ${zone}`,
      timedTitle: `${TAG} calendar timed ${zone}`,
      dateOnly: await task(cal.list, `${TAG} calendar date-only ${zone}`, null, `${ym}-15T00:00:00.000Z`),
      timed: await task(cal.list, `${TAG} calendar timed ${zone}`, null, `${ym}-15T17:30:00.000Z`),
    }
  }

  browser = await (await resolveChromium()).launch(launchOptions())
  /** A browser in `zone`, signed in as `who`, recording every PATCH of a task it sends. */
  const open = async (zone, who) => {
    const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 }, timezoneId: zone, locale: 'en-US', serviceWorkers: 'block', acceptDownloads: true })
    const page = await ctx.newPage()
    const patches = []
    page.on('request', (r) => {
      const m = /\/tasks\/([0-9a-f-]{36})$/.exec(new URL(r.url()).pathname)
      if (r.method() === 'PATCH' && m) patches.push({ id: m[1], body: r.postData() })
    })
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email, { timeout: 15_000 }).catch(() => {})
    await page.fill('input[type=password]', who.password, { timeout: 15_000 }).catch(() => {})
    await page.click('button[type=submit]', { timeout: 15_000 }).catch(() => {})
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS }).catch(() => {})
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return { ctx, page, sent: (id) => patches.filter((p) => p.id === id).map((p) => p.body) }
  }
  const toasts = (page) => page.locator('[data-sonner-toast]').filter({ visible: true }).allInnerTexts().catch(() => [])
  /** Press at a box's middle and drag `dx` pixels right in eight steps; `dx` 0 is a press. */
  const dragBy = async (page, locator, dx) => {
    // Into the chart's own scrollport first: a bar below or beside it has a box the mouse would miss.
    await locator.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {})
    const box = await locator.boundingBox({ timeout: 10_000 }).catch(() => null)
    if (!box) return false
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    if (dx !== 0) for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y)
    await page.mouse.up()
    return true
  }
  /** Until the row differs from `before`, or a while; the row then. */
  const settled = async (id, before) => {
    await waitUntil(async () => !same(await rowOf(id), before), { timeoutMs: 8000, lastLookGraceMs: 0 })
    return rowOf(id)
  }
  /** Open the workspace timeline at Day zoom, narrowed to one project; the axis it draws. */
  const openTimeline = async (page, projectId, firstBar) => {
    await page.goto(`${B}/app/${WS}/timeline`, { waitUntil: 'domcontentloaded' })
    await page.locator(`[data-testid="timeline-bar"][data-task-id="${firstBar}"]`).waitFor({ timeout: 30_000 }).catch(() => {})
    if (projectId) await page.getByTestId('timeline-project-filter').selectOption(projectId, { timeout: 10_000 }).catch(() => {})
    // The zoom is the time period's menu (`resume-defects/resume-5`).
    await page.getByTestId('timeline-period').click({ timeout: 10_000 }).catch(() => {})
    await page.getByTestId('timeline-zoom-day').click({ timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(300)
  }
  const bar = (page, id) => page.locator(`[data-testid="timeline-bar"][data-task-id="${id}"]`)
  /** The calendar day a bar's left edge is drawn on, read off the axis it is drawn against. */
  const drawnDay = async (page, id) => {
    const axis = await page.getByTestId('timeline-axis').evaluate((e) => ({ start: e.dataset.rangeStart, dayPx: Number(e.dataset.dayPx) })).catch(() => null)
    const left = await bar(page, id).evaluate((e) => parseFloat(e.style.left)).catch(() => NaN)
    return axis && Number.isFinite(left) ? addDaysYmd(axis.start, Math.round(left / axis.dayPx)) : null
  }

  // ══ 1–5. THE WORKSPACE TIMELINE, IN EACH ZONE ═════════════════════════════
  console.log('\n▶ the workspace timeline: a press, a drag and the handles, in UTC, Los Angeles and Karachi')
  const pressed = []
  const dragged = []
  const handled = []
  const drawn = []
  let exported = null
  for (const zone of ZONES) {
    const w = work[zone]
    const { ctx, page, sent } = await open(zone, ADMIN)
    await openTimeline(page, w.tl.project, w.pressTimed)
    const dayPx = await page.getByTestId('timeline-axis').evaluate((e) => Number(e.dataset.dayPx)).catch(() => 0)
    drawn.push({ zone, timed: await drawnDay(page, w.pressTimed), dateOnly: await drawnDay(page, w.pressDateOnly) })

    // A press and release on a bar, without moving.
    for (const k of ['pressTimed', 'pressDateOnly']) {
      const before = await rowOf(w[k])
      const did = await dragBy(page, bar(page, w[k]), 0)
      const anyPatch = await waitUntil(() => sent(w[k]).length > 0, { timeoutMs: 2500, lastLookGraceMs: 0 })
      pressed.push({ zone, k, did, anyPatch, before, after: await rowOf(w[k]) })
    }
    // A day's drag of the whole bar.
    for (const k of ['dragTimed', 'dragDateOnly', 'dragDueOnly']) {
      const before = await rowOf(w[k])
      const did = await dragBy(page, bar(page, w[k]), dayPx)
      dragged.push({ zone, k, did, before, after: await settled(w[k], before), sent: sent(w[k]) })
    }
    // A day's drag of each handle.
    for (const [k, handle] of [['leftHandle', 'start'], ['rightHandle', 'end']]) {
      const before = await rowOf(w[k])
      await bar(page, w[k]).hover({ timeout: 5000 }).catch(() => {})
      const did = await dragBy(page, bar(page, w[k]).locator(`[data-handle="${handle}"]`), dayPx)
      handled.push({ zone, k, did, before, after: await settled(w[k], before), sent: sent(w[k]) })
    }
    // West of UTC, what the file says of a date-only task (still the 12th to the 14th: it was only pressed).
    if (zone === 'America/Los_Angeles') {
      // The CSV is one of the Export menu's three (`resume-defects/resume-5`).
      await page.getByTestId('timeline-export-menu').click({ timeout: 10_000 }).catch(() => {})
      const download = await Promise.all([
        page.waitForEvent('download', { timeout: 20_000 }),
        page.getByTestId('timeline-export').click({ timeout: 10_000 }),
      ]).then(([d]) => d).catch(() => null)
      const file = download ? await download.path().catch(() => null) : null
      const text = file ? fs.readFileSync(file, 'utf8') : ''
      exported = text.split('\r\n').find((line) => line.includes(`press date-only ${zone}`)) ?? null
    }
    await ctx.close()
  }
  const want = {
    dragTimed: { start: '2026-10-08T09:00:00.000Z', due: '2026-10-10T17:30:00.000Z', binned: false },
    dragDateOnly: { start: '2026-10-13T00:00:00.000Z', due: '2026-10-15T00:00:00.000Z', binned: false },
    dragDueOnly: { start: null, due: '2026-10-16T17:30:00.000Z', binned: false },
    leftHandle: { start: '2026-10-08T09:00:00.000Z', due: TIMED.due, binned: false },
    rightHandle: { start: TIMED.start, due: '2026-10-10T17:30:00.000Z', binned: false },
  }
  chk(
    pressed.length === 6 && pressed.every((p) => p.did && !p.anyPatch && same(p.before, p.after)),
    'a press on a timeline bar that does not move it saves nothing: in UTC, Los Angeles and Karachi a task due at 17:30 and a date-only task keep both dates, and no PATCH is sent (read by SQL)',
    JSON.stringify(pressed.filter((p) => !(p.did && !p.anyPatch && same(p.before, p.after)))),
  )
  chk(
    dragged.length === 9 && dragged.every((d) => d.did && same(d.after, want[d.k])),
    'a dragged bar moves each date it has by whole days and keeps its time: in UTC, Los Angeles and Karachi a day’s drag moves 09:00 and 17:30 to the next day at 09:00 and 17:30, a date-only task to the next days still date-only, and a task with only a due date gains no start (read by SQL)',
    JSON.stringify(dragged.filter((d) => !(d.did && same(d.after, want[d.k])))),
  )
  chk(
    handled.length === 6 && handled.every((h) => h.did && same(h.after, want[h.k])),
    'each handle moves its own date by whole days and keeps its time: a day’s drag of the left handle starts the task at 09:00 a day later, of the right one makes it due at 17:30 a day later, the other date untouched, in UTC, Los Angeles and Karachi (read by SQL)',
    JSON.stringify(handled.filter((h) => !(h.did && same(h.after, want[h.k])))),
  )
  chk(
    drawn.length === 3 && drawn.every((d) => d.timed === '2026-10-07' && d.dateOnly === '2026-10-12'),
    'a date-only bar is drawn on its own day in every zone: a task of 12 to 14 October starts on the 12th in Los Angeles and Karachi as in UTC, and one starting 7 October 09:00 on the 7th',
    JSON.stringify(drawn),
  )
  chk(
    exported != null && exported.includes('"2026-10-12","2026-10-14","3"'),
    'and the timeline’s export says what it draws: in Los Angeles that date-only task runs from 2026-10-12 to 2026-10-14, three days',
    `the row read ${JSON.stringify(exported)}`,
  )

  // ══ 6–7. THE LIST'S GANTT, IN EACH ZONE ═══════════════════════════════════
  console.log("\n▶ the list's Gantt: a timed bar and a date-only one, drawn and dragged in UTC, Los Angeles and Karachi")
  const ganttTimed = []
  const ganttDate = []
  for (const zone of ZONES) {
    const w = work[zone]
    const { ctx, page, sent } = await open(zone, ADMIN)
    await page.goto(`${B}/app/${WS}/${FULL}/${w.gantt.project}/${w.gantt.list}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('work-view-tab-type-gantt').click({ timeout: 20_000 }).catch(() => {})
    const gbar = (title) => page.locator(`div[role="button"][aria-label="${title}"]`).first()
    await gbar(w.ganttTimedTitle).waitFor({ timeout: 20_000 }).catch(() => {})
    // The list's Gantt is the one Gantt now, its zoom the time period's menu (`resume-defects/resume-5`).
    await page.getByTestId('timeline-period').click({ timeout: 10_000 }).catch(() => {})
    await page.getByTestId('timeline-zoom-day').click({ timeout: 10_000 }).catch(() => {})
    // `waitUntil` answers whether the wait was met, so the width is read once it was.
    const dayZoomed = await waitUntil(async () => (await page.getByTestId('timeline-axis').getAttribute('data-zoom', { timeout: 2000 }).catch(() => null)) === 'day', { timeoutMs: 10_000 }).catch(() => false)
    const dayPx = dayZoomed ? Number(await page.getByTestId('timeline-axis').getAttribute('data-day-px', { timeout: 2000 }).catch(() => 0)) || null : null
    const titleBefore = await gbar(w.ganttDateTitle).getAttribute('title', { timeout: 5000 }).catch(() => null)
    // Where each bar is drawn, in Day columns: the 19th is three days after the 16th, in every zone.
    const leftOf = (title) => gbar(title).evaluate((e) => parseFloat(e.style.left)).catch(() => NaN)
    const daysApart = dayPx ? ((await leftOf(w.ganttDateTitle)) - (await leftOf(w.ganttTimedTitle))) / dayPx : NaN
    for (const [k, title, out] of [['ganttTimed', w.ganttTimedTitle, ganttTimed], ['ganttDateOnly', w.ganttDateTitle, ganttDate]]) {
      const before = await rowOf(w[k])
      // A Day column's width: a day's drag.
      const did = dayPx ? await dragBy(page, gbar(title), dayPx) : false
      out.push({ zone, did, before, after: await settled(w[k], before), sent: sent(w[k]), ...(k === 'ganttDateOnly' ? { titleBefore, daysApart } : {}) })
      await page.keyboard.press('Escape').catch(() => {})
    }
    await ctx.close()
  }
  chk(
    ganttTimed.length === 3 && ganttTimed.every((g) => g.did && same(g.after, { start: '2026-10-17T09:00:00.000Z', due: '2026-10-18T15:00:00.000Z', binned: false })),
    'the list’s Gantt moves a dragged bar by whole days and keeps its times: a task of 16 October 09:00 to 17 October 15:00, dragged a day, is 17 October 09:00 to 18 October 15:00 in UTC, Los Angeles and Karachi (read by SQL)',
    JSON.stringify(ganttTimed),
  )
  chk(
    ganttDate.length === 3 &&
      ganttDate.every((g) => g.did && /· Oct 19 – Oct 21$/.test(g.titleBefore ?? '') && g.daysApart === 3 && same(g.after, { start: '2026-10-20T00:00:00.000Z', due: '2026-10-22T00:00:00.000Z', binned: false })),
    'the list’s Gantt draws a date-only task on its own days in every zone, and a day’s drag moves it a day: 19 to 21 October reads “Oct 19 – Oct 21” and is drawn three days after the task of the 16th in Los Angeles and Karachi as in UTC, and moves to the 20th to the 22nd, still date-only (read by SQL)',
    JSON.stringify(ganttDate),
  )

  // ══ 8–10. WHO IS OFFERED A DRAG, AND WHAT A REFUSAL SAYS ══════════════════
  console.log('\n▶ a member: a list they may only view, a task put in the bin after the page loaded, and a task given them; a guest’s task given them')
  {
    const { ctx, page, sent } = await open('UTC', { email: memberEmail, password: memberPassword })
    await openTimeline(page, null, viewTask)
    // Each bar says whether it may be moved: the write rule's answer, which the timeline's read carries.
    const answered = await waitUntil(
      async () => {
        const states = await Promise.all([viewTask, editTask, binnedTask].map((id) => bar(page, id).getAttribute('data-may-edit', { timeout: 1000 }).catch(() => null)))
        return states.every((s) => s === 'true' || s === 'false')
      },
      { timeoutMs: 20_000 },
    )
    const dayPx = await page.getByTestId('timeline-axis').evaluate((e) => Number(e.dataset.dayPx)).catch(() => 0)
    const offer = async (id, on = page) => ({
      mayEdit: await bar(on, id).getAttribute('data-may-edit', { timeout: 2000 }).catch(() => null),
      handles: await bar(on, id).locator('[data-handle]').count().catch(() => -1),
    })
    const viewOffer = await offer(viewTask)
    const editOffer = await offer(editTask)
    // The view-only bar, dragged two days: where it is drawn while the mouse is down, and after.
    const viewBefore = await rowOf(viewTask)
    const leftBefore = await bar(page, viewTask).evaluate((e) => e.style.left).catch(() => null)
    await bar(page, viewTask).scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {})
    const box = await bar(page, viewTask).boundingBox({ timeout: 10_000 }).catch(() => null)
    let leftDuring = null
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2 + (2 * dayPx * i) / 8, box.y + box.height / 2)
      leftDuring = await bar(page, viewTask).evaluate((e) => e.style.left).catch(() => null)
      await page.mouse.up()
    }
    const viewPatched = await waitUntil(() => sent(viewTask).length > 0, { timeoutMs: 2500, lastLookGraceMs: 0 })
    const viewAfter = await rowOf(viewTask)
    chk(
      answered && viewOffer.mayEdit === 'false' && viewOffer.handles === 0 && !!box && leftDuring === leftBefore && !viewPatched && same(viewBefore, viewAfter)
        && editOffer.mayEdit === 'true' && editOffer.handles === 2,
      'a member who may only view a list is offered no drag on the timeline: its bar has no handles, does not move under the mouse and sends nothing, while the bar of a list they may change offers both handles',
      `answered ${answered}; view-only ${JSON.stringify(viewOffer)}, drawn at ${leftBefore} then ${leftDuring} while dragged, PATCH sent ${viewPatched}, the task ${JSON.stringify(viewBefore)} → ${JSON.stringify(viewAfter)}; editable ${JSON.stringify(editOffer)}`,
    )

    // A task the member may change, put in the bin by the admin after the page loaded, then dragged.
    const binned = await A(`/tasks/${binnedTask}`, { method: 'DELETE' })
    const binnedBefore = await rowOf(binnedTask)
    const answer = page
      .waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname.endsWith(`/tasks/${binnedTask}`), { timeout: 15_000 })
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        return { status: r.status(), words: String(body?.error?.message ?? body?.message ?? '') }
      })
      .catch(() => ({ status: null, words: '' }))
    const did = await dragBy(page, bar(page, binnedTask), dayPx)
    const refused = await answer
    let toast = ''
    await waitUntil(async () => (toast = (refused.words && (await toasts(page)).find((s) => s.includes(refused.words))) || '').length > 0, { timeoutMs: 10_000 })
    const binnedAfter = await rowOf(binnedTask)
    chk(
      binned.ok && did && refused.status === 409 && refused.words.length > 0 && toast.length > 0
        && binnedAfter?.start === TIMED.start && binnedAfter?.due === TIMED.due,
      'a timeline drag the server refuses is said in its words: a task put in the bin after the page loaded is refused (409), the toast carries the server’s sentence, and the task keeps its dates (read by SQL)',
      `binning answered ${said(binned)}; the PATCH answered ${refused.status ?? 'nothing'} saying ${JSON.stringify(refused.words)}; the toasts read ${JSON.stringify(await toasts(page))}; the task ${JSON.stringify(binnedBefore)} → ${JSON.stringify(binnedAfter)}`,
    )

    /*
     * The refusal reads the rows again, which takes the binned bar away and moves each row under it up
     * one. The next press waits for that: read between the bar's box and the press, the press landed
     * where the shared bar had been and panned the chart (rehearsal 22, late in the full job).
     */
    await waitUntil(async () => (await bar(page, binnedTask).count()) === 0, { timeoutMs: 10_000 })

    // The member's own share: a task given them at Edit, in the list they may only view.
    const sharedOffer = await offer(sharedTask)
    const sharedBefore = await rowOf(sharedTask)
    const sharedDid = await dragBy(page, bar(page, sharedTask), dayPx)
    const sharedAfter = await settled(sharedTask, sharedBefore)
    await ctx.close()

    // The guest, who holds only the task given them at Edit.
    const g = await open('UTC', { email: guestEmail, password: memberPassword })
    await openTimeline(g.page, null, guestTask)
    const guestDayPx = await g.page.getByTestId('timeline-axis').evaluate((e) => Number(e.dataset.dayPx)).catch(() => 0)
    const guestOffer = await offer(guestTask, g.page)
    const guestBefore = await rowOf(guestTask)
    const guestDid = await dragBy(g.page, bar(g.page, guestTask), guestDayPx)
    const guestAfter = await settled(guestTask, guestBefore)
    await g.ctx.close()
    const movedADay = { start: '2026-10-08T09:00:00.000Z', due: '2026-10-10T17:30:00.000Z', binned: false }
    chk(
      sharedOffer.mayEdit === 'true' && sharedOffer.handles === 2 && sharedDid && same(sharedAfter, movedADay)
        && guestOffer.mayEdit === 'true' && guestOffer.handles === 2 && guestDid && same(guestAfter, movedADay),
      'a person whose own share on a task lets them change it is offered its drag on the timeline, whatever its list allows them: a member given a task at Edit in a list they may only view, and a guest given one at Edit, each find both handles, and a day’s drag moves the task a day (read by SQL)',
      `the member's shared task ${JSON.stringify(sharedOffer)}, dragged ${sharedDid}: ${JSON.stringify(sharedBefore)} → ${JSON.stringify(sharedAfter)}; ` +
        `the guest's ${JSON.stringify(guestOffer)}, dragged ${guestDid}: ${JSON.stringify(guestBefore)} → ${JSON.stringify(guestAfter)}`,
    )
  }

  // ══ 11. A PRESS WITH A TREMOR IS A PRESS ═════════════════════════════════
  console.log('\n▶ a press whose mouse moves a pixel or two, at Auto fit')
  {
    const { ctx, page, sent } = await open('UTC', ADMIN)
    await openTimeline(page, jitterPlace.project, jitterTask)
    await page.getByTestId('timeline-autofit').click({ timeout: 10_000 }).catch(() => {})
    await page.waitForTimeout(500)
    const fitDayPx = await page.getByTestId('timeline-axis').evaluate((e) => Number(e.dataset.dayPx)).catch(() => 0)
    const before = await rowOf(jitterTask)
    const target = bar(page, jitterTask)
    await target.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {})
    const box = await target.boundingBox({ timeout: 10_000 }).catch(() => null)
    if (box) {
      // Two pixels of travel: at three pixels a day, rounded, the two thirds of a day it is.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2)
      await page.mouse.up()
    }
    const anyPatch = await waitUntil(() => sent(jitterTask).length > 0, { timeoutMs: 2500, lastLookGraceMs: 0 })
    const after = await rowOf(jitterTask)
    await ctx.close()
    chk(
      fitDayPx > 0 && fitDayPx < 4 && !!box && !anyPatch && same(before, after),
      'a press whose mouse moves a pixel or two is a press: at Auto fit, a day under four pixels, a press on a bar with two pixels of travel sends nothing and the task keeps its dates (read by SQL)',
      `a day drawn in ${fitDayPx}px; the bar ${box ? 'pressed' : 'not found'}; PATCH sent ${anyPatch} (${JSON.stringify(sent(jitterTask))}); the task ${JSON.stringify(before)} → ${JSON.stringify(after)}`,
    )
  }

  // ══ 12. THE LIST'S CALENDAR AND TABLE, IN UTC AND LOS ANGELES ════════════
  console.log("\n▶ the list's Calendar and Table: a date-only day drawn and dropped as that day, and a drop that keeps the time")
  {
    /** An instant as `YYYY-MM-DD HH:mm` on the clock of `zone`. */
    const onClock = (v, zone) => {
      if (!v) return null
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(v)).map((p) => [p.type, p.value]))
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
    }
    const results = []
    for (const zone of CAL_ZONES) {
      const c = calendarWork[zone]
      const { ctx, page } = await open(zone, ADMIN)
      await page.goto(`${B}/app/${WS}/${FULL}/${c.cal.project}/${c.cal.list}`, { waitUntil: 'domcontentloaded' })
      // The Table's due label of the date-only task.
      await page.getByTestId('work-view-tab-type-table').click({ timeout: 20_000 }).catch(() => {})
      const tableDue = page.locator(`[data-testid="list-table-row"][data-task-id="${c.dateOnly}"]`).getByTestId('list-table-due-button').filter({ visible: true })
      await tableDue.waitFor({ timeout: 20_000 }).catch(() => {})
      const tableLabel = (await tableDue.innerText({ timeout: 5000 }).catch(() => '')).trim()
      // The Calendar: the day cell each task is drawn in, by the cell's own day number.
      await page.getByTestId('work-view-tab-type-calendar').click({ timeout: 20_000 }).catch(() => {})
      const chip = (title) => page.locator('[data-testid="list-calendar"] button', { hasText: title }).first()
      const cellDayOf = (title) =>
        chip(title).evaluate((el) => {
          let n = el
          for (let i = 0; i < 8 && n; i++) {
            n = n.parentElement
            const label = n ? n.querySelector(':scope > div > span.text-xs') : null
            if (!label) continue
            return label.textContent // text-read: key — the cell's day number names the cell the chip is in
          }
          return null
        }, null, { timeout: 15_000 }).catch(() => null)
      const cellOf = (dayNumber) => page.locator('[data-testid="list-calendar"] div.group\\/day').filter({ has: page.locator(':scope > div > span.text-xs', { hasText: new RegExp(`^${dayNumber}$`) }) }).first()
      const drawnBefore = { dateOnly: await cellDayOf(c.dateOnlyTitle), timed: await cellDayOf(c.timedTitle) }
      const dateOnlyBefore = await rowOf(c.dateOnly)
      await chip(c.dateOnlyTitle).dragTo(cellOf(20), { timeout: 10_000 }).catch(() => {})
      const dateOnlyAfter = await settled(c.dateOnly, dateOnlyBefore)
      const timedBefore = await rowOf(c.timed)
      await chip(c.timedTitle).dragTo(cellOf(20), { timeout: 10_000 }).catch(() => {})
      const timedAfter = await settled(c.timed, timedBefore)
      await page.waitForTimeout(500)
      const drawnAfter = { dateOnly: await cellDayOf(c.dateOnlyTitle), timed: await cellDayOf(c.timedTitle) }
      await ctx.close()
      const [y, m] = c.ym.split('-').map(Number)
      results.push({
        zone,
        tableLabel,
        wantLabel: new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        drawnBefore,
        drawnAfter,
        dateOnlyAfter: dateOnlyAfter?.due ?? null,
        wantDateOnly: `${c.ym}-20T00:00:00.000Z`,
        timedAfter: onClock(timedAfter?.due, zone),
        wantTimed: `${c.ym}-20 ${onClock(`${c.ym}-15T17:30:00.000Z`, zone).slice(11)}`,
      })
    }
    chk(
      results.length === 2 && results.every((r) => r.tableLabel === r.wantLabel && r.drawnBefore.dateOnly === '15' && r.drawnBefore.timed === '15'
        && r.dateOnlyAfter === r.wantDateOnly && r.timedAfter === r.wantTimed && r.drawnAfter.dateOnly === '20' && r.drawnAfter.timed === '20'),
      'the list’s Calendar and Table read a date-only day as that day in every zone, and a Calendar drop keeps a task’s time: in UTC and Los Angeles a task due the 15th with no time is drawn on the 15th and labelled so in the Table, and dropped on the 20th is due the 20th, still with no time; one due the 15th at 17:30 UTC, dropped on the 20th, is due the 20th at the same hour there (read by SQL)',
      JSON.stringify(results),
    )
  }

  // ══ 9. A TASK IN YEAR 202: BOTH VIEWS DRAWN IN A SECOND, THEIR FAR END REACHED ══
  console.log('\n▶ found-6-oct/timeline-and-gantt-draw-a-column-per-day — a task starting in year 202 leaves the workspace timeline and the list’s Gantt drawn in a second, and this October reached by scrolling')
  /*
   * ClickUp's Timeline has "no limit to how far you can scroll into the future
   * or past". Each view laid its span out from the earliest date and drew an
   * element for every day of it: with a task starting in year 202 the timeline
   * drew after 17.8 s with 95,834 nodes, and the Gantt after a minute with 1.5
   * million (lane 5, 6 October). Each now draws the days in view and a margin,
   * and lays the span out no wider than a browser lays anything out, so its far
   * end is where its days say. Every wait is bounded: a build that cannot draw
   * the span fails these checks in words instead of hanging the run.
   *
   * Made last, as the timeline's span is the whole workspace's and every
   * section above opens it.
   */
  const farPlace = await place(FULL, 'year 202')
  const nearTitle = `${TAG} this October`
  const nearTask = await task(farPlace.list, nearTitle, '2026-10-07T09:00:00.000Z', '2026-10-09T17:30:00.000Z')
  await task(farPlace.list, `${TAG} since year 202`, '0202-10-06T09:00:00.000Z', '2026-10-08T17:30:00.000Z')
  /** What `fn` gives within `ms`, or 'timed out'. */
  const within = (ms, fn) => Promise.race([fn(), new Promise((r) => setTimeout(() => r('timed out'), ms))])
  /** The header cell drawn under a point of the chart, its day; and whether a box is in the scroller's view. */
  const cellUnder = (page, cellSel, x, y) =>
    page.evaluate(({ cellSel, x, y }) => {
      // A drawn cell only: a hidden one keeps a box and answers innerText with its whole text.
      const cell = [...document.querySelectorAll(cellSel)].find((c) => {
        const r = c.getBoundingClientRect()
        return c.checkVisibility() && r.left <= x && x < r.right && (y == null || (r.top <= y && y < r.bottom))
      })
      return cell ? cell.dataset.day ?? cell.innerText.trim() : null
    }, { cellSel, x, y })
  const inView = (page, scrollerSel, boxSel) =>
    page.evaluate(({ scrollerSel, boxSel }) => {
      const scroller = document.querySelector(scrollerSel)
      const box = document.querySelector(boxSel)
      if (!scroller || !box) return null
      const s = scroller.getBoundingClientRect()
      const b = box.getBoundingClientRect()
      return { inView: b.right > s.left && b.left < s.right, barLeft: b.left, barTop: b.top + b.height / 2, scrollWidth: scroller.scrollWidth }
    }, { scrollerSel, boxSel })
  const nodesUnder = (page, sel) => page.evaluate((sel) => document.querySelector(sel)?.querySelectorAll('*').length ?? null, sel)
  {
    const { ctx, page } = await open('UTC', ADMIN)
    const nearBar = `[data-testid="timeline-bar"][data-task-id="${nearTask}"]`
    // The timeline, narrowed to a project of an ordinary span first: then the year-202 project is the change timed.
    await page.goto(`${B}/app/${WS}/timeline`, { waitUntil: 'domcontentloaded' })
    const opened = await within(90_000, () => page.locator(`[data-testid="timeline-bar"][data-task-id="${work.UTC.pressTimed}"]`).waitFor({ timeout: 90_000 }).then(() => true, () => false))
    await within(90_000, () => page.getByTestId('timeline-project-filter').selectOption(work.UTC.tl.project, { timeout: 90_000 }).catch(() => {}))
    let t0 = Date.now()
    await within(90_000, () => page.getByTestId('timeline-project-filter').selectOption(farPlace.project, { timeout: 90_000 }).catch(() => {}))
    const drawn = await within(90_000, () => page.locator(nearBar).waitFor({ timeout: 90_000 }).then(() => true, () => false))
    const timelineMs = Date.now() - t0
    const axis = await within(10_000, () => page.getByTestId('timeline-axis').evaluate((e) => ({ start: e.dataset.rangeStart, dayPx: e.dataset.dayPx })).catch(() => null))
    const timelineNodes = await within(10_000, () => nodesUnder(page, '[data-testid="timeline-chart-viewport"]'))
    /*
     * The Day zoom, and the span's far end: this October, the bar under its own
     * day. Read by the axis's zoom and not its px a day: a span this long is
     * narrowed to the widest a browser lays out at the Week zoom already, so the
     * two zooms draw the same px a day here, in cells of a day or of a week.
     */
    // The time period is a menu on the one chart (`resume-defects/resume-5`): it is opened before the clock
    // starts, so what is timed is the Day zoom drawn, not two presses and a menu's animation.
    await within(90_000, () => page.getByTestId('timeline-period').click({ timeout: 90_000 }).catch(() => {}))
    await within(90_000, () => page.getByTestId('timeline-zoom-day').waitFor({ state: 'visible', timeout: 90_000 }).catch(() => {}))
    t0 = Date.now()
    await within(90_000, () => page.getByTestId('timeline-zoom-day').click({ timeout: 90_000 }).catch(() => {}))
    const zoomed = await within(90_000, () => waitUntil(async () => {
      const zoom = await page.getByTestId('timeline-axis').getAttribute('data-zoom', { timeout: 1000 }).catch(() => null)
      return zoom === 'day' && (await page.locator('[data-testid="timeline-date-cell"]').count()) > 0
    }, { timeoutMs: 90_000 }))
    const dayZoomMs = Date.now() - t0
    await within(30_000, () => page.getByTestId('timeline-chart-viewport').evaluate((e) => { e.scrollLeft = e.scrollWidth }).catch(() => {}))
    let end = null
    let under = null
    await within(30_000, () => waitUntil(async () => {
      end = await inView(page, '[data-testid="timeline-chart-viewport"]', nearBar)
      under = end?.inView ? await cellUnder(page, '[data-testid="timeline-date-cell"]', end.barLeft + 2, null) : null
      return under === '2026-10-07'
    }, { timeoutMs: 20_000 }))
    timelineFar.push({ opened, drawn, timelineMs, axis, timelineNodes, zoomed, dayZoomMs, end, under })
    await ctx.close()
  }
  chk(
    timelineFar[0]?.drawn === true && timelineFar[0].timelineMs < 1000 && String(timelineFar[0].axis?.start ?? '').startsWith('202-') && timelineFar[0].timelineNodes < 5000,
    'the workspace timeline draws a project holding a task that starts in year 202 within a second of its being chosen, its span starting in year 202, with a few thousand elements at most — not one a day',
    JSON.stringify(timelineFar),
  )
  chk(
    timelineFar[0]?.zoomed === true && timelineFar[0].dayZoomMs < 1000 && timelineFar[0].end?.inView === true && timelineFar[0].under === '2026-10-07',
    'and its Day zoom is drawn within a second, and scrolled to the span’s far end shows this October: the bar of a task starting 7 October in view, under the day “2026-10-07”',
    JSON.stringify(timelineFar),
  )
  console.log(`    measured: ${JSON.stringify(timelineFar[0] ?? null)}`)
  {
    const { ctx, page } = await open('UTC', ADMIN)
    await page.goto(`${B}/app/${WS}/${FULL}/${farPlace.project}/${farPlace.list}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('work-view-tab-type-list').waitFor({ timeout: 30_000 }).catch(() => {})
    const gbarSel = `div[role="button"][aria-label="${nearTitle}"]`
    let t0 = Date.now()
    await within(90_000, () => page.getByTestId('work-view-tab-type-gantt').click({ timeout: 90_000 }).catch(() => {}))
    const drawn = await within(90_000, () => page.locator(gbarSel).first().waitFor({ timeout: 90_000 }).then(() => true, () => false))
    const firstMs = Date.now() - t0
    /*
     * TIMED AS THE TAB IS CHOSEN AGAIN, IN THE PAGE. The first choosing mounts
     * the view and, timed from here, carries Playwright's own waits before its
     * click: 1.15 s on lane 3 with a CI rehearsal on the other cores, where the
     * draw itself was a tenth of that. So the List tab, then the Gantt's again,
     * clicked and timed in the page until the bar is there: the Gantt is drawn
     * anew each time its tab is chosen, and a build that draws every day of the
     * span pays for all of them again. Timed only once the Gantt has left the
     * page: a build that drew every day took no press on the List tab within its
     * 30 s, the Gantt stayed, and the timing read a press on the tab already
     * open, 207 ms.
     */
    await within(30_000, () => page.getByTestId('work-view-tab-type-list').click({ timeout: 30_000 }).catch(() => {}))
    const left = await within(30_000, () => page.locator(gbarSel).first().waitFor({ state: 'detached', timeout: 30_000 }).then(() => true, () => false))
    const ganttMs = await within(90_000, () => page.evaluate((sel) => new Promise((resolve) => {
      const tab = document.querySelector('[data-testid="work-view-tab-type-gantt"]')
      if (!tab) { resolve(null); return }
      const t = performance.now()
      const done = () => { observer.disconnect(); resolve(Math.round(performance.now() - t)) }
      const observer = new MutationObserver(() => { if (document.querySelector(sel)) done() })
      observer.observe(document.body, { childList: true, subtree: true })
      tab.click()
      if (document.querySelector(sel)) done()
    }), gbarSel).catch(() => null))
    const scrollerOf = async () => within(10_000, () => page.locator(gbarSel).first().evaluate((e) => {
      const s = e.closest('[data-testid="timeline-chart-viewport"]')
      return s ? { nodes: s.querySelectorAll('*').length, width: s.scrollWidth } : null
    }).catch(() => null))
    const week = await scrollerOf()
    const widthOf = () => page.locator(gbarSel).first().evaluate((e) => e.getBoundingClientRect().width).catch(() => null)
    // As above: the menu opened first, the Day zoom timed.
    await within(90_000, () => page.getByTestId('timeline-period').click({ timeout: 90_000 }).catch(() => {}))
    await within(90_000, () => page.getByTestId('timeline-zoom-day').waitFor({ state: 'visible', timeout: 90_000 }).catch(() => {}))
    t0 = Date.now()
    await within(90_000, () => page.getByTestId('timeline-zoom-day').click({ timeout: 90_000 }).catch(() => {}))
    /*
     * Zoomed when the chart says so, as the timeline's section above asks it: the
     * list's Gantt is the timeline's chart now (`resume-defects/resume-5`), and a
     * span this long is narrowed to the same width a day at Week and at Day, so
     * a bar's width cannot tell the two apart.
     */
    const zoomed = await within(90_000, () => waitUntil(async () => {
      const zoom = await page.getByTestId('timeline-axis').getAttribute('data-zoom', { timeout: 1000 }).catch(() => null)
      return zoom === 'day' && (await widthOf()) != null
    }, { timeoutMs: 90_000 }))
    const dayZoomMs = Date.now() - t0
    await within(30_000, () => page.locator(gbarSel).first().evaluate((e) => { const s = e.closest('[data-testid="timeline-chart-viewport"]'); if (s) s.scrollLeft = s.scrollWidth }).catch(() => {}))
    let end = null
    let under = null
    await within(30_000, () => waitUntil(async () => {
      end = await page.locator(gbarSel).first().evaluate((e) => {
        const s = e.closest('[data-testid="timeline-chart-viewport"]')?.getBoundingClientRect()
        const b = e.getBoundingClientRect()
        return s ? { inView: b.right > s.left && b.left < s.right, barLeft: b.left } : null
      }).catch(() => null)
      under = end?.inView ? await cellUnder(page, '[data-testid="timeline-date-cell"]', end.barLeft + 2, null) : null
      return under === '2026-10-07'
    }, { timeoutMs: 20_000 }))
    ganttFar.push({ drawn, firstMs, left, ganttMs, week, zoomed, dayZoomMs, end, under })
    await ctx.close()
  }
  chk(
    ganttFar[0]?.drawn === true && ganttFar[0].left === true && typeof ganttFar[0].ganttMs === 'number' && ganttFar[0].ganttMs < 1000 && (ganttFar[0].week?.nodes ?? Infinity) < 5000,
    'the list’s Gantt of a list holding a task that starts in year 202 is drawn within a second of its tab being chosen, with a few thousand elements at most — not one a day',
    JSON.stringify(ganttFar),
  )
  chk(
    ganttFar[0]?.zoomed === true && ganttFar[0].dayZoomMs < 1000 && ganttFar[0].end?.inView === true && ganttFar[0].under === '2026-10-07',
    'and its Day zoom is drawn within a second, and scrolled to the span’s far end shows this October: the bar of a task starting 7 October in view, over the day “2026-10-07”',
    JSON.stringify(ganttFar),
  )
  console.log(`    measured: ${JSON.stringify(ganttFar[0] ?? null)}`)

  // ══ 10. A DAY'S LABEL AFTER THE CLOCK GOES BACK ══════════════════════════════
  console.log('\n▶ found-8-oct/timeline-day-labels-slip-after-the-clock-goes-back — in Los Angeles a task of 10 November sits under “Nov 10” at Day zoom')
  /*
   * The timeline labelled a day cell with the date of `start + i × 24 h`. After
   * the clock goes back on 1 November that is 23:00 of the day before, so from
   * then on each cell read the day before the one it stood for — while the
   * bars, placed by their own days, stood under the right cells.
   */
  const dstPlace = await place(FULL, 'clock goes back')
  await task(dstPlace.list, `${TAG} before the change`, '2026-10-20T17:30:00.000Z', '2026-10-21T17:30:00.000Z')
  const afterChange = await task(dstPlace.list, `${TAG} after the change`, '2026-11-10T18:30:00.000Z', '2026-11-10T18:30:00.000Z')
  {
    const { ctx, page } = await open('America/Los_Angeles', ADMIN)
    await openTimeline(page, dstPlace.project, afterChange)
    const barSel = `[data-testid="timeline-bar"][data-task-id="${afterChange}"]`
    await page.locator(barSel).scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {})
    const at = await page.locator(barSel).evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left + 2 } }).catch(() => null)
    // The date row's cells are the header's lowest row; the one under the bar's left edge, by its words.
    const label = at
      ? await page.evaluate((x) => {
          const cells = [...document.querySelectorAll('[data-testid="timeline-chart-header"] div')].filter((c) => c.checkVisibility() && c.children.length === 0 && /^[A-Z][a-z]{2} \d{1,2}$/.test(c.innerText.trim()))
          const cell = cells.find((c) => { const r = c.getBoundingClientRect(); return r.left <= x && x < r.right })
          return cell ? cell.innerText.trim() : null
        }, at.x).catch(() => null)
      : null
    dstLabel.push({ at, label })
    await ctx.close()
  }
  chk(
    dstLabel[0]?.label === 'Nov 10',
    'in Los Angeles, at Day zoom, a task of 10 November sits under the cell “Nov 10”, after the clock goes back on 1 November as before it',
    JSON.stringify(dstLabel),
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
