/**
 * WHAT A TASK'S DATES AND ESTIMATE MAY BE — every write that sets them takes
 * them as they are sent.
 *
 * NOT A FRAME ROW: the owner's decision of 1 October on two ledger items found
 * closing `found-30-sep/template-submit-ignores-the-form`.
 *
 * `found-30-sep/a-task-starts-after-it-is-due`. A task may start after it is
 * due: `POST /tasks`, `PATCH`, the bulk editor, a template's task, a duplicate
 * and the next occurrence of a recurring task each take the two dates as they
 * are sent, and the task sheet and the create modal let the person type them
 * so. A template's date stands beside a typed one; each date that is not typed
 * is the template's.
 *
 * `found-30-sep/task-estimate-below-zero`. An estimate below nought is taken by
 * `POST /tasks`, `PATCH` and the bulk editor, and a duplicate copies one as it
 * is held. The template's route (`InstantiateTemplateDto`) refuses one below
 * nought, as it always has.
 *
 * AND WHAT A REFUSAL SAYS, whatever refused it: the list's bulk bar says how
 * many of the selected tasks the server did not change, and why; the task sheet
 * and a row edit on the list page (`patchTaskSaying`, which the calendar drop
 * and the Gantt shift send through too) say a refused change in the server's
 * words.
 *
 * EVERY WRITE IS READ BACK FROM THE ROW, not from the answer alone.
 *
 *   node test/e2e/task-values.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 16

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

const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `tvl${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`, status 0 when nothing answers; every
 * read below bounds it from beneath (lib/fixture.mjs's one client). */
const apiAs = apiAsAt(API)
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — every write is read back from the row')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  /* A refused write stops the suite, naming what could not be staged. */
  const must = (what, res) => {
    if (!res.ok) throw new Error(`could not ${what}: ${said(res)}`)
    return res.data
  }
  WS = must('make the workspace', await A('/workspaces', { method: 'POST', body: { name: TAG } }))?.id
  const SPACE = must('make the space', await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } }))?.id
  const PROJECT = must('make the project', await A('/projects', { method: 'POST', body: { spaceId: SPACE, name: `${TAG} project` } }))?.id
  const LIST = must('make the list', await A('/lists', { method: 'POST', body: { projectId: PROJECT, name: `${TAG} list` } }))?.id
  if (!WS || !SPACE || !PROJECT || !LIST) throw new Error('the workspace, space, project or list came back without an id')

  /** Noon UTC, `n` days from today — a moment. */
  const day = (n, hour = 12) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + n)
    d.setUTCHours(hour, 0, 0, 0)
    return d.toISOString()
  }
  const ms = (v) => (v ? new Date(v).getTime() : null)
  /*
   * A task starting ten days out and due in three, its dates put by SQL: the
   * checks of a duplicate and of Save as template read what those routes do
   * with such a task, whatever POST /tasks (checked on its own above) does.
   */
  const lateTask = async (title) => {
    const id = must(`make the task ${title}`, await A('/tasks', { method: 'POST', body: { listId: LIST, title } }))?.id
    await sql`update tasks set start_date = ${day(10)}, due_date = ${day(3)} where id = ${id}`
    return id
  }
  /** Whole days from now to a stored date, as a template's offset counts them. */
  const daysOut = (v) => (v ? Math.round((new Date(v).getTime() - Date.now()) / 86_400_000) : null)
  const rowOf = async (id) =>
    (await sql`select start_date, due_date, time_estimate, priority from tasks where id = ${id}`)[0] ?? null
  const rowsTitled = (title) => sql`select id, start_date, due_date, time_estimate from tasks where list_id = ${LIST} and title = ${title}`
  /** A task made through the API with these fields, its id. */
  const makeTask = async (title, fields = {}) =>
    must(`make the task ${title}`, await A('/tasks', { method: 'POST', body: { listId: LIST, title, ...fields } }))?.id

  // ══ 1. A TASK THAT STARTS AFTER IT IS DUE, THROUGH THE API ═══════════════
  console.log('\n▶ found-30-sep/a-task-starts-after-it-is-due — a start after the due date is taken')
  const LATE = `Late ${TAG}`
  const late = await A('/tasks', { method: 'POST', body: { listId: LIST, title: LATE, startDate: day(10), dueDate: day(3) } })
  const lateRows = await rowsTitled(LATE)
  chk(
    late.status === 201 && lateRows.length === 1 && ms(lateRows[0].start_date) === ms(day(10)) && ms(lateRows[0].due_date) === ms(day(3)),
    'POST /tasks makes a task that starts after it is due, holding both dates as sent (read by SQL)',
    `it answered ${said(late)}; ${lateRows.length} task(s) so titled, holding ${JSON.stringify(lateRows[0] ?? null)}`,
  )

  // PATCH: the start moved past the due it holds; the due moved before the start it holds; both the wrong way round.
  const patchAnswers = []
  for (const body of [{ startDate: day(10) }, { dueDate: day(-2) }, { startDate: day(12), dueDate: day(4) }]) {
    const P = await makeTask(`Patched ${Object.keys(body).join('+')} ${TAG}`, { startDate: day(1), dueDate: day(3) })
    const r = await A(`/tasks/${P}`, { method: 'PATCH', body })
    const held = await rowOf(P)
    const want = { start: ms(body.startDate ?? day(1)), due: ms(body.dueDate ?? day(3)) }
    patchAnswers.push({ sent: Object.keys(body).join('+'), status: r.status, kept: ms(held?.start_date) === want.start && ms(held?.due_date) === want.due })
  }
  chk(
    patchAnswers.every((a) => a.status === 200 && a.kept),
    'PATCH /tasks/:id takes a start moved past the due date the task holds, a due date moved before its start, and both sent the wrong way round (200 each), holding each as sent (read by SQL)',
    `answered ${JSON.stringify(patchAnswers)}`,
  )

  // The bulk editor: a start set on two tasks, one due before it, one after; then both dates the wrong way round.
  const EARLY = await makeTask(`Bulk due early ${TAG}`, { dueDate: day(3) })
  const LATER = await makeTask(`Bulk due later ${TAG}`, { dueDate: day(20) })
  const bulk = await A('/tasks/bulk/update', { method: 'PATCH', body: { taskIds: [EARLY, LATER], patch: { startDate: day(10) } } })
  const earlyRow = await rowOf(EARLY)
  const laterRow = await rowOf(LATER)
  const bulkBoth = await A('/tasks/bulk/update', { method: 'PATCH', body: { taskIds: [EARLY, LATER], patch: { startDate: day(15), dueDate: day(5) } } })
  const bothRows = [await rowOf(EARLY), await rowOf(LATER)]
  chk(
    bulk.status === 200 && bulk.data?.updatedCount === 2 && bulk.data?.failedCount === 0
      && ms(earlyRow?.start_date) === ms(day(10)) && ms(laterRow?.start_date) === ms(day(10))
      && bulkBoth.status === 200 && bulkBoth.data?.updatedCount === 2
      && bothRows.every((r) => ms(r?.start_date) === ms(day(15)) && ms(r?.due_date) === ms(day(5))),
    'the bulk editor changes every task it sets a start after its due date for, and every task it sends two dates the wrong way round, failing none (read by SQL)',
    `the start answered ${said(bulk)} with ${JSON.stringify({ updated: bulk.data?.updatedCount, failed: bulk.data?.failed })}, storing ${JSON.stringify([earlyRow, laterRow])}; ` +
      `both dates ${said(bulkBoth)} with ${JSON.stringify({ updated: bulkBoth.data?.updatedCount, failed: bulkBoth.data?.failed })}, storing ${JSON.stringify(bothRows)}`,
  )

  // A template starting nine days out; a due date typed three days out beside it; then both typed the wrong way round.
  const TPL = must('make the template', await A(`/workspaces/${WS}/task-templates`, {
    method: 'POST', body: { name: `Starts late ${TAG}`, payload: { title: `From the template ${TAG}`, startDateOffsetDays: 9 } },
  }))?.id
  const fromTpl = await A(`/workspaces/${WS}/task-templates/${TPL}/instantiate`, { method: 'POST', body: { listId: LIST, titleOverride: `Typed due ${TAG}`, dueDate: day(3) } })
  const fromTplRow = fromTpl.data?.taskId ? await rowOf(fromTpl.data.taskId) : null
  const BOTH_TYPED = `Both typed ${TAG}`
  const bothTyped = await A(`/workspaces/${WS}/task-templates/${TPL}/instantiate`, {
    method: 'POST', body: { listId: LIST, titleOverride: BOTH_TYPED, startDate: day(10), dueDate: day(3) },
  })
  const bothTypedRows = await rowsTitled(BOTH_TYPED)
  chk(
    fromTpl.status === 201 && ms(fromTplRow?.due_date) === ms(day(3)) && daysOut(fromTplRow?.start_date) === 9
      && bothTyped.status === 201 && bothTypedRows.length === 1
      && ms(bothTypedRows[0].start_date) === ms(day(10)) && ms(bothTypedRows[0].due_date) === ms(day(3)),
    'a task made from a template starting nine days out, with a due date typed three days out, is due when typed and starts when the template says; with both typed the wrong way round, it holds both as typed (read by SQL)',
    `the typed due date answered ${said(fromTpl)}, the task holding ${JSON.stringify(fromTplRow)}; both typed ${said(bothTyped)}, ${bothTypedRows.length} so titled, holding ${JSON.stringify(bothTypedRows[0] ?? null)}`,
  )

  // A template made starting after it is due; and one saved from a task that does.
  const INVERTED_TPL = `Inverted ${TAG}`
  const invertedTpl = await A(`/workspaces/${WS}/task-templates`, {
    method: 'POST', body: { name: INVERTED_TPL, payload: { title: INVERTED_TPL, startDateOffsetDays: 9, dueDateOffsetDays: 3 } },
  })
  const invertedSaved = (await sql`select payload->'startDateOffsetDays' as s, payload->'dueDateOffsetDays' as d from task_templates where workspace_id = ${WS} and name = ${INVERTED_TPL}`)[0] ?? null
  const LATE_SRC = await lateTask(`Save me late ${TAG}`)
  const SAVED_LATE = `Saved late ${TAG}`
  const savedLate = await A(`/workspaces/${WS}/task-templates/from-task/${LATE_SRC}`, { method: 'POST', body: { name: SAVED_LATE } })
  const savedLateRow = (await sql`select payload->'startDateOffsetDays' as s, payload->'dueDateOffsetDays' as d from task_templates where workspace_id = ${WS} and name = ${SAVED_LATE}`)[0] ?? null
  chk(
    invertedTpl.status === 201 && invertedSaved?.s === 9 && invertedSaved?.d === 3
      && savedLate.status === 201 && savedLateRow?.s === 10 && savedLateRow?.d === 3,
    'a template whose own start date is after its due date is saved, whether made so or saved from a task that starts after it is due (read by SQL)',
    `making it answered ${said(invertedTpl)}, holding ${JSON.stringify(invertedSaved)}; saving it from the task ${said(savedLate)}, holding ${JSON.stringify(savedLateRow)}`,
  )

  // A task that starts after it is due, duplicated.
  const DUP_LATE = `Duplicated late ${TAG}`
  const DUP_LATE_ID = await lateTask(DUP_LATE)
  const dupLate = await A(`/workspaces/${WS}/task-templates/duplicate/${DUP_LATE_ID}`, { method: 'POST', body: {} })
  const dupLateRows = await rowsTitled(`${DUP_LATE} (copy)`)
  chk(
    dupLate.status === 201 && dupLateRows.length === 1 && ms(dupLateRows[0].start_date) === ms(day(10)) && ms(dupLateRows[0].due_date) === ms(day(3)),
    'duplicating a task that starts after it is due makes a copy holding both dates (read by SQL)',
    `it answered ${said(dupLate)}; ${dupLateRows.length} cop${dupLateRows.length === 1 ? 'y' : 'ies'}, holding ${JSON.stringify(dupLateRows[0] ?? null)}`,
  )

  // A monthly task starting at 14:00 on the 5th of the coming month and due at 09:00 on the 20th; its next occurrence.
  // Wall-clock hours, as the rule moves them (`shiftByRecurrenceRule`, in the API's zone, which is this machine's).
  const RECURRING = `Monthly ${TAG}`
  const now = new Date()
  const recStart = new Date(now.getFullYear(), now.getMonth() + 1, 5, 14)
  const recDue = new Date(now.getFullYear(), now.getMonth() + 1, 20, 9)
  const REC = await makeTask(RECURRING, { startDate: recStart.toISOString(), dueDate: recDue.toISOString() })
  const next = await A(`/tasks/${REC}/recurring/next`, { method: 'POST', body: { recurrenceRule: { mode: 'monthly', dayOfMonth: 1 } } })
  const nextRows = (await rowsTitled(RECURRING)).filter((r) => r.id !== REC)
  const nextStart = new Date(now.getFullYear(), now.getMonth() + 2, 1, 14)
  const nextDue = new Date(now.getFullYear(), now.getMonth() + 2, 1, 9)
  chk(
    next.status === 201 && nextRows.length === 1 && ms(nextRows[0].start_date) === nextStart.getTime() && ms(nextRows[0].due_date) === nextDue.getTime(),
    'the next occurrence of a monthly task moves each date by its rule: both on the 1st, the start at its own hour after the due at its own (read by SQL)',
    `it answered ${said(next)}; ${nextRows.length} next occurrence(s), holding ${JSON.stringify(nextRows[0] ?? null)}; wanted ${nextStart.toISOString()} and ${nextDue.toISOString()}`,
  )

  // ══ 2. AN ESTIMATE BELOW NOUGHT ══════════════════════════════════════════
  console.log('\n▶ found-30-sep/task-estimate-below-zero — an estimate below nought is taken')
  const NEG = `Below nought ${TAG}`
  const neg = await A('/tasks', { method: 'POST', body: { listId: LIST, title: NEG, timeEstimate: -3600 } })
  const negRows = await rowsTitled(NEG)
  const NEG_TPL = `Below nought from the template ${TAG}`
  const negTpl = await A(`/workspaces/${WS}/task-templates/${TPL}/instantiate`, { method: 'POST', body: { listId: LIST, titleOverride: NEG_TPL, timeEstimate: -3600 } })
  const negTplRows = await rowsTitled(NEG_TPL)
  chk(
    neg.status === 201 && negRows.length === 1 && negRows[0].time_estimate === -3600 && negTpl.status === 400 && negTplRows.length === 0,
    'POST /tasks makes a task estimated below nought and stores it, while the template’s route refuses one below nought (400), as it always has (read by SQL)',
    `POST /tasks answered ${said(neg)}, storing ${JSON.stringify(negRows.map((r) => r.time_estimate))}; the template’s route ${said(negTpl)}, ${negTplRows.length} task(s) so titled`,
  )
  const E = await makeTask(`Estimated ${TAG}`, { timeEstimate: 5400 })
  const negPatch = await A(`/tasks/${E}`, { method: 'PATCH', body: { timeEstimate: -60 } })
  const ePatched = await rowOf(E)
  chk(
    negPatch.status === 200 && ePatched?.time_estimate === -60,
    'PATCH /tasks/:id takes an estimate below nought and stores it (read by SQL)',
    `it answered ${said(negPatch)}; the task holds ${ePatched?.time_estimate ?? null}`,
  )
  const negBulk = await A('/tasks/bulk/update', { method: 'PATCH', body: { taskIds: [E, LATER], patch: { timeEstimate: -120 } } })
  const eBulk = await rowOf(E)
  const laterBulk = await rowOf(LATER)
  chk(
    negBulk.status === 200 && negBulk.data?.updatedCount === 2 && eBulk?.time_estimate === -120 && laterBulk?.time_estimate === -120,
    'the bulk editor sets an estimate below nought on every task it is given (read by SQL)',
    `it answered ${said(negBulk)} with ${JSON.stringify({ updated: negBulk.data?.updatedCount, failed: negBulk.data?.failed })}; the tasks hold ${eBulk?.time_estimate ?? null} and ${laterBulk?.time_estimate ?? null}`,
  )

  // A task whose subtask is estimated below nought (put so by SQL, whatever POST /tasks does), duplicated.
  const DUP = `Subtask below nought ${TAG}`
  const DUP_ID = await makeTask(DUP, { timeEstimate: 600 })
  const DUP_SUB = await makeTask(`Its subtask ${TAG}`, { parentTaskId: DUP_ID, timeEstimate: 300 })
  await sql`update tasks set time_estimate = -60 where id = ${DUP_SUB}`
  const dupSub = await A(`/workspaces/${WS}/task-templates/duplicate/${DUP_ID}`, { method: 'POST', body: {} })
  const dupCopies = await rowsTitled(`${DUP} (copy)`)
  const dupSubs = dupCopies.length === 1 ? await sql`select time_estimate from tasks where parent_task_id = ${dupCopies[0].id}` : []
  const dupAudit = (await sql`select count(*)::int as n from audit_logs where action = 'task.duplicated' and metadata->>'sourceTaskId' = ${DUP_ID}`)[0]?.n ?? -1
  chk(
    dupSub.status === 201 && dupCopies.length === 1 && dupCopies[0].time_estimate === 600 && dupSubs.length === 1 && dupSubs[0].time_estimate === -60 && dupAudit === 1,
    'duplicating a task whose subtask is estimated below nought copies it whole, the subtask with its estimate, and records it (201, read by SQL)',
    `it answered ${said(dupSub)}; ${dupCopies.length} cop${dupCopies.length === 1 ? 'y' : 'ies'} holding ${JSON.stringify(dupCopies.map((c) => c.time_estimate))}, ` +
      `with subtasks ${JSON.stringify(dupSubs)}; ${dupAudit} duplicate(s) recorded`,
  )

  // ══ 3. THE TASK SHEET, THE CREATE MODAL AND THE BULK BAR ══════════════════
  console.log('\n▶ the task sheet and the create modal take a start after the due date; the bulk bar says what it could not change')
  browser = await (await resolveChromium()).launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email, { timeout: 15_000 }).catch(() => {})
  await page.fill('input[type=password]', ADMIN.password, { timeout: 15_000 }).catch(() => {})
  await page.click('button[type=submit]', { timeout: 15_000 }).catch(() => {})
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS }).catch(() => {})
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  const toasts = () => page.locator('[data-sonner-toast]').filter({ visible: true }).allInnerTexts().catch(() => [])
  /** A day from today at an hour, as a `datetime-local` box holds it, on this machine's clock (the browser's). */
  const dayAt = (days, hour) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`
  }

  // The sheet: a task starting tomorrow at 09:00 and due in three days at 17:00; a start typed ten days out.
  const SHEET_START = dayAt(1, 9)
  const SHEET_DUE = dayAt(3, 17)
  const S = await makeTask(`Sheet ${TAG}`, { startDate: new Date(SHEET_START).toISOString(), dueDate: new Date(SHEET_DUE).toISOString() })
  await page.goto(`${B}/app/${WS}/${SPACE}/${PROJECT}/${LIST}?task=${S}`, { waitUntil: 'domcontentloaded' })
  const startBox = page.getByTestId('task-start-date')
  const dueBox = page.getByTestId('task-due-date')
  const sheetReady = await waitUntil(async () => (await startBox.inputValue({ timeout: 1000 }).catch(() => '')) === SHEET_START, { timeoutMs: 20_000 })
  const bounds = {
    startMax: await startBox.getAttribute('max', { timeout: 1000 }).catch(() => 'unread'),
    dueMin: await dueBox.getAttribute('min', { timeout: 1000 }).catch(() => 'unread'),
  }
  const patched = page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname.endsWith(`/tasks/${S}`), { timeout: 15_000 }).catch(() => null)
  await startBox.fill(dayAt(10, 9), { timeout: 5000 }).catch(() => {})
  const sheetAnswer = (await patched)?.status() ?? null
  let sheetRow = null
  await waitUntil(async () => ms((sheetRow = await rowOf(S))?.start_date) === ms(new Date(dayAt(10, 9)).toISOString()), { timeoutMs: 10_000 })
  const sheetToasts = (await toasts()).filter((s) => /start|due|refused|cannot/i.test(s))
  chk(
    sheetReady && bounds.startMax === null && bounds.dueMin === null && sheetAnswer === 200 && sheetToasts.length === 0
      && ms(sheetRow?.start_date) === ms(new Date(dayAt(10, 9)).toISOString()) && ms(sheetRow?.due_date) === ms(new Date(SHEET_DUE).toISOString()),
    'the task sheet takes a start date typed after the due date — the PATCH answers 200, the task holds it, and nothing is said against it — and neither date box is bounded by the other (read by SQL)',
    `the sheet showed the start ${sheetReady}; the boxes' bounds ${JSON.stringify(bounds)}; the PATCH answered ${sheetAnswer ?? 'nothing'}; toasts ${JSON.stringify(sheetToasts)}; the task holds ${JSON.stringify(sheetRow)}`,
  )

  // The create modal: a start typed ten days out and a due date three days out.
  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('quick-create-open').click({ timeout: 25_000 }).catch(() => {})
  await page.getByTestId('create-tab-task').click({ timeout: 10_000 }).catch(() => {})
  await waitUntil(() => page.getByTestId('quick-create-task-title').isVisible().catch(() => false), { timeoutMs: 15_000 })
  await page.getByTestId('quick-create-space').selectOption(SPACE, { timeout: 10_000 }).catch(() => {})
  await page.getByTestId('quick-create-project').selectOption(PROJECT, { timeout: 10_000 }).catch(() => {})
  await page.getByTestId('quick-create-list').selectOption(LIST, { timeout: 10_000 }).catch(() => {})
  const MODAL = `Modal ${TAG}`
  await page.getByTestId('quick-create-task-title').fill(MODAL, { timeout: 5000 }).catch(() => {})
  await page.getByTestId('quick-create-start').fill(dayAt(10, 9), { timeout: 5000 }).catch(() => {})
  await page.getByTestId('quick-create-due').fill(dayAt(3, 17), { timeout: 5000 }).catch(() => {})
  const submit = page.getByTestId('quick-create-submit')
  const offered = await waitUntil(() => submit.isEnabled().catch(() => false), { timeoutMs: 5000 })
  const alerts = (await page.getByRole('alert').filter({ visible: true }).allInnerTexts().catch(() => [])).filter((s) => /start|due/i.test(s))
  await submit.click({ timeout: 5000 }).catch(() => {})
  let modalRows = []
  await waitUntil(async () => (modalRows = await rowsTitled(MODAL)).length > 0, { timeoutMs: 15_000 })
  chk(
    offered && alerts.length === 0 && modalRows.length === 1
      && ms(modalRows[0].start_date) === ms(new Date(dayAt(10, 9)).toISOString()) && ms(modalRows[0].due_date) === ms(new Date(dayAt(3, 17)).toISOString()),
    'the create modal makes a task whose start is typed after its due date: nothing is said beside the dates, Create is offered, and the task holds both (read by SQL)',
    `Create was offered ${offered}; alerts beside the dates ${JSON.stringify(alerts)}; ${modalRows.length} task(s) so titled, holding ${JSON.stringify(modalRows[0] ?? null)}`,
  )

  // The bulk bar: two tasks selected, one of them put in the bin meanwhile, then a priority set on both.
  const KEPT = await makeTask(`Bulk bar kept ${TAG}`)
  const BINNED = await makeTask(`Bulk bar binned ${TAG}`)
  await page.goto(`${B}/app/${WS}/${SPACE}/${PROJECT}/${LIST}`, { waitUntil: 'domcontentloaded' })
  const rowBox = (id) => page.locator(`[data-testid="list-task-row"][data-task-id="${id}"] input[type=checkbox]`)
  const rowsShown = await waitUntil(async () => (await rowBox(KEPT).isVisible().catch(() => false)) && (await rowBox(BINNED).isVisible().catch(() => false)), { timeoutMs: 20_000 })
  await rowBox(KEPT).check({ timeout: 5000 }).catch(() => {})
  await rowBox(BINNED).check({ timeout: 5000 }).catch(() => {})
  const binned = await A(`/tasks/${BINNED}`, { method: 'DELETE' })
  const prioritySelect = page.getByLabel('Set priority', { exact: true })
  const barShown = await waitUntil(() => prioritySelect.isVisible().catch(() => false), { timeoutMs: 10_000 })
  const bulked = page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname.endsWith('/tasks/bulk/update'), { timeout: 15_000 }).catch(() => null)
  await prioritySelect.selectOption('high', { timeout: 5000 }).catch(() => {})
  const bulkAnswer = (await bulked)?.status() ?? null
  let barToast = ''
  await waitUntil(async () => (barToast = (await toasts()).find((s) => /1 task was not changed/.test(s)) ?? '').length > 0, { timeoutMs: 10_000 })
  const keptRow = await rowOf(KEPT)
  const binnedRow = await rowOf(BINNED)
  chk(
    rowsShown && barShown && [200, 204].includes(binned.status) && bulkAnswer === 200
      && /in the bin/i.test(barToast) && keptRow?.priority === 'high' && binnedRow?.priority !== 'high',
    'the list’s bulk bar says how many of the selected tasks the server did not change, and why, and the rest are changed (read by SQL)',
    `the rows showed ${rowsShown}, the bar ${barShown}; binning answered ${said(binned)}; the bulk edit ${bulkAnswer ?? 'nothing'}; the toast read ${JSON.stringify(barToast || (await toasts()))}; ` +
      `the kept task holds ${keptRow?.priority ?? null}, the binned ${binnedRow?.priority ?? null}`,
  )

  // ══ 4. A REFUSED CHANGE IS SAID IN THE SERVER'S WORDS ═════════════════════
  console.log('\n▶ the task sheet and a row edit say a refused change in the server’s words')
  /*
   * Each task is put in the bin BY SQL while the page shows it, as binning does
   * it (`deleteTask`) but with no event: the list page redraws on a bin's event
   * and the row would be gone before it is changed. What is checked is what the
   * page says when the server refuses a change; the bin is only the refusal.
   */
  const binBySql = (id) => sql`update tasks set is_archived = true, archived_at = now() where id = ${id}`
  /** The PATCH of this task the page sends next, and the server's sentence in its answer. */
  const nextPatchOf = (id) => page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname.endsWith(`/tasks/${id}`), { timeout: 15_000 })
    .then(async (r) => {
      const body = await r.json().catch(() => null)
      return { status: r.status(), words: String(body?.message ?? body?.error?.message ?? '') }
    })
    .catch(() => ({ status: null, words: '' }))

  // The sheet: a task binned while its sheet is open, then a start typed.
  const SB_START = dayAt(1, 9)
  const SB = await makeTask(`Sheet refused ${TAG}`, { startDate: new Date(SB_START).toISOString(), dueDate: new Date(SHEET_DUE).toISOString() })
  await page.goto(`${B}/app/${WS}/${SPACE}/${PROJECT}/${LIST}?task=${SB}`, { waitUntil: 'domcontentloaded' })
  const sbReady = await waitUntil(async () => (await startBox.inputValue({ timeout: 1000 }).catch(() => '')) === SB_START, { timeoutMs: 20_000 })
  await binBySql(SB)
  const sbPatch = nextPatchOf(SB)
  await startBox.fill(dayAt(2, 9), { timeout: 5000 }).catch(() => {})
  const sbAnswer = await sbPatch
  let sbToast = ''
  await waitUntil(async () => (sbToast = (sbAnswer.words && (await toasts()).find((s) => s.includes(sbAnswer.words))) || '').length > 0, { timeoutMs: 10_000 })
  const sbRow = await rowOf(SB)
  chk(
    sbReady && sbAnswer.status === 409 && sbAnswer.words.length > 0 && sbToast.length > 0 && ms(sbRow?.start_date) === ms(new Date(SB_START).toISOString()),
    'the task sheet says a refused change in the server’s words: a start typed on a task put in the bin meanwhile is refused (409), the toast carries the server’s sentence, and the task keeps its start (read by SQL)',
    `the sheet showed the start ${sbReady}; the PATCH answered ${sbAnswer.status ?? 'nothing'} saying ${JSON.stringify(sbAnswer.words)}; the toasts read ${JSON.stringify(await toasts())}; the task holds ${JSON.stringify(sbRow)}`,
  )

  // A row edit in the Table view: a priority picked on a task binned while its menu is open.
  const RB = await makeTask(`Row refused ${TAG}`, { priority: 'normal' })
  await page.goto(`${B}/app/${WS}/${SPACE}/${PROJECT}/${LIST}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('work-view-tab-type-table').click({ timeout: 20_000 }).catch(() => {})
  const tableRow = page.locator(`[data-testid="list-table-row"][data-task-id="${RB}"]`).first()
  const rbShown = await waitUntil(() => tableRow.isVisible().catch(() => false), { timeoutMs: 20_000 })
  await tableRow.getByTestId('list-table-priority-button').click({ timeout: 5000 }).catch(() => {})
  const rbMenu = await waitUntil(() => tableRow.getByRole('button', { name: /^high$/i }).first().isVisible().catch(() => false), { timeoutMs: 5000 })
  await binBySql(RB)
  const rbPatch = nextPatchOf(RB)
  await tableRow.getByRole('button', { name: /^high$/i }).first().click({ timeout: 5000 }).catch(() => {})
  const rbAnswer = await rbPatch
  let rbToast = ''
  await waitUntil(async () => (rbToast = (rbAnswer.words && (await toasts()).find((s) => s.includes(rbAnswer.words))) || '').length > 0, { timeoutMs: 10_000 })
  const rbRow = await rowOf(RB)
  chk(
    rbShown && rbMenu && rbAnswer.status === 409 && rbAnswer.words.length > 0 && rbToast.length > 0 && rbRow?.priority === 'normal',
    'a row edit on the list page says a refused change in the server’s words: a priority picked in the Table view on a task put in the bin meanwhile is refused (409), the toast carries the server’s sentence, and the task keeps its priority (read by SQL)',
    `the row showed ${rbShown}, its menu ${rbMenu}; the PATCH answered ${rbAnswer.status ?? 'nothing'} saying ${JSON.stringify(rbAnswer.words)}; the toasts read ${JSON.stringify(await toasts())}; the task holds ${rbRow?.priority ?? null}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  // Archived through the API, as a person would; then the row and everything
  // under it removed by id, since an archive keeps them.
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  if (sql && WS) {
    await sql`delete from workspaces where id = ${WS}`
      .catch((e) => console.log(`  cleanup left behind: workspace ${WS} (${e.message})`))
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
