/**
 * WHAT A TASK'S DATES AND ESTIMATE MAY BE — every write that sets them.
 *
 * NOT A FRAME ROW: two ledger items found closing
 * `found-30-sep/template-submit-ignores-the-form`.
 *
 * `found-30-sep/a-task-starts-after-it-is-due`. Nothing refused a start after
 * the due date. Measured on lane 5, three runs: `POST /tasks` starting in ten
 * days and due in three answered 201; `PATCH` the same dates 200, and so did a
 * start moved past the due date the task held, and a due date moved before its
 * start; the bulk editor changed the task; a template starting in nine days
 * made beside a due date typed three days out gave a task starting six days
 * after it was due; two typed the wrong way round beside a template, 201; and
 * a duplicate of such a task, 201.
 *
 * ClickUp keeps the rule. Its feedback board ("Improve the Start/Due date and
 * time setting experience in Task view", read through search excerpts, the
 * board being blocked here) says that "when you set a start date that is after
 * a due date, it deletes the due date", and its users ask for "a warning" that
 * does "not let you save" instead. OWASP's Input Validation Cheat Sheet names
 * the case: semantic validation "should enforce correctness of their values in
 * the specific business context (e.g. start date is before end date …)". So a
 * write that would leave a task starting after it is due is REFUSED, with the
 * reason, and nothing is written — no date the caller named is deleted. A
 * template's date that contradicts one the person typed gives way to it, as
 * ClickUp's picker keeps the date just set. The task sheet and the create
 * modal say it: the sheet's refused change in the server's words, the modal
 * beside its dates, before Create.
 *
 * `found-30-sep/task-estimate-below-zero`. `POST /tasks` stored -3600 (201),
 * `PATCH` -60 (200) and the bulk editor -120 (200), where the template's route
 * refused one below nought (400). ClickUp's API says of a time estimate that
 * the time "must be a non-negative integer" (search excerpt of "Replace task
 * time estimates", developer.clickup.com).
 *
 * AND THREE A REVIEW OF THIS WORK FOUND, each measured on lane 5 three times:
 *   · A DAY BESIDE A MOMENT was ordered only where every zone agreed, so a
 *     start at 09:00 in Karachi on the 5th beside a due day of the 4th was taken
 *     from the sheet (200, no toast), a list row, the calendar drop and the bulk
 *     editor; the web sent no zone. Each write now names its writer's zone
 *     (`x-time-zone`) and is ordered there: refused from Karachi, taken from Los
 *     Angeles, where that instant is the evening of the 4th.
 *   · A DUPLICATE whose subtask held an estimate below nought (written before
 *     the rule) was refused (400) after the copy, its checklists and values were
 *     made — a half-made copy, one more at each try. The subtask's copy now
 *     carries none, as the parent's did.
 *   · SAVE AS TEMPLATE of a task due on a day with no time and starting later
 *     that day rounded the two apart (3 and 4 days out) and was refused (400)
 *     by the new template rule, depending on the hour it was saved.
 *
 * EVERY REFUSAL IS READ TWICE, by status and by the row; every refusal has a
 * twin that is taken — a date on the day it is due, both dates moved at once,
 * an estimate of nought, the same instant from another zone — so a fix that
 * refuses everything reddens too.
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
const EXPECTED_CHECKS = 21

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
/** The reason a refused write gives, as the API words it. */
const REASON = /cannot start after it is due/i

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
  /* The same person writing from Karachi (UTC+5) and from Los Angeles, naming the zone as the web does on every write. */
  const inKarachi = apiAsAt(API, { headers: { 'x-time-zone': 'Asia/Karachi' } })(auth.accessToken)
  const inLosAngeles = apiAsAt(API, { headers: { 'x-time-zone': 'America/Los_Angeles' } })(auth.accessToken)
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
  /** UTC midnight `n` days from today — a day with no time on it, as the date-only pickers write one. */
  const dayOnly = (n) => day(n, 0)
  /** 09:00 in Karachi `n` days from today: 04:00 UTC — 21:00 the day before in Los Angeles. */
  const nineInKarachi = (n) => day(n, 4)
  const ms = (v) => (v ? new Date(v).getTime() : null)
  const rowOf = async (id) =>
    (await sql`select start_date, due_date, time_estimate from tasks where id = ${id}`)[0] ?? null
  const madeCount = async (title) =>
    Number((await sql`select count(*)::int as n from tasks where list_id = ${LIST} and title = ${title}`)[0]?.n ?? -1)
  /** A task made through the API with these fields, its id. */
  const makeTask = async (title, fields = {}) =>
    must(`make the task ${title}`, await A('/tasks', { method: 'POST', body: { listId: LIST, title, ...fields } }))?.id

  // ══ 1. A TASK THAT STARTS AFTER IT IS DUE, THROUGH THE API ═══════════════
  console.log('\n▶ found-30-sep/a-task-starts-after-it-is-due — the API')
  const LATE = `Late ${TAG}`
  const late = await A('/tasks', { method: 'POST', body: { listId: LIST, title: LATE, startDate: day(10), dueDate: day(3) } })
  const lateMade = await madeCount(LATE)
  chk(
    late.status === 400 && REASON.test(late.error?.message ?? '') && lateMade === 0,
    'POST /tasks refuses a task that starts after it is due (400, saying so) and makes nothing (read by SQL)',
    `it answered ${said(late)}; ${lateMade} task(s) so titled were made`,
  )

  // Two moments in order; and a start on the due day, with its time, beside a due day with none.
  const IN_ORDER = `In order ${TAG}`
  const SAME_DAY = `Same day ${TAG}`
  const inOrder = await A('/tasks', { method: 'POST', body: { listId: LIST, title: IN_ORDER, startDate: day(1), dueDate: day(3) } })
  const sameDay = await A('/tasks', { method: 'POST', body: { listId: LIST, title: SAME_DAY, startDate: day(4, 15), dueDate: dayOnly(4) } })
  const sameDayRow = sameDay.data?.id ? await rowOf(sameDay.data.id) : null
  chk(
    inOrder.status === 201 && sameDay.status === 201 && ms(sameDayRow?.start_date) === ms(day(4, 15)) && ms(sameDayRow?.due_date) === ms(dayOnly(4)),
    'while a task starting before it is due is made, and so is one starting at 15:00 on a day it is due with no time given — the day holds the moment',
    `in order it answered ${said(inOrder)}; the same day ${said(sameDay)}, stored ${JSON.stringify(sameDayRow)}`,
  )

  // PATCH: the start moved past the due it holds; the due moved before the start it holds; both the wrong way round.
  const P = await makeTask(`Patched ${TAG}`, { startDate: day(1), dueDate: day(3) })
  const patchAnswers = []
  for (const body of [{ startDate: day(10) }, { dueDate: day(-2) }, { startDate: day(10), dueDate: day(3) }]) {
    const r = await A(`/tasks/${P}`, { method: 'PATCH', body })
    patchAnswers.push({ sent: Object.keys(body).join('+'), status: r.status, said: REASON.test(r.error?.message ?? '') })
  }
  const patchedRow = await rowOf(P)
  chk(
    patchAnswers.every((a) => a.status === 400 && a.said) && ms(patchedRow?.start_date) === ms(day(1)) && ms(patchedRow?.due_date) === ms(day(3)),
    'PATCH /tasks/:id refuses a start moved past the due date the task holds, a due date moved before its start, and both sent the wrong way round (400 each, saying so), and the task keeps its dates (read by SQL)',
    `answered ${JSON.stringify(patchAnswers)}; the task holds ${JSON.stringify(patchedRow)}`,
  )

  // Both moved at once, each past the other's old value; then the due date cleared.
  const moved = await A(`/tasks/${P}`, { method: 'PATCH', body: { startDate: day(10), dueDate: day(12) } })
  const movedRow = await rowOf(P)
  const cleared = await A(`/tasks/${P}`, { method: 'PATCH', body: { dueDate: null } })
  const clearedRow = await rowOf(P)
  chk(
    moved.status === 200 && ms(movedRow?.start_date) === ms(day(10)) && ms(movedRow?.due_date) === ms(day(12))
      && cleared.status === 200 && clearedRow?.due_date === null && ms(clearedRow?.start_date) === ms(day(10)),
    'and PATCH takes both dates moved at once past the old ones, in order, and a due date cleared (read by SQL)',
    `moving both answered ${said(moved)}, stored ${JSON.stringify(movedRow)}; clearing the due date ${said(cleared)}, stored ${JSON.stringify(clearedRow)}`,
  )

  // The bulk editor: a start set on two tasks, one due before it, one after.
  const EARLY = await makeTask(`Bulk due early ${TAG}`, { dueDate: day(3) })
  const LATER = await makeTask(`Bulk due later ${TAG}`, { dueDate: day(20) })
  const bulk = await A('/tasks/bulk/update', { method: 'PATCH', body: { taskIds: [EARLY, LATER], patch: { startDate: day(10) } } })
  const earlyRow = await rowOf(EARLY)
  const laterRow = await rowOf(LATER)
  const failedEarly = (bulk.data?.failed ?? []).find((f) => f.taskId === EARLY)
  chk(
    bulk.status === 200 && bulk.data?.updatedCount === 1 && bulk.data?.failedCount === 1 && REASON.test(failedEarly?.reason ?? '')
      && earlyRow?.start_date === null && ms(laterRow?.start_date) === ms(day(10)),
    'the bulk editor changes no task it would leave starting after its due date — that one is answered under failed, with the reason — and changes the rest (read by SQL)',
    `it answered ${said(bulk)} with ${JSON.stringify({ updated: bulk.data?.updatedCount, failed: bulk.data?.failed })}; the early task holds ${JSON.stringify(earlyRow)}, the later ${JSON.stringify(laterRow)}`,
  )
  const bulkBoth = await A('/tasks/bulk/update', { method: 'PATCH', body: { taskIds: [EARLY, LATER], patch: { startDate: day(15), dueDate: day(5) } } })
  const laterAfter = await rowOf(LATER)
  chk(
    bulkBoth.status === 400 && REASON.test(bulkBoth.error?.message ?? '') && ms(laterAfter?.start_date) === ms(day(10)) && ms(laterAfter?.due_date) === ms(day(20)),
    'and a bulk edit whose own two dates are the wrong way round is refused whole (400, saying so), changing no task',
    `it answered ${said(bulkBoth)}; the later task holds ${JSON.stringify(laterAfter)}`,
  )

  // A template starting nine days out; a due date typed three days out beside it.
  const TPL = must('make the template', await A(`/workspaces/${WS}/task-templates`, {
    method: 'POST', body: { name: `Starts late ${TAG}`, payload: { title: `From the template ${TAG}`, startDateOffsetDays: 9 } },
  }))?.id
  const FROM_TPL = `Typed due ${TAG}`
  const fromTpl = await A(`/workspaces/${WS}/task-templates/${TPL}/instantiate`, { method: 'POST', body: { listId: LIST, titleOverride: FROM_TPL, dueDate: day(3) } })
  const fromTplRow = fromTpl.data?.taskId ? await rowOf(fromTpl.data.taskId) : null
  chk(
    fromTpl.status === 201 && ms(fromTplRow?.due_date) === ms(day(3)) && fromTplRow?.start_date === null,
    'a task made from a template starting nine days out, with a due date typed three days out, is due when typed and has no start: the template’s start date gives way to it (read by SQL)',
    `it answered ${said(fromTpl)}; the task holds ${JSON.stringify(fromTplRow)}`,
  )
  const BOTH_TYPED = `Both typed ${TAG}`
  const bothTyped = await A(`/workspaces/${WS}/task-templates/${TPL}/instantiate`, {
    method: 'POST', body: { listId: LIST, titleOverride: BOTH_TYPED, startDate: day(10), dueDate: day(3) },
  })
  const bothTypedMade = await madeCount(BOTH_TYPED)
  chk(
    bothTyped.status === 400 && REASON.test(bothTyped.error?.message ?? '') && bothTypedMade === 0,
    'and with both dates typed the wrong way round beside a template, its route refuses them as POST /tasks does (400, saying so) and makes nothing',
    `it answered ${said(bothTyped)}; ${bothTypedMade} task(s) so titled were made`,
  )
  const INVERTED_TPL = `Inverted ${TAG}`
  const invertedTpl = await A(`/workspaces/${WS}/task-templates`, {
    method: 'POST', body: { name: INVERTED_TPL, payload: { title: INVERTED_TPL, startDateOffsetDays: 9, dueDateOffsetDays: 3 } },
  })
  const invertedSaved = (await sql`select count(*)::int as n from task_templates where workspace_id = ${WS} and name = ${INVERTED_TPL}`)[0]?.n ?? -1
  chk(
    invertedTpl.status === 400 && /cannot start after it is due/i.test(invertedTpl.error?.message ?? '') && invertedSaved === 0,
    'a template whose own start date is after its due date is refused when made (400, saying so), and none is saved (read by SQL)',
    `it answered ${said(invertedTpl)}; ${invertedSaved} template(s) so named`,
  )

  // A task made before the rule, starting after it is due (put so by SQL), duplicated.
  const OLD = `Made before ${TAG}`
  const OLD_ID = await makeTask(OLD)
  await sql`update tasks set start_date = ${day(10)}, due_date = ${day(3)} where id = ${OLD_ID}`
  const dup = await A(`/workspaces/${WS}/task-templates/duplicate/${OLD_ID}`, { method: 'POST', body: {} })
  const copies = await madeCount(`${OLD} (copy)`)
  chk(
    dup.status === 400 && REASON.test(dup.error?.message ?? '') && copies === 0,
    'duplicating a task that starts after it is due is refused with the reason (400), and no copy is made',
    `it answered ${said(dup)}; ${copies} cop${copies === 1 ? 'y' : 'ies'} made`,
  )

  // Save as template: a task due on a day with no time, starting at noon that day; then the task made before the rule.
  const SAVE_SRC = await makeTask(`Save me ${TAG}`, { startDate: day(4, 12), dueDate: dayOnly(4) })
  const SAVED = `Saved ${TAG}`
  const saved = await A(`/workspaces/${WS}/task-templates/from-task/${SAVE_SRC}`, { method: 'POST', body: { name: SAVED } })
  const savedRow = (await sql`select payload->'startDateOffsetDays' as s, payload->'dueDateOffsetDays' as d from task_templates where workspace_id = ${WS} and name = ${SAVED}`)[0] ?? null
  const SAVED_LATE = `Saved late ${TAG}`
  const savedLate = await A(`/workspaces/${WS}/task-templates/from-task/${OLD_ID}`, { method: 'POST', body: { name: SAVED_LATE } })
  const savedLateCount = (await sql`select count(*)::int as n from task_templates where workspace_id = ${WS} and name = ${SAVED_LATE}`)[0]?.n ?? -1
  chk(
    saved.status === 201 && savedRow !== null && Number.isInteger(savedRow.s) && Number.isInteger(savedRow.d) && savedRow.s <= savedRow.d
      && savedLate.status === 400 && /cannot start after it is due/i.test(savedLate.error?.message ?? '') && savedLateCount === 0,
    'Save as template takes a task due on a day with no time and starting at noon that day, whatever the hour it is saved, as a template starting no later than it is due (read by SQL); while a task that starts after it is due is refused as one, saying so, and none is saved',
    `saving answered ${said(saved)}, holding offsets ${JSON.stringify(savedRow)}; the late task ${said(savedLate)}, ${savedLateCount} so named`,
  )

  // A day beside a moment, where its writer is: due the 4th with no time; a start at 09:00 on the 5th in Karachi.
  console.log('\n▶ found-30-sep/a-task-starts-after-it-is-due — a day beside a moment, ordered where its writer is')
  const K_MADE = `Made in Karachi ${TAG}`
  const LA_MADE = `Made in Los Angeles ${TAG}`
  const kMade = await inKarachi('/tasks', { method: 'POST', body: { listId: LIST, title: K_MADE, startDate: nineInKarachi(5), dueDate: dayOnly(4) } })
  const laMade = await inLosAngeles('/tasks', { method: 'POST', body: { listId: LIST, title: LA_MADE, startDate: nineInKarachi(5), dueDate: dayOnly(4) } })
  const kMadeCount = await madeCount(K_MADE)
  const laMadeRow = laMade.data?.id ? await rowOf(laMade.data.id) : null
  chk(
    kMade.status === 400 && REASON.test(kMade.error?.message ?? '') && kMadeCount === 0
      && laMade.status === 201 && ms(laMadeRow?.start_date) === ms(nineInKarachi(5)) && ms(laMadeRow?.due_date) === ms(dayOnly(4)),
    'POST /tasks from a writer in Karachi refuses a task due on a day with no time and starting at 09:00 there the next day (400, saying so) and makes nothing; from Los Angeles, where that instant is the evening of the day it is due, it is made (read by SQL)',
    `from Karachi it answered ${said(kMade)}, ${kMadeCount} so titled; from Los Angeles ${said(laMade)}, stored ${JSON.stringify(laMadeRow)}`,
  )
  const KP = await makeTask(`Karachi start ${TAG}`, { dueDate: dayOnly(4) })
  const KD = await makeTask(`Karachi drop ${TAG}`, { startDate: nineInKarachi(5) })
  const kStart = await inKarachi(`/tasks/${KP}`, { method: 'PATCH', body: { startDate: nineInKarachi(5) } })
  // The calendar's drop sends the day it was dropped on, with no time.
  const kDrop = await inKarachi(`/tasks/${KD}`, { method: 'PATCH', body: { dueDate: dayOnly(4).slice(0, 10) } })
  const kBulk = await inKarachi('/tasks/bulk/update', { method: 'PATCH', body: { taskIds: [KP], patch: { startDate: nineInKarachi(5) } } })
  const kBulkFailed = (kBulk.data?.failed ?? []).find((f) => f.taskId === KP)
  const kpHeld = await rowOf(KP)
  const kdHeld = await rowOf(KD)
  const laStart = await inLosAngeles(`/tasks/${KP}`, { method: 'PATCH', body: { startDate: nineInKarachi(5) } })
  const laDrop = await inLosAngeles(`/tasks/${KD}`, { method: 'PATCH', body: { dueDate: dayOnly(4).slice(0, 10) } })
  const kpRow = await rowOf(KP)
  const kdRow = await rowOf(KD)
  chk(
    kStart.status === 400 && REASON.test(kStart.error?.message ?? '') && kDrop.status === 400 && REASON.test(kDrop.error?.message ?? '')
      && kBulk.status === 200 && kBulk.data?.updatedCount === 0 && REASON.test(kBulkFailed?.reason ?? '')
      && kpHeld?.start_date === null && kdHeld?.due_date === null
      && laStart.status === 200 && laDrop.status === 200 && ms(kpRow?.start_date) === ms(nineInKarachi(5)) && ms(kdRow?.due_date) === ms(dayOnly(4)),
    'PATCH /tasks/:id from Karachi refuses a start at 09:00 on the day after the due day the task holds, and a due day with no time, as the calendar drop sends one, before the start it holds (400 each, saying so), and the bulk editor fails that task with the reason, each task keeping its dates; while from Los Angeles both are taken (read by SQL)',
    `from Karachi the start answered ${said(kStart)}, the drop ${said(kDrop)}, the bulk editor ${said(kBulk)} with ${JSON.stringify(kBulk.data?.failed ?? null)}; ` +
      `they held ${JSON.stringify(kpHeld)} and ${JSON.stringify(kdHeld)}; from Los Angeles ${said(laStart)} and ${said(laDrop)}, storing ${JSON.stringify(kpRow)} and ${JSON.stringify(kdRow)}`,
  )

  // ══ 2. AN ESTIMATE BELOW NOUGHT ══════════════════════════════════════════
  console.log('\n▶ found-30-sep/task-estimate-below-zero')
  const NEG = `Below nought ${TAG}`
  const neg = await A('/tasks', { method: 'POST', body: { listId: LIST, title: NEG, timeEstimate: -3600 } })
  const negTpl = await A(`/workspaces/${WS}/task-templates/${TPL}/instantiate`, { method: 'POST', body: { listId: LIST, titleOverride: NEG, timeEstimate: -3600 } })
  const negMade = await madeCount(NEG)
  chk(
    neg.status === 400 && negTpl.status === 400 && negMade === 0,
    'POST /tasks refuses an estimate below nought (400), as the template’s route does, and makes nothing (read by SQL)',
    `POST /tasks answered ${said(neg)}; the template’s route ${said(negTpl)}; ${negMade} task(s) so titled`,
  )
  const E = await makeTask(`Estimated ${TAG}`, { timeEstimate: 5400 })
  const negPatch = await A(`/tasks/${E}`, { method: 'PATCH', body: { timeEstimate: -60 } })
  const ePatched = await rowOf(E)
  chk(
    negPatch.status === 400 && ePatched?.time_estimate === 5400,
    'PATCH /tasks/:id refuses an estimate below nought (400), and the task keeps its estimate (read by SQL)',
    `it answered ${said(negPatch)}; the task holds ${ePatched?.time_estimate ?? null}`,
  )
  const negBulk = await A('/tasks/bulk/update', { method: 'PATCH', body: { taskIds: [E, LATER], patch: { timeEstimate: -120 } } })
  const eBulk = await rowOf(E)
  const laterBulk = await rowOf(LATER)
  chk(
    negBulk.status === 400 && eBulk?.time_estimate === 5400 && laterBulk?.time_estimate === null,
    'the bulk editor refuses an estimate below nought (400) and changes no task (read by SQL)',
    `it answered ${said(negBulk)}; the tasks hold ${eBulk?.time_estimate ?? null} and ${laterBulk?.time_estimate ?? null}`,
  )
  const ZERO = `Nought ${TAG}`
  const zeroMade = await A('/tasks', { method: 'POST', body: { listId: LIST, title: ZERO, timeEstimate: 0 } })
  const zeroRow = zeroMade.data?.id ? await rowOf(zeroMade.data.id) : null
  const zeroPatch = await A(`/tasks/${E}`, { method: 'PATCH', body: { timeEstimate: 0 } })
  const zeroBulk = await A('/tasks/bulk/update', { method: 'PATCH', body: { taskIds: [LATER], patch: { timeEstimate: 0 } } })
  const zeroE = await rowOf(E)
  const zeroLater = await rowOf(LATER)
  chk(
    zeroMade.status === 201 && zeroRow?.time_estimate === 0 && zeroPatch.status === 200 && zeroE?.time_estimate === 0
      && zeroBulk.status === 200 && zeroBulk.data?.updatedCount === 1 && zeroLater?.time_estimate === 0,
    'while an estimate of nought is taken by POST /tasks, PATCH and the bulk editor, and stored as 0 (read by SQL)',
    `POST answered ${said(zeroMade)} storing ${zeroRow?.time_estimate ?? null}; PATCH ${said(zeroPatch)} storing ${zeroE?.time_estimate ?? null}; ` +
      `bulk ${said(zeroBulk)} storing ${zeroLater?.time_estimate ?? null}`,
  )

  // A task whose subtask holds an estimate below nought (put so by SQL, as a row written before the rule), duplicated.
  const DUP = `Subtask below nought ${TAG}`
  const DUP_ID = await makeTask(DUP, { timeEstimate: 600 })
  const DUP_SUB = await makeTask(`Its subtask ${TAG}`, { parentTaskId: DUP_ID, timeEstimate: 300 })
  await sql`update tasks set time_estimate = -60 where id = ${DUP_SUB}`
  const dupSub = await A(`/workspaces/${WS}/task-templates/duplicate/${DUP_ID}`, { method: 'POST', body: {} })
  const dupCopies = await sql`select id, time_estimate from tasks where list_id = ${LIST} and title = ${`${DUP} (copy)`}`
  const dupSubs = dupCopies.length === 1 ? await sql`select time_estimate from tasks where parent_task_id = ${dupCopies[0].id}` : []
  const dupAudit = (await sql`select count(*)::int as n from audit_logs where action = 'task.duplicated' and metadata->>'sourceTaskId' = ${DUP_ID}`)[0]?.n ?? -1
  chk(
    dupSub.status === 201 && dupCopies.length === 1 && dupCopies[0].time_estimate === 600 && dupSubs.length === 1 && dupSubs[0].time_estimate === null && dupAudit === 1,
    'duplicating a task whose subtask holds an estimate below nought, from before the rule, makes one whole copy — its subtask copied with no estimate — and records it (201, read by SQL)',
    `it answered ${said(dupSub)}; ${dupCopies.length} cop${dupCopies.length === 1 ? 'y' : 'ies'} holding ${JSON.stringify(dupCopies.map((c) => c.time_estimate))}, ` +
      `with subtasks ${JSON.stringify(dupSubs)}; ${dupAudit} duplicate(s) recorded`,
  )

  // ══ 3. THE TASK SHEET AND THE CREATE MODAL SAY IT ════════════════════════
  console.log('\n▶ the task sheet and the create modal say that a task cannot start after it is due')
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
  const sheetReady = await waitUntil(async () => (await startBox.inputValue({ timeout: 1000 }).catch(() => '')) === SHEET_START, { timeoutMs: 20_000 })
  const patched = page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname.endsWith(`/tasks/${S}`), { timeout: 15_000 }).catch(() => null)
  await startBox.fill(dayAt(10, 9), { timeout: 5000 }).catch(() => {})
  const sheetAnswer = (await patched)?.status() ?? null
  let sheetToast = ''
  await waitUntil(async () => (sheetToast = (await toasts()).find((s) => REASON.test(s)) ?? '').length > 0, { timeoutMs: 10_000 })
  const sheetRow = await rowOf(S)
  chk(
    sheetReady && sheetAnswer === 400 && sheetToast.length > 0 && ms(sheetRow?.start_date) === ms(new Date(SHEET_START).toISOString()),
    'in the task sheet, a start date typed after the due date is refused and said — the toast gives the reason — and the task keeps its start (read by SQL)',
    `the sheet showed the start ${sheetReady}; the PATCH answered ${sheetAnswer ?? 'nothing'}; the toast read ${JSON.stringify(sheetToast || (await toasts()))}; the task holds ${JSON.stringify(sheetRow)}`,
  )

  // The create modal: a start typed ten days out and a due date three days out, then the start put right.
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
  const note = page.getByTestId('quick-create-dates-order')
  const submit = page.getByTestId('quick-create-submit')
  const noteShown = await waitUntil(() => note.isVisible().catch(() => false), { timeoutMs: 5000 })
  const noteText = noteShown ? await note.innerText({ timeout: 1000 }).catch(() => '') : ''
  const heldBack = !(await submit.isEnabled({ timeout: 1000 }).catch(() => true))
  const madeWhileWrong = await madeCount(MODAL)
  await page.getByTestId('quick-create-start').fill(dayAt(1, 9), { timeout: 5000 }).catch(() => {})
  const noteGone = await waitUntil(async () => !(await note.isVisible().catch(() => false)), { timeoutMs: 5000 })
  await waitUntil(() => submit.isEnabled().catch(() => false), { timeoutMs: 5000 })
  await submit.click({ timeout: 5000 }).catch(() => {})
  let modalRows = []
  await waitUntil(async () => (modalRows = await sql`select start_date, due_date from tasks where list_id = ${LIST} and title = ${MODAL}`).length > 0, { timeoutMs: 15_000 })
  chk(
    noteShown && REASON.test(noteText) && heldBack && madeWhileWrong === 0 && noteGone && modalRows.length === 1
      && ms(modalRows[0].start_date) === ms(new Date(dayAt(1, 9)).toISOString()) && ms(modalRows[0].due_date) === ms(new Date(dayAt(3, 17)).toISOString()),
    'the create modal says, beside the dates and before Create, that the start is after the due date, and makes nothing until it is not — then Create makes the task with both dates (read by SQL)',
    `the note showed ${noteShown} reading ${JSON.stringify(noteText)}; Create held back ${heldBack}; ${madeWhileWrong} task(s) made meanwhile; ` +
      `the note went ${noteGone}; then ${modalRows.length} task(s) so titled, holding ${JSON.stringify(modalRows[0] ?? null)}`,
  )

  // The sheet in Karachi: due the 4th with no time; a start typed at 09:00 on the 5th, then at 09:00 on the 4th.
  const KS = await makeTask(`Sheet in Karachi ${TAG}`, { dueDate: dayOnly(4) })
  const kctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, serviceWorkers: 'block', timezoneId: 'Asia/Karachi', storageState: await ctx.storageState() })
  const kpage = await kctx.newPage()
  const zonesSent = []
  /** A request (or a response's request) that is the sheet's write of this task. */
  const isSheetPatch = (r) => r.method() === 'PATCH' && new URL(r.url()).pathname.endsWith(`/tasks/${KS}`)
  const answersSheetPatch = (res) => isSheetPatch(res.request())
  kpage.on('request', (r) => { if (isSheetPatch(r)) zonesSent.push(r.headers()['x-time-zone'] ?? null) })
  const ktoasts = () => kpage.locator('[data-sonner-toast]').filter({ visible: true }).allInnerTexts().catch(() => [])
  await kpage.goto(`${B}/app/${WS}/${SPACE}/${PROJECT}/${LIST}?task=${KS}`, { waitUntil: 'domcontentloaded' })
  const kStartBox = kpage.getByTestId('task-start-date')
  const kDueBox = kpage.getByTestId('task-due-date')
  const kReady = await waitUntil(async () => (await kDueBox.inputValue({ timeout: 1000 }).catch(() => '')) === `${dayOnly(4).slice(0, 10)}T00:00`, { timeoutMs: 20_000 })
  const kLate = kpage.waitForResponse(answersSheetPatch, { timeout: 15_000 }).catch(() => null)
  await kStartBox.fill(`${dayOnly(5).slice(0, 10)}T09:00`, { timeout: 5000 }).catch(() => {})
  const kLateAnswer = (await kLate)?.status() ?? null
  let kToast = ''
  await waitUntil(async () => (kToast = (await ktoasts()).find((t) => REASON.test(t)) ?? '').length > 0, { timeoutMs: 10_000 })
  const kLateRow = await rowOf(KS)
  const kFits = kpage.waitForResponse(answersSheetPatch, { timeout: 15_000 }).catch(() => null)
  await kStartBox.fill(`${dayOnly(4).slice(0, 10)}T09:00`, { timeout: 5000 }).catch(() => {})
  const kFitsAnswer = (await kFits)?.status() ?? null
  let kFitsRow = null
  await waitUntil(async () => ms((kFitsRow = await rowOf(KS))?.start_date) === ms(nineInKarachi(4)), { timeoutMs: 10_000 })
  await kctx.close().catch(() => {})
  chk(
    kReady && kLateAnswer === 400 && kToast.length > 0 && kLateRow?.start_date === null
      && kFitsAnswer === 200 && ms(kFitsRow?.start_date) === ms(nineInKarachi(4)) && zonesSent.length === 2 && zonesSent.every((z) => z === 'Asia/Karachi'),
    'in the task sheet in Karachi, a start typed at 09:00 on the day after a due day with no time is refused and said — the toast gives the reason — and the task keeps no start, while 09:00 on the due day itself is taken; each write names the zone (read by SQL)',
    `the sheet showed the due day ${kReady}; the late start answered ${kLateAnswer ?? 'nothing'}, the toast read ${JSON.stringify(kToast || (await ktoasts().catch(() => [])))}, the task held ${JSON.stringify(kLateRow)}; ` +
      `the start on the day answered ${kFitsAnswer ?? 'nothing'}, storing ${JSON.stringify(kFitsRow)}; the zones sent ${JSON.stringify(zonesSent)}`,
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
