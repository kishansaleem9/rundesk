/**
 * MY AGENT PERFORMANCE, AS CLICKUP'S CREDITS TAB HAS IT
 * (`found-14-oct/agent-performance-carried-and-unbuilt`).
 *
 * ClickUp (help centre through search excerpts, 14 October: "Track your
 * Workspace's Brain AI usage", "How are AI Super Credits consumed?", "Super
 * Agent privacy, security, and permissions"): a row per Super Agent — the
 * actions it completed, the time they saved (each action times a per-action
 * time benchmark), the value created (that time at an hourly rate), its cost,
 * its ROI (value over cost) and who made it; admins see every agent of the
 * workspace, members the ones they made. Frame `19:00` draws it under the
 * Credits tab's usage trend, with Find agent and Edit benchmark.
 *
 * Measured before it was built: no `/super-agents/performance` (404), an
 * agent's calls kept under the person it acted for with nothing naming the
 * agent, and no count of what a run did.
 *
 * A workspace of this run's own: the lanes' admin owns it, Mia and Max are
 * members, Gus a guest. Each has an agent — the admin's Herald, Mia's Scout,
 * Max's Quill — and this month's runs and their calls are staged by SQL, so
 * every number below is known before it is read. The last check runs an agent
 * for real: where a model answers (a lane's stub) its calls and what it did
 * are counted as its own; where none answers (CI), the refused run counts
 * nothing. The same number of checks either way.
 *
 *   node test/e2e/agent-performance.mjs --api 3029 --dist /tmp/claude-0/dist-9
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, madeWorkspace } from './lib/fixture.mjs'
import { madeAccount } from './lib/made.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 15

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const MODEL = `http://127.0.0.1:${argOf('--model', process.env.E2E_MODEL_PORT ?? String(9200 + (API_PORT - 3020)))}`
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = { email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal', password: process.env.E2E_PASSWORD ?? 'Admin@123!' }

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `agp${stamp}`
const PASSWORD = 'AgentPerformance@12345!'

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error, message, details}`. Every call site reads `status`. */
const apiAs = apiAsAt(API, { emptyBodyOn: ['POST'] })
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`
const must = (res, what) => {
  if (!res.ok || !res.data) throw new Error(`could not ${what}: ${said(res)}`)
  return res.data
}
/** The model stub's control routes: reset what an earlier run left staged, and stage the next answer. */
const stub = (route, body) =>
  fetch(`${MODEL}/__control/${route}`, {
    method: 'POST',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
    .then((r) => r.ok)
    .catch(() => false)

let sql = null
let browser = null
let MODEL_ON_FOR_FINALLY = false

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the runs and their calls are staged and read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const [me] = await sql`select id from users where lower(email) = lower(${ADMIN.email})`
  const aiStatus = await A('/ai/status')
  const MODEL_ON = aiStatus.status === 200 && aiStatus.data?.available === true
  console.log(`  · /ai/status says a model is ${MODEL_ON ? `configured (stub ${MODEL})` : 'not configured: the run is refused, and counts nothing'}`)
  if (MODEL_ON && !(await stub('reset'))) throw new Error(`a model is configured but no stub answers on ${MODEL}`)
  MODEL_ON_FOR_FINALLY = MODEL_ON

  const WS = must(await A('/workspaces', { method: 'POST', body: { name: `Agent performance ${TAG}` } }), 'make the workspace').id
  madeWorkspace(WS)
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `${who} ${stamp}`, email, password: PASSWORD, organizationName: `Agents ${who} ${stamp}`, organizationSlug: `agents-${who}-${stamp}` })
    must(await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } }), `add ${who}`)
    return { email, id: signed.user.id, api: apiAs(signed.accessToken) }
  }
  const mia = await person('mia', 'member')
  const max = await person('max', 'member')
  const gus = await person('gus', 'guest')
  const space = must(await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} work` } }), 'make the space')
  const project = must(await A('/projects', { method: 'POST', body: { spaceId: space.id, name: `${TAG} folder` } }), 'make the folder')
  const L = must(await A('/lists', { method: 'POST', body: { projectId: project.id, name: `${TAG} launch` } }), 'make the list').id

  const agent = async (api, name) => {
    const made = must(await api(`/workspaces/${WS}/super-agents`, { method: 'POST', body: { name: `${name} ${TAG}`, description: `${name} helps with the launch.` } }), `make ${name}`)
    madeAccount({ id: made.userId })
    return made
  }
  const herald = await agent(A, 'Herald')
  const scout = await agent(mia.api, 'Scout')
  const quill = await agent(max.api, 'Quill')

  // This month's runs, and their calls — written as the product writes them: a run's calls carry its id.
  const now = new Date()
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 2 * 86_400_000).toISOString()
  const stageRun = async (agentId, { actions, credits, status = 'completed', at = null }) => {
    const [run] = await sql`
      insert into super_agent_runs (agent_id, workspace_id, trigger, status, input, actions_completed, started_at, finished_at)
      values (${agentId}, ${WS}, 'manual', ${status}, ${`staged ${TAG}`}, ${actions}, coalesce(${at}::timestamptz, now()), coalesce(${at}::timestamptz, now()))
      returning id`
    // No person on a staged call: the hourly limit counts a person's calls, and nobody made these.
    if (credits) {
      await sql`
        insert into ai_usage (workspace_id, user_id, feature, model, input_tokens, output_tokens, status, credits, agent_run_id, created_at)
        values (${WS}, null, 'agent.run', 'claude-sonnet-4-6', 0, 0, 'succeeded', ${credits}, ${run.id}, coalesce(${at}::timestamptz, now()))`
    }
    return run.id
  }
  await stageRun(herald.id, { actions: 3, credits: 1200 })
  await stageRun(herald.id, { actions: 2, credits: 800 })
  await stageRun(herald.id, { actions: 0, credits: 0, status: 'skipped' })
  await stageRun(herald.id, { actions: 7, credits: 900, at: lastMonth })
  await stageRun(scout.id, { actions: 4, credits: 500 })
  await stageRun(quill.id, { actions: 1, credits: 100 })
  // The admin's own call this month, in no agent's run: theirs, not Herald's.
  await sql`insert into ai_usage (workspace_id, user_id, feature, model, input_tokens, output_tokens, status, credits) values (${WS}, null, 'summarize', 'claude-haiku-4-5', 0, 0, 'succeeded', 5000)`

  const perf = (api = A) => api(`/workspaces/${WS}/super-agents/performance`)
  const rowOf = (res, a) => (res.data?.agents ?? []).find((r) => r.id === a.id) ?? null

  // ══ 1. EVERY AGENT, TO AN ADMIN ══════════════════════════════════════════════
  console.log('\n▶ an admin reads every Super Agent’s month')
  const all = await perf()
  const h = rowOf(all, herald)
  const s = rowOf(all, scout)
  const q = rowOf(all, quill)
  chk(
    all.status === 200 && all.data?.scope === 'all' && (all.data?.agents ?? []).length === 3
      && h?.actions === 5 && s?.actions === 4 && q?.actions === 1
      && h?.createdBy?.id === me?.id && s?.createdBy?.id === mia.id && q?.createdBy?.id === max.id,
    'an admin reads every Super Agent of the workspace, with the actions each completed this month and who made it',
    JSON.stringify({ status: all.status, scope: all.data?.scope, agents: (all.data?.agents ?? []).map((r) => [r.name, r.actions, r.createdBy?.id]) }),
  )

  // ══ 2. WHAT A RUN IS, AND WHICH MONTH ════════════════════════════════════════
  chk(
    h?.runs === 2 && s?.runs === 1 && q?.runs === 1,
    'a run refused before it began is not one of its runs, and last month’s runs are not this month’s',
    JSON.stringify({ herald: h?.runs, scout: s?.runs, quill: q?.runs }),
  )

  // ══ 3. ITS OWN CALLS ═════════════════════════════════════════════════════════
  chk(
    h?.credits === 2000 && s?.credits === 500 && q?.credits === 100,
    'an agent’s credits are its own runs’ calls this month — not last month’s, and not a call made outside its runs (read by SQL)',
    JSON.stringify({ herald: h?.credits, scout: s?.credits, quill: q?.credits }),
  )

  // ══ 4. TIME, VALUE, COST, RETURN ═════════════════════════════════════════════
  chk(
    all.data?.benchmark?.minutesSavedPerAction === 6 && all.data?.benchmark?.hourlyRateCents === 5000
      && h?.minutesSaved === 30 && h?.valueUsd === 25 && h?.costUsd === 2 && h?.roi === 12.5
      && s?.minutesSaved === 24 && s?.valueUsd === 20 && s?.costUsd === 0.5 && s?.roi === 40,
    'time saved is its actions at 6 minutes each, its value that time at $50 an hour, its cost its credits at a tenth of a cent, and its return value over cost',
    JSON.stringify({ benchmark: all.data?.benchmark, herald: h, scout: s }),
  )

  // ══ 5. A MEMBER'S OWN ════════════════════════════════════════════════════════
  console.log('\n▶ who reads which')
  const miaPerf = await perf(mia.api)
  chk(
    miaPerf.status === 200 && miaPerf.data?.scope === 'mine' && (miaPerf.data?.agents ?? []).map((r) => r.id).join() === scout.id
      && miaPerf.data?.mayEditBenchmark === false,
    'a member reads only the Super Agents they made, and may not edit the benchmark',
    JSON.stringify({ status: miaPerf.status, scope: miaPerf.data?.scope, agents: (miaPerf.data?.agents ?? []).map((r) => r.name), may: miaPerf.data?.mayEditBenchmark }),
  )

  // ══ 6. A GUEST, NONE ═════════════════════════════════════════════════════════
  const gusPerf = await perf(gus.api)
  chk(
    gusPerf.status === 403 && /Guests have no Super Agents/.test(gusPerf.message ?? ''),
    'a guest is refused it in words (403)',
    said(gusPerf),
  )

  // ══ 7. EDIT BENCHMARK ════════════════════════════════════════════════════════
  console.log('\n▶ Edit benchmark')
  const benchmark = (api, body) => api(`/ai/value/benchmark?workspaceId=${WS}`, { method: 'PATCH', body })
  const [perRunBefore] = await sql`select ai_minutes_saved_per_run as m from workspaces where id = ${WS}`
  const set = await benchmark(A, { minutesSavedPerAgentAction: 10, hourlyRateCents: 6000 })
  const after = await perf()
  const h2 = rowOf(after, herald)
  const [stored] = await sql`select ai_minutes_saved_per_agent_action as per_action, ai_hourly_rate_cents as rate, ai_minutes_saved_per_run as per_run from workspaces where id = ${WS}`
  chk(
    set.status === 200 && stored?.per_action === 10 && stored?.rate === 6000 && stored?.per_run === perRunBefore?.m
      && h2?.minutesSaved === 50 && h2?.valueUsd === 50 && h2?.roi === 25,
    'an admin sets the minutes an action saves and the hourly rate; each agent’s row is reckoned again from them, and the value panel’s minutes per run are its own (read by SQL)',
    JSON.stringify({ set: said(set), stored, perRunBefore: perRunBefore?.m, herald: h2 }),
  )

  // ══ 8. NOT A MEMBER'S TO SET ═════════════════════════════════════════════════
  const miaSets = await benchmark(mia.api, { minutesSavedPerAgentAction: 99 })
  const [unchanged] = await sql`select ai_minutes_saved_per_agent_action as per_action from workspaces where id = ${WS}`
  chk(
    miaSets.status === 403 && /Only a workspace admin can change the AI benchmark/.test(miaSets.message ?? '') && unchanged?.per_action === 10,
    'a member is refused setting the benchmark in words, and it stays as it was (read by SQL)',
    JSON.stringify({ mia: said(miaSets), perAction: unchanged?.per_action }),
  )

  // ══ 9. A BENCHMARK THAT WOULD DISCREDIT THE TABLE ════════════════════════════
  const tooMany = await benchmark(A, { minutesSavedPerAgentAction: 481 })
  const fraction = await benchmark(A, { minutesSavedPerAgentAction: 2.5 })
  const [still] = await sql`select ai_minutes_saved_per_agent_action as per_action from workspaces where id = ${WS}`
  chk(
    tooMany.status === 400 && /between 0 and 480/.test(tooMany.message ?? '') && fraction.status === 400 && still?.per_action === 10,
    'minutes per action past eight hours, or not whole, are refused in words (400) and nothing is kept',
    JSON.stringify({ tooMany: said(tooMany), fraction: said(fraction), perAction: still?.per_action }),
  )

  // ══ 10. THE CREDITS TAB DRAWS IT ═════════════════════════════════════════════
  console.log('\n▶ the Credits tab: My Agent Performance')
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const signIn = async (email, password) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return page
  }
  const openCredits = async (page) => {
    await page.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('ai-tab-credits').click({ timeout: 20_000 }).catch(() => {})
    await page.getByTestId('agent-performance-table').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  }
  const drawnRow = async (page, a) => {
    const row = page.getByTestId(`agent-performance-row-${a.id}`)
    const cell = async (id) => (await row.getByTestId(id).filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')).trim()
    return {
      name: await cell('agent-performance-name'),
      maker: await cell('agent-performance-maker'),
      actions: await cell('agent-performance-actions'),
      time: await cell('agent-performance-time'),
      value: await cell('agent-performance-value'),
      cost: await cell('agent-performance-cost'),
      roi: await cell('agent-performance-roi'),
    }
  }
  const adminPage = await signIn(ADMIN.email, ADMIN.password)
  await openCredits(adminPage)
  const drawnHerald = await drawnRow(adminPage, herald)
  const drawnScout = await drawnRow(adminPage, scout)
  const drawnRows = await adminPage.locator('[data-testid^="agent-performance-row-"]').count().catch(() => 0)
  chk(
    drawnRows === 3 && drawnHerald.name === `Herald ${TAG}` && drawnHerald.actions === '5' && drawnHerald.time === '50m'
      && drawnHerald.value === '$50.00' && drawnHerald.cost === '$2.00' && drawnHerald.roi === '25×'
      && drawnScout.name === `Scout ${TAG}` && drawnScout.maker === `mia ${stamp}` && drawnScout.roi === '80×',
    'the Credits tab draws My Agent Performance under the month’s credits: a row per agent with who made it, its actions, time saved, value, cost and return',
    JSON.stringify({ drawnRows, herald: drawnHerald, scout: drawnScout }),
  )

  // ══ 11. FIND AGENT ═══════════════════════════════════════════════════════════
  const find = adminPage.getByTestId('agent-performance-find')
  await find.fill('scout').catch(() => {})
  await waitUntil(async () => (await adminPage.locator('[data-testid^="agent-performance-row-"]').count().catch(() => -1)) === 1, { timeoutMs: 5000 }).catch(() => {})
  const found = await adminPage.locator('[data-testid^="agent-performance-row-"]').count().catch(() => -1)
  const foundScout = await adminPage.getByTestId(`agent-performance-row-${scout.id}`).count().catch(() => 0)
  await find.fill(`nobody ${TAG}`).catch(() => {})
  const noMatch = (await adminPage.getByTestId('agent-performance-no-match').filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')).trim()
  await find.fill('').catch(() => {})
  chk(
    found === 1 && foundScout === 1 && noMatch.includes(`nobody ${TAG}`),
    'Find agent narrows the rows to the agents whose name it holds, and says so when none has it',
    JSON.stringify({ found, foundScout, noMatch }),
  )

  // ══ 12. EDIT BENCHMARK FROM THE CARD ═════════════════════════════════════════
  await adminPage.getByTestId('agent-performance-edit-benchmark').click({ timeout: 10_000 }).catch(() => {})
  await adminPage.getByTestId('agent-performance-minutes').fill('12').catch(() => {})
  await adminPage.getByTestId('agent-performance-rate').fill('30').catch(() => {})
  await adminPage.getByTestId('agent-performance-save-benchmark').click({ timeout: 10_000 }).catch(() => {})
  const heraldRow = adminPage.getByTestId(`agent-performance-row-${herald.id}`)
  // 5 actions × 12 min = 1h; at $30 an hour, $30.00, over $2.00: 15×.
  await waitUntil(async () => (await heraldRow.getByTestId('agent-performance-value').filter({ visible: true }).innerText({ timeout: 1000 }).catch(() => '')).trim() === '$30.00', { timeoutMs: 15_000 }).catch(() => {})
  const redrawn = await drawnRow(adminPage, herald)
  const [saved] = await sql`select ai_minutes_saved_per_agent_action as per_action, ai_hourly_rate_cents as rate from workspaces where id = ${WS}`
  chk(
    redrawn.time === '1h' && redrawn.value === '$30.00' && redrawn.roi === '15×' && saved?.per_action === 12 && saved?.rate === 3000,
    'Edit benchmark on the card saves the minutes per action and the hourly rate, and the rows are drawn again from them (read by SQL)',
    JSON.stringify({ redrawn, saved }),
  )

  // ══ 13. A MEMBER'S CARD ══════════════════════════════════════════════════════
  const miaPage = await signIn(mia.email, PASSWORD)
  await openCredits(miaPage)
  const miaRows = await miaPage.locator('[data-testid^="agent-performance-row-"]').count().catch(() => 0)
  const miaScout = await miaPage.getByTestId(`agent-performance-row-${scout.id}`).count().catch(() => 0)
  const miaScope = (await miaPage.getByTestId('agent-performance-scope').filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')).trim()
  const miaEdit = await miaPage.getByTestId('agent-performance-edit-benchmark').count().catch(() => -1)
  chk(
    miaRows === 1 && miaScout === 1 && /The Super Agents you made/.test(miaScope) && miaEdit === 0,
    'a member’s card draws only the agents they made, says so, and offers no Edit benchmark',
    JSON.stringify({ miaRows, miaScout, miaScope, miaEdit }),
  )

  // ══ 14. SETTINGS → AI USAGE ══════════════════════════════════════════════════
  await adminPage.goto(`${B}/app/${WS}/settings?tab=aiUsage`, { waitUntil: 'domcontentloaded' })
  await adminPage.getByTestId('agent-performance-table').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  // The credits card draws once its own answer is in, which may come after the table's.
  await adminPage.getByTestId('ai-credits-card').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  const settingsRows = await adminPage.locator('[data-testid^="agent-performance-row-"]').count().catch(() => 0)
  const settingsCredits = await adminPage.getByTestId('ai-credits-card').count().catch(() => 0)
  chk(
    settingsRows === 3 && settingsCredits === 1,
    'Settings → AI usage draws the same table under the credits card',
    JSON.stringify({ settingsRows, settingsCredits }),
  )

  // ══ 15. A REAL RUN COUNTS AS ITS OWN ═════════════════════════════════════════
  console.log('\n▶ a run of the agent, for real')
  const before = rowOf(await perf(mia.api), scout)
  if (MODEL_ON) await stub('next', { content: [{ type: 'tool_use', name: 'create_task', input: { listId: L, title: `Made by Scout ${TAG}` } }] })
  const ran = await mia.api(`/super-agents/${scout.id}/run`, { method: 'POST', body: { prompt: 'Make a task for the launch' } })
  const runId = ran.data?.id ?? null
  const [runRow] = runId ? await sql`select status, actions_completed as actions from super_agent_runs where id = ${runId}` : [null]
  const calls = runId ? await sql`select status, credits from ai_usage where agent_run_id = ${runId}` : []
  const spent = calls.reduce((n, c) => n + c.credits, 0)
  const afterRun = rowOf(await perf(mia.api), scout)
  if (MODEL_ON) {
    const [task] = await sql`select id from tasks where list_id = ${L} and title = ${`Made by Scout ${TAG}`}`
    chk(
      runRow?.status === 'completed' && runRow?.actions === 1 && !!task && calls.length >= 1 && calls.every((c) => c.status === 'succeeded') && spent >= 1
        && afterRun?.runs === (before?.runs ?? -9) + 1 && afterRun?.actions === (before?.actions ?? -9) + 1 && afterRun?.credits === (before?.credits ?? -9) + spent,
      'a run of the agent writes its calls as its own and counts what it carried out — and its row grows by that run, that action and those credits (read by SQL)',
      JSON.stringify({ ran: said(ran), runRow, task: !!task, calls, before, afterRun }),
    )
  } else {
    chk(
      runRow?.status === 'failed' && runRow?.actions === 0 && calls.length === 1 && calls[0]?.status === 'failed' && calls[0]?.credits === 0
        && afterRun?.runs === (before?.runs ?? -9) + 1 && afterRun?.actions === before?.actions && afterRun?.credits === before?.credits,
      'a run of the agent writes its calls as its own and counts what it carried out — and its row grows by that run, that action and those credits (read by SQL)',
      `no model here: the refused run is the agent's, carried out nothing and cost nothing — ${JSON.stringify({ ran: said(ran), runRow, calls, before, afterRun })}`,
    )
  }
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (MODEL_ON_FOR_FINALLY) await stub('reset')
  await browser?.close().catch(() => {})
  stack.close()
  await sql?.end?.({ timeout: 5 }).catch?.(() => {})
}

console.log(`\n${passed} passed, ${failed} failed`)
// Said only when it is so, as every suite says it: the break runner reads this line as a short run.
if (passed + failed !== EXPECTED_CHECKS) {
  console.log(`\n✗ ${passed + failed} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
}
if (failed > 0 || passed + failed !== EXPECTED_CHECKS) process.exitCode = 1
