/**
 * §V2-11 frames `18:53` / `18:56` / `18:59` — "Actions completed", eight tiles
 * in two rows of four.
 *
 * `[18:51]` "analytics mein humein show karta hai ke acha, hum ne kya zyada
 * cheezein [kiye] … kitna USAGE hua hai".
 *
 * WHAT THIS SUITE IS GUARDING:
 *
 *   1. THE GROUPING IS REAL AND IT IS THE SERVER'S. Twenty-four raw feature
 *      strings roll up into the frame's eight. The check is arithmetic on
 *      DELTAS from rows this suite inserts itself: seeded runs of two different
 *      task features must add up in the `tasks` tile and move no other.
 *
 *   2. FAILED RUNS DO NOT INFLATE THE VALUE FIGURES. Migration 0150 started
 *      writing failures into `ai_usage`, and every figure on this panel is
 *      derived from a count of that table. If `usageSummary` stopped filtering
 *      to `succeeded`, a workspace with a broken API key would be shown
 *      hundreds of runs and hours of time saved on calls that never happened.
 *      That is the single most dangerous regression 0150 could cause and it is
 *      checked here, twice.
 *
 *   3. TWO TILES SAY "NOT AVAILABLE" INSTEAD OF "0". Nothing in this product
 *      reaches a connected app. A tile that can only ever render 0 is
 *      indistinguishable on screen from a workspace that genuinely did none —
 *      the "confident zero" — so those two print the reason, and
 *      the reasons must differ from each other, because a missing i18n key
 *      falls back to a sibling's string and "a reason is present" would pass on
 *      exactly that bug.
 *
 * ITS OWN FIXTURES. `ai_usage` rows are written by the AI service as a side
 * effect of calling the model. With no model configured — CI, and every lane
 * `RUNDESK_LANE_MODEL` does not name — no endpoint can create one, and this
 * suite runs in both configurations, so it asks none to. Hence the direct
 * insert, the same reasoning as `ai-value.mjs`. Every row this suite makes
 * carries a unique `model` tag so exactly those can be removed again, and
 * every claim is a DELTA against a baseline read moments earlier, so the
 * shared database's other rows are irrelevant to it.
 *
 *   node test/e2e/ai-action-categories.mjs --api 3011 --dist apps/web/dist
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
const EXPECTED_CHECKS = 29

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')

/**
 * The width the frame's 2×4 arrangement assumes.
 *
 * Stated rather than defaulted: the grid is two across below Tailwind's `xl`
 * breakpoint (1280px) BY DESIGN, because these are viewport breakpoints and the
 * AI page's left nav makes the panel narrower than the window. A suite that let
 * the runner pick the width would be asserting a layout nobody guaranteed.
 */
const VIEWPORT = { width: 1440, height: 1100 }

/** The frame's order, left to right then top to bottom. */
const ORDER = [
  'tasks', 'docs', 'images', 'comments',
  'summaries', 'assets', 'externalActions', 'externalSearches',
]
// Images generated is filled since image generation (`ledger-rows/row-870`): `image.generate` runs.
// And the connected apps' two since the AI acts and searches in them (`ledger-rows/row-2294`):
// a command turn that reached for one is `command.connected_action` or `command.connected_search`.
// No tile is one the product cannot fill now.

/** Tags every row this run appends, so it can take exactly those away again. */
const TAG = `e2e-cat-${Date.now()}`
const UNKNOWN_FEATURE = `e2e-unmapped-${Date.now()}`

let stack = null
let B = (process.env.BASE ?? '').replace(/\/$/, '')
if (!B) {
  stack = await startLocalStack({
    dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')),
    apiPort: Number(argOf('--api', process.env.E2E_API_PORT ?? 3011)),
  })
  B = stack.base
}

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
// THE SENTENCE, THEN THE REASON: a failing check that printed only its reason
// named no check `check-break-reddened.mjs` could find when the reason was
// built from the run (`found-29-sep/failing-checks-print-only-their-reason`).
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg && badMsg !== good ? `${good} \u2014 ${badMsg}` : good))

const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
const api = apiClient(`${B}/api/v1`, auth.accessToken)
const WS = process.env.E2E_WS ?? (await pickWorkspace(api)).id

const value = () => api(`/ai/value?workspaceId=${WS}`)
/** `{tasks: 3, docs: 0, …}` from a value response, for subtraction. */
const runsByCategory = (data) =>
  Object.fromEntries((data?.byCategory ?? []).map((c) => [c.category, c.runs]))

let sql = null
let browser = null
let ctx = null

try {
  console.log('\n▶ the eight tiles frames `18:53`–`18:59` draw, from the server')
  const first = await value()
  chk(
    first.status === 200 && Array.isArray(first.data?.byCategory),
    'the value endpoint carries a category breakdown',
    `it returned ${first.status} ${JSON.stringify(first.data).slice(0, 160)}`,
  )
  const cats = first.data?.byCategory ?? []
  chk(
    cats.length === 8,
    'eight of them, as the frames show',
    `it returned ${cats.length} categories: ${cats.map((c) => c.category).join(', ')}`,
  )
  /*
   * ALL EIGHT, EVERY TIME, IN ORDER. A grid built from whatever the data
   * happened to contain cannot be measured, and a tile that vanishes when its
   * count is zero reads as the feature having been removed.
   */
  chk(
    cats.map((c) => c.category).join(',') === ORDER.join(','),
    'in the frame’s order, not the data’s',
    `the order was ${cats.map((c) => c.category).join(', ')}`,
  )
  const unsupported = cats.filter((c) => !c.supported).map((c) => c.category).sort()
  chk(
    unsupported.length === 0,
    'none is marked as something this product cannot do — the connected apps’ tiles count the AI’s runs in them, as Images generated counts image generation’s',
    `the unsupported ones were ${unsupported.join(', ') || '(none)'}`,
  )
  chk(
    cats.every((c) => c.reasonKey === undefined),
    'and none carries a reason it cannot be filled',
    `reason keys were ${JSON.stringify(cats.map((c) => [c.category, c.reasonKey ?? null]))}`,
  )

  console.log('\n▶ seeded runs land in the right bucket, and only there')
  sql = await openDb()
  chk(
    !!sql,
    'the suite can reach the database to stage real runs',
    'no DATABASE_URL — every delta check below would have nothing to measure, ' +
      'so they are being reported as failures rather than skipped',
  )
  if (!sql) throw new Error('no database handle; the remaining checks cannot be made honest')

  const baseline = runsByCategory((await value()).data)
  const baselineRuns = (await value()).data?.runs ?? 0

  /*
   * Real feature names, because the taxonomy maps real feature names — a made
   * up one would land in `uncategorisedFeatures` and prove nothing about the
   * buckets. The MODEL is the tag instead: it is not part of the grouping, an
   * unknown model prices at zero against zero tokens so no cost figure moves,
   * and `delete … where model = TAG` takes back exactly these rows.
   */
  const seed = async (feature, n, status = 'succeeded') => {
    for (let i = 0; i < n; i += 1) {
      await sql`
        insert into ai_usage (workspace_id, user_id, feature, model, input_tokens, output_tokens, status)
        values (${WS}, null, ${feature}, ${TAG}, 0, 0, ${status})
      `
    }
  }
  await seed('task.generate', 3)
  await seed('command', 2)
  await seed('chat.title', 4)
  await seed('image.generate', 2)
  await seed(UNKNOWN_FEATURE, 1)

  const after = await value()
  const now = runsByCategory(after.data)
  const delta = (c) => (now[c] ?? 0) - (baseline[c] ?? 0)
  /*
   * FIVE, FROM TWO DIFFERENT FEATURE STRINGS. A mapping that dropped one of
   * them would still show a plausible number; only the sum catches it.
   */
  chk(
    delta('tasks') === 5,
    'three `task.generate` and two `command` runs add up to five in Tasks',
    `the Tasks tile moved by ${delta('tasks')}, not 5`,
  )
  chk(
    delta('comments') === 4,
    'and four `chat.title` runs land in Comments',
    `the Comments tile moved by ${delta('comments')}, not 4`,
  )
  chk(
    delta('docs') === 0 && delta('summaries') === 0 && delta('assets') === 0,
    'and nothing leaks into the buckets they do not belong to',
    `docs moved ${delta('docs')}, summaries ${delta('summaries')}, assets ${delta('assets')}`,
  )
  chk(
    delta('images') === 2,
    'and two `image.generate` runs land in Images generated',
    `the Images tile moved by ${delta('images')}, not 2`,
  )
  chk(
    delta('externalActions') === 0 && delta('externalSearches') === 0,
    'and nothing of theirs lands in the connected apps’ tiles',
    `the connected apps' tiles moved by actions=${delta('externalActions')} searches=${delta('externalSearches')}`,
  )
  /*
   * ELEVEN, NOT TWELVE. Twelve rows were inserted and one of them has no
   * category; if the roll-up quietly folded it into a plausible neighbour the
   * sum would be twelve and every individual tile would still look right.
   */
  chk(
    ORDER.reduce((n, c) => n + delta(c), 0) === 11,
    'eleven of the twelve seeded runs are in a tile — the twelfth has no category',
    `the tiles moved by ${ORDER.reduce((n, c) => n + delta(c), 0)} in total, not 11`,
  )
  chk(
    (after.data?.uncategorisedFeatures ?? []).includes(UNKNOWN_FEATURE),
    'and the twelfth is REPORTED rather than dropped',
    `uncategorisedFeatures came back ${JSON.stringify(after.data?.uncategorisedFeatures)} — ` +
      'a run that happened and appears nowhere is a confident zero',
  )
  chk(
    (after.data?.byFeature?.['task.generate']?.calls ?? 0) >= 3,
    'the per-feature detail survives underneath the categories',
    'byFeature no longer carries the raw features — the Activity feature filter reads it',
  )

  console.log('\n▶ a FAILED run must not be counted as work done')
  /*
   * THE REGRESSION 0150 COULD HAVE CAUSED, stated as a check. Failures are
   * rows in `ai_usage` now, and every figure on this panel comes from counting
   * that table. Drop the `status = 'succeeded'` filter and a workspace whose
   * API key is wrong gets told it saved hours on calls that never happened.
   */
  const beforeFailures = runsByCategory((await value()).data)
  const runsBeforeFailures = (await value()).data?.runs ?? 0
  await seed('task.generate', 5, 'failed')
  const afterFailures = await value()
  chk(
    runsByCategory(afterFailures.data).tasks === beforeFailures.tasks,
    'five failed runs move the Tasks tile by nothing',
    `the Tasks tile went ${beforeFailures.tasks} → ${runsByCategory(afterFailures.data).tasks} ` +
      'on five FAILED runs — the panel is counting calls that never happened',
  )
  chk(
    (afterFailures.data?.runs ?? 0) === runsBeforeFailures,
    'and the headline run count with it',
    `runs went ${runsBeforeFailures} → ${afterFailures.data?.runs} on five failed runs`,
  )
  chk(
    (afterFailures.data?.runs ?? 0) - baselineRuns === 12,
    'while the twelve succeeded runs are all counted, mapped or not',
    `runs moved by ${(afterFailures.data?.runs ?? 0) - baselineRuns} against twelve seeded successes`,
  )

  console.log('\n▶ the AI acting in a connected app is counted in its own two tiles')
  /*
   * `ledger-rows/row-2294`. A command turn that reached for the asker's
   * calendar or mailbox is `command.connected_action`, one that searched their
   * Drive, Gmail or SharePoint `command.connected_search`; both are the command
   * path, and neither is Tasks'. Seeded after the twelve, so every count above
   * stands as it was.
   */
  const beforeConnected = runsByCategory((await value()).data)
  await seed('command.connected_action', 2)
  await seed('command.connected_search', 1)
  const afterConnected = runsByCategory((await value()).data)
  chk(
    (afterConnected.externalActions ?? 0) - (beforeConnected.externalActions ?? 0) === 2
      && (afterConnected.externalSearches ?? 0) - (beforeConnected.externalSearches ?? 0) === 1
      && afterConnected.tasks === beforeConnected.tasks,
    'two `command.connected_action` runs land in External app actions and one `command.connected_search` in External app searches — not in Tasks, though both are the command path',
    `actions ${beforeConnected.externalActions} → ${afterConnected.externalActions}, searches ${beforeConnected.externalSearches} → ${afterConnected.externalSearches}, tasks ${beforeConnected.tasks} → ${afterConnected.tasks}`,
  )

  // ── On screen ────────────────────────────────────────────────────────────
  console.log('\n▶ the grid, measured')
  browser = await chromium.launch(launchOptions())
  ctx = await browser.newContext({ viewport: VIEWPORT })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  await page.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Analytics', { exact: true }).first().click({ timeout: 20_000 }).catch(() => {})
  const gridUp = await waitUntil(
    () => page.getByTestId('ai-value-categories').isVisible().catch(() => false),
    { timeoutMs: 20_000 },
  )
  chk(gridUp, 'the Analytics tab draws a category grid',
    'there is no category grid on the Analytics tab')

  const tiles = page.locator('[data-testid^="ai-value-category-"][data-category]')
  chk(
    (await tiles.count()) === 8,
    'with eight tiles',
    `${await tiles.count()} tiles were drawn`,
  )
  const boxes = []
  for (const id of ORDER) {
    const b = await page.getByTestId(`ai-value-category-${id}`).boundingBox().catch(() => null)
    boxes.push({ id, ...(b ?? { x: -1, y: -1, width: 0, height: 0 }) })
  }
  chk(
    boxes.every((b) => b.width > 0),
    'every one of the frame’s eight names is on screen',
    `missing: ${boxes.filter((b) => !b.width).map((b) => b.id).join(', ')}`,
  )
  /*
   * FOUR COLUMNS, ASKED OF THE LAYOUT RATHER THAN INFERRED FROM POSITIONS.
   * Geometry can only ever say where things ended up; this says what the grid
   * was told to do, so a wrap and a four-column grid cannot be confused.
   */
  const columnCount = await page.getByTestId('ai-value-categories').evaluate((el) => {
    const cols = getComputedStyle(el).gridTemplateColumns
    return cols === 'none' ? 0 : cols.trim().split(/\s+/).length
  })
  chk(
    columnCount === 4,
    `the grid is four columns wide at ${VIEWPORT.width}px`,
    `grid-template-columns resolved to ${columnCount} column(s) — the frame's 2×4 needs the ` +
      "`xl` (1280px) breakpoint, and 0 means it is not a grid at all",
  )
  /*
   * MEASURED, and GROUPED BY PROXIMITY rather than by a rounding bucket.
   *
   * The first version of this keyed rows on `Math.round(y / 4)`, which puts a
   * hard boundary every four pixels. Four tiles that genuinely share a row have
   * the same grid row start but can differ by a hundredth of a pixel after
   * fractional column widths; when that hundredth straddles the boundary, one
   * tile lands in the next bucket and the suite reports "3 rows of 3/1/4" for a
   * layout that is two clean rows of four. It reported exactly that.
   *
   * A tolerance cannot make the opposite mistake: same-row tiles share a row
   * start to within a pixel, and two real rows are a whole tile-height apart.
   */
  const ROW_TOLERANCE_PX = 8
  const rows = []
  for (const b of [...boxes].sort((p, q) => p.y - q.y || p.x - q.x)) {
    const row = rows.find((r) => Math.abs(r[0].y - b.y) <= ROW_TOLERANCE_PX)
    if (row) row.push(b)
    else rows.push([b])
  }
  chk(
    rows.length === 2 && rows.every((r) => r.length === 4),
    'and lays the eight tiles out as two rows of four',
    `at ${VIEWPORT.width}×${VIEWPORT.height} the tiles landed on ${rows.length} rows of ` +
      `${rows.map((r) => r.length).join('/')} — the frame's arrangement assumes a viewport of at ` +
      'least 1280px, below which the grid is two across by design',
  )
  /*
   * The whole sequence, not each row against itself. `rows` is already sorted
   * top-to-bottom then left-to-right, so comparing it to ORDER pins reading
   * order across the wrap as well as within each row.
   */
  chk(
    rows.flat().map((b) => b.id).join(',') === ORDER.join(','),
    'reading left to right and top to bottom in the frame’s order',
    `the tiles read ${rows.map((r) => r.map((b) => b.id).join('>')).join(' | ')}`,
  )

  console.log('\n▶ no tile says the product cannot fill it')
  const unavailableTiles = page.locator('[data-testid^="ai-value-category-"][data-supported="false"]')
  const unavailable = await page.locator('[data-testid^="ai-value-category-unavailable-"]').count()
  chk(
    (await unavailableTiles.count()) === 0 && unavailable === 0,
    'no tile admits the product cannot fill it — the connected apps’ two are filled like the rest',
    `${await unavailableTiles.count()} tiles were marked unavailable, ${unavailable} said so`,
  )
  /*
   * And the External app searches tile prints the server's count, as the Tasks
   * tile is read below: the run seeded above is one, so a tile that still says
   * "not available", or draws nothing, cannot pass.
   */
  const shownSearches = await page
    .getByTestId('ai-value-category-externalSearches')
    .getAttribute('data-runs', { timeout: 8000 })
    .catch(() => null)
  const serverSearches = runsByCategory((await value()).data).externalSearches
  chk(
    typeof shownSearches === 'string' && Number(shownSearches) === serverSearches && serverSearches >= 1,
    'and the External app searches tile prints its runs, as the server counts them',
    `the tile shows ${shownSearches} and the API says ${serverSearches}`,
  )

  console.log('\n▶ the tiles show what the server computed, not their own arithmetic')
  /*
   * BOUNDED, AND THE NULL REJECTED BEFORE THE COMPARISON. `Number(null)` is
   * ZERO, so `Number(shownTasks) === serverTasks` would PASS on a missing tile
   * every time the server's own answer was 0 — a confident zero manufactured
   * by the catch. `typeof … === 'string'` first is what keeps absence failing.
   */
  const shownTasks = await page
    .getByTestId('ai-value-category-tasks')
    .getAttribute('data-runs', { timeout: 8000 })
    .catch(() => null)
  const serverTasks = runsByCategory((await value()).data).tasks
  chk(
    typeof shownTasks === 'string' && Number(shownTasks) === serverTasks,
    'the Tasks tile renders the server’s number exactly',
    `the tile shows ${shownTasks} and the API says ${serverTasks}`,
  )
  // Bounded and caught, then `?? ''`: a caught null would throw on `.trim()`,
  // which turns a read that could not find its element into a section-ender by
  // a different route. An empty string fails the regex below, which is the
  // honest answer for a card that is not on screen.
  const visibleTasks = (
    (await page.getByTestId('ai-value-category-tasks').filter({ visible: true }).innerText({ timeout: 8000 }).catch(() => null)) ?? ''
  ).trim()
  chk(
    new RegExp(`(^|\\D)${serverTasks}(\\D|$)`).test(visibleTasks),
    'and a person can read that number on the tile',
    `the tile’s text was ${JSON.stringify(visibleTasks.replace(/\s+/g, ' '))}`,
  )
  /*
   * THE UNIT, STATED ON THE PAGE. `ai-value.ts` and the panel both refuse the
   * frame's word "actions" because one run is one call to the model. Honouring
   * that means the page has to SAY what it is counting, or the categories
   * silently become the thing the note warned about.
   */
  const unitNote = (await page.getByTestId('ai-value-categories')
    .locator('xpath=preceding-sibling::*[1]').filter({ visible: true }).innerText().catch(() => '')) || ''
  chk(
    /run/i.test(unitNote),
    'and the heading says the unit is a run, as `ai-value.ts` insists',
    `the note above the grid read ${JSON.stringify(unitNote.replace(/\s+/g, ' ').slice(0, 120))}`,
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  // Every row this run made, taken back. Tagged by model, so nothing else goes.
  if (sql) {
    await sql`delete from ai_usage where model = ${TAG}`.catch(() => {})
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
