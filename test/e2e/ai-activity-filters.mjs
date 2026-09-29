/**
 * §V2-11 frame `19:05` — the Activity log's filter row.
 *
 * The frame draws `Date run ▾ · Status ▾ · My agents · Agent ▾` over an empty
 * list reading "No activity found — We couldn't find activity that matches your
 * filters" with a **Clear filters** button.
 *
 * TWO REAL DEFECTS ARE BEING CLOSED HERE, and neither was a missing control.
 *
 *   1. `GET /ai/activity` HAS ACCEPTED `userId` SINCE IT WAS WRITTEN, and no
 *      web code ever sent it. A "mine only" toggle on top of that re-renders
 *      and asks the server for exactly the same rows — the render is right and
 *      the reason is wrong. So this suite CAPTURES THE REQUEST and asserts the
 *      parameter left the browser, in both directions: a toggle that only
 *      works the first time is the other half of the same bug.
 *
 *   2. STATUS WAS IMPOSSIBLE. `recordUsage` fired only on the success path, so
 *      every row in `ai_usage` was a success and a Status dropdown would have
 *      had one reachable value — the facade, exactly. Migration 0150 adds the
 *      column AND the write, so the filter has something to discriminate.
 *
 * A REAL FAILURE IS CAUSED, not simulated — and WHICH failure is read from the
 * configuration before it is caused. `/ai/status` says whether a model is
 * configured, and `POST /ai/task/generate` is made to fail the way that
 * configuration makes real:
 *
 *   · no model (CI, and every lane `RUNDESK_LANE_MODEL` does not name): the
 *     product's own "AI features are not configured" refusal, a 503 and a
 *     `not_configured` row. The most common AI failure this product has, and
 *     until 0150 it left no trace anywhere.
 *   · a model (`model-stub.mjs`): the stub is told, through
 *     `POST /__control/next`, to fail the call often enough to outlast the
 *     client's retries, so the provider's failure reaches the product — a 5xx
 *     and a `provider_error` row.
 *
 * Either way the refusal is scenery. This suite is about the row a failure
 * leaves and the filters that find it, so the checks are the same checks on
 * both kinds of lane and the row's `errorCode` must be the one the
 * configuration predicts. It used to force the 503 alone, which made it a
 * suite that stood on the refusal: green only where no model answered, and on
 * a lane with one the 503 check failed and the failed-row checks after it had
 * nothing to count (`lane-env.sh`). The status is checked explicitly (the
 * fixture's `apiClient` NEVER THROWS, so a `.catch` on it would be inert and a
 * failed call would read as success), then the run proves exactly one new
 * failed row appeared and that the two status filters put it on opposite
 * sides.
 *
 * ITS OWN FIXTURES: the failed row is identified by DELTA against a set of ids
 * read moments before, and the succeeded row carries a feature name unique to
 * this run. Nothing here asserts a total over the shared database.
 *
 *   node test/e2e/ai-activity-filters.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, pickWorkspace } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { openDb } from './lib/db.mjs'

const chromium = await resolveChromium()
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure. */
const EXPECTED_CHECKS = 34

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')

const STAMP = Date.now()
/** Unique to this run: a feature nothing else writes, so it filters to itself. */
const MINE_FEATURE = `e2e-af-${STAMP}`
/** Tags the rows inserted directly, so exactly those can be removed. */
const TAG = `e2e-af-model-${STAMP}`

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
/*
 * THE LANE'S MODEL STUB, asked for anything only where `/ai/status` says a
 * model is configured. Lane k runs its API on 302k and `model-stub.mjs` on
 * 92k (`lane-env.sh`); `--model` or `E2E_MODEL_PORT` overrides the formula.
 */
const MODEL = `http://127.0.0.1:${argOf('--model', process.env.E2E_MODEL_PORT ?? String(9200 + (API_PORT - 3020)))}`

let stack = null
let B = (process.env.BASE ?? '').replace(/\/$/, '')
if (!B) {
  stack = await startLocalStack({
    dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')),
    apiPort: API_PORT,
  })
  B = stack.base
}

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
// The SENTENCE, then the reason: this reason is built from the run's numbers,
// so printed alone it named no check `check-break-reddened.mjs` could find
// (`af-3` read as unreadable; `found-29-sep/failing-checks-print-only-their-reason`).
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg && badMsg !== good ? `${good} \u2014 ${badMsg}` : good))

/*
 * READS THAT ANSWER `null` INSTEAD OF ENDING THE SECTION. Both verbs wait for
 * the element and THROW when it never arrives, and both are read twice below —
 * once in a condition and once in the message beside it. A `chk` message is
 * evaluated whether the check passes or fails, so no `&&` in the condition can
 * protect the second read; these hold the answer in a variable and use it in
 * both places. `null` is not a value any of these checks accept, so an absent
 * control still fails, in a sentence, with the rest of the section reported.
 */
const attrOf = (loc, name) => loc.getAttribute(name, { timeout: 6000 }).catch(() => null)
const valueOf = (loc) => loc.inputValue({ timeout: 6000 }).catch(() => null)

const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
const api = apiClient(`${B}/api/v1`, auth.accessToken)
const ME = auth.user?.id ?? auth.id
const WS = process.env.E2E_WS ?? (await pickWorkspace(api)).id

const activity = (extra = '') => api(`/ai/activity?workspaceId=${WS}&limit=500${extra}`)
const idsOf = (res) => new Set((res.data ?? []).map((r) => r.id))

let sql = null
let browser = null
let ctx = null
let forcedFailureId = null

try {
  console.log('\n▶ forcing a REAL failed run `19:05`')
  chk(
    typeof ME === 'string' && ME.length > 0,
    'the suite knows whose runs are "mine"',
    `the login payload carried no user id: ${JSON.stringify(auth?.user ?? null)}`,
  )
  const before = await activity('&status=failed')
  chk(
    before.status === 200 && Array.isArray(before.data),
    'the run log answers a status-filtered read',
    `it returned ${before.status} ${JSON.stringify(before.data).slice(0, 140)}`,
  )
  const failedBefore = idsOf(before)

  /*
   * WHICH FAILURE IS REAL HERE, READ BEFORE ONE IS CAUSED. Availability belongs
   * to the API process — one key per API, fixed when it starts (`lane-env.sh`)
   * — so a suite cannot choose it, only ask. `/ai/status` answers, and the run
   * causes the failure that answer makes real. An answer that is neither true
   * nor false predicts nothing, so no failure is caused and the check below
   * says why.
   */
  const aiStatus = await api('/ai/status')
  const statusKnown = aiStatus.status === 200 && typeof aiStatus.data?.available === 'boolean'
  const modelConfigured = statusKnown && aiStatus.data.available === true
  /** The `errorCode` the new row must carry, as the configuration predicts it. */
  const predicted = modelConfigured ? 'provider_error' : 'not_configured'
  const configuration = statusKnown
    ? `/ai/status says a model is ${modelConfigured ? `configured (stub ${MODEL})` : 'not configured'}`
    : `/ai/status answered ${aiStatus.status} ${JSON.stringify(aiStatus.data)?.slice(0, 80)}`
  console.log(`  · ${configuration}, so the failure caused is ${modelConfigured ? "the provider's" : "the product's own refusal"}`)

  /*
   * THE PROVIDER'S FAILURE, ARRANGED where a model answers. The stub fails the
   * call it is staged for `count` times over, because the product builds its
   * client with the SDK's default retries: a failure the first attempt uses up
   * lets the retry succeed, and the arranged failure reaches nobody
   * (`model-stub.mjs` found that the moment its status became truthful).
   * Reset BEFORE, because the stub outlives every run and whatever an earlier
   * one staged and never used is still staged; reset AFTER, so what is left of
   * the count does not fail whatever asks the model next on this lane.
   *
   * Where no model is configured nothing is arranged: the product's own "AI
   * features are not configured" path is the failure, the one that used to 503
   * and record nothing at all.
   *
   * The status is checked EXPLICITLY either way: `apiClient` returns
   * `{status, data, error}` and never throws, so a `.catch` here would be inert
   * and a 200 would sail through as if it had failed.
   */
  const stub = (route, body) =>
    fetch(`${MODEL}/__control/${route}`, {
      method: 'POST',
      ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    })
      .then((r) => r.ok)
      .catch(() => false)
  let arranged = false
  if (modelConfigured) {
    arranged =
      (await stub('reset')) &&
      (await stub('next', { status: 500, message: `arranged by ai-activity-filters ${STAMP}`, count: 8 }))
  }
  const forced =
    statusKnown && (!modelConfigured || arranged)
      ? await api('/ai/task/generate', {
          method: 'POST',
          body: { prompt: `activity filter fixture ${STAMP}`, workspaceId: WS },
        })
      : { status: 0, data: null }
  if (modelConfigured) await stub('reset')
  chk(
    modelConfigured ? arranged && forced.status >= 500 : statusKnown && forced.status === 503,
    modelConfigured
      ? 'asking for a task while the provider fails is refused, not answered'
      : 'asking for a task while AI is unconfigured is refused with a 503',
    !statusKnown
      ? `${configuration} — without the configuration there is no knowing which failure is real here, so none was caused`
      : modelConfigured && !arranged
        ? `the model stub at ${MODEL} would not stage a failure, so this run could not cause one and nothing below measures anything`
        : `it returned ${forced.status} while ${configuration}` +
          (modelConfigured ? ' and the stub was told to fail the call' : ''),
  )

  const afterFail = await activity('&status=failed')
  const newFailed = (afterFail.data ?? []).filter((r) => !failedBefore.has(r.id))
  chk(
    newFailed.length === 1,
    'and leaves exactly one new failed row behind',
    `${newFailed.length} new failed rows appeared — before 0150 the answer was 0, ` +
      'because nothing wrote a failure down',
  )
  const row = newFailed[0]
  forcedFailureId = row?.id ?? null
  chk(
    row?.status === 'failed' && row?.feature === 'task.generate',
    'the row names itself as a failed `task.generate`',
    `the new row was ${JSON.stringify(row)}`,
  )
  chk(
    row?.errorCode === predicted && typeof row?.errorMessage === 'string' && row.errorMessage.length > 0,
    'and carries WHY, in a sentence somebody can act on',
    `errorCode=${JSON.stringify(row?.errorCode)}, where the configuration predicts ${JSON.stringify(predicted)}; ` +
      `errorMessage=${JSON.stringify(row?.errorMessage)}`,
  )
  chk(
    row?.userId === ME,
    'attributed to the person who asked for it',
    `the row's userId was ${JSON.stringify(row?.userId)}, not ${ME}`,
  )

  console.log('\n▶ the two status filters put it on opposite sides')
  const succeeded = await activity('&status=succeeded')
  /*
   * AN ABSENCE IS A CLAIM ONLY WHERE THE ROW COULD HAVE BEEN. With no failed
   * row made above — a model lane, or a regression of the failure write —
   * `forcedFailureId` is null, no row has a null id, and this passed about a
   * row that does not exist; a read that failed passed it the same way. So
   * the row must exist and the read must have answered.
   */
  chk(
    forcedFailureId != null && succeeded.status === 200 && Array.isArray(succeeded.data) &&
      !idsOf(succeeded).has(forcedFailureId),
    'the failed row is absent from "Succeeded"',
    forcedFailureId == null
      ? 'no failed row was made above, so its absence from "Succeeded" says nothing'
      : succeeded.status !== 200 || !Array.isArray(succeeded.data)
        ? `the Succeeded read answered ${succeeded.status}, so it could not have listed anything`
        : 'a failed run is being listed as a success — the filter is decorative',
  )
  sql = await openDb()
  chk(
    !!sql,
    'the suite can reach the database to stage a succeeded run',
    'no DATABASE_URL — the other half of the filter cannot be shown to work, ' +
      'so these are failures rather than skips',
  )
  if (!sql) throw new Error('no database handle; the remaining checks cannot be made honest')
  await sql`
    insert into ai_usage (workspace_id, user_id, feature, model, input_tokens, output_tokens, status)
    values (${WS}, ${ME}, ${MINE_FEATURE}, ${TAG}, 0, 0, 'succeeded')
  `
  const succeeded2 = await activity('&status=succeeded')
  const mineRow = (succeeded2.data ?? []).find((r) => r.feature === MINE_FEATURE)
  chk(
    !!mineRow && mineRow.status === 'succeeded',
    'and the succeeded row IS in "Succeeded"',
    'the staged succeeded run did not come back under the succeeded filter',
  )
  const failed2 = await activity('&status=failed')
  chk(
    !(failed2.data ?? []).some((r) => r.feature === MINE_FEATURE),
    'and absent from "Failed" — the filter discriminates both ways',
    'a succeeded run is being listed as failed',
  )
  const unfiltered = await activity()
  const allIds = idsOf(unfiltered)
  chk(
    allIds.has(forcedFailureId) && allIds.has(mineRow?.id),
    'with no filter, both are listed',
    'the unfiltered log is missing one of the two rows this suite made',
  )
  /*
   * A NONSENSE STATUS IS DROPPED, NOT MATCHED. Passed through to the query it
   * would match nothing, and an empty list is how somebody concludes they have
   * no failed runs when what they actually have is a typo.
   */
  const nonsense = await activity('&status=banana')
  chk(
    nonsense.status === 200 && (nonsense.data ?? []).length === (unfiltered.data ?? []).length,
    'an unrecognised status is ignored rather than silently matching nothing',
    `status=banana returned ${(nonsense.data ?? []).length} rows against ` +
      `${(unfiltered.data ?? []).length} unfiltered`,
  )

  console.log('\n▶ `userId` — the parameter the client never sent')
  const mine = await activity(`&userId=${ME}`)
  chk(
    mine.status === 200 && (mine.data ?? []).every((r) => r.userId === ME),
    'filtering by a person returns only that person’s runs',
    `${(mine.data ?? []).filter((r) => r.userId !== ME).length} rows belonged to somebody else`,
  )
  chk(
    idsOf(mine).has(forcedFailureId),
    'including the failure it just caused',
    'the forced failure is not attributed to the person who caused it',
  )
  const combined = await activity(`&userId=${ME}&status=failed`)
  chk(
    idsOf(combined).has(forcedFailureId) &&
      (combined.data ?? []).every((r) => r.userId === ME && r.status === 'failed'),
    'and the two filters combine as AND, not as OR',
    `the combined filter returned ${(combined.data ?? []).length} rows, ` +
      `${(combined.data ?? []).filter((r) => r.status !== 'failed' || r.userId !== ME).length} of them wrong`,
  )

  // ── On screen ────────────────────────────────────────────────────────────
  console.log('\n▶ the filter row frame `19:05` draws')
  browser = await chromium.launch(launchOptions())
  ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()

  /*
   * Every activity fetch this page makes, with its query string. This is the
   * ONLY way to tell "the server was asked for my rows" apart from "the client
   * filtered rows it already had" — and that distinction IS the defect.
   */
  const calls = []
  page.on('request', (r) => {
    if (r.url().includes('/ai/activity')) calls.push(r.url())
  })

  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  await page.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Analytics', { exact: true }).first().click({ timeout: 20_000 })
  await page.getByTestId('ai-analytics-tab-activity').click({ timeout: 20_000 })
  const listUp = await waitUntil(
    async () => (await page.getByTestId('ai-activity-row').count()) > 0,
    { timeoutMs: 20_000 },
  )
  chk(listUp, 'the Activity tab lists runs', 'the Activity tab never rendered a row')

  // `boundingBox()` THROWS when the locator matches nothing — it waits for the
  // element first — and returns null only for one that exists with no box. Every
  // check below reads the size through `?? 0` or a null test, so absence reports
  // as zero and reddens; unguarded it spent thirty seconds and ended the section
  // (ledger §10).
  const statusBox = await page.getByTestId('ai-activity-status').boundingBox({ timeout: 6000 }).catch(() => null)
  const mineBox = await page.getByTestId('ai-activity-mine').boundingBox({ timeout: 6000 }).catch(() => null)
  const featureBox = await page.getByTestId('ai-activity-feature').boundingBox({ timeout: 6000 }).catch(() => null)
  chk(
    !!statusBox && !!mineBox && !!featureBox,
    'Status, "My runs" and the feature filter are all on the bar',
    `missing: status=${!!statusBox} mine=${!!mineBox} feature=${!!featureBox}`,
  )
  chk(
    !!statusBox && !!mineBox && !!featureBox &&
      statusBox.x < mineBox.x && mineBox.x < featureBox.x &&
      Math.max(statusBox.y, mineBox.y, featureBox.y) -
        Math.min(statusBox.y, mineBox.y, featureBox.y) <= 4,
    'in the frame’s Status-then-mine order, on one row',
    `x order ${Math.round(statusBox?.x ?? -1)}/${Math.round(mineBox?.x ?? -1)}/${Math.round(featureBox?.x ?? -1)}, ` +
      `tops ${Math.round(statusBox?.y ?? -1)}/${Math.round(mineBox?.y ?? -1)}/${Math.round(featureBox?.y ?? -1)}`,
  )
  chk(
    (await page.locator('[data-testid="ai-activity-row-status"]').count()) ===
      (await page.getByTestId('ai-activity-row').count()),
    'and every row carries a status badge',
    `${await page.locator('[data-testid="ai-activity-row-status"]').count()} badges for ` +
      `${await page.getByTestId('ai-activity-row').count()} rows`,
  )

  console.log('\n▶ the request, not the render')
  chk(
    calls.length > 0 && calls.every((u) => !u.includes('userId=')),
    'nothing has asked the server for one person’s runs yet',
    `a userId went out before the toggle was touched: ${calls.find((u) => u.includes('userId=')) ?? ''}`,
  )
  const beforeToggle = calls.length
  await page.getByTestId('ai-activity-mine').click()
  const sentUser = await waitUntil(
    () => calls.slice(beforeToggle).some((u) => u.includes(`userId=${ME}`)),
    { timeoutMs: 10_000 },
  )
  /*
   * THE CHECK THIS ROW EXISTS FOR. Before this build the toggle re-rendered
   * and the outgoing URL was byte-identical.
   */
  chk(
    sentUser,
    'pressing "My runs" puts `userId` in the query string',
    `the requests after the toggle were ${JSON.stringify(calls.slice(beforeToggle))} — ` +
      'the toggle is still UI-only',
  )
  /*
   * The read opened this condition, so there was no `&&` in front of it to
   * short-circuit: an absent toggle sat out the default wait and threw, taking
   * every report below it with it. `attrOf` answers null instead, and the
   * comparison to 'true' fails on null rather than accepting absence.
   */
  const mineOn = await attrOf(page.getByTestId('ai-activity-mine'), 'data-on')
  chk(
    mineOn === 'true',
    'and the toggle shows itself as on',
    `the toggle sent the parameter but reads data-on=${JSON.stringify(mineOn)} ` +
      '— it never showed that it is on',
  )
  /*
   * AND OFF AGAIN. A control that keys its effect on a value rather than on the
   * change is dead on the second press; only the second half of the round trip
   * catches that.
   *
   * THE FIRST VERSION OF THIS CHECK WAS DECIDED BY CACHE TIMING, NOT BY THE
   * PRODUCT, and it is worth writing down so it is not reintroduced.
   * `apps/web/src/lib/query.ts:6` sets `staleTime: 30_000` on every query, so
   * untoggling returns the observer to the queryKey fetched seconds earlier,
   * which is still fresh: TanStack serves it from cache and NO REQUEST FIRES
   * AT ALL. The check then asserted over an empty array — and had the run taken
   * more than thirty seconds to reach this line the entry would have gone
   * stale, a request would have fired, and the same code would have passed. A
   * check whose answer depends on how fast the runner is, is a flake wearing an
   * assertion's clothes.
   *
   * The falsifiable question the untoggle actually raises is whether `userId`
   * left the STATE or merely stopped being drawn, so it is asked in two halves,
   * neither of which can be answered by the cache:
   *
   *   · the control itself flipped back, and
   *   · the next thing the page asks the server for — forced to MISS the cache
   *     by moving to a range this run has never fetched — carries no `userId`.
   *
   * If "mine" had stopped being drawn while staying true in state, that forced
   * request would still carry it.
   */
  await page.getByTestId('ai-activity-mine').click()
  await page.waitForTimeout(400)
  const mineOffAgain = await attrOf(page.getByTestId('ai-activity-mine'), 'data-on')
  chk(
    mineOffAgain === 'false',
    'pressing it again turns the control back off',
    `the toggle still reads data-on=${JSON.stringify(mineOffAgain)} ` +
      '— it can be switched on and never off',
  )
  const beforeMiss = calls.length
  // Every request so far has used the 30-day range, so 7 days is a queryKey
  // this run has never fetched: the refetch happens whatever the cache holds.
  await page.getByTestId('ai-value-range-7').click()
  const refetched = await waitUntil(() => calls.length > beforeMiss, { timeoutMs: 15_000 })
  const forcedCall = calls[calls.length - 1] ?? ''
  chk(
    refetched && !forcedCall.includes('userId='),
    'and `userId` is gone from the next thing the page asks for',
    refetched
      ? `the forced request was ${JSON.stringify(forcedCall)} — "mine" is still on in state, ` +
          'it has only stopped being drawn'
      : 'no activity request fired even after a guaranteed cache miss, so this proved nothing',
  )

  /*
   * A NEW FILTER'S LIST IS A SKELETON UNTIL ITS ANSWER ARRIVES — no rows and no
   * empty state (`activityQuery.isPending`; nothing keeps the previous rows). So
   * the rows are read once the list has drawn the answer, rows or empty state,
   * after the request for it has gone out. They were read 1.2 fixed seconds
   * after the choice, and under a sweep's load that was the skeleton: no row
   * under Failed, though the same filter's API read had found one
   * (`found-24-sep/three-suites-fail-under-a-full-sweep`). Bounded; what is on
   * screen when it ends is what the checks judge.
   */
  const answerDrawn = () =>
    waitUntil(
      async () =>
        (await page.getByTestId('ai-activity-row').count()) > 0 ||
        (await page.getByTestId('ai-activity-empty').count()) > 0,
      { timeoutMs: 20_000 },
    )

  const beforeStatus = calls.length
  await page.getByTestId('ai-activity-status').selectOption('failed')
  const sentStatus = await waitUntil(
    () => calls.slice(beforeStatus).some((u) => u.includes('status=failed')),
    { timeoutMs: 10_000 },
  )
  chk(
    sentStatus,
    'choosing Failed puts `status=failed` in the query string',
    `the requests after choosing Failed were ${JSON.stringify(calls.slice(beforeStatus))}`,
  )
  await answerDrawn()
  const shownRows = page.getByTestId('ai-activity-row')
  const failedCount = await shownRows.count()
  chk(
    failedCount > 0 &&
      (await page.locator('[data-testid="ai-activity-row"][data-status="failed"]').count()) === failedCount,
    'and every row on screen is a failed one',
    `${failedCount} rows, of which ` +
      `${await page.locator('[data-testid="ai-activity-row"][data-status="succeeded"]').count()} were successes`,
  )
  chk(
    (await page.locator(`[data-run-id="${forcedFailureId}"]`).count()) === 1,
    'the run this suite broke is one of them',
    'the forced failure is not listed under the Failed filter',
  )
  /*
   * A NON-EMPTY string, asserted as one. `getAttribute('title') !== ''` returns
   * true when the attribute is ABSENT — `null !== ''` — so that spelling of
   * this check would pass on exactly the bug it is meant to catch.
   */
  /*
   * BOUNDED AND CAUGHT, and this one was proved by a break run rather than by
   * a rule. `af-3-no-failure-recorded` stops a failure being recorded, so no
   * row carries `data-status="failed"`, so this locator matches nothing — and
   * an unbounded `getAttribute` waits Playwright's full thirty seconds and
   * throws. The run ended at 29 of 34 with `threw: locator.getAttribute:
   * Timeout 30000ms exceeded`, five checks silenced by the patch it was
   * measuring.
   *
   * THE EIGHT SECTION-ENDER RULES ALL MISS THIS SHAPE. It is not in a chk
   * message (rule six), not at the head of a condition (rule seven), and no
   * check in the file asserts that testid EXISTS, so the two pairing rules
   * have nothing to pair it with. It is a standalone assignment — and nothing
   * can short-circuit an assignment, which is the same argument that let rules
   * six and seven gate.
   *
   * null is safe here without further guarding: the check below asks
   * `typeof badgeTitle === 'string'`, and `typeof null` is `'object'`.
   */
  const badgeTitle = await page
    .locator('[data-testid="ai-activity-row-status"][data-status="failed"]')
    .first()
    .getAttribute('title', { timeout: 8000 })
    .catch(() => null)
  chk(
    typeof badgeTitle === 'string' && badgeTitle.trim().length > 0,
    'and its badge carries the failure’s own sentence',
    `the badge's title was ${JSON.stringify(badgeTitle)} — "failed" with no reason ` +
      'tells somebody a thing went wrong and nothing they can act on',
  )

  const beforeSucceeded = calls.length
  await page.getByTestId('ai-activity-status').selectOption('succeeded')
  await waitUntil(() => calls.slice(beforeSucceeded).some((u) => u.includes('status=succeeded')), { timeoutMs: 10_000 })
  await answerDrawn()
  // As above: "drops it" is only a claim about a row that was made.
  chk(
    forcedFailureId != null &&
      (await page.locator(`[data-run-id="${forcedFailureId}"]`).count()) === 0 &&
      (await page.getByTestId('ai-activity-row').count()) > 0,
    'switching to Succeeded drops it, and does not empty the list',
    forcedFailureId == null
      ? 'no failed row was made above, so there was nothing for Succeeded to drop'
      : `the failed row appeared ${await page.locator(`[data-run-id="${forcedFailureId}"]`).count()} times ` +
          `among ${await page.getByTestId('ai-activity-row').count()} succeeded rows`,
  )

  console.log('\n▶ an empty list says the filters are why, and clears ALL of them')
  chk(
    (await page.getByTestId('ai-activity-clear-filters').count()) === 0,
    'nothing offers to clear filters while none of them are doing anything',
    'a Clear filters button is offered over an unfiltered list',
  )
  /*
   * A DETERMINISTIC EMPTY STATE. `MINE_FEATURE` is unique to this run and its
   * only row succeeded, so "failed runs of that feature" is guaranteed to be
   * empty — rather than hoping the shared database happens to have no match.
   */
  await page.getByTestId('ai-activity-feature').selectOption(MINE_FEATURE)
  await page.getByTestId('ai-activity-status').selectOption('failed')
  await page.getByTestId('ai-activity-mine').click()
  const empty = await waitUntil(
    () => page.getByTestId('ai-activity-empty').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  chk(empty, 'three filters that can match nothing produce the empty state',
    'the list did not report that its filters matched nothing')
  await page.getByTestId('ai-activity-clear-filters').click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const clearedStatus = await valueOf(page.getByTestId('ai-activity-status'))
  const clearedFeature = await valueOf(page.getByTestId('ai-activity-feature'))
  const clearedMine = await attrOf(page.getByTestId('ai-activity-mine'), 'data-on')
  chk(
    clearedStatus === '' && clearedFeature === '' && clearedMine === 'false',
    'and Clear filters clears all three, not just the one it used to know about',
    `after clearing: status=${JSON.stringify(clearedStatus)} ` +
      `feature=${JSON.stringify(clearedFeature)} ` +
      `mine=${JSON.stringify(clearedMine)}`,
  )
  chk(
    await waitUntil(async () => (await page.getByTestId('ai-activity-row').count()) > 0, { timeoutMs: 10_000 }),
    'and the rows come back',
    'clearing the filters left the list empty',
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  /*
   * Both rows this run made, taken back: the one it inserted (by its model
   * tag) and the one it caused the product to write (by its id).
   */
  if (sql) {
    await sql`delete from ai_usage where model = ${TAG}`.catch(() => {})
    if (forcedFailureId) {
      await sql`delete from ai_usage where id = ${forcedFailureId}`.catch(() => {})
    }
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await ctx?.close().catch(() => {})
  await browser?.close().catch(() => {})
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
await stack?.close?.()
process.exit(failed() ? 1 : 0)
