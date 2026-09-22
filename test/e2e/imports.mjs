/**
 * §V2-S13 frame `12:08` — **Create › Imports ›**.
 *
 * The frame's submenu has twelve rows:
 *
 *     Spreadsheet files · Document files
 *     Asana · Basecamp · Confluence · Jira Software · Monday · Notion ·
 *     Slack · Todoist · Trello · Wrike
 *
 * Rundesk shipped one importer (ClickUp CSV). Drawing ten tiles that open a
 * dialog which cannot import would be the facade defect at ten times scale, so
 * ONE real delimited-file importer was built, with per-source column presets
 * over it, and the four sources with no task-shaped export are named in text
 * with a reason and given NO CONTROL AT ALL.
 *
 * THIS SUITE IS WRITTEN AGAINST THAT TRADE. Two things it refuses to accept:
 *
 *  1. **A tile that cannot import.** Check 1 asserts the picker draws a control
 *     for every preset the server serves AND no control for the four it does
 *     not. A "Basecamp" button appearing would fail it, which is the point.
 *
 *  2. **An import that reports success and writes nothing, or writes the wrong
 *     thing.** It uploads a real Jira-shaped CSV with four rows — two good, one
 *     with no summary, one with an unparseable due date — and then reads the
 *     result back out of POSTGRES: the two tasks exist with the right status,
 *     status_category, priority, due date and assignee; the two bad rows
 *     produced NOTHING; and the job row records which FILE LINE failed and why.
 *
 * `status_category` is asserted on purpose. Every rollup, the Closed toggle and
 * the progress ring read that column and not `status` — the ClickUp importer
 * never sets it, so an imported "Done" task counts as open everywhere. A check
 * on `status` alone passes on that bug.
 *
 * NARROWED TO ITS OWN FIXTURES. The e2e database is shared, so every row this
 * suite asserts on is found by a per-run tag, never by counting.
 *
 * THE FIXTURE'S `apiClient` NEVER THROWS — it answers `{status, data, error}`,
 * so a `.catch` on it is inert and a 500 reads exactly like a 200. Every call
 * below checks `status` itself.
 *
 *   node test/e2e/imports.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/**
 * Exact, with `!==`. With `<`, a branch that quietly skipped becomes a shorter
 * run that still passes — and half of this suite is branches that only run once
 * an earlier step really happened.
 */
const EXPECTED_CHECKS = 20

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const TAG = `simp-${Date.now()}`

/** The four rows of the frame this build deliberately does NOT draw. */
const UNDRAWN = ['basecamp', 'confluence', 'slack', 'documents']

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

/**
 * A Jira Software export, as Jira writes one. Four data rows on file LINES
 * 2–5, two of which must be refused:
 *
 *   line 4 — no Summary at all
 *   line 5 — "not-a-date" where a due date belongs
 *
 * "Highest" and "Done" are here because they are the two values a lazy mapper
 * gets wrong: a substring match reads "Highest" as `high`, and a writer that
 * sets `status` without `status_category` leaves a finished task counted open.
 */
const CSV = [
  'Summary,Description,Status,Priority,Due Date,Assignee,Project name',
  `Alpha ${TAG},First issue,Done,Highest,2026-03-04,${EMAIL},Board ${TAG}`,
  `Beta ${TAG},Second issue,In Progress,Low,,${EMAIL},Board ${TAG}`,
  `,Orphan ${TAG} with no summary,Done,High,2026-03-04,,Board ${TAG}`,
  `Gamma ${TAG},Bad date,To Do,Medium,not-a-date,,Board ${TAG}`,
  '',
].join('\n')

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const API = `${stack.base}/api/v1`
const browser = await chromium.launch(launchOptions())
let sql = null
/** Set once the import runs, so the teardown removes exactly this run's job. */
let createdJobId = null

try {
  const auth = await login(API, EMAIL, PASSWORD)
  const api = apiClient(API, auth.accessToken)

  const wsRes = await api('/workspaces')
  if (wsRes.status >= 300) throw new Error(`GET /workspaces answered ${wsRes.status}`)
  const workspaceId = (wsRes.data ?? [])[0]?.workspace?.id ?? (wsRes.data ?? [])[0]?.id
  if (!workspaceId) throw new Error('this account can see no workspace')

  const meRes = await api('/auth/me')
  if (meRes.status >= 300) throw new Error(`GET /auth/me answered ${meRes.status}`)
  const myUserId = meRes.data?.id ?? meRes.data?.user?.id ?? auth.user?.id
  if (!myUserId) throw new Error('could not resolve the signed-in user id')

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite reads the imported rows back from Postgres')

  const catalogueRes = await api(`/workspaces/${workspaceId}/import/spreadsheet/sources`)
  if (catalogueRes.status >= 300) {
    throw new Error(`GET import/spreadsheet/sources answered ${catalogueRes.status}`)
  }
  const catalogue = catalogueRes.data ?? {}
  const presetKeys = (catalogue.sources ?? []).map((s) => s.key)
  console.log(`\x1b[2m  workspace ${workspaceId}, tag ${TAG}, presets: ${presetKeys.join(', ')}\x1b[0m`)

  // ── the browser ────────────────────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } })
  const page = await ctx.newPage()

  /** Every preview request body this run sent, so the mapping can be PROVED. */
  const previewBodies = []
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/import/spreadsheet/preview')) {
      try { previewBodies.push(JSON.parse(req.postData() ?? '{}')) } catch { previewBodies.push({}) }
    }
  })

  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })

  await page.goto(`${stack.base}/app/${workspaceId}/import`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('import-tab-sheet').click({ timeout: 25_000 })
  await page.getByTestId('import-sheet-panel').waitFor({ timeout: 20_000 })
  /*
   * The picker is server-driven, so wait for a source the server actually
   * served rather than for the container — `import-source-picker` renders
   * whether or not a single preset came back, and gating on it would make
   * "the picker drew nothing" look like "the picker drew everything".
   */
  await page.getByTestId(`import-source-${presetKeys[0]}`).waitFor({ timeout: 20_000 })

  // ══ 1. THE PICKER DRAWS WHAT IT CAN DO, AND ONLY THAT ══════════════════════
  console.log('\n▶ frame `12:08` — a control for every preset, and none for the four with no export')

  const drawn = []
  for (const key of presetKeys) {
    if (await page.getByTestId(`import-source-${key}`).count()) drawn.push(key)
  }
  const ghosts = []
  for (const key of UNDRAWN) {
    if (await page.getByTestId(`import-source-${key}`).count()) ghosts.push(key)
  }
  chk(
    presetKeys.length >= 7 && drawn.length === presetKeys.length && ghosts.length === 0,
    `the picker draws all ${presetKeys.length} presets and no tile for ${UNDRAWN.join('/')}`,
    ghosts.length
      ? `a tile exists for ${ghosts.join(', ')} — there is no importer behind it, which is the facade this row exists to avoid`
      : `drew ${drawn.length} of ${presetKeys.length} presets (${presetKeys.filter((k) => !drawn.includes(k)).join(', ') || 'none missing'})`,
  )

  console.log('\n▶ …and says why each of the four is absent')
  const reasons = []
  for (const key of UNDRAWN) {
    const el = page.getByTestId(`import-unsupported-${key}`)
    reasons.push((await el.count()) ? ((await el.first().innerText()) ?? '') : '')
  }
  chk(
    reasons.length === UNDRAWN.length && reasons.every((r) => r.trim().length > 40),
    'each undrawn source is named with a reason, as text rather than as a control',
    `the reasons read ${JSON.stringify(reasons.map((r) => r.slice(0, 30)))}`,
  )

  // ══ 2. THE FILE, THE PRESET, AND THE MAPPING ═══════════════════════════════
  console.log('\n▶ uploading a Jira export')

  await page.getByTestId('import-sheet-file').setInputFiles({
    name: `jira-${TAG}.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV, 'utf8'),
  })
  await page.getByTestId('import-sheet-filename').waitFor({ timeout: 15_000 })

  const previewed = page.waitForResponse(
    (r) => r.url().includes('/import/spreadsheet/preview') && r.request().method() === 'POST',
    { timeout: 30_000 },
  )
  await page.getByTestId('import-sheet-preview').click()
  await previewed
  await page.getByTestId('import-sheet-review').waitFor({ timeout: 20_000 })

  /*
   * THE PRESET HAS TO CHANGE SOMETHING. "Summary" is a Jira word: the generic
   * preset has no mapping for it, the Jira preset makes it the task name. If
   * both read the same, the preset is a dead control that only recolours a
   * button — and every other check here would still pass.
   */
  const readSummaryMapping = async () =>
    await page.getByTestId('import-map-summary').inputValue()
  const genericSummary = await readSummaryMapping()

  const reMapped = page.waitForResponse(
    (r) => r.url().includes('/import/spreadsheet/preview') && r.request().method() === 'POST',
    { timeout: 30_000 },
  )
  await page.getByTestId('import-source-jira').click()
  await reMapped
  const converged = await waitUntil(async () => (await readSummaryMapping()) === 'title', { timeoutMs: 15_000 })
  const jiraSummary = await readSummaryMapping()

  console.log('\n▶ the preset is not a recoloured button — it changes the mapping')
  chk(
    converged && genericSummary === 'ignore' && jiraSummary === 'title',
    `"Summary" maps to ${genericSummary} under the generic preset and to ${jiraSummary} under Jira Software`,
    `"Summary" read "${genericSummary}" generic / "${jiraSummary}" jira — the preset changed nothing`,
  )

  console.log('\n▶ a hand-edited mapping is what the server is actually asked to use')
  const beforeEdit = previewBodies.length
  const edited = page.waitForResponse(
    (r) => r.url().includes('/import/spreadsheet/preview') && r.request().method() === 'POST',
    { timeout: 30_000 },
  )
  await page.getByTestId('import-map-description').selectOption('ignore')
  await edited
  const sentMapping = previewBodies.slice(beforeEdit).map((b) => b?.mapping?.Description)
  /*
   * PROVE THE REQUEST, NOT THE RENDER. A select that updates local state and
   * never tells the server would look identical on screen and import the
   * column anyway.
   */
  chk(
    sentMapping.length > 0 && sentMapping[sentMapping.length - 1] === 'ignore',
    'changing a column sends the new mapping to the server',
    `the preview requests after the edit carried Description = ${JSON.stringify(sentMapping)}`,
  )

  // Put Description back — the import below asserts it landed on the task.
  const restored = page.waitForResponse(
    (r) => r.url().includes('/import/spreadsheet/preview') && r.request().method() === 'POST',
    { timeout: 30_000 },
  )
  await page.getByTestId('import-map-description').selectOption('description')
  await restored
  await waitUntil(
    async () => (await page.getByTestId('import-map-description').inputValue()) === 'description',
    { timeoutMs: 10_000 },
  )

  // ══ 3. THE REFUSALS, BEFORE ANYTHING IS WRITTEN ════════════════════════════
  console.log('\n▶ four rows in, two importable, two refused — said before the import runs')

  /*
   * NaN WHERE THERE IS NO STAT, rather than thirty seconds and a throw. Every
   * caller compares the number with `===` against something real, so an absent
   * stat reddens the check that reads it — and `imports-3-deadpreset` is why:
   * with nothing importable the import never runs, so the REPORT is not drawn,
   * and this read ended the run at 17 of 20 with the five checks under it
   * unreported (ledger §10).
   */
  const statValue = async (testid) =>
    Number(await page.getByTestId(testid).getAttribute('data-value', { timeout: 6000 }).catch(() => null))
  const total = await statValue('import-sheet-total')
  const importable = await statValue('import-sheet-importable')
  const rejected = await statValue('import-sheet-rejected')
  chk(
    total === 4 && importable === 2 && rejected === 2,
    `the preview counts 4 rows: 2 importable, 2 rejected`,
    `the preview counted total=${total} importable=${importable} rejected=${rejected}`,
  )

  console.log('\n▶ and names the file line and the reason for each refusal')
  const rejectRows = page.getByTestId('import-sheet-reject-row')
  const rejectCount = await rejectRows.count()
  const rejectMeta = []
  for (let i = 0; i < rejectCount; i++) {
    const row = rejectRows.nth(i)
    rejectMeta.push({
      row: await row.getAttribute('data-row'),
      code: await row.getAttribute('data-code'),
      text: await row.innerText(),
    })
  }
  const byRow = Object.fromEntries(rejectMeta.map((r) => [r.row, r]))
  chk(
    rejectCount === 2 &&
      byRow['4']?.code === 'title_missing' &&
      byRow['5']?.code === 'invalid_date' &&
      /not-a-date/.test(byRow['5']?.text ?? '') &&
      /Due Date/i.test(byRow['5']?.text ?? ''),
    'row 4 is refused for having no name and row 5 names the column and the value that is not a date',
    `the refusals read ${JSON.stringify(rejectMeta)}`,
  )

  // ══ 4. THE IMPORT ══════════════════════════════════════════════════════════
  console.log('\n▶ running the import')

  await page.getByTestId('import-sheet-project').fill(`Import ${TAG}`)
  /*
   * A START THAT CANNOT BE PRESSED IS A FINDING, NOT A THROW.
   *
   * This was a bare `.click()` followed by `if (!finished) throw`, and
   * `imports-3-deadpreset` is what that costs: make the preset a recoloured
   * button and the Jira file maps to nothing importable, so Start stays
   * DISABLED. The click retried for thirty seconds, threw, and ended the run at
   * 7 of 19 checks. Twelve checks about what the import wrote were reported by
   * nobody, and the patch was credited with reddening the one check it claims.
   *
   * The cascade is real and worth SEEING: a broken mapping means nothing
   * imports, and the checks below say so in their own sentences against an
   * empty database. What is not worth having is a throw deciding which of them
   * get to speak.
   */
  const start = page.getByTestId('import-sheet-start')
  const started = await start
    .click({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  const finished =
    started &&
    (await waitUntil(
      () => page.getByTestId('import-sheet-report').isVisible().catch(() => false),
      { timeoutMs: 60_000 },
    ))
  chk(
    finished,
    'pressing Start runs the import, and it reports a result',
    started
      ? 'Start was pressed and the import never reported a result'
      : 'Start could not be pressed at all — with nothing importable it stays disabled, so every ' +
        'check below is about an import that did not run',
  )

  // ── what Postgres actually holds ───────────────────────────────────────────
  const importedTasks = await sql`
    select t.id, t.title, t.description, t.status, t.status_category, t.priority, t.due_date, t.list_id
    from tasks t
    where t.title like ${`%${TAG}%`}
    order by t.title`
  const alpha = importedTasks.find((t) => t.title === `Alpha ${TAG}`) ?? null
  const beta = importedTasks.find((t) => t.title === `Beta ${TAG}`) ?? null

  console.log('\n▶ the two good rows became two real tasks — and only those two')
  chk(
    importedTasks.length === 2 && !!alpha && !!beta,
    'exactly the two importable rows exist as tasks',
    `the database holds ${importedTasks.length} tagged tasks: ${JSON.stringify(importedTasks.map((t) => t.title))}`,
  )

  console.log('\n▶ the refused rows wrote nothing at all')
  const orphans = await sql`
    select id, title from tasks where description like ${`%Orphan ${TAG}%`} or title = ${`Gamma ${TAG}`}`
  /*
   * A rejection that still inserts — with a placeholder name, or with the due
   * date dropped — is worse than a failure, because the report says 2 refused
   * while the list shows 4. Assert the absence directly.
   */
  chk(
    orphans.length === 0,
    'neither refused row produced a task',
    `the refused rows left ${orphans.length} rows behind: ${JSON.stringify(orphans)}`,
  )

  console.log('\n▶ the fields the CSV carried are the fields the task has')
  const due = alpha?.due_date ? new Date(alpha.due_date).toISOString().slice(0, 10) : null
  chk(
    alpha?.description === 'First issue' &&
      alpha?.status === 'done' &&
      alpha?.priority === 'urgent' &&
      due === '2026-03-04',
    `Alpha carries its description, status done, priority urgent (from Jira's "Highest") and due ${due}`,
    `Alpha reads status=${alpha?.status} priority=${alpha?.priority} due=${due} description=${JSON.stringify(alpha?.description)}`,
  )

  console.log('\n▶ …including status_category, which is the column every rollup reads')
  /*
   * `status` alone is not the check. A writer that sets status='done' and
   * leaves status_category at its 'open' default produces a finished task that
   * the Closed filter hides, the progress ring ignores and every report counts
   * as outstanding — a confident zero with a database row behind it.
   */
  chk(
    alpha?.status_category === 'closed' && beta?.status_category === 'in_progress',
    'a "Done" row is stamped closed and an "In Progress" row in_progress',
    `Alpha status_category=${alpha?.status_category} (expected closed), Beta=${beta?.status_category} (expected in_progress)`,
  )

  console.log('\n▶ the assignee column resolved to a real member')
  const assignees = alpha
    ? await sql`select user_id from task_assignees where task_id = ${alpha.id}`
    : []
  chk(
    assignees.length === 1 && assignees[0].user_id === myUserId,
    'the Assignee cell linked the signed-in member to the task',
    `Alpha has ${assignees.length} assignee(s): ${JSON.stringify(assignees.map((a) => a.user_id))}, expected ${myUserId}`,
  )

  console.log('\n▶ the list it created is a usable list, not a bare row')
  const listRow = alpha
    ? (await sql`select id, name, project_id, space_id from lists where id = ${alpha.list_id}`)[0]
    : null
  const statusRows = listRow
    ? await sql`select key, category from list_statuses where list_id = ${listRow.id} order by position`
    : []
  /*
   * `db.insert(lists)` does not seed `list_statuses` — only ListsService does.
   * A list imported without them has no columns to group by, so Board view
   * renders an empty screen for a list that has tasks in it. `space_id` is the
   * other half: left null, every "which space is this in?" read has to join
   * back through the project.
   */
  chk(
    listRow?.name === `Board ${TAG}` &&
      listRow?.space_id != null &&
      statusRows.length === 6 &&
      statusRows.some((s) => s.key === 'done' && s.category === 'closed'),
    `the list "Board ${TAG}" carries its space and all 6 default statuses`,
    `list=${JSON.stringify(listRow)} with ${statusRows.length} statuses: ${JSON.stringify(statusRows.map((s) => s.key))}`,
  )

  // ══ 5. THE JOB ROW ═════════════════════════════════════════════════════════
  console.log('\n▶ the job row records the refusals, by line, with the reason')

  const jobRow = (
    await sql`
      select id, source, source_preset, status, total, processed, created_count, rejected_count, row_errors
      from clickup_import_jobs
      where workspace_id = ${workspaceId} and source = 'spreadsheet'
      order by created_at desc limit 1`
  )[0]
  createdJobId = jobRow?.id ?? null
  const rowErrors = Array.isArray(jobRow?.row_errors) ? jobRow.row_errors : []
  const errRows = rowErrors.map((e) => e.row).sort((a, b) => a - b)
  chk(
    jobRow?.rejected_count === 2 &&
      errRows.length === 2 &&
      errRows[0] === 4 &&
      errRows[1] === 5 &&
      rowErrors.every((e) => typeof e.message === 'string' && e.message.length > 10),
    'rejected_count is 2 and row_errors names lines 4 and 5 with a sentence each',
    `the job row has rejected_count=${jobRow?.rejected_count} and row_errors ${JSON.stringify(rowErrors)}`,
  )

  console.log('\n▶ …and records WHICH importer ran, and under which preset')
  chk(
    jobRow?.source === 'spreadsheet' &&
      jobRow?.source_preset === 'jira' &&
      jobRow?.status === 'completed' &&
      jobRow?.created_count === 2,
    `the job is source=spreadsheet preset=jira, completed, 2 created`,
    `the job row reads source=${jobRow?.source} preset=${jobRow?.source_preset} status=${jobRow?.status} created=${jobRow?.created_count}`,
  )

  console.log('\n▶ `source` is a column something READS — the history filters on it')
  const mine = await api(`/workspaces/${workspaceId}/import/spreadsheet/jobs?source=spreadsheet`)
  const theirs = await api(`/workspaces/${workspaceId}/import/spreadsheet/jobs?source=clickup_csv`)
  if (mine.status >= 300) throw new Error(`GET import jobs?source=spreadsheet answered ${mine.status}`)
  if (theirs.status >= 300) throw new Error(`GET import jobs?source=clickup_csv answered ${theirs.status}`)
  const mineIds = (mine.data ?? []).map((j) => j.id)
  const theirIds = (theirs.data ?? []).map((j) => j.id)
  /*
   * A stored value no reader honours is the facade's mirror, and it is worse,
   * because the database then stands as evidence for a feature that does not
   * exist. Both halves are asserted: the job is IN its own listing and OUT of
   * the other one. A filter that ignored the parameter would pass the first.
   */
  chk(
    mineIds.includes(jobRow?.id) &&
      !theirIds.includes(jobRow?.id) &&
      (mine.data ?? []).every((j) => j.source === 'spreadsheet'),
    'the spreadsheet job is listed under source=spreadsheet and absent under source=clickup_csv',
    `source=spreadsheet returned ${mineIds.length} rows (job present: ${mineIds.includes(jobRow?.id)}), source=clickup_csv returned ${theirIds.length} (job present: ${theirIds.includes(jobRow?.id)})`,
  )

  // ══ 6. WHAT THE PAGE SAYS AFTERWARDS ═══════════════════════════════════════
  console.log('\n▶ the report shows the refusals rather than rounding them away')

  const reportRejected = await statValue('import-sheet-r-rejected')
  const reportCreated = await statValue('import-sheet-r-created')
  const errorRows = page.getByTestId('import-sheet-error-row')
  const errorRowCount = await errorRows.count()
  const reportedLines = []
  for (let i = 0; i < errorRowCount; i++) {
    reportedLines.push(await errorRows.nth(i).getAttribute('data-row'))
  }
  chk(
    reportCreated === 2 &&
      reportRejected === 2 &&
      errorRowCount === 2 &&
      reportedLines.includes('4') &&
      reportedLines.includes('5'),
    'the report reads created 2 / rejected 2 and lists lines 4 and 5',
    `the report read created=${reportCreated} rejected=${reportRejected} with lines ${JSON.stringify(reportedLines)}`,
  )

  console.log('\n▶ the preset used is on the report, not just in the database')
  // `imports-3-deadpreset` leaves the preset unresolved, so this badge is not
  // drawn and the read threw at 18 of 20. `null` fails the check below, which
  // is the honest answer for a badge that is not there.
  const presetBadge = await page
    .getByTestId('import-sheet-preset')
    .getAttribute('data-preset', { timeout: 8000 })
    .catch(() => null)
  chk(
    presetBadge === 'jira',
    'the report names the preset the import ran under',
    `the report's preset badge read "${presetBadge}"`,
  )

  console.log('\n▶ the history lists this run under its own source')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('import-tab-sheet').click({ timeout: 25_000 })
  const historyShowed = await waitUntil(
    async () => (await page.getByTestId('import-sheet-history-row').count()) > 0,
    { timeoutMs: 25_000 },
  )
  const historyRow = page.locator(`[data-testid="import-sheet-history-row"][data-job="${jobRow?.id}"]`)
  const historySources = await page
    .locator('[data-testid="import-sheet-history-row"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-source')))
  chk(
    historyShowed &&
      (await historyRow.count()) === 1 &&
      (await historyRow.getAttribute('data-preset')) === 'jira' &&
      historySources.every((s) => s === 'spreadsheet'),
    'the history draws this job with its preset, and nothing from the ClickUp importer',
    `history held ${historySources.length} rows (${JSON.stringify(historySources)}); this job appeared ${await historyRow.count()} time(s)`,
  )

  // ══ 7. THE OTHER IMPORTER IS STILL THERE ═══════════════════════════════════
  console.log('\n▶ the ClickUp importer the row was already half-credited for still works')
  const clickupPreview = await api(`/workspaces/${workspaceId}/import/clickup/preview`, {
    method: 'POST',
    body: { csv: `Task Name,Status\nRegression ${TAG},Done\n` },
  })
  chk(
    clickupPreview.status < 300 && clickupPreview.data?.totalRows === 1,
    'POST import/clickup/preview still answers with its row count',
    `the ClickUp preview answered ${clickupPreview.status} with ${JSON.stringify(clickupPreview.data?.totalRows)}`,
  )

  await page.close()
} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
} finally {
  if (sql) {
    // The e2e database is shared; this run takes its own fixtures away with it.
    await sql`delete from tasks where title like ${`%${TAG}%`}`.catch(() => {})
    await sql`delete from lists where name like ${`%${TAG}%`}`.catch(() => {})
    await sql`delete from projects where name like ${`%${TAG}%`}`.catch(() => {})
    await sql`delete from spaces where name like ${`%${TAG}%`}`.catch(() => {})
    if (createdJobId) {
      await sql`delete from clickup_import_jobs where id = ${createdJobId}`.catch(() => {})
    }
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — a run that skipped a branch is not a ` +
        'shorter pass, it is a failure, and "0 failed" would describe only the part it reached.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
