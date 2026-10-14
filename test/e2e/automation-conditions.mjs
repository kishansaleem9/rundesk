/**
 * AN AUTOMATION'S CONDITIONS, ITS FOUR NEW ACTIONS, AND ITS TEST (`found-14-oct/automation-conditions-and-actions-unbuilt`).
 *
 * ClickUp lets a rule add conditions to its trigger — "only if the priority is
 * Urgent", "only if the task has the tag Client" — and act only when all of
 * them hold, or any one; it adds a comment, a watcher, a due date, and fills an
 * AI field; and it tests a rule on a task without running it. Rundesk's rules
 * had filters on the event (a list, a status moved to) and seven actions, and
 * nothing read the task. Here each is measured where it acts: in the rows a run
 * writes (SQL), in the rule's run log, and on the page where a rule is built
 * and tested.
 *
 *   DATABASE_URL=postgres://…/rundesk_v4 node test/e2e/automation-conditions.mjs --api 3024 --dist /tmp/claude-0/dist-4
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, madeWorkspace, must } from './lib/fixture.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

const EXPECTED_CHECKS = 9

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = { email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal', password: process.env.E2E_PASSWORD ?? 'Admin@123!' }

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `acn${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
const apiAs = apiAsAt(API, { emptyBodyOn: ['POST', 'DELETE'] })
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? res.message ?? null)}`

let sql = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what a rule did is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const [me] = await sql`select id from users where lower(email) = lower(${ADMIN.email})`
  const WS = must(await A('/workspaces', { method: 'POST', body: { name: `Automation conditions ${TAG}` } }), 'make the workspace').id
  madeWorkspace(WS)
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Conditions ${who}`, email, password: 'Member@12345!', organizationName: `ACN ${who} ${stamp}`, organizationSlug: `acn-${who}-${stamp}` })
    must(await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } }), `add the ${who}`)
    return { id: signed.user?.id, as: apiAs(signed.accessToken) }
  }
  const mia = await person('mia', 'member')
  const gus = await person('gus', 'guest')
  const make = async (route, body, what) => must(await A(route, { method: 'POST', body }), `make ${what}`).id
  const SPACE = await make('/spaces', { workspaceId: WS, name: `${TAG} space` }, 'the space')
  const PROJECT = await make('/projects', { spaceId: SPACE, name: `${TAG} project` }, 'the project')
  const LIST = await make('/lists', { projectId: PROJECT, name: `${TAG} list` }, 'the list')
  const CLIENT = await make(`/workspaces/${WS}/labels`, { name: `client-${stamp}` }, 'the Client tag')
  const task = async (title, priority, tagged) => {
    const id = await make('/tasks', { listId: LIST, title: `${title} ${TAG}`, priority }, `the task ${title}`)
    if (tagged) must(await A(`/tasks/${id}/labels/${CLIENT}`, { method: 'POST' }), `tag ${title}`)
    return id
  }
  const T1 = await task('Renewal', 'urgent', true)
  const T2 = await task('Untagged', 'urgent', false)
  const T3 = await task('Project kickoff', 'normal', false)
  const runsOf = async (rule) => sql`select outcome, error_msg, context from automation_runs where automation_id = ${rule} order by triggered_at`
  const commentsOf = async (t) => sql`select author_id, body from task_comments where task_id = ${t}`
  const dueOf = async (t) => (await sql`select due_date, due_date_has_time from tasks where id = ${t}`)[0]
  const daysAhead = (n) => {
    const d = new Date()
    d.setUTCHours(0, 0, 0, 0)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString()
  }
  const move = async (t, status) => must(await A(`/tasks/${t}`, { method: 'PATCH', body: { status } }), `move ${t}`)

  // ══ 1. ALL OF THEM ════════════════════════════════════════════════════════
  console.log('\n▶ A rule acts only when every condition holds')
  const RULE_ALL = must(await A(`/workspaces/${WS}/automations`, {
    method: 'POST',
    body: {
      name: `${TAG} escalate`,
      trigger: { type: 'task.status_changed', conditions: [{ field: 'priority', operator: 'is', value: 'urgent' }, { field: 'tag', operator: 'is', value: `Client-${stamp}` }], match: 'all' },
      actions: [
        { type: 'add_comment', params: { text: 'Escalated: {{task.title}}' } },
        { type: 'add_follower', params: { userId: mia.id } },
        { type: 'set_due_date', params: { days: '3' } },
      ],
    },
  }), 'make the all-of rule').id
  await move(T1, 'in_progress')
  await move(T2, 'in_progress')
  const ranAll = await waitUntil(async () => (await runsOf(RULE_ALL)).length >= 2, { timeoutMs: 15_000 })
  const runsAll = await runsOf(RULE_ALL)
  const t1Comments = await commentsOf(T1)
  const t1Watched = (await sql`select 1 from task_watchers where task_id = ${T1} and user_id = ${mia.id}`).length
  const t1Due = await dueOf(T1)
  chk(
    ranAll && t1Comments.length === 1 && t1Comments[0].author_id === me.id && t1Comments[0].body === `Escalated: Renewal ${TAG}` &&
      t1Watched === 1 && t1Due?.due_date?.toISOString() === daysAhead(3) && t1Due?.due_date_has_time === false,
    'on an urgent task tagged Client, the rule comments — its title filled in, under the rule’s maker — adds Mia as a watcher, and sets the due date three days out',
    JSON.stringify({ ran: ranAll, comments: t1Comments, watched: t1Watched, due: t1Due?.due_date, wanted: daysAhead(3) }),
  )

  const skipped = runsAll.find((r) => r.outcome === 'skipped')
  const verdicts = skipped ? JSON.parse(skipped.context?.conditions ?? '[]') : []
  chk(
    !!skipped && (await commentsOf(T2)).length === 0 && !(await dueOf(T2))?.due_date &&
      verdicts.map((v) => `${v.field}:${v.passed}`).join() === 'priority:true,tag:false' && /did not hold/.test(skipped.error_msg ?? ''),
    'on an urgent task without the tag it does nothing, and its run is logged as skipped with each condition’s verdict — the priority held, the tag did not',
    JSON.stringify({ outcomes: runsAll.map((r) => r.outcome), verdicts, msg: skipped?.error_msg }),
  )

  // ══ 2. ANY ONE ════════════════════════════════════════════════════════════
  console.log('\n▶ Or any one of them')
  const RULE_ANY = must(await A(`/workspaces/${WS}/automations`, {
    method: 'POST',
    body: {
      name: `${TAG} kickoff`,
      trigger: { type: 'task.status_changed', conditions: [{ field: 'priority', operator: 'is', value: 'low' }, { field: 'title', operator: 'contains', value: 'KICKOFF' }], match: 'any' },
      actions: [{ type: 'set_due_date', params: { days: '1' } }],
    },
  }), 'make the any-of rule').id
  await move(T3, 'in_progress')
  const ranAny = await waitUntil(async () => (await runsOf(RULE_ANY)).some((r) => r.outcome === 'success'), { timeoutMs: 15_000 })
  chk(
    ranAny && (await dueOf(T3))?.due_date?.toISOString() === daysAhead(1),
    'a rule matching any one condition acts on a normal-priority task whose name contains “kickoff”, whatever the case',
    JSON.stringify({ ran: ranAny, due: (await dueOf(T3))?.due_date, runs: (await runsOf(RULE_ANY)).map((r) => r.outcome) }),
  )

  // ══ 3. CONDITIONS REFUSED ═════════════════════════════════════════════════
  console.log('\n▶ Conditions that cannot be read are refused in words')
  const rule = (conditions) => A(`/workspaces/${WS}/automations`, { method: 'POST', body: { name: `${TAG} bad`, trigger: { type: 'task.created', conditions }, actions: [] } })
  const badOp = await rule([{ field: 'due_date', operator: 'contains', value: 'x' }])
  const noValue = await rule([{ field: 'status', operator: 'is' }])
  const tooMany = await rule(Array.from({ length: 16 }, () => ({ field: 'status', operator: 'is', value: 'x' })))
  const rulesAfter = (await sql`select count(*)::int as n from automations where workspace_id = ${WS}`)[0].n
  chk(
    badOp.status === 400 && /is not something due date can be compared by/.test(said(badOp)) && noValue.status === 400 && /needs a value/.test(said(noValue)) &&
      tooMany.status === 400 && /at most 15 conditions/.test(said(tooMany)) && rulesAfter === 2,
    'an operator a field does not take, a missing value and sixteen conditions are each refused, and no rule is kept',
    JSON.stringify({ badOp: said(badOp), noValue: said(noValue), tooMany: said(tooMany), rules: rulesAfter }),
  )

  // ══ 4. ACTIONS THAT CANNOT ACT ════════════════════════════════════════════
  console.log('\n▶ A watcher who cannot open the task, and a field that is not an AI field')
  const TEXT_FIELD = must(await A(`/workspaces/${WS}/projects/${PROJECT}/custom-fields`, { method: 'POST', body: { name: `${TAG} notes`, type: 'text' } }), 'make a text field').id
  const RULE_BAD = must(await A(`/workspaces/${WS}/automations`, {
    method: 'POST',
    body: { name: `${TAG} cannot`, trigger: { type: 'task.status_changed', conditions: [{ field: 'title', operator: 'contains', value: 'Renewal' }] }, actions: [{ type: 'add_follower', params: { userId: gus.id } }] },
  }), 'make the guest-watcher rule').id
  const RULE_AI = must(await A(`/workspaces/${WS}/automations`, {
    method: 'POST',
    body: { name: `${TAG} ai`, trigger: { type: 'task.status_changed', conditions: [{ field: 'title', operator: 'contains', value: 'Renewal' }] }, actions: [{ type: 'update_ai_field', params: { fieldId: TEXT_FIELD } }] },
  }), 'make the AI-field rule').id
  await move(T1, 'done')
  const ranBad = await waitUntil(async () => (await runsOf(RULE_BAD)).length >= 1 && (await runsOf(RULE_AI)).length >= 1, { timeoutMs: 15_000 })
  const [badRun] = await runsOf(RULE_BAD)
  const [aiRun] = await runsOf(RULE_AI)
  chk(
    ranBad && badRun?.outcome === 'error' && /cannot open this task/.test(badRun?.error_msg ?? '') &&
      (await sql`select 1 from task_watchers where task_id = ${T1} and user_id = ${gus.id}`).length === 0 &&
      aiRun?.outcome === 'error' && /not an AI field/.test(aiRun?.error_msg ?? ''),
    'a guest the task is not shared with is not made its watcher, and a text field is not filled as an AI field: each run fails in words',
    JSON.stringify({ bad: badRun, ai: aiRun }),
  )

  // ══ 5. THE TEST ═══════════════════════════════════════════════════════════
  console.log('\n▶ Testing a rule on a task does nothing to it')
  const runsBefore = (await runsOf(RULE_ALL)).length
  const tested2 = await A(`/workspaces/${WS}/automations/${RULE_ALL}/test`, { method: 'POST', body: { taskId: T2 } })
  const commentsAfterTest = (await commentsOf(T2)).length
  const runsAfterTest = (await runsOf(RULE_ALL)).length
  const memberTest = await mia.as(`/workspaces/${WS}/automations/${RULE_ALL}/test`, { method: 'POST', body: { taskId: T2 } })
  chk(
    tested2.status === 201 && tested2.data?.wouldAct === false && tested2.data?.conditions?.map((v) => v.passed).join() === 'true,false' &&
      tested2.data?.actions?.length === 0 && commentsAfterTest === 0 && runsAfterTest === runsBefore && memberTest.status === 403,
    'testing the rule on the untagged task says it would not act and which condition fails — no comment, no run logged; a member who may not manage automations is refused',
    JSON.stringify({ test: said(tested2), body: tested2.data, comments: commentsAfterTest, runs: [runsBefore, runsAfterTest], member: memberTest.status }),
  )

  // ══ 6. THE PAGE ═══════════════════════════════════════════════════════════
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(15_000)
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })

  console.log('\n▶ The builder makes a rule with conditions')
  await page.goto(`${B}/app/${WS}/automations`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('automations-new').click({ timeout: 20_000 }).catch(() => {})
  await page.getByTestId('automation-add-condition').click().catch(() => {})
  await page.getByTestId('automation-add-condition').click().catch(() => {})
  const rows = page.getByTestId('automation-condition')
  await rows.nth(0).getByTestId('automation-condition-field').selectOption('priority').catch(() => {})
  await rows.nth(0).getByTestId('automation-condition-operator').selectOption('any_of').catch(() => {})
  await rows.nth(0).getByTestId('automation-condition-value').fill('high, urgent').catch(() => {})
  await rows.nth(1).getByTestId('automation-condition-field').selectOption('assignee').catch(() => {})
  await rows.nth(1).getByTestId('automation-condition-operator').selectOption('is_not_set').catch(() => {})
  const valueShownForUnset = await rows.nth(1).getByTestId('automation-condition-value').count().catch(() => -1)
  await page.getByTestId('automation-conditions-match').selectOption('any').catch(() => {})
  await page.getByTestId('automation-create-submit').click().catch(() => {})
  const made = await waitUntil(async () => (await sql`select trigger from automations where workspace_id = ${WS} and name = 'New automation'`).length === 1
    || (await sql`select 1 from automations where workspace_id = ${WS} and trigger->>'match' = 'any' and jsonb_array_length(trigger->'conditions') = 2`).length === 1, { timeoutMs: 15_000 })
  const [built] = await sql`select trigger from automations where workspace_id = ${WS} and jsonb_array_length(coalesce(trigger->'conditions', '[]'::jsonb)) = 2 and trigger->>'match' = 'any'`
  chk(
    made && valueShownForUnset === 0 && JSON.stringify(built?.trigger?.conditions) === JSON.stringify([{ field: 'priority', operator: 'any_of', value: 'high, urgent' }, { field: 'assignee', operator: 'is_not_set' }]),
    'the builder adds conditions — a field, its operators, a value only where one is compared — and keeps them with “any of these”',
    JSON.stringify({ made, valueShownForUnset, trigger: built?.trigger }),
  )

  console.log('\n▶ And tests a rule on a task, saying why it would not act')
  await page.goto(`${B}/app/${WS}/automations`, { waitUntil: 'domcontentloaded' })
  const card = page.locator('div.overflow-hidden', { hasText: `${TAG} escalate` }).first()
  await card.locator('button').filter({ has: page.locator('svg.lucide-chevron-down') }).first().click({ timeout: 20_000 }).catch(() => {})
  await card.getByTestId('automation-test-search').fill('Untagged').catch(() => {})
  await card.getByTestId('automation-test-task').first().click({ timeout: 15_000 }).catch(() => {})
  await card.getByTestId('automation-test-result').waitFor({ timeout: 15_000 }).catch(() => {})
  const result = card.getByTestId('automation-test-result').filter({ visible: true })
  const wouldAct = await result.getAttribute('data-would-act').catch(() => null)
  const lines = await card.getByTestId('automation-test-condition').filter({ visible: true }).evaluateAll((els) => els.map((e) => `${e.getAttribute('data-passed')}:${e.innerText}`)).catch(() => [])
  const summary = (await readText(card.getByTestId('automation-conditions-summary').filter({ visible: true }))) ?? ''
  chk(
    wouldAct === 'false' && lines.length === 2 && lines[0].startsWith('true:') && lines[1].startsWith('false:') && /Tag/.test(lines[1]) && /Only if all of/.test(summary),
    'the rule’s card says its conditions, and testing it on the untagged task shows it would not act: the priority holds, the tag does not',
    JSON.stringify({ wouldAct, lines, summary }),
  )

  const skippedShown = await waitUntil(() => card.getByTestId('automation-run-skipped').filter({ visible: true }).count().then((n) => n > 0).catch(() => false), { timeoutMs: 10_000 })
  const skippedText = (await readText(card.getByTestId('automation-run-skipped').filter({ visible: true }).first())) ?? ''
  chk(
    skippedShown && /Skipped: 1 condition/.test(skippedText),
    'and its run history shows the skipped run, and how many conditions did not hold',
    JSON.stringify({ skippedShown, skippedText }),
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m the run stopped: ${e?.stack ?? e}`)
} finally {
  await browser?.close().catch(() => {})
  stack.close()
  await sql?.end?.({ timeout: 2 }).catch?.(() => {})
}

console.log(`\n${passed} passed, ${failed} failed`)
// Said only when it is so, as every suite says it: the break runner reads this line as a short run.
if (passed + failed !== EXPECTED_CHECKS) {
  console.log(`\n✗ ${passed + failed} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
}
if (failed > 0 || passed + failed !== EXPECTED_CHECKS) process.exitCode = 1
