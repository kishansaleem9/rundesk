/**
 * ONE GANTT, AS CLICKUP'S GANTT VIEW (`resume-defects/resume-5`).
 *
 * There were two Gantts and they had drifted apart: the workspace timeline
 * drew Today, Auto fit, week numbers, a task panel and an export and no
 * dependency at all; the list's Gantt tab drew arrows and a critical path and
 * nothing else, with no test id a suite could hold. Both surfaces draw one
 * chart now (`components/gantt-chart.tsx`), and this suite reads it on both.
 *
 * ClickUp (help centre, "Create and share a Gantt view", "Critical Path and
 * Slack Time", "How to use Gantt charts for project planning"; changelog,
 * "Gantt view: zoom to fit, date marker" and "Improved Gantt view export";
 * read through search excerpts, 12 October):
 *   · the time period: Day, Week (a new view's), Month, Quarter, Year;
 *   · the date marker named for the scale: Today, Current Month, Current Year;
 *   · Customize › Critical path: each group's last task, and every task before
 *     it that it waits on with no time between, in red; Slack time: what a
 *     task off the path may slip before the next one, or its group's end;
 *   · dependencies drawn from bar to bar, and a line double-clicked removed;
 *   · Export view as a PDF or a PNG, on Business and above.
 *
 * A workspace of this run's own, on Business, with one list of five tasks in
 * one status: A (2–4 March) → B (5–9) → C (10–13), each starting the day after
 * the one it waits on ends, and D (2–3) → E (6–8), a gap between them. C ends
 * last: the path is C, B and A; D has two days of slack before E, E five
 * before the group ends. What is saved is read back by SQL.
 *
 *   node test/e2e/gantt-one-chart.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, madeWorkspace } from './lib/fixture.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 15

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const TAG = `gantt1-${Date.now()}`
/** Date-only days, at UTC midnight, carrying no time: drawn on that day in any zone. */
const day = (d) => `2026-03-${String(d).padStart(2, '0')}T00:00:00.000Z`
const SEED = {
  A: { from: 2, to: 4, after: null },
  B: { from: 5, to: 9, after: 'A' },
  C: { from: 10, to: 13, after: 'B' },
  D: { from: 2, to: 3, after: null },
  E: { from: 6, to: 8, after: 'D' },
}

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error, message}`. Every call site reads `status`. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`

let sql = null
let WS = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the dependencies and dates are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: `Gantt ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  madeWorkspace(WS)
  await sql`update workspaces set plan = 'business' where id = ${WS}`
  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space`, defaultPermission: 'admin' } })
  const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} project` } })
  const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} list` } })
  if (!list.ok) throw new Error(`could not make the list: ${said(list)}`)
  const ids = {}
  for (const [key, s] of Object.entries(SEED)) {
    const made = await A('/tasks', {
      method: 'POST',
      body: { listId: list.data.id, title: `${key} ${TAG}`, startDate: day(s.from), dueDate: day(s.to), startDateHasTime: false, dueDateHasTime: false },
    })
    if (!made.ok || !made.data?.id) throw new Error(`could not make task ${key}: ${said(made)}`)
    ids[key] = made.data.id
  }
  for (const [key, s] of Object.entries(SEED)) {
    if (!s.after) continue
    const dep = await A(`/tasks/${ids[key]}/dependencies`, { method: 'POST', body: { relatedTaskId: ids[s.after], type: 'blocked_by' } })
    if (!dep.ok) throw new Error(`could not make ${key} wait on ${s.after}: ${said(dep)}`)
  }
  const nameOf = Object.fromEntries(Object.entries(ids).map(([k, id]) => [id, k]))
  const dependsRows = () =>
    sql`select task_id, related_task_id, type from task_dependencies where task_id = any(${Object.values(ids)}) or related_task_id = any(${Object.values(ids)})`
  const waitsOn = async (blocked, blocker) =>
    (await dependsRows()).some(
      (r) => (r.task_id === ids[blocked] && r.related_task_id === ids[blocker] && r.type === 'blocked_by') || (r.task_id === ids[blocker] && r.related_task_id === ids[blocked] && r.type === 'blocks'),
    )

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', acceptDownloads: true })
  const page = await ctx.newPage()
  // A step that cannot happen fails in seconds rather than waiting for ever.
  page.setDefaultTimeout(15_000)
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })

  const listUrl = `${B}/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}`
  const bar = (key) => page.locator(`[data-testid="timeline-bar"][data-task-id="${ids[key]}"]`)
  const openGantt = async () => {
    await page.goto(listUrl, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('work-view-tab-type-gantt').click({ timeout: 30_000 })
    await bar('C').waitFor({ state: 'visible', timeout: 20_000 })
  }
  const axis = async () => {
    const el = page.getByTestId('timeline-axis')
    return {
      dayPx: Number(await el.getAttribute('data-day-px').catch(() => 0)),
      zoom: await el.getAttribute('data-zoom').catch(() => null),
    }
  }
  const choosePeriod = async (period) => {
    await page.getByTestId('timeline-period').click()
    await page.getByTestId(`timeline-zoom-${period}`).click()
    await waitUntil(async () => (await axis()).zoom === period, { timeoutMs: 10_000 })
  }
  const toggle = async (id) => {
    await page.getByTestId('timeline-customize').click()
    await page.getByTestId(id).click()
    await page.keyboard.press('Escape')
  }
  const criticalOf = async () =>
    Object.fromEntries(await Promise.all(Object.keys(ids).map(async (k) => [k, await bar(k).getAttribute('data-critical').catch(() => null)])))
  const download = async (item) => {
    await page.getByTestId('timeline-export-menu').click()
    const [file] = await Promise.all([page.waitForEvent('download', { timeout: 20_000 }), page.getByTestId(item).click()])
    const at = await file.path()
    return { name: file.suggestedFilename(), bytes: at ? fs.readFileSync(at) : Buffer.alloc(0) }
  }

  // ══ 1. THE LIST'S GANTT TAB IS THE ONE GANTT ══════════════════════════════════
  console.log("\n▶ the list's Gantt tab draws the one Gantt")
  await openGantt()
  const TOOLBAR = ['timeline-period', 'timeline-panel-toggle', 'timeline-today', 'timeline-week-numbers', 'timeline-autofit', 'timeline-customize', 'timeline-export-menu']
  const counts = await Promise.all(TOOLBAR.map((id) => page.getByTestId(id).count()))
  const bars = await page.getByTestId('timeline-bar').count()
  chk(
    counts.every((n) => n === 1) && bars === 5,
    "the list's Gantt tab draws the one Gantt: the time period, the task panel, Today, week numbers, Auto fit, Customize and Export, over a bar for each of the list's five dated tasks",
    JSON.stringify({ toolbar: Object.fromEntries(TOOLBAR.map((id, i) => [id, counts[i]])), bars }),
  )

  // ══ 2. THE TIME PERIOD ════════════════════════════════════════════════════════
  console.log('\n▶ the time period: Day, Week, Month, Quarter, Year')
  const first = await page.getByTestId('timeline-period').getAttribute('data-period').catch(() => null)
  await page.getByTestId('timeline-period').click()
  const offered = await page.locator('[data-testid^="timeline-zoom-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('timeline-zoom-', '')))
  await page.keyboard.press('Escape')
  const widths = {}
  for (const period of ['day', 'week', 'month', 'quarter', 'year']) {
    await choosePeriod(period)
    widths[period] = (await axis()).dayPx
  }
  chk(
    first === 'week' && JSON.stringify(offered) === JSON.stringify(['day', 'week', 'month', 'quarter', 'year'])
      && widths.day > widths.week && widths.week > widths.month && widths.month > widths.quarter && widths.quarter > widths.year && widths.year > 0,
    'the time period offers Day, Week, Month, Quarter and Year, Week to begin with, and each draws a day narrower than the one before it',
    JSON.stringify({ first, offered, widths }),
  )

  // ══ 3. THE DATE MARKER ════════════════════════════════════════════════════════
  console.log('\n▶ the date marker, named for the scale')
  const markers = {}
  for (const period of ['week', 'month', 'year']) {
    await choosePeriod(period)
    await page.getByTestId('timeline-today').click()
    await page.getByTestId('timeline-today-label').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    markers[period] = (await page.getByTestId('timeline-today-label').filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')).trim()
  }
  chk(
    markers.week === 'Today' && markers.month === 'Current Month' && markers.year === 'Current Year',
    'Today draws the date marker and names it for the scale: Today by the week, Current Month by the month, Current Year by the year',
    JSON.stringify(markers),
  )
  await choosePeriod('day')

  // ══ 4. THE DEPENDENCIES ═══════════════════════════════════════════════════════
  console.log('\n▶ the dependencies, from bar to bar')
  const lines = await page.locator('[data-testid="timeline-link"]').evaluateAll((els) =>
    els.map((e) => ({ blocker: e.getAttribute('data-blocker'), blocked: e.getAttribute('data-blocked'), d: e.querySelector('path')?.getAttribute('d') })),
  )
  const named = lines.map((l) => `${nameOf[l.blocker]}→${nameOf[l.blocked]}`).sort()
  const edgeAt = async (key) => bar(key).evaluate((e) => ({ left: parseFloat(e.style.left), right: parseFloat(e.style.left) + parseFloat(e.style.width) }))
  const ab = lines.find((l) => nameOf[l.blocker] === 'A' && nameOf[l.blocked] === 'B')
  const abPoints = (ab?.d ?? '').match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
  const aEdge = await edgeAt('A').catch(() => null)
  const bEdge = await edgeAt('B').catch(() => null)
  chk(
    JSON.stringify(named) === JSON.stringify(['A→B', 'B→C', 'D→E']) && !!aEdge && !!bEdge
      && Math.abs(abPoints[0] - aEdge.right) < 1 && Math.abs(abPoints[abPoints.length - 2] - bEdge.left) < 1,
    'a line is drawn from each task to the one waiting on it, from the end of the one bar to the start of the other',
    JSON.stringify({ named, ab: ab?.d, aEdge, bEdge }),
  )

  // ══ 5–6. THE CRITICAL PATH ═════════════════════════════════════════════════════
  console.log('\n▶ Customize › Critical path')
  const pathOff = await criticalOf()
  await toggle('timeline-critical-path')
  await waitUntil(async () => (await criticalOf()).C === 'true', { timeoutMs: 10_000 })
  const pathOn = await criticalOf()
  const redA = await bar('A').evaluate((e) => getComputedStyle(e).backgroundImage).catch(() => '')
  chk(
    Object.values(pathOff).every((v) => v === 'false')
      && pathOn.A === 'true' && pathOn.B === 'true' && pathOn.C === 'true' && pathOn.D === 'false' && pathOn.E === 'false'
      && /239, 68, 68|220, 38, 38|244, 63, 94|225, 29, 72/.test(redA),
    "Customize › Critical path draws the group's last task and the tasks it waits on with no day between in red — C, B and A, not D or E — and draws none until it is asked for",
    JSON.stringify({ pathOff, pathOn, redA: redA.slice(0, 80) }),
  )
  await openGantt()
  const kept = await criticalOf()
  chk(
    kept.A === 'true' && kept.C === 'true' && kept.D === 'false',
    'and the path stays shown as it was left, the page opened again',
    JSON.stringify(kept),
  )

  // ══ 7. SLACK TIME ═════════════════════════════════════════════════════════════
  console.log('\n▶ Customize › Slack time')
  await choosePeriod('day')
  await toggle('timeline-slack-time')
  const slackAt = async (key) => page.locator(`[data-testid="timeline-slack"][data-task-id="${ids[key]}"]`)
  await waitUntil(async () => (await (await slackAt('E')).count()) === 1, { timeoutMs: 10_000 })
  const dayPx = (await axis()).dayPx
  const slack = {}
  for (const key of Object.keys(ids)) {
    const el = await slackAt(key)
    slack[key] = (await el.count()) ? { days: Number(await el.getAttribute('data-slack-days')), width: await el.evaluate((e) => parseFloat(e.style.width)) } : null
  }
  chk(
    slack.A === null && slack.B === null && slack.C === null
      && slack.D?.days === 2 && Math.abs(slack.D.width - 2 * dayPx) < 1 && slack.E?.days === 5 && Math.abs(slack.E.width - 5 * dayPx) < 1,
    'Slack time draws beside each task off the path the days it may slip: two for D, before E needs it, five for E, before the group ends — and none on the path',
    JSON.stringify({ slack, dayPx }),
  )

  // ══ 8–9. A LINE DRAWN, AND TAKEN OUT ══════════════════════════════════════════
  console.log('\n▶ a line drawn from E to C, and double-clicked away')
  await bar('E').hover()
  const dot = bar('E').locator('[data-testid="timeline-connector"][data-end="end"]')
  const from = await dot.boundingBox().catch(() => null)
  const to = await bar('C').boundingBox().catch(() => null)
  if (from && to) {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + ((to.x + to.width / 2 - from.x) * i) / 10, from.y + ((to.y + to.height / 2 - from.y) * i) / 10)
    await page.mouse.up()
  }
  const linked = await waitUntil(() => waitsOn('C', 'E'), { timeoutMs: 10_000 })
  const drawnEC = page.locator(`[data-testid="timeline-link"][data-blocker="${ids.E}"][data-blocked="${ids.C}"]`)
  await drawnEC.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {})
  chk(
    !!from && !!to && linked && (await drawnEC.count()) === 1,
    "a line drawn from the dot at E's end onto C makes C wait on E (read by SQL), and the line is drawn",
    JSON.stringify({ from, to, linked, drawn: await drawnEC.count() }),
  )
  // Double-clicked on the line itself: the middle of its upright, where it is drawn.
  const dPath = (await drawnEC.locator('path').first().getAttribute('d').catch(() => '')) ?? ''
  const nums = dPath.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
  const svgBox = await page.getByTestId('timeline-links').boundingBox().catch(() => null)
  if (svgBox && nums.length >= 8) await page.mouse.dblclick(svgBox.x + nums[2], svgBox.y + (nums[3] + nums[5]) / 2)
  const unlinked = await waitUntil(async () => !(await waitsOn('C', 'E')), { timeoutMs: 10_000 })
  await drawnEC.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
  chk(
    unlinked && (await drawnEC.count()) === 0 && (await waitsOn('B', 'A')),
    'and that line double-clicked is taken out (read by SQL) and drawn no more, the others left as they were',
    JSON.stringify({ unlinked, drawn: await drawnEC.count() }),
  )

  // ══ 10–11. A BAR DRAGGED, AND A BAR PRESSED ═══════════════════════════════════
  console.log('\n▶ a bar dragged two days, and one pressed')
  const dBox = await bar('D').boundingBox().catch(() => null)
  if (dBox) {
    await page.mouse.move(dBox.x + dBox.width / 2, dBox.y + dBox.height / 2)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) await page.mouse.move(dBox.x + dBox.width / 2 + (2 * dayPx * i) / 8, dBox.y + dBox.height / 2)
    await page.mouse.up()
  }
  const moved = await waitUntil(async () => {
    const [row] = await sql`select start_date, due_date from tasks where id = ${ids.D}`
    return row && new Date(row.start_date).toISOString() === day(4) && new Date(row.due_date).toISOString() === day(5) ? row : null
  }, { timeoutMs: 10_000 })
  await openGantt()
  const dTitle = await bar('D').getAttribute('title').catch(() => null)
  chk(
    !!dBox && !!moved && /· Mar 4 – Mar 5$/.test(dTitle ?? ''),
    'a bar dragged two days moves both its dates two days, still date-only (read by SQL), and is drawn there when the page is opened again',
    JSON.stringify({ moved, dTitle }),
  )
  // A press that cannot land is this check failing, not the run ending (a line's hit area over the bar was one).
  await bar('A').click({ timeout: 8000 }).catch(() => {})
  const sheet = page.getByTestId('task-sheet').first()
  await sheet.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  const opened = await sheet.isVisible().catch(() => false)
  chk(
    opened,
    'a press on a bar that does not move it opens the task',
    JSON.stringify({ url: page.url(), opened }),
  )
  await page.keyboard.press('Escape').catch(() => {})

  // ══ 12–14. EXPORT ═════════════════════════════════════════════════════════════
  console.log('\n▶ Export: a PNG, a PDF, and on Pro the plan says so')
  await openGantt()
  const png = await download('timeline-export-png').catch(() => ({ name: null, bytes: Buffer.alloc(0) }))
  const pngOk = png.bytes.length > 24 && png.bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const pngW = pngOk ? png.bytes.readUInt32BE(16) : 0
  const pngH = pngOk ? png.bytes.readUInt32BE(20) : 0
  chk(
    pngOk && /^rundesk-gantt-\d{4}-\d{2}-\d{2}\.png$/.test(png.name ?? '') && pngW > 260 && pngH >= 36 + 30 + 26 + 5 * 30,
    "Export › PNG downloads the picture of the view: a PNG wider than the task names, as tall as its group and five tasks",
    JSON.stringify({ name: png.name, size: png.bytes.length, pngW, pngH }),
  )
  const pdf = await download('timeline-export-pdf').catch(() => ({ name: null, bytes: Buffer.alloc(0) }))
  const pdfText = pdf.bytes.toString('latin1')
  const jpegAt = pdfText.indexOf('stream\n', pdfText.indexOf('/DCTDecode')) + 'stream\n'.length
  chk(
    pdfText.startsWith('%PDF-') && /\/Subtype \/Image .*\/Filter \/DCTDecode/.test(pdfText) && pdf.bytes[jpegAt] === 0xff && pdf.bytes[jpegAt + 1] === 0xd8 && pdfText.trimEnd().endsWith('%%EOF')
      && /^rundesk-gantt-\d{4}-\d{2}-\d{2}\.pdf$/.test(pdf.name ?? ''),
    'and Export › PDF a one-page PDF holding that picture as a JPEG',
    JSON.stringify({ name: pdf.name, size: pdf.bytes.length, head: pdfText.slice(0, 9), jpeg: [pdf.bytes[jpegAt], pdf.bytes[jpegAt + 1]] }),
  )
  await sql`update workspaces set plan = 'pro' where id = ${WS}`
  // The gate lets a plan still loading through, so the plan is read before the press.
  const planRead = page.waitForResponse((r) => r.url().includes(`/workspaces/${WS}/plan`) && r.status() === 200, { timeout: 30_000 }).then(() => true, () => false)
  await openGantt()
  const planSeen = await planRead
  await page.getByTestId('timeline-export-menu').click()
  const anyDownload = page.waitForEvent('download', { timeout: 4000 }).then(() => 'downloaded', () => 'none')
  await page.getByTestId('timeline-export-png').click()
  const refused = await anyDownload
  const gate = page.getByTestId('feature-gate')
  await gate.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  const gatePlan = await page.getByTestId('feature-gate-plan').getAttribute('data-plan').catch(() => null)
  const gateName = (await page.getByTestId('feature-gate-name').filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')).trim()
  await page.getByTestId('feature-gate-dismiss').click().catch(() => page.keyboard.press('Escape'))
  const csv = await download('timeline-export').catch(() => ({ name: null, bytes: Buffer.alloc(0) }))
  chk(
    planSeen && refused === 'none' && gatePlan === 'business' && /Gantt export/i.test(gateName)
      && /^rundesk-gantt-\d{4}-\d{2}-\d{2}\.csv$/.test(csv.name ?? '') && csv.bytes.toString('utf8').includes(`C ${TAG}`),
    'on Pro, PDF and PNG open the plan’s gate naming Business and download nothing, while the CSV of the same rows stays free',
    JSON.stringify({ planSeen, refused, gatePlan, gateName, csv: csv.name }),
  )
  await sql`update workspaces set plan = 'business' where id = ${WS}`

  // ══ 15. THE WORKSPACE TIMELINE DRAWS THE SAME CHART ═══════════════════════════
  console.log('\n▶ the workspace timeline: the same chart')
  await page.goto(`${B}/app/${WS}/timeline`, { waitUntil: 'domcontentloaded' })
  await bar('C').waitFor({ state: 'visible', timeout: 20_000 })
  await toggle('timeline-critical-path')
  await waitUntil(async () => (await criticalOf()).C === 'true', { timeoutMs: 10_000 })
  const timelineLines = (await page.locator('[data-testid="timeline-link"]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-blocker'), e.getAttribute('data-blocked')])))
    .map(([a, b]) => `${nameOf[a]}→${nameOf[b]}`)
    .sort()
  const timelinePath = await criticalOf()
  const periods = await page.getByTestId('timeline-period').count()
  chk(
    JSON.stringify(timelineLines) === JSON.stringify(['A→B', 'B→C', 'D→E']) && timelinePath.A === 'true' && timelinePath.B === 'true' && timelinePath.C === 'true'
      && timelinePath.D === 'false' && timelinePath.E === 'false' && periods === 1,
    'the workspace timeline draws the same chart: the same lines between the same tasks, its time period, and the critical path as the list’s tab draws it',
    JSON.stringify({ timelineLines, timelinePath, periods }),
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${err?.stack ?? err}`)
} finally {
  await browser?.close().catch(() => {})
  if (sql) {
    if (WS) await sql`delete from workspaces where id = ${WS}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  // `close`: the stack has no `stop` (`found-12-oct/suites-stop-a-stack-with-no-stop`).
  stack.close()
}

const ran = passed + failed
if (ran !== EXPECTED_CHECKS) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${ran} checks, expected exactly ${EXPECTED_CHECKS}`)
}
console.log(`\n${passed} passed, ${failed} failed`)
process.exitCode = failed > 0 ? 1 : 0
