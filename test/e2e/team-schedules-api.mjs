/**
 * THE TEAM SCHEDULE, AS THE SERVER ANSWERS IT (`commit-log/log-1e7f092-1`).
 *
 * NOT A FRAME ROW OF ITS OWN: `team-schedules.mjs` closes frame `12:48`, and
 * it intercepts every `**\/api\/**` call at the browser, so no server code runs
 * in it. `ts-9-dedupe-dropped` removed the server's de-duplication and ran
 * green there — it changed a line nothing in the repository executed — and the
 * row was closed on a suite that cannot reach the endpoint. The facts the grid
 * rests on are unit-tested in `team-schedule-columns.test.ts`; this suite asks
 * the real API and Postgres the same questions, through the route the page
 * calls: `GET /planner/:workspaceId/team-schedules?userIds=…&from&to`.
 *
 * TWO PEOPLE WITH DIFFERENT DAYS, as the browser suite has: Sara with three
 * dated tasks, Omar with one. Different counts, so a server that answered the
 * first person's calendar in every column fails on the numbers; each task is
 * matched by id, so it fails on identity too.
 *
 *   node test/e2e/team-schedules-api.mjs --api 3021
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 5

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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? null).slice(0, 140)}`

const stamp = Date.now()
const TAG = `tsa-${stamp}`
let WS = null
let A = null

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const person = async (who, member) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Schedule ${who}`, email, password: 'Member@12345!',
      organizationName: `Schedule ${who} ${stamp}`, organizationSlug: `schedule-${who}-${stamp}`,
    })
    if (member) {
      const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
      if (added.status >= 300) throw new Error(`could not add ${who}: ${said(added)}`)
    }
    if (!signed.user?.id) throw new Error(`${who} signed up without an id`)
    return signed.user.id
  }
  const sara = await person('sara', true)
  const omar = await person('omar', true)
  // Signed up, and never a member of this workspace.
  const stranger = await person('stranger', false)

  const space = await make('/spaces', { workspaceId: WS, name: `${TAG} space` }, 'the space')
  const project = await make('/projects', { spaceId: space, name: `${TAG} project` }, 'the project')
  const list = await make('/lists', { projectId: project, name: `${TAG} list` }, 'the list')
  const tomorrow = new Date(Date.now() + 24 * 3_600_000)
  const at = (hour) => { const d = new Date(tomorrow); d.setUTCHours(hour, 0, 0, 0); return d.toISOString() }
  const task = (title, hour, who) =>
    make('/tasks', { listId: list, title: `${TAG} ${title}`, dueDate: at(hour), assigneeIds: [who] }, `the task "${title}"`)
  const saraTasks = [await task('sara standup', 9, sara), await task('sara review', 10, sara), await task('sara sync', 11, sara)]
  const omarTasks = [await task('omar demo', 15, omar)]

  const from = new Date().toISOString()
  const to = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString()
  const schedule = (ids) =>
    A(`/planner/${WS}/team-schedules?userIds=${ids.join(',')}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
  const taskIdsOf = (col) => (col?.tasks ?? []).map((t) => t.id).sort()

  // ══ 1. THE COLUMNS ═══════════════════════════════════════════════════════
  console.log('\n▶ one column per person asked, in the order asked')
  const twice = await schedule([sara, omar, sara])
  const order = (twice.data?.people ?? []).map((p) => p.userId)
  chk(
    twice.status === 200 && JSON.stringify(order) === JSON.stringify([sara, omar]),
    'a person named twice is one column, at their first place: Sara, Omar, Sara answers Sara then Omar',
    `it answered ${said(twice)} with columns ${JSON.stringify(order.map((id) => (id === sara ? 'sara' : id === omar ? 'omar' : id)))}`,
  )
  const cols = Object.fromEntries((twice.data?.people ?? []).map((p) => [p.userId, p]))
  chk(
    JSON.stringify(taskIdsOf(cols[sara])) === JSON.stringify([...saraTasks].sort()) &&
      JSON.stringify(taskIdsOf(cols[omar])) === JSON.stringify([...omarTasks].sort()),
    'and each column is its own person’s day: Sara’s three tasks in hers, Omar’s one in his',
    `Sara's column holds ${taskIdsOf(cols[sara]).length} of hers and ${taskIdsOf(cols[sara]).filter((id) => omarTasks.includes(id)).length} of Omar's; ` +
      `Omar's holds ${taskIdsOf(cols[omar]).length}, ${taskIdsOf(cols[omar]).filter((id) => saraTasks.includes(id)).length} of them Sara's`,
  )

  // ══ 2. WHO CAN BE ASKED ══════════════════════════════════════════════════
  console.log('\n▶ a column it cannot read says so, and the rest still draw')
  const withStranger = await schedule([sara, stranger])
  const [first, second] = withStranger.data?.people ?? []
  chk(
    withStranger.status === 200 && first?.userId === sara && !first?.error && taskIdsOf(first).length === 3 &&
      second?.userId === stranger && typeof second?.error === 'string' && second.error.length > 0 &&
      (second?.tasks ?? []).length === 0 && (second?.busy ?? []).length === 0,
    'someone outside the workspace is refused in their own column, with a reason, while Sara’s column still draws',
    `it answered ${said(withStranger)}; Sara's column ${first ? `error=${JSON.stringify(first.error)}, ${taskIdsOf(first).length} task(s)` : 'missing'}; ` +
      `the stranger's ${second ? `error=${JSON.stringify(second.error)}, ${(second.tasks ?? []).length} task(s)` : 'missing'}`,
  )
  const nine = Array.from({ length: 9 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
  const tooMany = await schedule(nine)
  chk(
    tooMany.status === 400 && /at most 8 people/.test(JSON.stringify(tooMany.error ?? '')),
    'nine people are refused as a 400 that names the limit of eight',
    `it answered ${said(tooMany)}`,
  )
  const sameMany = await schedule(Array.from({ length: 9 }, () => sara))
  chk(
    sameMany.status === 200 && (sameMany.data?.people ?? []).length === 1,
    'and the limit counts people, not names: Sara named nine times is one column, not a refusal',
    `it answered ${said(sameMany)} with ${(sameMany.data?.people ?? []).length} column(s)`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  // This run's workspace only — made above, so nothing else is removed.
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (gone.status >= 300 || gone.status === 0) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${gone.status}`)
  }
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
