/**
 * §S07-S12 frame `09:44` — THE GANTT TOOLBAR.
 *
 * The frame is a ClickUp Gantt view. Above the chart, left to right:
 *
 *     ▤  │ Today │ Week ⌄ │ Auto fit │ ⤓ Export
 *
 * and in the header band, right-aligned in its own week, **`W32`** — which is
 * the real ISO week number for `Aug 3 – 9, 2026`, the week the recording was
 * made. Below the caret in the task panel, the group row `⌄ ☰ List` collapses.
 *
 * Rundesk's workspace timeline had the chart and neither the toolbar nor the
 * band: no auto fit, no week numbers, no way to collapse anything, and no
 * export of any kind from this screen (the server's CSV is the whole workspace
 * and sits behind `WorkspaceAdminGuard`).
 *
 * WHAT THIS SUITE REFUSES TO ACCEPT AS A PASS.
 *
 * Every one of these four is trivially fakeable, and each fake demos perfectly:
 *
 *   - an `Auto fit` that highlights itself and moves nothing. So auto fit is
 *     checked by MEASURING the rendered span before and after against the
 *     measured viewport — the span has to stop overflowing, and it has to
 *     still fill the viewport, so shrinking the chart to a stub is not a pass
 *     either.
 *   - a week band that prints a constant. So the week number is computed here,
 *     independently, from the date this suite seeded, and matched against the
 *     cell that claims that Monday.
 *   - a "collapse" that hides the panel and leaves the grid where it was. So
 *     the check is on the NEIGHBOUR: the chart viewport has to grow by exactly
 *     the width the panel gave up.
 *   - an export that downloads a constant file. So the bytes have to contain
 *     the tasks this run seeded, have to have one row per bar actually on
 *     screen, and have to CHANGE when the view changes.
 *
 * NARROWED TO ITS OWN FIXTURES. The e2e database is shared: this run makes two
 * projects of its own, filters the timeline to one of them, and every count
 * below is about bars and rows it can name. Nothing is asserted about "the
 * timeline" as a whole.
 *
 *   node test/e2e/gantt-controls.mjs --api 3011 --dist apps/web/dist
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/**
 * Exact, and compared with `!==`.
 *
 * With `<`, a branch that quietly skipped — a control that never appeared, a
 * download that never arrived — turns into a shorter run that still reports
 * "0 failed". Exact makes a skipped branch a failure.
 */
const EXPECTED_CHECKS = 30

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const TAG = `gantt-${Date.now()}`

/*
 * Fixed instants, at MIDDAY UTC so that no plausible runner timezone can move
 * them onto a different calendar day than the one asserted. `2026-03-02` is a
 * Monday, which is what makes the week-band assertion below exact.
 */
const SEED = {
  firstStart: '2026-03-02T12:00:00.000Z',
  firstDue: '2026-03-04T12:00:00.000Z',
  midStart: '2026-04-13T12:00:00.000Z',
  midDue: '2026-04-17T12:00:00.000Z',
  lastStart: '2026-06-22T12:00:00.000Z',
  lastDue: '2026-06-24T12:00:00.000Z',
  otherStart: '2026-03-09T12:00:00.000Z',
  otherDue: '2026-03-11T12:00:00.000Z',
  bulk: [
    ['Bulk one', '2026-03-16T12:00:00.000Z', '2026-03-18T12:00:00.000Z'],
    ['Bulk two', '2026-05-04T12:00:00.000Z', '2026-05-06T12:00:00.000Z'],
    ['Bulk three', '2026-05-18T12:00:00.000Z', '2026-05-20T12:00:00.000Z'],
  ],
}
const FIRST_MONDAY = '2026-03-02'

/** ISO-8601 week number, computed here so the page cannot be its own witness. */
function isoWeekNumber(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const probe = new Date(Date.UTC(y, m - 1, d))
  const weekday = probe.getUTCDay() || 7
  probe.setUTCDate(probe.getUTCDate() + 4 - weekday)
  const yearStart = Date.UTC(probe.getUTCFullYear(), 0, 1)
  return Math.ceil(((probe.getTime() - yearStart) / 86400_000 + 1) / 7)
}

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
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const API = `${stack.base}/api/v1`
const browser = await chromium.launch(launchOptions())
let api = null
let projectA = null
let projectB = null

try {
  const auth = await login(API, EMAIL, PASSWORD)
  /*
   * THIS CLIENT NEVER THROWS. It answers `{status, data, error}`, so a
   * `.catch(() => {})` on it is inert and a 500 reads exactly like a 200.
   * Every call below is checked on `status` before its result is used.
   */
  api = apiClient(API, auth.accessToken)

  const wsRes = await api('/workspaces')
  if (wsRes.status >= 300) throw new Error(`GET /workspaces answered ${wsRes.status}`)
  const workspaceId = (wsRes.data ?? [])[0]?.workspace?.id ?? (wsRes.data ?? [])[0]?.id
  if (!workspaceId) throw new Error('this account can see no workspace')

  const spacesRes = await api(`/spaces/workspace/${workspaceId}`)
  if (spacesRes.status >= 300) throw new Error(`GET /spaces answered ${spacesRes.status}`)
  const spaceId = (spacesRes.data ?? [])[0]?.id
  if (!spaceId) throw new Error('this workspace has no space to hang a project on')

  const mkProject = async (name) => {
    const res = await api('/projects', { method: 'POST', body: { spaceId, name } })
    if (res.status >= 300 || !res.data?.id) {
      throw new Error(`POST /projects (${name}) answered ${res.status}`)
    }
    return res.data
  }
  const mkList = async (projectId, name) => {
    const res = await api('/lists', { method: 'POST', body: { projectId, name } })
    if (res.status >= 300 || !res.data?.id) throw new Error(`POST /lists answered ${res.status}`)
    return res.data
  }
  const mkTask = async (listId, title, startDate, dueDate) => {
    const res = await api('/tasks', { method: 'POST', body: { listId, title, startDate, dueDate } })
    if (res.status >= 300 || !res.data?.id) {
      throw new Error(`POST /tasks (${title}) answered ${res.status}: ${JSON.stringify(res.error)}`)
    }
    return res.data.id
  }

  // Two projects, because the timeline's project filter is what narrows this
  // run to its own rows — and because the second one is the control the export
  // is not allowed to contain.
  projectA = await mkProject(`Gantt A ${TAG}`)
  projectB = await mkProject(`Gantt B ${TAG}`)
  const listA = await mkList(projectA.id, `List A ${TAG}`)
  const listB = await mkList(projectB.id, `List B ${TAG}`)

  const TITLES = {
    first: `Fit first ${TAG}`,
    mid: `Fit mid ${TAG}`,
    last: `Fit last ${TAG}`,
    other: `Other project ${TAG}`,
  }
  const idFirst = await mkTask(listA.id, TITLES.first, SEED.firstStart, SEED.firstDue)
  const idMid = await mkTask(listA.id, TITLES.mid, SEED.midStart, SEED.midDue)
  const idLast = await mkTask(listA.id, TITLES.last, SEED.lastStart, SEED.lastDue)
  await mkTask(listB.id, TITLES.other, SEED.otherStart, SEED.otherDue)
  /*
   * Three more, all INSIDE the window the three above already span, so the
   * plotted range — and every span measurement built on it — is unchanged.
   * They are here for height: the sticky section at the end needs the chart
   * taller than its own scrollport, and three rows is not taller than anything.
   */
  const idBulk = []
  for (const [label, start, due] of SEED.bulk) {
    idBulk.push(await mkTask(listA.id, `${label} ${TAG}`, start, due))
  }
  const MINE = [idFirst, idMid, idLast, ...idBulk]
  // Neither date: nothing to draw, so the timeline never carries it.
  const idUndated = await mkTask(listA.id, `Undated ${TAG}`, undefined, undefined)
  console.log(`\x1b[2m  workspace ${workspaceId}, project ${projectA.id}, tag ${TAG}\x1b[0m`)

  /*
   * THE SERVER'S OWN `?projectId=`, which nothing had ever called.
   *
   * `GET /tasks/workspace/:id/timeline` accepts `projectId` and narrows on it
   * (`tasks.service.ts`, `opts.projectId ? [eq(lists.projectId, …)]`), and the
   * one client in the product does not send it. That was on the open-defects
   * list as "the same shape as the `/ai/activity` `userId` defect", and
   * **the framing was wrong**, which is why this is a check rather than a fix:
   *
   *   · `/ai/activity` was a parameter the UI NEEDED and failed to send, so
   *     the panel showed everyone's activity where it promised one person's.
   *   · here the query has no `limit` and no window, so the page holds every
   *     dated task in the workspace. `projectOptions` is derived from exactly
   *     those rows, so the browser-side filter can never offer a project it
   *     cannot then show — and narrowing server-side would collapse the
   *     options list to the one project already chosen. The client is right.
   *
   * So the parameter is not dead wiring to be removed, and not a bug to be
   * fixed — it is API surface with no exercise, which is how a query parameter
   * comes to be quietly broken. One check, against this run's own two
   * projects: unscoped sees both, scoped sees one, and the one it sees is the
   * one that was asked for. Asserted on ids this run created, never on totals,
   * because the workspace is shared.
   */
  const wholeWorkspace = await api(`/tasks/workspace/${workspaceId}/timeline`)
  const scopedToA = await api(`/tasks/workspace/${workspaceId}/timeline?projectId=${projectA.id}`)
  const idsOf = (res) => new Set((res.data ?? []).map((t) => t.id))
  const whole = idsOf(wholeWorkspace)
  const scoped = idsOf(scopedToA)
  const otherId = (wholeWorkspace.data ?? []).find((t) => t.title === TITLES.other)?.id ?? null
  chk(
    wholeWorkspace.status === 200 && scopedToA.status === 200 &&
      !!otherId && whole.has(otherId) && !scoped.has(otherId) &&
      MINE.every((id) => whole.has(id) && scoped.has(id)),
    'the timeline endpoint really narrows on `projectId`, which no client sends',
    `unscoped ${wholeWorkspace.status} holding ${whole.size}, scoped ${scopedToA.status} holding ` +
      `${scoped.size}; the other project's task ${JSON.stringify(otherId)} was ` +
      `${scoped.has(otherId) ? 'STILL THERE' : 'absent'} and this run's own ` +
      `${MINE.filter((id) => scoped.has(id)).length}/${MINE.length} survived`,
  )
  /*
   * WHAT IT CAN DRAW, AND NOTHING ELSE, filtered in SQL
   * (`timeline-projectid-param`): the read has no limit, so an undated task
   * read and then dropped in JavaScript was the whole workspace's undated work
   * carried to be thrown away.
   */
  chk(
    wholeWorkspace.status === 200 && scopedToA.status === 200 && !whole.has(idUndated) && !scoped.has(idUndated) && MINE.every((id) => whole.has(id)),
    'the timeline carries only the tasks it can draw: this run’s task with neither date is in neither read, and its dated ones are',
    `the undated task ${whole.has(idUndated) || scoped.has(idUndated) ? 'WAS carried' : 'was absent'}; dated ${MINE.filter((id) => whole.has(id)).length}/${MINE.length}`,
  )

  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    timezoneId: 'UTC',
    acceptDownloads: true,
  })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })

  await page.goto(`${stack.base}/app/${workspaceId}/timeline`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('timeline-toolbar').waitFor({ timeout: 30_000 })

  // ── narrow to this run's own project ──────────────────────────────────────
  await page.getByTestId('timeline-project-filter').selectOption(projectA.id, { timeout: 20_000 })

  /** The ids of every bar the chart is currently drawing. */
  const barIds = () =>
    page.$$eval('[data-testid="timeline-bar"]', (els) => els.map((e) => e.dataset.taskId))
  const nameCount = () => page.locator('[data-testid="timeline-task-name"]').count()
  const weekCells = () =>
    page.$$eval('[data-testid="timeline-week-number"]', (els) =>
      els.map((e) => ({
        week: e.dataset.week,
        monday: e.dataset.weekStart,
        // As drawn: a label that is not shown reads '' (its own innerText would not say so).
        text: (e.checkVisibility() ? e.innerText : '').trim(),
        height: e.getBoundingClientRect().height,
      })),
    )

  const narrowed = await waitUntil(
    async () => {
      const ids = await barIds()
      return ids.length === MINE.length && MINE.every((id) => ids.includes(id))
    },
    { timeoutMs: 20_000 },
  )
  if (!narrowed) {
    throw new Error(`the timeline never narrowed to ${projectA.id} — bars were ${JSON.stringify(await barIds())}`)
  }

  /** Everything the geometry checks read, in one layout pass. */
  const geom = () =>
    page.evaluate(() => {
      const q = (sel) => document.querySelector(sel)
      const vp = q('[data-testid="timeline-chart-viewport"]')
      const ax = q('[data-testid="timeline-axis"]')
      const panel = q('[data-testid="timeline-task-panel"]')
      return {
        viewW: vp ? vp.clientWidth : -1,
        scrollLeft: vp ? vp.scrollLeft : -1,
        anchorToday: ax ? ax.dataset.anchorToday : null,
        spanW: ax ? ax.getBoundingClientRect().width : -1,
        axisH: ax ? ax.getBoundingClientRect().height : -1,
        panelW: panel ? panel.getBoundingClientRect().width : -1,
        panelMounted: !!panel,
        panelSays: panel ? panel.dataset.collapsed : null,
        dayPx: ax ? Number(ax.dataset.dayPx) : -1,
        spanDays: ax ? Number(ax.dataset.spanDays) : -1,
        rangeStart: ax ? ax.dataset.rangeStart : null,
        rangeEnd: ax ? ax.dataset.rangeEnd : null,
        fit: ax ? ax.dataset.fit : null,
      }
    })
  /** Where one bar's right edge sits relative to the viewport's right edge. */
  const barVsViewport = (taskId) =>
    page.evaluate((id) => {
      const vp = document.querySelector('[data-testid="timeline-chart-viewport"]')
      const bar = document.querySelector(`[data-testid="timeline-bar"][data-task-id="${id}"]`)
      if (!vp || !bar) return null
      const v = vp.getBoundingClientRect()
      const b = bar.getBoundingClientRect()
      return { barRight: b.right, viewRight: v.right, overflowPx: b.right - v.right }
    }, taskId)

  // ══ 1. THE FOUR CONTROLS, AS THE FRAME DRAWS THEM ═════════════════════════
  console.log('\n▶ frame `09:44` — the Gantt toolbar')
  const TOOLBAR = [
    'timeline-panel-toggle',
    'timeline-today',
    'timeline-week-numbers',
    'timeline-autofit',
    // Export is a menu now — PDF, PNG and this CSV (`resume-defects/resume-5`).
    'timeline-export-menu',
  ]
  const controls = await Promise.all(TOOLBAR.map((id) => page.getByTestId(id).count()))
  chk(
    controls.every((n) => n === 1),
    'the toolbar draws a panel toggle, Today, Week numbers, Auto fit and Export',
    `found ${JSON.stringify(controls)} for ${JSON.stringify(TOOLBAR)} — the frame has one of each`,
  )

  // ══ 2. WEEK NUMBERS — the frame's `W32` ═══════════════════════════════════
  console.log('\n▶ week numbers `09:44` — `W32` in the header band')
  const beforeWeeks = await geom()
  chk(
    (await weekCells()).length === 0,
    'the band is off to begin with, so turning it on is a change and not a redraw',
    'week-number cells were already on screen before the toggle was touched',
  )

  await page.getByTestId('timeline-week-numbers').click()
  const bandOn = await waitUntil(async () => (await weekCells()).length > 0, { timeoutMs: 10_000 })
  if (!bandOn) throw new Error('the week band never appeared')
  const cells = await weekCells()
  const afterWeeks = await geom()

  /*
   * INDEPENDENTLY COMPUTED. `2026-03-02` is the Monday of the week the first
   * seeded task starts in, and the calendar — not the page — says that is ISO
   * week 10. A band that printed a constant, or counted weeks from the start
   * of the chart instead of the start of the year, fails here.
   */
  const expectedWeek = isoWeekNumber(FIRST_MONDAY)
  const cell = cells.find((c) => c.monday === FIRST_MONDAY)
  chk(
    !!cell && cell.week === String(expectedWeek) && cell.text === `W${expectedWeek}`,
    `the week containing ${FIRST_MONDAY} is labelled W${expectedWeek}, which is the ISO week it is`,
    cell
      ? `that week rendered ${JSON.stringify(cell.text)} (data-week ${cell.week}); the calendar says W${expectedWeek}`
      : `no band cell claimed the Monday ${FIRST_MONDAY} — cells were ${JSON.stringify(cells.slice(0, 4))}`,
  )
  chk(
    cells.length > 0 && Math.abs(afterWeeks.axisH - beforeWeeks.axisH - cells[0].height) <= 1,
    'and the header GAINED that band — it is taller by exactly the band it now draws',
    `header went ${beforeWeeks.axisH}px → ${afterWeeks.axisH}px while the band cell is ${cells[0]?.height}px tall`,
  )

  await page.getByTestId('timeline-week-numbers').click()
  const bandOff = await waitUntil(async () => (await weekCells()).length === 0, { timeoutMs: 10_000 })
  chk(
    bandOff,
    'and it is a toggle, not a latch: pressing it again takes the band away',
    'the band stayed on screen after a second press',
  )

  // ══ 3. COLLAPSIBLE PANELS — the task panel ════════════════════════════════
  console.log('\n▶ collapsible panels `09:44` — the task panel gives its width to the grid')
  const openGeom = await geom()
  const namesOpen = await nameCount()
  chk(
    openGeom.panelW > 0 && namesOpen === MINE.length,
    `the panel is ${Math.round(openGeom.panelW)}px wide and lists this run's ${MINE.length} tasks`,
    `panel measured ${openGeom.panelW}px with ${namesOpen} name row(s)`,
  )

  await page.getByTestId('timeline-panel-toggle').click()
  /*
   * WAIT ON THE MEASUREMENT, NOT ON VISIBILITY.
   *
   * This wait used to be `locator('…[data-collapsed="true"]').waitFor()`, and it
   * could never have resolved. `waitFor()` defaults to `state: 'visible'`, and
   * playwright decides visibility in `computeBox` as
   *
   *     visible: rect.width > 0 && rect.height > 0
   *
   * A collapsed panel is zero wide, so it is invisible BY DEFINITION — the wait
   * was asking the panel not to be collapsed, which is the opposite of what this
   * section observes. It timed out against a working build.
   *
   * `state: 'detached'` would be the other wrong answer: check 8 measures the
   * width this panel gave up, so the panel has to stay in the document to be
   * measured at 0. "The panel is gone" and "the panel is 0px" are different
   * claims and only the second one check 8 can stand on.
   *
   * So the wait is the check's own quantity — the measured width — and it
   * cannot converge for a reason the check would disagree with. It also does
   * not throw: a panel that genuinely never collapses is a red check carrying
   * the numbers, not a timeout that stops the run at six of twenty-two.
   */
  const shut = await waitUntil(async () => (await geom()).panelW === 0, { timeoutMs: 10_000 })
  const shutGeom = await geom()
  const namesShut = await nameCount()
  chk(
    shut && shutGeom.panelMounted && shutGeom.panelW === 0 && namesShut === 0,
    'collapsed, the panel is zero wide and draws no rows at all',
    `collapsed panel measured ${shutGeom.panelW}px with ${namesShut} name row(s) still rendered; ` +
      `it is ${shutGeom.panelMounted ? 'mounted' : 'NOT MOUNTED — check 8 has nothing left to measure'} ` +
      `and reports data-collapsed=${JSON.stringify(shutGeom.panelSays)} ` +
      `(data-collapsed="false" means the toggle never fired; "true" at ${shutGeom.panelW}px means it fired and the pane did not reflow)`,
  )
  /*
   * THE CHECK IS ON THE NEIGHBOUR. A panel that hides itself and leaves the
   * grid where it was passes every "is the panel gone" assertion ever written.
   */
  chk(
    Math.abs(shutGeom.viewW - openGeom.viewW - openGeom.panelW) <= 2,
    `and the grid took the width back: the chart went ${Math.round(openGeom.viewW)}px → ${Math.round(shutGeom.viewW)}px, ` +
      `+${Math.round(shutGeom.viewW - openGeom.viewW)}px for a ${Math.round(openGeom.panelW)}px panel`,
    `the chart gained ${Math.round(shutGeom.viewW - openGeom.viewW)}px when the panel gave up ${Math.round(openGeom.panelW)}px`,
  )

  await page.getByTestId('timeline-panel-toggle').click()
  // Measured, for the same reason: an expanded panel happens to be visible, but
  // keying on that would be keying on a side effect of the width it is here to
  // check. And the message below has to be able to say what it measured.
  const reopened = await waitUntil(async () => (await geom()).panelW > 0, { timeoutMs: 10_000 })
  const reopenGeom = await geom()
  const namesReopen = await nameCount()
  chk(
    reopened &&
      Math.abs(reopenGeom.panelW - openGeom.panelW) <= 1 &&
      Math.abs(reopenGeom.viewW - openGeom.viewW) <= 2 &&
      namesReopen === MINE.length,
    'and it comes back the same size, with the grid handing the width back',
    `reopened to panel ${reopenGeom.panelW}px / chart ${reopenGeom.viewW}px with ${namesReopen} name row(s) ` +
      `(was ${openGeom.panelW}px / ${openGeom.viewW}px with ${MINE.length})`,
  )

  // ══ 4. COLLAPSIBLE PANELS — the groups ════════════════════════════════════
  console.log('\n▶ collapsible panels `09:44` — the `⌄ List` group row')
  await page.getByTestId('timeline-group-toggle').first().click()
  const groupShut = await waitUntil(async () => (await barIds()).length === 0, { timeoutMs: 10_000 })
  chk(
    groupShut,
    "collapsing the group takes its bars out of the chart, not just its names out of the panel",
    `bars still on screen after collapsing the group: ${JSON.stringify(await barIds())}`,
  )
  await page.getByTestId('timeline-group-toggle').first().click()
  const groupOpen = await waitUntil(
    async () => {
      const ids = await barIds()
      return ids.length === MINE.length && MINE.every((id) => ids.includes(id))
    },
    { timeoutMs: 10_000 },
  )
  chk(
    groupOpen,
    'and expanding it brings back exactly those three bars',
    `after expanding, the chart drew ${JSON.stringify(await barIds())}`,
  )

  // ══ 5. AUTO FIT ═══════════════════════════════════════════════════════════
  console.log('\n▶ `Auto fit` `09:44` — the span has to change, measurably')
  const beforeFit = await geom()
  const lastBefore = await barVsViewport(idLast)
  chk(
    beforeFit.fit === 'off' && beforeFit.spanW > beforeFit.viewW && !!lastBefore && lastBefore.overflowPx > 0,
    `before: ${Math.round(beforeFit.spanW)}px of chart in a ${Math.round(beforeFit.viewW)}px viewport, ` +
      `so the last task sits ${Math.round(lastBefore?.overflowPx ?? 0)}px past the right edge`,
    `nothing to fit — span ${beforeFit.spanW}px, viewport ${beforeFit.viewW}px, last bar ${JSON.stringify(lastBefore)}`,
  )

  await page.getByTestId('timeline-autofit').click()
  // The axis always has a non-zero box, so a `waitFor` here would resolve — but
  // an Auto fit that never sets its state would make it throw, and a timeout
  // reports nothing. Wait on the value, carry it into the check.
  const fitted = await waitUntil(async () => (await geom()).fit === 'on', { timeoutMs: 10_000 })
  const afterFit = await geom()
  const lastAfter = await barVsViewport(idLast)

  /*
   * FITS **AND** FILLS. `span <= viewport` alone is satisfied by a chart shrunk
   * to a stub, which is a different bug wearing this one's clothes.
   */
  chk(
    fitted &&
      afterFit.spanW < beforeFit.spanW &&
      afterFit.spanW <= afterFit.viewW + 2 &&
      afterFit.spanW > afterFit.viewW * 0.9,
    `after: the span is ${Math.round(afterFit.spanW)}px in a ${Math.round(afterFit.viewW)}px viewport — it fits, and it fills`,
    `span went ${Math.round(beforeFit.spanW)}px → ${Math.round(afterFit.spanW)}px against a ${Math.round(afterFit.viewW)}px viewport ` +
      `(data-fit=${JSON.stringify(afterFit.fit)}${fitted ? '' : ' — Auto fit never reported itself on'})`,
  )
  const daysVisibleBefore = beforeFit.viewW / beforeFit.dayPx
  const daysVisibleAfter = afterFit.viewW / afterFit.dayPx
  chk(
    beforeFit.spanDays > 0 &&
      afterFit.spanDays === beforeFit.spanDays &&
      daysVisibleBefore < beforeFit.spanDays - 1 &&
      Math.abs(daysVisibleAfter - afterFit.spanDays) <= 3,
    `in days: ${Math.round(daysVisibleBefore)} of ${beforeFit.spanDays} were on screen, now all ${afterFit.spanDays} are`,
    `visible days went ${daysVisibleBefore.toFixed(1)} → ${daysVisibleAfter.toFixed(1)} of a ${afterFit.spanDays}-day span`,
  )
  chk(
    !!lastAfter && lastAfter.overflowPx <= 2,
    'and the last task, which was off screen, is now inside the viewport',
    `the last bar is still ${Math.round(lastAfter?.overflowPx ?? NaN)}px past the right edge`,
  )
  /*
   * FITTED, NOT CROPPED. Dropping the tasks that did not fit would shrink the
   * span just as well and would pass every pixel check above.
   */
  chk(
    !!afterFit.rangeStart &&
      !!afterFit.rangeEnd &&
      afterFit.rangeStart <= SEED.firstStart.slice(0, 10) &&
      afterFit.rangeEnd >= SEED.lastDue.slice(0, 10) &&
      (await barIds()).length === MINE.length,
    `and nothing was cropped to do it: the range still runs ${afterFit.rangeStart} → ${afterFit.rangeEnd}, all ${MINE.length} bars drawn`,
    `range ${afterFit.rangeStart} → ${afterFit.rangeEnd} does not cover ${SEED.firstStart.slice(0, 10)} → ${SEED.lastDue.slice(0, 10)}`,
  )

  // ══ 6. TODAY ══════════════════════════════════════════════════════════════
  console.log("\n▶ `Today` `09:44` — the viewport has to actually move")
  /*
   * Back to a plain zoom first: with Auto fit still on, the whole chart fits
   * the viewport, and a viewport with nothing to scroll cannot show that
   * anything scrolled. This clears the fit (it does not matter that `week` is
   * already the zoom — the click is what clears it).
   */
  // The zoom is the time period's menu now, as ClickUp's Gantt draws it (`resume-defects/resume-5`).
  await page.getByTestId('timeline-period').click()
  await page.getByTestId('timeline-zoom-week').click()
  const preToday = await waitUntil(async () => (await geom()).fit === 'off', { timeoutMs: 10_000 })
  if (!preToday) throw new Error('clicking the week zoom did not clear the fit')

  /** Where the today line sits relative to the viewport, or null if undrawn. */
  const todayVsViewport = () =>
    page.evaluate(() => {
      const vp = document.querySelector('[data-testid="timeline-chart-viewport"]')
      const line = document.querySelector('[data-testid="timeline-today-line"]')
      if (!vp) return null
      if (!line) return { drawn: false, inside: false, lineLeft: null }
      const v = vp.getBoundingClientRect()
      const l = line.getBoundingClientRect()
      return {
        drawn: true,
        inside: l.left >= v.left - 1 && l.right <= v.right + 1,
        lineLeft: Math.round(l.left - v.left),
      }
    })

  /*
   * DETERMINISTIC, NOT LUCKY. Every seeded date is in the past and can only get
   * further into the past, so today is always beyond the plotted range and the
   * line is never drawn before the button is pressed. No branch, no skip.
   */
  const beforeToday = await geom()
  const todayBefore = await todayVsViewport()
  chk(
    !!todayBefore && todayBefore.drawn === false && beforeToday.anchorToday === 'false',
    `before: the range stops at ${beforeToday.rangeEnd}, today is past it, and no today line is drawn`,
    `expected no today line outside the range; got ${JSON.stringify(todayBefore)} with data-anchor-today=${beforeToday.anchorToday}`,
  )

  await page.getByTestId('timeline-today').click()
  const todayLanded = await waitUntil(
    async () => {
      const t = await todayVsViewport()
      return !!t && t.drawn && t.inside
    },
    { timeoutMs: 10_000 },
  )
  const afterToday = await geom()
  const todayAfter = await todayVsViewport()
  /*
   * THE CHECK WITH TEETH. Not "the button is there" and not "state flipped" —
   * the line has to be ON THE CHART and INSIDE the viewport, and the viewport
   * has to have moved to put it there. A Today that sets its flag and scrolls
   * nothing leaves the line drawn but off to the right, at scrollLeft 0.
   */
  chk(
    todayLanded &&
      !!todayAfter &&
      todayAfter.drawn &&
      todayAfter.inside &&
      beforeToday.scrollLeft === 0 &&
      afterToday.scrollLeft > 0,
    `pressing Today draws the line and scrolls it into view — scrollLeft ${beforeToday.scrollLeft} → ${Math.round(afterToday.scrollLeft)}, ` +
      `line ${todayAfter?.lineLeft}px from the viewport's left edge`,
    `line=${JSON.stringify(todayAfter)}, scrollLeft ${beforeToday.scrollLeft} → ${Math.round(afterToday.scrollLeft)}, ` +
      `data-anchor-today=${afterToday.anchorToday} ` +
      `(anchor "true" with scrollLeft unmoved means the range grew and nothing scrolled)`,
  )
  chk(
    afterToday.rangeEnd > beforeToday.rangeEnd && afterToday.spanDays > beforeToday.spanDays,
    `and it reached today by growing the range ${beforeToday.rangeEnd} → ${afterToday.rangeEnd} ` +
      `(${beforeToday.spanDays} → ${afterToday.spanDays} days), not by moving the tasks`,
    `range went ${beforeToday.rangeEnd} → ${afterToday.rangeEnd}, span ${beforeToday.spanDays} → ${afterToday.spanDays} days`,
  )

  /*
   * AND IT WORKS TWICE. `anchorToday` is already true by now, so an
   * implementation keyed on that flag instead of on a per-press stamp is dead
   * from here on — and would have passed everything above.
   */
  await page.evaluate(() => {
    document.querySelector('[data-testid="timeline-chart-viewport"]').scrollLeft = 0
  })
  const scrolledAway = await waitUntil(async () => (await geom()).scrollLeft === 0, { timeoutMs: 5_000 })
  await page.getByTestId('timeline-today').click()
  const secondLanded = await waitUntil(
    async () => {
      const t = await todayVsViewport()
      return !!t && t.drawn && t.inside
    },
    { timeoutMs: 10_000 },
  )
  const secondGeom = await geom()
  chk(
    scrolledAway && secondLanded && secondGeom.scrollLeft > 0,
    'and a second press scrolls back to today after the chart was scrolled away',
    `after scrolling to 0 and pressing Today again: scrollLeft ${Math.round(secondGeom.scrollLeft)}, ` +
      `line ${JSON.stringify(await todayVsViewport())} — a Today keyed on its own flag is dead from the second press`,
  )

  // ══ 7. LOCAL EXPORT ═══════════════════════════════════════════════════════
  console.log('\n▶ `⤓ Export` `09:44` — a real file, with this run\'s tasks in it')
  const grab = async () => {
    // The CSV is one of the Export menu's three now (`resume-defects/resume-5`).
    await page.getByTestId('timeline-export-menu').click()
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByTestId('timeline-export').click(),
    ])
    const file = await download.path()
    if (!file) throw new Error('the download produced no file on disk')
    return { name: download.suggestedFilename(), text: fs.readFileSync(file, 'utf8') }
  }

  const barsOnScreen = (await barIds()).length
  const first = await grab()
  chk(
    /^rundesk-timeline-\d{4}-\d{2}-\d{2}\.csv$/.test(first.name),
    `the download arrives as ${first.name}`,
    `the download was named ${JSON.stringify(first.name)}`,
  )
  chk(
    first.text.includes(TITLES.first) && first.text.includes(TITLES.mid) && first.text.includes(TITLES.last),
    'and its bytes carry the three tasks this run seeded, by name',
    `the file does not name this run's tasks — first 200 bytes: ${JSON.stringify(first.text.slice(0, 200))}`,
  )
  const lines = first.text.trim().split('\r\n')
  chk(
    lines[0] === '"Task","Group","Status","Priority","Start date","Due date","Days","List","Project","Space"',
    'with the columns the chart shows',
    `the header row was ${JSON.stringify(lines[0])}`,
  )
  chk(
    barsOnScreen > 0 && lines.length === barsOnScreen + 1,
    `one row per bar on screen — ${barsOnScreen} bars, ${lines.length - 1} rows`,
    `${barsOnScreen} bars were drawn but the file has ${lines.length - 1} row(s)`,
  )
  chk(
    !first.text.includes(TITLES.other),
    'and nothing from the project the filter excluded',
    'the export contains a task from a project that is not on screen — it is dumping, not exporting the view',
  )

  /*
   * THE ANTI-FACADE CHECK. A constant file passes everything above the moment
   * it happens to be the right constant. It cannot pass this: change the view,
   * and the bytes have to change with it.
   */
  await page.getByTestId('timeline-project-filter').selectOption(projectB.id, { timeout: 20_000 })
  const swapped = await waitUntil(
    async () => {
      const ids = await barIds()
      return ids.length === 1 && !MINE.includes(ids[0])
    },
    { timeoutMs: 20_000 },
  )
  if (!swapped) throw new Error('the filter never moved to the second project')
  const second = await grab()
  chk(
    second.text.includes(TITLES.other) &&
      !second.text.includes(TITLES.first) &&
      !second.text.includes(TITLES.mid) &&
      !second.text.includes(TITLES.last) &&
      second.text !== first.text,
    'and the file follows the view: filtered to the other project, it holds that task and none of the first three',
    `the second export ${second.text === first.text ? 'was byte-identical to the first' : 'held the wrong rows'}`,
  )

  // ══ 8. THE STICKY HEADERS ═════════════════════════════════════════════════
  console.log('\n▶ the date header stays put while the rows scroll under it')
  /*
   * Both headers were declared `sticky top-0` and neither stuck: every ancestor
   * that could have been their scrollport was either `overflow-hidden` (a
   * scrollport that never scrolls) or unbounded (a scrollport with nothing to
   * scroll). The fix is a bounded chart pane, so this proves the pane really is
   * a scrollport and that the header really does hold position inside it.
   *
   * Back to the six-task project first, then a short window so the chart is
   * taller than its own pane. Resizing the browser is the test arranging the
   * conditions; the 70vh bound is the product's, and is not touched.
   */
  await page.getByTestId('timeline-project-filter').selectOption(projectA.id, { timeout: 20_000 })
  const backOnA = await waitUntil(async () => (await barIds()).length === MINE.length, { timeoutMs: 20_000 })
  if (!backOnA) throw new Error('could not get back to the six-task project')
  await page.setViewportSize({ width: 1600, height: 400 })

  const paneScroll = () =>
    page.evaluate(() => {
      const pane = document.querySelector('[data-testid="timeline-chart-viewport"]')
      const panel = document.querySelector('[data-testid="timeline-task-panel"]')
      const head = document.querySelector('[data-testid="timeline-chart-header"]')
      const bar = document.querySelector('[data-testid="timeline-bar"]')
      if (!pane || !head || !bar) return null
      return {
        scrollable: pane.scrollHeight - pane.clientHeight,
        scrollTop: pane.scrollTop,
        panelTop: panel ? panel.scrollTop : -1,
        paneRectTop: pane.getBoundingClientRect().top,
        headRectTop: head.getBoundingClientRect().top,
        barRectTop: bar.getBoundingClientRect().top,
      }
    })

  const SCROLL_BY = 50
  const roomToScroll = await waitUntil(
    async () => {
      const s = await paneScroll()
      return !!s && s.scrollable >= SCROLL_BY
    },
    { timeoutMs: 10_000 },
  )
  const stickyBefore = await paneScroll()
  await page.evaluate((by) => {
    document.querySelector('[data-testid="timeline-chart-viewport"]').scrollTop = by
  }, SCROLL_BY)
  const synced = await waitUntil(
    async () => {
      const s = await paneScroll()
      return !!s && s.scrollTop === SCROLL_BY && s.panelTop === SCROLL_BY
    },
    { timeoutMs: 10_000 },
  )
  const stickyAfter = await paneScroll()

  chk(
    roomToScroll &&
      synced &&
      !!stickyAfter &&
      stickyAfter.scrollTop === SCROLL_BY &&
      stickyAfter.panelTop === SCROLL_BY,
    `the chart is a real scrollport — ${Math.round(stickyBefore?.scrollable ?? -1)}px of room, scrolled to ${stickyAfter?.scrollTop}, ` +
      'and the task panel came with it',
    `scrollable=${stickyBefore?.scrollable}, chart scrollTop=${stickyAfter?.scrollTop}, panel scrollTop=${stickyAfter?.panelTop} ` +
      '(0 room means the pane is unbounded again and its header has nothing to stick to; ' +
      'a panel that stayed at 0 means the two panes have come unsynced and the rows no longer line up with their bars)',
  )
  chk(
    !!stickyBefore &&
      !!stickyAfter &&
      Math.abs(stickyAfter.headRectTop - stickyAfter.paneRectTop) <= 1 &&
      Math.abs(stickyBefore.barRectTop - stickyAfter.barRectTop - SCROLL_BY) <= 1,
    `and the date header held the top of the pane while the bars moved ${SCROLL_BY}px up under it`,
    `after scrolling ${SCROLL_BY}px the header sits ${Math.round((stickyAfter?.headRectTop ?? 0) - (stickyAfter?.paneRectTop ?? 0))}px ` +
      `from the pane's top and the first bar moved ${Math.round((stickyBefore?.barRectTop ?? 0) - (stickyAfter?.barRectTop ?? 0))}px ` +
      '(header offset ≈ the scroll distance means it scrolled away with the content — it is not sticking)',
  )

  await page.close()
} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
} finally {
  /*
   * Cleanup, and the client never throws — so these are `await`ed for their
   * side effect and their status is deliberately not asserted. A project this
   * run could not delete is litter, not a failed check.
   */
  if (api) {
    if (projectA?.id) await api(`/projects/${projectA.id}`, { method: 'DELETE' })
    if (projectB?.id) await api(`/projects/${projectB.id}`, { method: 'DELETE' })
  }
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — a run that skipped a branch is not a ` +
        'shorter pass, it is a failure, and "0 failed" would describe only the part it reached.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
