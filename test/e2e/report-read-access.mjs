/**
 * A REPORT COUNTS AND NAMES ONLY WHAT ITS READER MAY OPEN.
 *
 * NOT A FRAME ROW: `found-23-sep/workspace-reads-skip-the-container-rule`, its
 * reports. Every report reads across the workspace, and applied only the
 * private-item rule. Measured on lane 1 before the fix, as a member refused a
 * private space that holds three tasks: the overview, completion, workload,
 * status durations, time by project and the custom report all answered the
 * member exactly as they answered the admin, the refused space's tasks
 * counted in; project health named the refused space's project, the activity
 * feed its tasks, a day's workload its tasks, and a custom report by project
 * the project. And a saved report could be edited, deleted and sent by any
 * member, whoever made it — with the mailer running every report workspace-
 * wide, as nobody (`scheduled-reports.service.test.ts` holds that half).
 *
 *   node test/e2e/report-read-access.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 6

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
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

/* NEVER THROWS — `{status, data, error, text}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? null).slice(0, 120)}`

const stamp = Date.now()
const TAG = `rra-${stamp}`
const WORD = `okapi${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — a saved report is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const email = `${TAG}-member@rundesk.invalid`
  const signed = await signUpApi(API, {
    fullName: 'Report member', email, password: 'Member@12345!',
    organizationName: `Report member ${stamp}`, organizationSlug: `report-member-${stamp}`,
  })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (!added.ok) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)

  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (!res.ok || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const plant = async (side, visibility, count) => {
    const space = await make('/spaces', { workspaceId: WS, name: `${side === 'hidden' ? WORD : TAG} ${side} space`, ...(visibility ? { visibility } : {}) }, `the ${side} space`)
    const project = await make('/projects', { spaceId: space, name: `${side === 'hidden' ? WORD : TAG} ${side} project` }, `the ${side} project`)
    const list = await make('/lists', { projectId: project, name: `${side === 'hidden' ? WORD : TAG} ${side} list` }, `the ${side} list`)
    const tasks = []
    for (let i = 0; i < count; i++) {
      tasks.push(await make('/tasks', { listId: list, title: `${side === 'hidden' ? WORD : TAG} ${side} task ${i}`, assigneeIds: [adminId], dueDate: tomorrow }, `a ${side} task`))
    }
    return { project, list, tasks }
  }
  const hidden = await plant('hidden', 'private', 3)
  const open = await plant('open', null, 1)
  const gate = await M(`/tasks/list/${hidden.list}`)
  if (gate.status !== 403) throw new Error(`the member was not refused the hidden list (${said(gate)}), so nothing here would mean anything`)
  const reportOf = (C, path, init) => C(`/workspaces/${WS}/reports/${path}`, init)
  const carries = (res) => res.text.includes(WORD)

  // ══ 1. COUNTS ════════════════════════════════════════════════════════════
  console.log('\n▶ what the overview and completion count')
  const [mOverview, aOverview, mCompletion, aCompletion] = await Promise.all([
    reportOf(M, 'overview'), reportOf(A, 'overview'), reportOf(M, 'completion'), reportOf(A, 'completion'),
  ])
  chk(
    mOverview.data?.total === 1 && aOverview.data?.total === 4 && mCompletion.data?.total === 1 && aCompletion.data?.total === 4 &&
      !carries(mOverview),
    'a member’s overview and completion count only the task they may open — the admin’s count all four',
    `overview: the member ${mOverview.data?.total}, the admin ${aOverview.data?.total}; completion: the member ${mCompletion.data?.total}, the admin ${aCompletion.data?.total}`,
  )

  // ══ 2. WORKLOAD ══════════════════════════════════════════════════════════
  console.log('\n▶ workload, over the fortnight and on the day')
  const day = tomorrow.slice(0, 10)
  const [mWorkload, aWorkload, mDay, aDay] = await Promise.all([
    reportOf(M, 'workload'), reportOf(A, 'workload'),
    reportOf(M, `workload/day?userId=${adminId}&date=${day}`), reportOf(A, `workload/day?userId=${adminId}&date=${day}`),
  ])
  const loadOf = (res) => ((res.data ?? []).find((r) => r.userId === adminId)?.dailyLoads ?? []).reduce((a, b) => a + Number(b || 0), 0)
  chk(
    mWorkload.status === 200 && loadOf(mWorkload) < loadOf(aWorkload) && !carries(mDay) && mDay.status === 200 && carries(aDay),
    'workload counts, and the day’s workload names, nothing of a space the member is refused — the admin’s carries it',
    `the admin's load as the member sees it ${loadOf(mWorkload)}, as the admin does ${loadOf(aWorkload)}; the day, for the member (${mDay.status}): ${carries(mDay) ? 'NAMES the refused space' : 'clean'}, for the admin: ${carries(aDay) ? 'names it' : 'does NOT name it'}`,
  )

  // ══ 3. PROJECT HEALTH AND ACTIVITY ═══════════════════════════════════════
  console.log('\n▶ project health and the activity feed')
  const [mHealth, aHealth, mActivity, aActivity] = await Promise.all([
    reportOf(M, 'project-health'), reportOf(A, 'project-health'), reportOf(M, 'activity'), reportOf(A, 'activity'),
  ])
  const healthIds = (res) => (res.data ?? []).map((p) => p.projectId)
  chk(
    mHealth.status === 200 && !healthIds(mHealth).includes(hidden.project) && healthIds(mHealth).includes(open.project) &&
      healthIds(aHealth).includes(hidden.project) && mActivity.status === 200 && !carries(mActivity) && carries(aActivity),
    'project health lists, and the activity feed names, nothing of a space the member is refused — while the open project is listed; the admin’s have both',
    `health for the member: refused project ${healthIds(mHealth).includes(hidden.project)}, open ${healthIds(mHealth).includes(open.project)}; ` +
      `activity for the member: ${carries(mActivity) ? 'NAMES the refused space' : 'clean'}, for the admin: ${carries(aActivity) ? 'names it' : 'does not'}`,
  )

  // ══ 4. CUSTOM REPORTS ════════════════════════════════════════════════════
  console.log('\n▶ a custom report, by project and by list')
  const runAs = (C, dimension) => reportOf(C, 'custom/run', { method: 'POST', body: { dimension, metrics: ['tasks-count'], days: 30 } })
  const [mByProject, mByList, aByProject] = await Promise.all([runAs(M, 'project'), runAs(M, 'list'), runAs(A, 'project')])
  const totalOf = (res) => (res.data?.rows ?? []).reduce((n, r) => n + Number(r.values?.['tasks-count'] ?? 0), 0)
  chk(
    !carries(mByProject) && !carries(mByList) && totalOf(mByProject) === 1 && totalOf(mByList) === 1 && carries(aByProject) && totalOf(aByProject) === 4,
    'a custom report, by project or by list, names nothing of a refused space and counts only the task the member may open — the admin’s names it and counts four',
    `by project for the member: ${carries(mByProject) ? 'NAMES the refused project' : 'clean'}, total ${totalOf(mByProject)}; by list ${carries(mByList) ? 'NAMES it' : 'clean'}, total ${totalOf(mByList)}; ` +
      `the admin's by project total ${totalOf(aByProject)}`,
  )

  // ══ 5. SOMEBODY ELSE'S SAVED REPORT ══════════════════════════════════════
  console.log('\n▶ a saved report is its owner’s to change and to send')
  const adminReport = await make(`/workspaces/${WS}/reports/custom`, { name: `${TAG} the admin's report`, definition: { dimension: 'project', metrics: ['tasks-count'], days: 30 } }, 'the admin’s report')
  const hijack = await reportOf(M, `custom/${adminReport}`, { method: 'PATCH', body: { name: 'hijacked', schedule: { frequency: 'daily', hour: 9, recipients: ['outside@example.invalid'] } } })
  const sendIt = await reportOf(M, `custom/${adminReport}/send-now`, { method: 'POST', body: {} })
  const dropIt = await reportOf(M, `custom/${adminReport}`, { method: 'DELETE' })
  const [row] = await sql`select name, schedule_recipients from custom_reports where id = ${adminReport}`
  chk(
    [hijack, sendIt, dropIt].every((r) => r.status === 404) && row?.name === `${TAG} the admin's report` &&
      !JSON.stringify(row?.schedule_recipients ?? []).includes('outside@'),
    'a member cannot edit, send or delete another person’s saved report (404 each, the report unchanged, its recipients untouched)',
    `edit ${said(hijack)}, send ${said(sendIt)}, delete ${said(dropIt)}; the report now reads ${JSON.stringify(row ?? null)}`,
  )

  // ══ 6. ONE'S OWN ═════════════════════════════════════════════════════════
  const mine = await M(`/workspaces/${WS}/reports/custom`, { method: 'POST', body: { name: `${TAG} the member's report`, definition: { dimension: 'list', metrics: ['tasks-count'], days: 30 } } })
  const mineId = mine.data?.id
  const renameMine = mineId ? await reportOf(M, `custom/${mineId}`, { method: 'PATCH', body: { name: `${TAG} the member's report, renamed` } }) : { status: 0 }
  const sendMine = mineId ? await reportOf(M, `custom/${mineId}/send-now`, { method: 'POST', body: {} }) : { status: 0 }
  const adminEdits = mineId ? await reportOf(A, `custom/${mineId}`, { method: 'PATCH', body: { name: `${TAG} the member's report, as the admin left it` } }) : { status: 0 }
  chk(
    mine.ok && renameMine.status === 200 && sendMine.ok && adminEdits.status === 200,
    'while a member edits and sends their own saved report, and an admin may edit anybody’s',
    `saving ${said(mine)}, renaming ${said(renameMine)}, sending ${said(sendMine)}; the admin's edit ${said(adminEdits)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (gone.status >= 300 || gone.status === 0) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${gone.status}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
