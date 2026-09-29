/**
 * §V2-11 — what the AI was worth, frames `19:00` and `19:05`.
 *
 * `[18:51]` "analytics mein humein show karta hai ke acha, hum ne kya zyada
 * cheezein [kiye] … kitna COST laga hai … kitna USAGE hua hai, ACTIVITY kya
 * rahi hai."
 *
 * WHAT THIS SUITE IS REALLY GUARDING, and it is not arithmetic — that is unit
 * tested in `ai-value.test.ts`. It is HONESTY, in three specific ways that a
 * later change could quietly undo:
 *
 *   1. The panel can report a LOSS. A workspace whose spend exceeds the value
 *      of the time it saved must see a negative number. The easiest "fix"
 *      somebody could apply here is a `Math.max(0, …)`, and that single change
 *      would turn an analytics page into marketing.
 *   2. The benchmark is the workspace's, and changing it changes the figures.
 *      A benchmark that saves but does not move the numbers is a settings form
 *      attached to nothing — this codebase's most common defect.
 *   3. The estimate cannot be set to a value that discredits it. Eight hours
 *      saved per model call produces a figure somebody would quote once and
 *      never trust again.
 *
 * The Activity log is checked for the thing frame `19:05` shows: an empty list
 * under a filter says the filter is why, and offers to clear it.
 *
 *   node test/e2e/ai-value.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil, readText } from './lib/wait.mjs'
import { openDb } from './lib/db.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 23

const chromium = await resolveChromium()
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
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

const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let restoreBenchmark = null
let A = null
let workspaceId = null
let sql = null
/** Tags the rows this suite appends, so it can remove exactly those. */
const FIXTURE_FEATURE = `e2e-value-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  const value = () => A(`/ai/value?workspaceId=${workspaceId}`)
  const setBenchmark = (body) =>
    A(`/ai/value/benchmark?workspaceId=${workspaceId}`, { method: 'PATCH', body })

  console.log('\n▶ §V2-11 `[18:51]` — the panel answers "what was it worth"')
  let v = (await value()).data
  restoreBenchmark = v?.benchmark ? { ...v.benchmark } : null
  chk(
    v && typeof v.minutesSaved === 'number' && typeof v.laborValueUsd === 'number',
    'the value endpoint answers with time saved and its worth',
    `it returned ${JSON.stringify(v).slice(0, 160)}`,
  )
  chk(
    v?.benchmark && typeof v.benchmark.minutesSavedPerRun === 'number',
    'and echoes the benchmark it reasoned from',
    'the benchmark is not returned — the figures would be a conclusion with no visible inputs',
  )
  chk(
    typeof v?.costUsd === 'number',
    'beside what it cost, which is the half that already existed',
    `costUsd came back ${JSON.stringify(v?.costUsd)}`,
  )

  console.log('\n▶ the benchmark is the workspace’s, and it MOVES the figures')
  await setBenchmark({ minutesSavedPerRun: 10, hourlyRateCents: 6000 })
  const after = (await value()).data
  chk(
    after?.benchmark.minutesSavedPerRun === 10 && after?.benchmark.hourlyRateCents === 6000,
    'changing it is saved',
    `the benchmark came back ${JSON.stringify(after?.benchmark)}`,
  )
  /*
   * The check that matters most in this block. A settings form that saves,
   * reads back, and changes nothing on the page it belongs to is the defect
   * this codebase keeps finding — so the assertion is on the FIGURES, not on
   * the stored value.
   */
  chk(
    after?.minutesSaved === after?.runs * 10,
    'and every figure above it moves with it',
    `${after?.runs} runs at 10 min/run should be ${(after?.runs ?? 0) * 10} minutes, ` +
      `the panel says ${after?.minutesSaved}`,
  )
  chk(
    Math.abs((after?.laborValueUsd ?? 0) - ((after?.minutesSaved ?? 0) / 60) * 60) < 0.02,
    'including the money, at the rate that was set',
    `${after?.minutesSaved} minutes at $60/h should be about ` +
      `$${(((after?.minutesSaved ?? 0) / 60) * 60).toFixed(2)}, the panel says $${after?.laborValueUsd}`,
  )

  console.log('\n▶ it can report a LOSS, which is the point of reporting at all')
  /*
   * REAL SPEND IS INSERTED, not hoped for. The first version of this block
   * asked "if there happens to be spend, is the net negative" — and on a fresh
   * database there never is, so the single most important check in the suite
   * quietly took an else branch and proved nothing. That is the same vacuous
   * check the merge suite shipped with; it is written down here so the next
   * person reading does not reintroduce it.
   *
   * `ai_usage` rows are appended by the AI service as a side effect of calling
   * the model. With no model configured — CI, and every lane
   * `RUNDESK_LANE_MODEL` does not name — no endpoint can create one, and this
   * suite runs in both configurations, so it asks none to. Hence the direct
   * insert — with a tagged feature name, so exactly these rows can be taken
   * away again.
   */
  sql = await openDb()
  chk(
    !!sql,
    'the suite can reach the database to stage real spend',
    'no DATABASE_URL — the loss check below cannot be made honest, so it is not being made',
  )
  if (sql) {
    // A deliberately expensive run against a real model id, so the estimated
    // cost outweighs any saving the benchmark could produce.
    await sql`
      insert into ai_usage (workspace_id, user_id, feature, model, input_tokens, output_tokens)
      values (${workspaceId}, null, ${FIXTURE_FEATURE}, 'claude-opus-4-20250514', 4000000, 400000)
    `
  }

  await setBenchmark({ minutesSavedPerRun: 0, hourlyRateCents: 0 })
  const zeroed = (await value()).data
  chk(
    zeroed?.minutesSaved === 0 && zeroed?.laborValueUsd === 0,
    'a benchmark of nothing saves nothing, and does not divide by zero',
    `it returned minutesSaved ${zeroed?.minutesSaved}, laborValueUsd ${zeroed?.laborValueUsd}`,
  )
  chk(
    (zeroed?.costUsd ?? 0) > 0,
    'the staged spend is visible to the panel',
    `costUsd came back ${zeroed?.costUsd} after inserting an expensive run — ` +
      'the check below would prove nothing',
  )
  /*
   * THE CHECK THIS SUITE EXISTS FOR. Money spent, nothing saved: the net must
   * be negative. The easiest "fix" anybody could apply to `summariseValue` is a
   * `Math.max(0, …)`, and that one change turns an analytics page into
   * marketing without breaking anything else.
   */
  chk(
    (zeroed?.netValueUsd ?? 0) < 0,
    'and a workspace that has spent money for no saving is shown as LOSING',
    `net came back ${zeroed?.netValueUsd} on $${zeroed?.costUsd} of spend with no saving — ` +
      'the figure is being clamped, which makes the whole panel a promotion',
  )

  console.log('\n▶ a benchmark that would discredit the figure is refused')
  const absurdMinutes = await setBenchmark({ minutesSavedPerRun: 100000 })
  chk(
    absurdMinutes.status >= 400 && absurdMinutes.status < 500,
    'eight hours saved per model call is refused',
    `it returned ${absurdMinutes.status} — the panel would report a saving nobody could defend`,
  )
  /*
   * AND IN THE SERVICE'S WORDS, NOT THE DATABASE'S.
   *
   * Migration 0140 puts CHECK constraints on both columns
   * (`<= 480`, `<= 10000000`), and `AllExceptionsFilter` maps a 23514 to 400
   * with the generic "A value failed a database constraint". So deleting the
   * bounds from `validateBenchmark` does not let an absurd benchmark through —
   * it only changes the sentence, from one naming the range to one naming
   * nothing. A status-only assertion cannot see that, which is the same hole
   * `task-merge` and `list-name-taken` each had.
   *
   * The range is the useful part: somebody typing 100000 needs to be told what
   * the ceiling is, not that a constraint exists.
   */
  chk(
    /between 0 and/i.test(JSON.stringify(absurdMinutes.error ?? '')),
    'and the refusal names the range, rather than reporting a database constraint',
    `it said ${JSON.stringify(absurdMinutes.error)} — a generic constraint message means the ` +
      'service bound is gone and the CHECK in migration 0140 caught it instead',
  )
  const absurdRate = await setBenchmark({ hourlyRateCents: 999999999 })
  chk(
    absurdRate.status >= 400 && absurdRate.status < 500,
    'and so is an hourly rate nobody is paid',
    `it returned ${absurdRate.status}`,
  )
  chk(
    /outside the range/i.test(JSON.stringify(absurdRate.error ?? '')),
    'and that refusal is the service\'s sentence too',
    `it said ${JSON.stringify(absurdRate.error)}`,
  )
  const fractional = await setBenchmark({ minutesSavedPerRun: 2.5 })
  chk(
    fractional.status >= 400 && fractional.status < 500,
    'and a fractional number of minutes, which the column cannot hold',
    `it returned ${fractional.status}`,
  )

  console.log('\n▶ frame `19:05` — the Activity log')
  const activity = await A(`/ai/activity?workspaceId=${workspaceId}&limit=5`)
  chk(
    activity.status === 200 && Array.isArray(activity.data),
    'the run log answers with a list',
    `it returned ${activity.status} ${JSON.stringify(activity.data).slice(0, 120)}`,
  )
  const nonsense = await A(`/ai/activity?workspaceId=${workspaceId}&feature=not-a-real-feature`)
  chk(
    nonsense.status === 200 && (nonsense.data ?? []).length === 0,
    'and a filter that matches nothing returns nothing, rather than everything',
    `filtering by a feature that does not exist returned ${(nonsense.data ?? []).length} rows — ` +
      'the filter is being ignored',
  )

  // Put the benchmark back before the browser half reads it.
  await setBenchmark({ minutesSavedPerRun: 6, hourlyRateCents: 5000 })

  // ── On screen ────────────────────────────────────────────────────────────
  console.log('\n▶ the Analytics tab on the AI page')
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${workspaceId}/ai`, { waitUntil: 'domcontentloaded' })

  await page.getByText('Analytics', { exact: true }).first().click({ timeout: 20000 })
  const shown = await waitUntil(
    () => page.getByTestId('ai-value-panel').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  chk(shown, 'the AI page has an Analytics tab', 'there is no Analytics tab on the AI page')

  const timeShown = await waitUntil(
    () => page.getByTestId('ai-value-time').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  chk(timeShown, 'and it leads with time saved, not with cost',
    'the panel does not show a time-saved figure')

  /*
   * THE WORKING, ON SCREEN. A figure somebody may put in a business case has to
   * show where it came from. Without this the page is a number with no
   * provenance, which is exactly what makes such numbers untrustworthy.
   */
  // Guarded: an unmounted element here used to auto-wait thirty seconds and
  // THROW, which is how this suite failed in CI while passing locally.
  const working = await readText(page.getByTestId('ai-value-time').filter({ visible: true }))
  chk(
    /×/.test(working) && /\d/.test(working),
    'showing its arithmetic beside it',
    `the tile reads ${JSON.stringify(working.replace(/\s+/g, ' '))} — a conclusion with no visible inputs`,
  )

  chk(
    await page.getByTestId('ai-value-edit-benchmark').isVisible().catch(() => false),
    'and offers Edit benchmark, as frame `19:00` does',
    'the benchmark cannot be changed from the panel it drives',
  )

  await page.getByTestId('ai-analytics-tab-activity').click()
  const activityShown = await waitUntil(
    async () =>
      (await page.getByTestId('ai-activity-row').count()) > 0 ||
      (await page.getByTestId('ai-activity-empty').count()) > 0,
    { timeoutMs: 15_000 },
  )
  chk(activityShown, 'the Activity tab shows runs, or says there are none',
    'the Activity tab rendered neither rows nor an empty state')
} catch (e) {
  const lines = e.message.split('\n')
  const where = lines.find((l) => l.includes('waiting for') || l.includes('getByTestId'))
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${lines[0]}${where ? `\n         ${where.trim()}` : ''}`)
} finally {
  // The benchmark is this workspace's real setting, not the suite's to keep, so
  // a refused restore is this run's failure. Nothing read, nothing to put back.
  let putBack = null
  if (restoreBenchmark && A && workspaceId) {
    try {
      putBack = await A(`/ai/value/benchmark?workspaceId=${workspaceId}`, {
        method: 'PATCH',
        body: restoreBenchmark,
      })
    } catch (err) {
      putBack = { status: 0, error: { message: String(err?.message ?? err) } }
    }
  }
  chk(
    !putBack || putBack.status < 300,
    'and the workspace’s own benchmark is put back',
    `PATCH answered ${putBack?.status} ${JSON.stringify(putBack?.error ?? null)} — the workspace keeps this run's benchmark`,
  )
  // The staged spend is this suite's, and must not follow the database around.
  if (sql) {
    await sql`delete from ai_usage where feature = ${FIXTURE_FEATURE}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  /*
   * EXACT, not `<`. Hardened during the §V2-S18 re-audit, which added three
   * suites next to this one under a rule this file predated: with `<`, a branch
   * that silently SKIPPED turns into a shorter run that still passes, and only
   * a run that stopped early is caught. All twenty checks here are
   * unconditional, so anything but twenty means the shape of the suite changed
   * without its count being reconsidered.
   */
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run did not do what it says, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
