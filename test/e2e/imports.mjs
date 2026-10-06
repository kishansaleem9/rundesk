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
import { LOGIN_NAV_TIMEOUT_MS, signUpApi } from './lib/signin.mjs'
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
const EXPECTED_CHECKS = 53

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
  /*
   * A DISK THAT READS ONE FILE SLOWLY: a large file's read, without the large
   * file. A file named `slow-…` has its `readAsText` start 1.5 s late, and each
   * such read that lands is counted, so section 11 can choose a file, replace
   * it while its read is still out, and know when the first read has landed.
   */
  await ctx.addInitScript(() => {
    const read = FileReader.prototype.readAsText
    FileReader.prototype.readAsText = function (blob, ...rest) {
      if (typeof blob?.name !== 'string' || !blob.name.startsWith('slow-')) return read.call(this, blob, ...rest)
      this.addEventListener('load', () => { window.__slowReadsLanded = (window.__slowReadsLanded ?? 0) + 1 })
      setTimeout(() => read.call(this, blob, ...rest), 1500)
    }
  })
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
    // Drawn, and caught: a hidden reason reads '' and fails the check below in its own words.
    reasons.push((await el.count()) ? ((await el.first().filter({ visible: true }).innerText().catch(() => '')) ?? '') : '')
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
      text: await row.filter({ visible: true }).innerText().catch(() => ''),
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

  // ── a workspace of this run's own, for what the imports below may and may not write ──
  // Made through the fixture's client, so it is journaled and swept with all it holds.
  const made = await api('/workspaces', { method: 'POST', body: { name: `Import targets ${TAG}` } })
  const WT = made.data?.id
  if (!WT) throw new Error(`could not make the run's workspace: ${made.status} ${made.message}`)
  const spaceIn = async (name, extra = {}) => {
    const res = await api('/spaces', { method: 'POST', body: { workspaceId: WT, name: `${name} ${TAG}`, ...extra } })
    if (!res.data?.id) throw new Error(`could not make the space "${name}": ${res.status} ${res.message}`)
    return res.data.id
  }
  const OPEN = await spaceIn('Open')
  const VIEW_ONLY = await spaceIn('View-only', { defaultPermission: 'view' })
  const PRIVATE = await spaceIn('Private', { visibility: 'private' })
  /** An import's job, polled to its end; `null` when there was none to poll or it never ended. */
  const jobOf = async (who, ws, kind, run, timeoutMs = 30_000) => {
    if (!run.data?.jobId) return null
    let job = null
    await waitUntil(async () => {
      job = (await who(`/workspaces/${ws}/import/${kind}/jobs/${run.data.jobId}`)).data
      return job?.status === 'completed' || job?.status === 'failed'
    }, { timeoutMs })
    return job?.status === 'completed' || job?.status === 'failed' ? job : null
  }
  /** Projects in a space whose name carries a marker — what an import made there. */
  const projectsIn = async (spaceId, marker) =>
    (await sql`select name from projects where space_id = ${spaceId} and name like ${`%${marker}%`}`).length
  const jobRowsOf = async (ws, source) =>
    (await sql`select count(*)::int as n from clickup_import_jobs where workspace_id = ${ws} and source = ${source}`)[0].n
  const SHEET = (title) => `Title\n${title}\n`
  const CLICKUP = (title) => `Task Name\n${title}\n`
  const NOWHERE = '00000000-0000-4000-8000-000000000000'

  // ══ 8. WHERE AN IMPORT MAY WRITE ═══════════════════════════════════════════
  /*
   * `found-5-oct/import-writes-into-another-workspace` (security). Both
   * importers took `targetSpaceId` as given: an admin of one workspace wrote a
   * project, a list and a task into another workspace's space, measured on
   * lanes 6 and 4. And inside the workspace an import made a project where its
   * maker may add nothing. Each refusal is read off the answer and then off the
   * database: nothing written, not even the job row.
   */
  console.log('\n▶ a stranger names a space of another workspace, from a workspace of their own')
  const stamp = TAG.replace(/[^a-z0-9]/g, '')
  const signed = await signUpApi(API, {
    fullName: `Importer ${TAG}`,
    email: `${TAG}-stranger@rundesk.invalid`,
    password: 'ImportTargets@12345!',
    organizationName: `Importer ${TAG}`,
    organizationSlug: `importer-${stamp}`,
  })
  const S = apiClient(API, signed.accessToken)
  const HOME = (signed.workspaces ?? [])[0]?.id
  if (!HOME) throw new Error('the stranger’s sign-up made no workspace of their own')
  const sheetThere = await S(`/workspaces/${HOME}/import/spreadsheet`, { method: 'POST', body: { content: SHEET(`Injected sheet ${TAG}`), preset: 'generic', targetSpaceId: OPEN, targetProjectName: `Injected sheet ${TAG}` } })
  const sheetNowhere = await S(`/workspaces/${HOME}/import/spreadsheet`, { method: 'POST', body: { content: SHEET(`Nowhere sheet ${TAG}`), preset: 'generic', targetSpaceId: NOWHERE } })
  await jobOf(S, HOME, 'spreadsheet', sheetThere)
  const sheetLeft = { projects: await projectsIn(OPEN, `Injected sheet ${TAG}`), jobs: await jobRowsOf(HOME, 'spreadsheet') }
  chk(
    sheetThere.status === 403 && sheetThere.message === 'That space is not in this workspace' &&
      sheetNowhere.status === 404 && sheetLeft.projects === 0 && sheetLeft.jobs === 0,
    'the spreadsheet import refuses a space of another workspace, 403 “That space is not in this workspace”, and one naming nothing 404 — writing nothing there, not even a job row',
    `another workspace’s space: ${sheetThere.status} ${JSON.stringify(sheetThere.message)}; an id naming nothing: ${sheetNowhere.status}; ` +
      `left behind: ${sheetLeft.projects} project(s) in that space, ${sheetLeft.jobs} job row(s)`,
  )

  const clickupThere = await S(`/workspaces/${HOME}/import/clickup`, { method: 'POST', body: { csv: CLICKUP(`Injected clickup ${TAG}`), targetSpaceId: OPEN, targetProjectName: `Injected clickup ${TAG}` } })
  const clickupNowhere = await S(`/workspaces/${HOME}/import/clickup`, { method: 'POST', body: { csv: CLICKUP(`Nowhere clickup ${TAG}`), targetSpaceId: NOWHERE } })
  await jobOf(S, HOME, 'clickup', clickupThere)
  const clickupLeft = { projects: await projectsIn(OPEN, `Injected clickup ${TAG}`), jobs: await jobRowsOf(HOME, 'clickup_csv') }
  chk(
    clickupThere.status === 403 && clickupThere.message === 'That space is not in this workspace' &&
      clickupNowhere.status === 404 && clickupLeft.projects === 0 && clickupLeft.jobs === 0,
    'the ClickUp import refuses a space of another workspace, 403 “That space is not in this workspace”, and one naming nothing 404 — writing nothing there, not even a job row',
    `another workspace’s space: ${clickupThere.status} ${JSON.stringify(clickupThere.message)}; an id naming nothing: ${clickupNowhere.status}; ` +
      `left behind: ${clickupLeft.projects} project(s) in that space, ${clickupLeft.jobs} job row(s)`,
  )

  console.log('\n▶ a member granted workspace.import, in a view-only space and a private one')
  const memberEmail = `${TAG}-importer@rundesk.invalid`
  const memberSigned = await signUpApi(API, {
    fullName: `Member importer ${TAG}`,
    email: memberEmail,
    password: 'ImportTargets@12345!',
    organizationName: `Member importer ${TAG}`,
    organizationSlug: `member-importer-${stamp}`,
  })
  const M = apiClient(API, memberSigned.accessToken)
  const added = await api(`/workspaces/${WT}/members`, { method: 'POST', body: { email: memberEmail, role: 'member' } })
  if (!added.ok) throw new Error(`could not add the member: ${added.status} ${added.message}`)
  const [memberRow] = await sql`select m.id from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${WT} and u.email = ${memberEmail}`
  const role = await api(`/workspaces/${WT}/roles`, { method: 'POST', body: { name: `Importers ${TAG}`, permissions: ['workspace.import'] } })
  const granted = role.data?.id && memberRow
    ? await api(`/workspaces/${WT}/members/${memberRow.id}/roles/${role.data.id}`, { method: 'POST', body: {} })
    : null
  if (!granted?.ok) throw new Error(`could not grant the member workspace.import: ${role.status} ${role.message}; ${granted?.status} ${granted?.message}`)

  const intoViewOnly = {
    sheet: await M(`/workspaces/${WT}/import/spreadsheet`, { method: 'POST', body: { content: SHEET(`Member view ${TAG}`), preset: 'generic', targetSpaceId: VIEW_ONLY, targetProjectName: `Member view ${TAG}` } }),
    clickup: await M(`/workspaces/${WT}/import/clickup`, { method: 'POST', body: { csv: CLICKUP(`Member view ${TAG}`), targetSpaceId: VIEW_ONLY, targetProjectName: `Member view ${TAG}` } }),
  }
  const intoOpen = await M(`/workspaces/${WT}/import/spreadsheet`, { method: 'POST', body: { content: SHEET(`Member open ${TAG}`), preset: 'generic', targetSpaceId: OPEN, targetProjectName: `Member open ${TAG}` } })
  const openJob = await jobOf(M, WT, 'spreadsheet', intoOpen)
  const [openTask] = await sql`select t.id from tasks t join lists l on l.id = t.list_id join projects p on p.id = l.project_id where p.space_id = ${OPEN} and t.title = ${`Member open ${TAG}`}`
  const viewLeft = await projectsIn(VIEW_ONLY, `Member view ${TAG}`)
  const levelWords = /does not allow adding a project/
  chk(
    intoViewOnly.sheet.status === 403 && levelWords.test(intoViewOnly.sheet.message) &&
      intoViewOnly.clickup.status === 403 && levelWords.test(intoViewOnly.clickup.message) &&
      viewLeft === 0 && intoOpen.status === 201 && openJob?.status === 'completed' && !!openTask,
    'a member granted workspace.import cannot import into a view-only space — both importers refuse in the space’s words and write nothing there — while an import into the open space beside it goes through',
    `view-only: sheet ${intoViewOnly.sheet.status} ${JSON.stringify(intoViewOnly.sheet.message)}, clickup ${intoViewOnly.clickup.status} ${JSON.stringify(intoViewOnly.clickup.message)}, ` +
      `${viewLeft} project(s) made there; the open space: ${intoOpen.status}, job ${openJob?.status ?? 'none'}, task ${openTask ? 'there' : 'missing'}`,
  )

  const intoPrivate = {
    sheet: await M(`/workspaces/${WT}/import/spreadsheet`, { method: 'POST', body: { content: SHEET(`Member private ${TAG}`), preset: 'generic', targetSpaceId: PRIVATE, targetProjectName: `Member private ${TAG}` } }),
    clickup: await M(`/workspaces/${WT}/import/clickup`, { method: 'POST', body: { csv: CLICKUP(`Member private ${TAG}`), targetSpaceId: PRIVATE, targetProjectName: `Member private ${TAG}` } }),
  }
  await jobOf(M, WT, 'spreadsheet', intoPrivate.sheet)
  await jobOf(M, WT, 'clickup', intoPrivate.clickup)
  const privateLeft = await projectsIn(PRIVATE, `Member private ${TAG}`)
  const noAccess = 'You do not have access to where this project would go'
  chk(
    intoPrivate.sheet.status === 403 && intoPrivate.sheet.message === noAccess &&
      intoPrivate.clickup.status === 403 && intoPrivate.clickup.message === noAccess && privateLeft === 0,
    'nor into a private space they cannot open: both importers refuse, 403 “You do not have access to where this project would go”, and nothing is written there',
    `sheet ${intoPrivate.sheet.status} ${JSON.stringify(intoPrivate.sheet.message)}, clickup ${intoPrivate.clickup.status} ${JSON.stringify(intoPrivate.clickup.message)}, ${privateLeft} project(s) made there`,
  )

  console.log('\n▶ the workspace named in capitals in the address')
  /*
   * The guards take a workspace id in any case, as Postgres compares ids, and
   * the refusal above compared it as a string: an import into the workspace's
   * own space answered 403 “That space is not in this workspace” — a reason
   * that was not true (measured on lane 4, both importers).
   */
  const WT_CAPS = WT.toUpperCase()
  const capsSheet = await api(`/workspaces/${WT_CAPS}/import/spreadsheet`, { method: 'POST', body: { content: SHEET(`Caps sheet ${TAG}`), preset: 'generic', targetSpaceId: OPEN, targetProjectName: `Caps sheet ${TAG}` } })
  const capsClickup = await api(`/workspaces/${WT_CAPS}/import/clickup`, { method: 'POST', body: { csv: CLICKUP(`Caps clickup ${TAG}`), targetSpaceId: OPEN, targetProjectName: `Caps clickup ${TAG}` } })
  const capsJobs = { sheet: await jobOf(api, WT, 'spreadsheet', capsSheet), clickup: await jobOf(api, WT, 'clickup', capsClickup) }
  const capsMade = { sheet: await projectsIn(OPEN, `Caps sheet ${TAG}`), clickup: await projectsIn(OPEN, `Caps clickup ${TAG}`) }
  chk(
    capsSheet.status === 201 && capsClickup.status === 201 && capsJobs.sheet?.status === 'completed' &&
      capsJobs.clickup?.status === 'completed' && capsMade.sheet === 1 && capsMade.clickup === 1,
    'an import addressed to its workspace in capitals takes that workspace’s own space — both importers — rather than refusing it as another workspace’s',
    `sheet ${capsSheet.status} ${JSON.stringify(capsSheet.message)} (job ${capsJobs.sheet?.status ?? 'none'}, ${capsMade.sheet} project(s)); ` +
      `clickup ${capsClickup.status} ${JSON.stringify(capsClickup.message)} (job ${capsJobs.clickup?.status ?? 'none'}, ${capsMade.clickup} project(s))`,
  )

  // ══ 9. A TAG WHATEVER ITS CASE ═════════════════════════════════════════════
  /*
   * `found-30-sep/spreadsheet-import-skips-task-rules`, its tag half: both
   * importers found a tag by its exact spelling, so "urgent-x" beside the
   * workspace's "Urgent-X" made a second tag, where the tags route and a
   * task's `labelsByName` find the one there.
   */
  console.log('\n▶ a row tagged in another case than the workspace’s tag')
  const TAG_NAME = `Urgent-${TAG}`
  const tagMade = await api(`/workspaces/${WT}/labels`, { method: 'POST', body: { name: TAG_NAME, color: '#ef4444' } })
  if (!tagMade.data?.id) throw new Error(`could not make the tag: ${tagMade.status} ${tagMade.message}`)
  const tagsLike = async () =>
    (await sql`select name from labels where workspace_id = ${WT} and lower(name) = lower(${TAG_NAME}) order by name`).map((l) => l.name)
  const tagsOn = async (title) =>
    (await sql`select lb.name from tasks t join task_label_assignments a on a.task_id = t.id join labels lb on lb.id = a.label_id where t.title = ${title}`).map((l) => l.name)

  const sheetTagged = await api(`/workspaces/${WT}/import/spreadsheet`, { method: 'POST', body: { content: `Title,Tags\nTagged sheet ${TAG},${TAG_NAME.toLowerCase()}\n`, preset: 'generic', targetSpaceId: OPEN, targetProjectName: `Tagged sheet ${TAG}` } })
  const sheetTagJob = await jobOf(api, WT, 'spreadsheet', sheetTagged)
  const afterSheet = { tags: await tagsLike(), on: await tagsOn(`Tagged sheet ${TAG}`) }
  chk(
    sheetTagJob?.status === 'completed' && sheetTagJob?.result?.labelsCreated === 0 &&
      afterSheet.tags.length === 1 && afterSheet.tags[0] === TAG_NAME && afterSheet.on.length === 1 && afterSheet.on[0] === TAG_NAME,
    'a sheet row tagged in another case is tagged with the workspace’s tag — no second tag differing only in case',
    `job ${sheetTagJob?.status ?? 'none'} (tags made: ${sheetTagJob?.result?.labelsCreated}); the workspace’s tags of that name: ${JSON.stringify(afterSheet.tags)}; the task is tagged ${JSON.stringify(afterSheet.on)}`,
  )

  const clickupTagged = await api(`/workspaces/${WT}/import/clickup`, { method: 'POST', body: { csv: `Task Name,Tags\nTagged clickup ${TAG},${TAG_NAME.toUpperCase()}\n`, targetSpaceId: OPEN, targetProjectName: `Tagged clickup ${TAG}` } })
  const clickupTagJob = await jobOf(api, WT, 'clickup', clickupTagged)
  const afterClickup = { tags: await tagsLike(), on: await tagsOn(`Tagged clickup ${TAG}`) }
  // Read apart from the sheet's: whichever spelling the workspace holds, the ClickUp row made none of its own.
  chk(
    clickupTagJob?.status === 'completed' && clickupTagJob?.result?.labelsCreated === 0 &&
      !afterClickup.tags.includes(TAG_NAME.toUpperCase()) && afterClickup.on.length === 1 &&
      afterClickup.on[0].toLowerCase() === TAG_NAME.toLowerCase() && afterClickup.on[0] !== TAG_NAME.toUpperCase(),
    'a ClickUp row tagged in another case is tagged with the workspace’s tag — no second tag differing only in case',
    `job ${clickupTagJob?.status ?? 'none'} (tags made: ${clickupTagJob?.result?.labelsCreated}); the workspace’s tags of that name: ${JSON.stringify(afterClickup.tags)}; the task is tagged ${JSON.stringify(afterClickup.on)}`,
  )

  console.log('\n▶ a ClickUp tag longer than the 60 characters a tag is made with')
  /*
   * The ClickUp import makes a tag cut to 60 characters and looked it up by
   * the whole name, which no tag has: a second import of a 70-character tag in
   * another case made a twin differing only in case, and a third in the first
   * case struck the twin's conflict and dropped the tag (measured on lane 4).
   */
  const LONG = `Quarterly-Review-${stamp}-`.padEnd(70, 'Xy')
  const longRuns = []
  for (const [title, tag] of [[`Long one ${TAG}`, LONG], [`Long two ${TAG}`, LONG.toLowerCase()], [`Long three ${TAG}`, LONG]]) {
    const run = await api(`/workspaces/${WT}/import/clickup`, { method: 'POST', body: { csv: `Task Name,Tags\n${title},${tag}\n`, targetSpaceId: OPEN, targetProjectName: title } })
    longRuns.push((await jobOf(api, WT, 'clickup', run))?.status ?? `${run.status} and no job`)
  }
  const longTags = (await sql`select name from labels where workspace_id = ${WT} and lower(left(name, 60)) = lower(${LONG.slice(0, 60)})`).map((l) => l.name)
  const longOn = [await tagsOn(`Long one ${TAG}`), await tagsOn(`Long two ${TAG}`), await tagsOn(`Long three ${TAG}`)]
  chk(
    longRuns.every((r) => r === 'completed') && longTags.length === 1 && longOn.every((on) => on.length === 1 && on[0] === longTags[0]),
    'a ClickUp row tagged with a 70-character tag, in another case or the same, is tagged with the one tag the import made — no twin differing only in case, and none dropped',
    `jobs ${JSON.stringify(longRuns)}; the workspace’s tags of that name: ${JSON.stringify(longTags)}; the three tasks are tagged ${JSON.stringify(longOn)}`,
  )

  // ══ 10. A MERGE WRITES WHAT THE FILE MAPS ══════════════════════════════════
  /*
   * `found-5-oct/import-merge-resets-fields-the-file-lacks`: a merge from a
   * file with no Status and no Priority column set the matched task To do and
   * Normal (lane 6, and on lane 4 the ClickUp import's merge too). The file
   * below carries a description, so the merge visibly ran.
   */
  console.log('\n▶ a merge from a file with no Status or Priority column')
  const project = await api('/projects', { method: 'POST', body: { spaceId: OPEN, name: `Merge project ${TAG}` } })
  if (!project.data?.id) throw new Error(`could not make the merge project: ${project.status} ${project.message}`)
  const mergeList = await api('/lists', { method: 'POST', body: { projectId: project.data.id, name: `Merge ${TAG}` } })
  if (!mergeList.data?.id) throw new Error(`could not make the merge list: ${mergeList.status} ${mergeList.message}`)
  const matched = async (title) => {
    const res = await api('/tasks', { method: 'POST', body: { listId: mergeList.data.id, title, status: 'in_progress', priority: 'high', description: 'old words' } })
    if (!res.data?.id) throw new Error(`could not make "${title}": ${res.status} ${res.message}`)
    return res.data.id
  }
  const fieldsOf = async (id) => (await sql`select status, status_category, priority, description from tasks where id = ${id}`)[0] ?? {}
  const kept = (t) => t.status === 'in_progress' && t.status_category === 'in_progress' && t.priority === 'high' && t.description === 'new words'

  const twoId = await matched(`Two ${TAG}`)
  const sheetMerge = await api(`/workspaces/${WT}/import/spreadsheet`, { method: 'POST', body: { content: `Title,List,Description\nTwo ${TAG},Merge ${TAG},new words\n`, preset: 'generic', strategy: 'merge', targetSpaceId: OPEN, targetProjectName: `Merged sheet ${TAG}` } })
  const sheetMergeJob = await jobOf(api, WT, 'spreadsheet', sheetMerge)
  const two = await fieldsOf(twoId)
  chk(
    sheetMergeJob?.status === 'completed' && sheetMergeJob?.updatedCount === 1 && kept(two),
    'a spreadsheet merge from a file with no Status or Priority column writes the description it carries and leaves the task In progress and High',
    `job ${sheetMergeJob?.status ?? 'none'} (updated ${sheetMergeJob?.updatedCount}); the task reads ${JSON.stringify(two)}`,
  )

  const threeId = await matched(`Three ${TAG}`)
  const clickupMerge = await api(`/workspaces/${WT}/import/clickup`, { method: 'POST', body: { csv: `Task Name,List,Description\nThree ${TAG},Merge ${TAG},new words\n`, strategy: 'merge', targetSpaceId: OPEN, targetProjectName: `Merged clickup ${TAG}` } })
  const clickupMergeJob = await jobOf(api, WT, 'clickup', clickupMerge)
  const three = await fieldsOf(threeId)
  chk(
    clickupMergeJob?.status === 'completed' && clickupMergeJob?.updatedCount === 1 && kept(three),
    'a ClickUp merge from a file with no Status or Priority column writes the description it carries and leaves the task In progress and High',
    `job ${clickupMergeJob?.status ?? 'none'} (updated ${clickupMergeJob?.updatedCount}); the task reads ${JSON.stringify(three)}`,
  )

  // ══ 11. A FILE THAT IS NOT DELIMITED TEXT ══════════════════════════════════
  /*
   * `found-5-oct/xlsx-read-as-text`: an .xlsx put in anyway (the picker's "All
   * files", a drop) was read as text, its zip's bytes drawn as a column,
   * offered for import, and the run failed leaving an empty space, project and
   * list. The .xlsx here is a real one: this run's merge list, exported by the
   * product itself.
   */
  console.log('\n▶ an .xlsx put into the spreadsheet import anyway')
  const exported = await fetch(`${API}/tasks/list/${mergeList.data.id}/export?format=xlsx`, { headers: { authorization: `Bearer ${auth.accessToken}` } })
  const XLSX = Buffer.from(await exported.arrayBuffer())
  if (exported.status !== 200 || XLSX.subarray(0, 2).toString('latin1') !== 'PK') {
    throw new Error(`could not export a real .xlsx to put in: ${exported.status}, ${XLSX.length} bytes`)
  }
  /** What the page did with the file named `name`: refused it, or took it (its name on the file line). */
  const settledOn = async (name) => {
    await waitUntil(
      async () => (await page.getByTestId('import-sheet-not-text').count()) > 0 ||
        ((await page.getByTestId('import-sheet-filename').filter({ visible: true }).innerText({ timeout: 1000 }).catch(() => '')) ?? '').includes(name),
      { timeoutMs: 8000 },
    )
    return {
      said: await page.getByTestId('import-sheet-not-text').filter({ visible: true }).innerText({ timeout: 3000 }).catch(() => ''),
      kept: await page.getByTestId('import-sheet-filename').count(),
      preview: await page.getByTestId('import-sheet-preview').isEnabled({ timeout: 3000 }).catch(() => null),
    }
  }
  const PAGE_WORDS = /Accepted: \.csv · \.tsv · \.txt\. \.xlsx is not read — re-save the sheet as CSV first\./
  /** A real CSV between two files, so the refusal read next is that file's and not the last one's. */
  const chooseFine = async () => {
    await page.getByTestId('import-sheet-file').setInputFiles({ name: `fine-${TAG}.csv`, mimeType: 'text/csv', buffer: Buffer.from(`Title\nFine ${TAG}\n`, 'utf8') }, { timeout: 10_000 })
    await waitUntil(async () => (await page.getByTestId('import-sheet-not-text').count()) === 0, { timeoutMs: 8000 })
  }
  await page.getByTestId('import-sheet-file').setInputFiles({ name: `board-${TAG}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX }, { timeout: 10_000 })
  const byName = await settledOn(`board-${TAG}.xlsx`)
  /*
   * AND AN .xls WHOSE BYTES ARE TEXT: some tools save tab-separated text
   * under an .xls name. Its first bytes say nothing, so only its name does —
   * this one is the name rule's alone. (The .xlsx above is refused by its
   * first bytes as well, and a real .xls by its own, below.)
   */
  await chooseFine()
  const TEXT_XLS = Buffer.from(`Title\tStatus\nOld board ${TAG}\tDone\n`, 'utf8')
  await page.getByTestId('import-sheet-file').setInputFiles({ name: `board-${TAG}.xls`, mimeType: 'application/vnd.ms-excel', buffer: TEXT_XLS }, { timeout: 10_000 })
  const byOldName = await settledOn(`board-${TAG}.xls`)
  chk(
    PAGE_WORDS.test(byName.said) && byName.kept === 0 && byName.preview === false &&
      PAGE_WORDS.test(byOldName.said) && byOldName.kept === 0 && byOldName.preview === false,
    'an .xlsx or .xls chosen anyway is refused by its name, in the words under the picker, and nothing is offered: no file kept, no Preview',
    `the .xlsx: the page said ${JSON.stringify(byName.said)}, kept ${byName.kept} file line(s), Preview enabled: ${byName.preview}; ` +
      `the .xls: ${JSON.stringify(byOldName.said)}, kept ${byOldName.kept}, Preview enabled: ${byOldName.preview}`,
  )

  await chooseFine()
  const previewsBefore = previewBodies.length
  await page.getByTestId('import-sheet-file').setInputFiles({ name: `board-${TAG}.csv`, mimeType: 'text/csv', buffer: XLSX }, { timeout: 10_000 })
  const byBytes = await settledOn(`board-${TAG}.csv`)
  // Pressed only where it can be: a Preview the page offers would send the zip to the server.
  if (byBytes.preview) await page.getByTestId('import-sheet-preview').click({ timeout: 5000 }).catch(() => {})
  await waitUntil(async () => previewBodies.length > previewsBefore, { timeoutMs: 3000 })
  chk(
    PAGE_WORDS.test(byBytes.said) && byBytes.kept === 0 && byBytes.preview === false && previewBodies.length === previewsBefore,
    'an .xlsx renamed .csv is refused by its first bytes, the same way, and no preview is asked of the server',
    `the page said ${JSON.stringify(byBytes.said)}, kept ${byBytes.kept} file line(s), Preview enabled: ${byBytes.preview}; ${previewBodies.length - previewsBefore} preview request(s) sent`,
  )

  /*
   * A LEGACY .xls IS NO ZIP: an OLE2 compound file, D0 CF 11 E0 A1 B1 1A E1
   * and then NULs. A real one (written by xlwt) renamed .csv was taken, its
   * preview drew five column names of binary, and its import failed (measured
   * on lane 4). These are its first 512 bytes as a compound file begins them.
   */
  await chooseFine()
  const XLS = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(504)])
  const previewsBeforeXls = previewBodies.length
  await page.getByTestId('import-sheet-file').setInputFiles({ name: `legacy-${TAG}.csv`, mimeType: 'text/csv', buffer: XLS }, { timeout: 10_000 })
  const xlsByBytes = await settledOn(`legacy-${TAG}.csv`)
  if (xlsByBytes.preview) await page.getByTestId('import-sheet-preview').click({ timeout: 5000 }).catch(() => {})
  await waitUntil(async () => previewBodies.length > previewsBeforeXls, { timeoutMs: 3000 })
  chk(
    PAGE_WORDS.test(xlsByBytes.said) && xlsByBytes.kept === 0 && xlsByBytes.preview === false && previewBodies.length === previewsBeforeXls,
    'a legacy .xls renamed .csv is refused by its first bytes too — the compound file’s signature — and no preview is asked of the server',
    `the page said ${JSON.stringify(xlsByBytes.said)}, kept ${xlsByBytes.kept} file line(s), Preview enabled: ${xlsByBytes.preview}; ${previewBodies.length - previewsBeforeXls} preview request(s) sent`,
  )

  console.log('\n▶ a file still being read when a refused one replaces it')
  /*
   * A file is read after an await and then by a FileReader, so a large file
   * chosen and replaced by one the page refused finished its read afterwards:
   * the page said the second was refused and kept no file line, yet offered
   * Preview — which sent the first file, 21 MB of it (measured on lane 4,
   * three runs of three). `slow-…` is read 1.5 s late (the init script above).
   */
  await chooseFine()
  const previewsBeforeSlow = previewBodies.length
  const slowLanded = async () => Number(await page.evaluate(() => window.__slowReadsLanded ?? 0))
  const slowBefore = await slowLanded()
  await page.getByTestId('import-sheet-file').setInputFiles({ name: `slow-${TAG}.csv`, mimeType: 'text/csv', buffer: Buffer.from(`Title\nSlow ${TAG}\n`, 'utf8') }, { timeout: 10_000 })
  const slowTaken = await waitUntil(
    async () => ((await page.getByTestId('import-sheet-filename').filter({ visible: true }).innerText({ timeout: 1000 }).catch(() => '')) ?? '').includes(`slow-${TAG}.csv`),
    { timeoutMs: 8000 },
  )
  await page.getByTestId('import-sheet-file').setInputFiles({ name: `replaced-${TAG}.csv`, mimeType: 'text/csv', buffer: XLSX }, { timeout: 10_000 })
  const slowRead = await waitUntil(async () => (await slowLanded()) > slowBefore, { timeoutMs: 8000 })
  const afterSlow = await settledOn(`replaced-${TAG}.csv`)
  if (afterSlow.preview) await page.getByTestId('import-sheet-preview').click({ timeout: 5000 }).catch(() => {})
  await waitUntil(async () => previewBodies.length > previewsBeforeSlow, { timeoutMs: 3000 })
  chk(
    slowTaken && slowRead && PAGE_WORDS.test(afterSlow.said) && afterSlow.kept === 0 && afterSlow.preview === false &&
      previewBodies.length === previewsBeforeSlow,
    'a file still being read when a refused one replaces it is not offered: no file line, no Preview, no preview request',
    `the slow file was ${slowTaken ? '' : 'never '}taken and its read ${slowRead ? 'landed' : 'never landed'}; then the page said ${JSON.stringify(afterSlow.said)}, ` +
      `kept ${afterSlow.kept} file line(s), Preview enabled: ${afterSlow.preview}; ${previewBodies.length - previewsBeforeSlow} preview request(s) sent`,
  )

  console.log('\n▶ the same .xlsx sent to the server, as the page would have read it')
  const asText = new TextDecoder('utf-8').decode(XLSX)
  const firstColumn = asText.split('\n')[0]
  const xlsxPreview = await api(`/workspaces/${WT}/import/spreadsheet/preview`, { method: 'POST', body: { content: asText } })
  // Mapped as its preview drew it, when it drew one: the zip's bytes, as one column, to Title.
  const column = xlsxPreview.data?.headers?.[0] ?? firstColumn
  const xlsxImport = await api(`/workspaces/${WT}/import/spreadsheet`, { method: 'POST', body: { content: asText, mapping: { [column]: 'title' }, targetProjectName: `Xlsx ${TAG}` } })
  await jobOf(api, WT, 'spreadsheet', xlsxImport)
  const xlsxLeft = {
    jobs: xlsxImport.data?.jobId ? (await sql`select count(*)::int as n from clickup_import_jobs where id = ${xlsxImport.data.jobId}`)[0].n : 0,
    spaces: (await sql`select count(*)::int as n from spaces where workspace_id = ${WT} and name = ${`Xlsx ${TAG}`}`)[0].n,
  }
  const SERVER_WORDS = 'Accepted: .csv · .tsv · .txt. .xlsx is not read — re-save the sheet as CSV first.'
  chk(
    xlsxPreview.status === 400 && xlsxPreview.message === SERVER_WORDS &&
      xlsxImport.status === 400 && xlsxImport.message === SERVER_WORDS && xlsxLeft.jobs === 0 && xlsxLeft.spaces === 0,
    'the server refuses an .xlsx’s content too — preview and import answer 400 in the page’s words — and makes nothing: no job row, no space',
    `preview ${xlsxPreview.status} ${JSON.stringify(xlsxPreview.message)}; import ${xlsxImport.status} ${JSON.stringify(xlsxImport.message)}; ` +
      `left behind: ${xlsxLeft.jobs} job row(s), ${xlsxLeft.spaces} space(s)`,
  )

  console.log('\n▶ the same legacy .xls sent to the server, as the page would have read it')
  /*
   * No zip, so the zip test passed it: as text its first line holds NULs,
   * which no header row of delimited text does.
   */
  const xlsAsText = new TextDecoder('utf-8').decode(XLS)
  const xlsPreview = await api(`/workspaces/${WT}/import/spreadsheet/preview`, { method: 'POST', body: { content: xlsAsText } })
  const xlsColumn = xlsPreview.data?.headers?.[0] ?? xlsAsText.split('\n')[0]
  const xlsImport = await api(`/workspaces/${WT}/import/spreadsheet`, { method: 'POST', body: { content: xlsAsText, mapping: { [xlsColumn]: 'title' }, targetProjectName: `Xls ${TAG}` } })
  await jobOf(api, WT, 'spreadsheet', xlsImport)
  const xlsLeft = {
    jobs: xlsImport.data?.jobId ? (await sql`select count(*)::int as n from clickup_import_jobs where id = ${xlsImport.data.jobId}`)[0].n : 0,
    spaces: (await sql`select count(*)::int as n from spaces where workspace_id = ${WT} and name = ${`Xls ${TAG}`}`)[0].n,
  }
  chk(
    xlsPreview.status === 400 && xlsPreview.message === SERVER_WORDS &&
      xlsImport.status === 400 && xlsImport.message === SERVER_WORDS && xlsLeft.jobs === 0 && xlsLeft.spaces === 0,
    'the server refuses a legacy .xls’s content too — a NUL in its first line — preview and import answering 400 in the page’s words, and makes nothing',
    `preview ${xlsPreview.status} ${JSON.stringify(xlsPreview.message)} (${xlsPreview.data?.headers?.length ?? 0} column(s) drawn); import ${xlsImport.status} ${JSON.stringify(xlsImport.message)}; ` +
      `left behind: ${xlsLeft.jobs} job row(s), ${xlsLeft.spaces} space(s)`,
  )

  console.log('\n▶ a preview whose content is no text at all')
  // A number is no zip and holds no NUL: it goes on to the parser, which finds no header row in it.
  const numberPreview = await api(`/workspaces/${WT}/import/spreadsheet/preview`, { method: 'POST', body: { content: 123 } })
  chk(
    numberPreview.status === 400 && numberPreview.message === 'The file has no header row.',
    'a preview whose content is a number, not text, answers 400 “The file has no header row.” — not a 500',
    `the preview answered ${numberPreview.status} ${JSON.stringify(numberPreview.message)}`,
  )

  console.log('\n▶ a row holding a NUL')
  /*
   * Postgres refuses a NUL in a title, so that row fails — and its error,
   * naming the title, then reached the job's jsonb, which refuses a NUL too:
   * the whole run failed on its last write, in the raw words "unsupported
   * Unicode escape sequence", with none of its good rows imported (measured on
   * lane 4). What is written to the job row now holds no NUL, so the row
   * fails alone, as any row the database refuses does.
   */
  const nulRow = await api(`/workspaces/${WT}/import/spreadsheet`, { method: 'POST', body: { content: `Title\nKept one ${TAG}\nBro\u0000ken ${TAG}\nKept two ${TAG}\n`, preset: 'generic', targetSpaceId: OPEN, targetProjectName: `Nul row ${TAG}` } })
  const nulJob = await jobOf(api, WT, 'spreadsheet', nulRow)
  const nulKept = (await sql`select title from tasks where title in (${`Kept one ${TAG}`}, ${`Kept two ${TAG}`}) order by title`).map((t) => t.title)
  const nulErrors = nulJob?.result?.errors ?? []
  chk(
    nulJob?.status === 'completed' && nulJob?.createdCount === 2 && nulKept.length === 2 && nulErrors.length === 1 &&
      nulErrors[0].startsWith(`Row 3 ("Bro\uFFFDken ${TAG}")`),
    'a row holding a NUL fails alone: the job completes with the rows around it imported, and that row’s error is reported without the NUL',
    `job ${nulJob?.status ?? 'none'} (${JSON.stringify(nulJob?.error ?? null)}, created ${nulJob?.createdCount}, errors ${JSON.stringify(nulErrors)}); kept: ${JSON.stringify(nulKept)}`,
  )

  console.log('\n▶ an import the database refuses at its last write')
  /*
   * A run that fails takes away what it made. Nothing a file can hold fails a
   * run now — a row that fails, fails alone — so the database is made to refuse
   * this run's last write, its "completed": a trigger on the job table, for
   * this run's workspace alone, made before the import and dropped after it.
   * That is the end the .xlsx came to, and a dropped connection or a full disk
   * would come to; the run made a space, a project, a list, two tasks and a
   * tag before it, and leaves none of them.
   */
  const REFUSE = `e2e_refuse_last_write_${stamp}`
  if (!/^[0-9a-f-]{36}$/.test(WT)) throw new Error(`the run's workspace id is not an id: ${WT}`)
  const dropRefusal = async () => {
    await sql.unsafe(`drop trigger if exists ${REFUSE} on clickup_import_jobs`).catch(() => {})
    await sql.unsafe(`drop function if exists ${REFUSE}()`).catch(() => {})
  }
  await sql.unsafe(`create function ${REFUSE}() returns trigger language plpgsql as $$ begin raise exception 'the database refused this run''s last write'; end $$`)
  await sql.unsafe(`create trigger ${REFUSE} before update on clickup_import_jobs for each row when (new.status = 'completed' and new.workspace_id = '${WT}') execute function ${REFUSE}()`)
  let failing = null
  let failedJob = null
  try {
    failing = await api(`/workspaces/${WT}/import/spreadsheet`, { method: 'POST', body: { content: `Title,Tags\nKept ${TAG},Undone-${TAG}\nAlso kept ${TAG},\n`, preset: 'generic', targetProjectName: `Failed ${TAG}` } })
    failedJob = await jobOf(api, WT, 'spreadsheet', failing)
  } finally {
    await dropRefusal()
  }
  const failedLeft = (await sql`
    select (select count(*)::int from spaces where workspace_id = ${WT} and name = ${`Failed ${TAG}`}) as spaces,
           (select count(*)::int from projects p join spaces s on s.id = p.space_id where s.workspace_id = ${WT} and p.name = ${`Failed ${TAG}`}) as projects,
           (select count(*)::int from lists l join projects p on p.id = l.project_id where p.name = ${`Failed ${TAG}`}) as lists,
           (select count(*)::int from tasks where title in (${`Kept ${TAG}`}, ${`Also kept ${TAG}`})) as tasks,
           (select count(*)::int from labels where workspace_id = ${WT} and name = ${`Undone-${TAG}`}) as tags`)[0]
  chk(
    failing?.status === 201 && failedJob?.status === 'failed' && failedJob?.createdCount === 0 &&
      /refused this run's last write/.test(failedJob?.error ?? '') &&
      failedLeft.spaces === 0 && failedLeft.projects === 0 && failedLeft.lists === 0 && failedLeft.tasks === 0 && failedLeft.tags === 0,
    'an import the database refuses at its last write ends failed and leaves nothing behind: no space, project, list, task or tag of it is there',
    `the import answered ${failing?.status}, its job ${failedJob?.status ?? 'none'} (${JSON.stringify(failedJob?.error ?? null)}, created ${failedJob?.createdCount}); left behind: ${JSON.stringify(failedLeft)}`,
  )

  console.log('\n▶ …while a row the database refuses still fails alone')
  /*
   * Each row is written in a transaction of its own, so a row Postgres
   * refuses is reported and the rest of the file is imported, as it always
   * was. Year 0 is a date JavaScript reads and Postgres refuses ("date/time
   * field value out of range").
   */
  const rowAlone = await api(`/workspaces/${WT}/import/spreadsheet`, { method: 'POST', body: { content: `Title,Due Date\nSaved one ${TAG},2026-10-10\nRefused ${TAG},0000-01-01\nSaved two ${TAG},2026-10-11\n`, preset: 'generic', targetSpaceId: OPEN, targetProjectName: `Row alone ${TAG}` } })
  const rowAloneJob = await jobOf(api, WT, 'spreadsheet', rowAlone)
  const rowAloneTasks = (await sql`select title from tasks where title in (${`Saved one ${TAG}`}, ${`Refused ${TAG}`}, ${`Saved two ${TAG}`}) order by title`).map((t) => t.title)
  const rowAloneErrors = rowAloneJob?.result?.errors ?? []
  chk(
    rowAloneJob?.status === 'completed' && rowAloneJob?.createdCount === 2 && rowAloneErrors.length === 1 &&
      /^Row 3 /.test(rowAloneErrors[0] ?? '') && rowAloneTasks.length === 2 && !rowAloneTasks.includes(`Refused ${TAG}`),
    'a row the database refuses fails alone: the job completes with the rows around it imported and that row’s error reported',
    `job ${rowAloneJob?.status ?? 'none'} (created ${rowAloneJob?.createdCount}, errors ${JSON.stringify(rowAloneErrors)}); tasks there: ${JSON.stringify(rowAloneTasks)}`,
  )

  // ══ 12. WHO MAY IMPORT, AND WHICH TASKS AN IMPORT MAY MATCH AND MERGE INTO ═══
  /*
   * Three items of 6 October, measured on lane 4 on the build that closed the
   * import items of the 5th:
   *   · `found-6-oct/import-previews-tell-what-private-places-hold` — both
   *     previews answered any member or guest, and counted a private space's
   *     task and a private list's task as duplicates (1 each, against 0 for a
   *     row naming nothing) while `GET` of them answered 403;
   *   · `found-6-oct/import-merge-writes-tasks-its-importer-may-not-change` — a
   *     member granted workspace.import merged into a view-only space's task, a
   *     task of a project they are at View on, a private list's and a private
   *     space's, with a space named or not, both importers: all came out Done
   *     and Low;
   *   · `found-6-oct/a-guest-who-may-import-makes-a-space` — a guest granted
   *     workspace.import imported a file naming no space, and a new public
   *     space, made by nobody, held their project and task; both importers.
   * And, from the review of their first fix, on lane 4: a ClickUp merge put a
   * task the member could only Comment on under a new task, a new task under
   * one they could not Full-edit, and made chains two deep and a task its own
   * parent; the ClickUp enrichment wrote comments into a private space's task
   * and a view-only space's; no check held a private task, or measured the
   * level a merge asks of an assignee at Comment.
   * Each answer is read off the API and each write off the database.
   */
  /** Somebody of this run's workspace, in `role`, holding `permissions` by a custom role of their own. */
  const joined = async (key, role, permissions = []) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const password = 'ImportTargets@12345!'
    const person = await signUpApi(API, { fullName: `${key} ${TAG}`, email, password, organizationName: `${key} ${TAG}`, organizationSlug: `${key}-${stamp}` })
    const add = await api(`/workspaces/${WT}/members`, { method: 'POST', body: { email, role } })
    if (!add.ok) throw new Error(`could not add the ${key}: ${add.status} ${add.message}`)
    const [row] = await sql`select m.id, m.user_id from workspace_members m join users u on u.id = m.user_id where m.workspace_id = ${WT} and u.email = ${email}`
    if (permissions.length > 0) {
      const made = await api(`/workspaces/${WT}/roles`, { method: 'POST', body: { name: `${key} ${TAG}`, permissions } })
      const given = made.data?.id ? await api(`/workspaces/${WT}/members/${row.id}/roles/${made.data.id}`, { method: 'POST', body: {} }) : null
      if (!given?.ok) throw new Error(`could not grant the ${key} ${permissions.join(', ')}: ${made.status} ${made.message}; ${given?.status} ${given?.message}`)
    }
    return { email, password, userId: row.user_id, as: apiClient(API, person.accessToken) }
  }
  /** A list of the admin's, in a project of its own in `spaceId`, holding one task In progress and High. */
  const placed = async (spaceId, list, title, listExtra = {}) => {
    const project = await api('/projects', { method: 'POST', body: { spaceId, name: `${list} project` } })
    if (!project.data?.id) throw new Error(`could not make the project of "${list}": ${project.status} ${project.message}`)
    const made = await api('/lists', { method: 'POST', body: { projectId: project.data.id, name: list, ...listExtra } })
    if (!made.data?.id) throw new Error(`could not make the list "${list}": ${made.status} ${made.message}`)
    const task = await api('/tasks', { method: 'POST', body: { listId: made.data.id, title, status: 'in_progress', priority: 'high' } })
    if (!task.data?.id) throw new Error(`could not make "${title}": ${task.status} ${task.message}`)
    return { list, title, id: task.data.id, project: project.data.id }
  }
  const [memberOf] = await sql`select user_id from workspace_members where id = ${memberRow.id}`
  const P = {
    viewOnly: await placed(VIEW_ONLY, `Shared ${TAG}`, `View-only task ${TAG}`),
    narrowed: await placed(OPEN, `Narrowed ${TAG}`, `Narrowed task ${TAG}`),
    privateList: await placed(OPEN, `Secret ${TAG}`, `Private-list task ${TAG}`, { visibility: 'private' }),
    privateSpace: await placed(PRIVATE, `Hidden ${TAG}`, `Private-space task ${TAG}`),
    // In an open list, the admin's and made private: its creator's, its assignees' and the managers'.
    privateTask: await placed(OPEN, `Closed ${TAG}`, `Private task ${TAG}`),
    mine: await placed(OPEN, `Mine ${TAG}`, `Open task ${TAG}`),
  }
  // The member's own grant on the narrowed project: View, which reads its tasks and changes none.
  const narrowedTo = await api(`/projects/${P.narrowed.project}/members`, { method: 'POST', body: { userId: memberOf.user_id, role: 'view' } })
  if (!narrowedTo.ok) throw new Error(`could not set the member to View on the narrowed project: ${narrowedTo.status} ${narrowedTo.message}`)
  const madePrivate = await api(`/tasks/${P.privateTask.id}`, { method: 'PATCH', body: { visibility: 'private' } })
  if (!madePrivate.ok) throw new Error(`could not make the private task private: ${madePrivate.status} ${madePrivate.message}`)
  const privateRead = await M(`/tasks/${P.privateTask.id}`)
  if (privateRead.status !== 403) throw new Error(`the member was meant to be refused the private task, and read it: ${privateRead.status} ${privateRead.message}`)
  const rowsOf = (head, keys, extra = '') => `${head}\n${keys.map((k) => `${P[k].title},${P[k].list}${extra}`).join('\n')}\n`

  console.log('\n▶ who may preview: a member and a guest without workspace.import')
  const noKeyMember = await joined('nokey-member', 'member')
  const noKeyGuest = await joined('nokey-guest', 'guest')
  const previewsBy = async (who) => ({
    sheet: await who.as(`/workspaces/${WT}/import/spreadsheet/preview`, { method: 'POST', body: { content: rowsOf('Title,List', ['privateSpace']), preset: 'generic' } }),
    clickup: await who.as(`/workspaces/${WT}/import/clickup/preview`, { method: 'POST', body: { csv: rowsOf('Task Name,List', ['privateSpace']) } }),
  })
  const byNoKeyMember = await previewsBy(noKeyMember)
  const byNoKeyGuest = await previewsBy(noKeyGuest)
  const KEY_WORDS = 'Missing required permission: workspace.import'
  const keyAsked = (r) => r.status === 403 && r.message === KEY_WORDS
  const previewSaid = (r) => `${r.status} ${JSON.stringify(r.message || null)}${r.data ? ` (duplicates ${JSON.stringify(r.data.duplicates)})` : ''}`
  chk(
    keyAsked(byNoKeyMember.sheet) && keyAsked(byNoKeyMember.clickup) && keyAsked(byNoKeyGuest.sheet) && keyAsked(byNoKeyGuest.clickup),
    'a member and a guest without workspace.import are refused both previews, 403 “Missing required permission: workspace.import”, as the imports refuse them',
    `the member: sheet ${previewSaid(byNoKeyMember.sheet)}, clickup ${previewSaid(byNoKeyMember.clickup)}; the guest: sheet ${previewSaid(byNoKeyGuest.sheet)}, clickup ${previewSaid(byNoKeyGuest.clickup)}`,
  )

  console.log('\n▶ what a preview counts for a member granted workspace.import')
  const counted = {
    sheet: await M(`/workspaces/${WT}/import/spreadsheet/preview`, { method: 'POST', body: { content: rowsOf('Title,List', ['privateSpace', 'privateList', 'privateTask', 'mine']), preset: 'generic' } }),
    clickup: await M(`/workspaces/${WT}/import/clickup/preview`, { method: 'POST', body: { csv: rowsOf('Task Name,List', ['privateSpace', 'privateList', 'privateTask', 'mine']) } }),
  }
  const countedTitles = (counted.clickup.data?.duplicates?.sample ?? []).map((d) => d.title)
  chk(
    counted.sheet.status === 201 && counted.sheet.data?.duplicates === 1 &&
      counted.clickup.status === 201 && counted.clickup.data?.duplicates?.count === 1 && countedTitles.length === 1 && countedTitles[0] === P.mine.title,
    'for a member granted workspace.import, both previews count as a duplicate only the task they may open — not a private space’s task, a private list’s or a private task',
    `sheet ${counted.sheet.status} ${JSON.stringify(counted.sheet.message || null)}: ${JSON.stringify(counted.sheet.data?.duplicates)} duplicate(s); ` +
      `clickup ${counted.clickup.status} ${JSON.stringify(counted.clickup.message || null)}: ${JSON.stringify(counted.clickup.data?.duplicates)}`,
  )

  /** Each named task's status and priority, by SQL. */
  const statesOf = async (keys) => Object.fromEntries(await Promise.all(keys.map(async (k) => {
    const [t] = await sql`select status, priority from tasks where id = ${P[k].id}`
    return [k, `${t?.status}/${t?.priority}`]
  })))
  const AS_MADE = 'in_progress/high'
  /** A merge by the member, Done and Low on every row; `scope` names its space, or none. */
  const mergeBy = async (kind, scope, keys, name) => {
    const rows = rowsOf(kind === 'spreadsheet' ? 'Title,List,Status,Priority' : 'Task Name,List,Status,Priority', keys, ',Done,Low')
    const where = { targetProjectName: name, ...(scope ? { targetSpaceId: scope } : {}) }
    const run = await M(`/workspaces/${WT}/import/${kind}`, {
      method: 'POST',
      body: kind === 'spreadsheet' ? { content: rows, preset: 'generic', strategy: 'merge', ...where } : { csv: rows, strategy: 'merge', ...where },
    })
    return { run, job: await jobOf(M, WT, kind, run) }
  }

  console.log('\n▶ a merge by a member granted workspace.import, into tasks they may open and not change')
  const writeRuns = []
  /** Each named task back as it was made, so a run is read on its own and not on what an earlier one left. */
  const asMade = async (keys) => {
    for (const k of keys) await sql`update tasks set status = 'in_progress', status_category = 'in_progress', priority = 'high' where id = ${P[k].id}`
  }
  for (const [kind, scope, keys] of [
    ['spreadsheet', null, ['viewOnly', 'narrowed', 'mine']],
    ['clickup', null, ['viewOnly', 'narrowed', 'mine']],
    ['spreadsheet', OPEN, ['narrowed', 'mine']],
    ['clickup', OPEN, ['narrowed', 'mine']],
  ]) {
    await asMade(keys)
    const { run, job } = await mergeBy(kind, scope, keys, `Write rule ${kind} ${scope ? 'open' : 'nowhere'} ${TAG}`)
    const errors = job?.result?.errors ?? []
    const refused = keys.filter((k) => k !== 'mine')
    const tasks = await statesOf(keys)
    writeRuns.push({
      kind, scope: scope ? 'the open space' : 'no space', started: run.status, job: job?.status ?? 'none', updated: job?.updatedCount, errors, tasks,
      ok: run.status === 201 && job?.status === 'completed' && job?.updatedCount === 1 && tasks.mine === 'done/low' &&
        refused.every((k) => tasks[k] === AS_MADE) && errors.length === refused.length &&
        refused.every((k) => errors.some((e) => e.includes(`"${P[k].title}"`) && /which does not allow changing its tasks$/.test(e))),
    })
  }
  chk(
    writeRuns.every((r) => r.ok),
    'a merge by a member granted workspace.import changes only the task they may change — both importers, with a space named and without: a view-only space’s task and a task of a project they are at View on stay as they were, each row refused in the write rule’s words',
    writeRuns.map((r) => `${r.kind} into ${r.scope}: ${r.started}, job ${r.job} (updated ${r.updated}); tasks ${JSON.stringify(r.tasks)}; errors ${JSON.stringify(r.errors)}`).join(' | '),
  )

  console.log('\n▶ a merge by a member granted workspace.import, into a task assigned to them in a space at Comment')
  /*
   * The level a merge asks is the routes' for the same change: a status alone is what an assignee
   * at Comment may change (their `PATCH` of a status alone answers 200), and any other field asks
   * Edit (their `PATCH` of a priority alone answers 403). The member above is no assignee, and
   * below Edit a non-assignee is refused at either level — so a merge asking "comment" of every
   * field passed every check (the review's mutation, measured on lane 4: a Priority and a
   * Description merged into the assignee's task).
   */
  const COMMENT_SPACE = await spaceIn('Comment-level', { defaultPermission: 'comment' })
  /** The admin's task in a list of its own in the Comment space, assigned to the member. */
  const assignedIn = async (list, title) => {
    const task = await placed(COMMENT_SPACE, list, title)
    const assigned = await api(`/tasks/${task.id}/assignees`, { method: 'POST', body: { userId: memberOf.user_id } })
    if (!assigned.ok) throw new Error(`could not assign the member "${title}": ${assigned.status} ${assigned.message}`)
    return task
  }
  const assignedTask = await assignedIn(`Assigned ${TAG}`, `Assigned task ${TAG}`)
  const COMMENT_WORDS = `This space's default permission is "Comment", which does not allow changing its tasks`
  const levelRuns = []
  for (const kind of ['spreadsheet', 'clickup']) {
    for (const [what, head, cells] of [
      ['a status alone', 'Status', 'Done'],
      ['a priority and a description', 'Priority,Description', 'Low,Rewritten by a merge'],
    ]) {
      await sql`update tasks set status = 'in_progress', status_category = 'in_progress', priority = 'high', description = null where id = ${assignedTask.id}`
      const name = `Level ${kind} ${what} ${TAG}`
      const rows = `${kind === 'spreadsheet' ? 'Title' : 'Task Name'},List,${head}\n${assignedTask.title},${assignedTask.list},${cells}\n`
      const run = await M(`/workspaces/${WT}/import/${kind}`, {
        method: 'POST',
        body: kind === 'spreadsheet' ? { content: rows, preset: 'generic', strategy: 'merge', targetProjectName: name } : { csv: rows, strategy: 'merge', targetProjectName: name },
      })
      const job = await jobOf(M, WT, kind, run)
      const [task] = await sql`select status, priority, description from tasks where id = ${assignedTask.id}`
      levelRuns.push({ kind, what, started: run.status, job: job?.status ?? 'none', updated: job?.updatedCount, errors: job?.result?.errors ?? [], task })
    }
  }
  chk(
    levelRuns.every((r) => r.started === 201 && r.job === 'completed') &&
      levelRuns.filter((r) => r.what === 'a status alone').every((r) => r.updated === 1 && r.errors.length === 0 && r.task?.status === 'done' && r.task?.priority === 'high') &&
      levelRuns.filter((r) => r.what !== 'a status alone').every((r) =>
        r.updated === 0 && r.errors.length === 1 && r.errors[0].includes(`"${assignedTask.title}"`) && r.errors[0].endsWith(COMMENT_WORDS) &&
        r.task?.status === 'in_progress' && r.task?.priority === 'high' && r.task?.description === null),
    'a merge by a member granted workspace.import into a task assigned to them in a space at Comment writes a status alone, and refuses a priority or a description in the write rule’s words, leaving the task as it was — both importers',
    levelRuns.map((r) => `${r.kind}, ${r.what}: ${r.started}, job ${r.job} (updated ${r.updated}); task ${JSON.stringify(r.task)}; errors ${JSON.stringify(r.errors)}`).join(' | '),
  )

  console.log('\n▶ a merge by a member granted workspace.import, naming tasks they may not open')
  const readRuns = []
  for (const [kind, scope, keys] of [
    ['spreadsheet', null, ['privateList', 'privateSpace', 'privateTask']],
    ['clickup', null, ['privateList', 'privateSpace', 'privateTask']],
    ['spreadsheet', OPEN, ['privateList', 'privateTask']],
    ['clickup', OPEN, ['privateList', 'privateTask']],
  ]) {
    await asMade(keys)
    const name = `Read rule ${kind} ${scope ? 'open' : 'nowhere'} ${TAG}`
    const { run, job } = await mergeBy(kind, scope, keys, name)
    const errors = job?.result?.errors ?? []
    const tasks = await statesOf(keys)
    // What the run made: its rows, as new tasks in the lists of its own project — taken
    // away again, as they are tasks the member may open, which the next run would match.
    const made = (await sql`select t.title from tasks t join lists l on l.id = t.list_id join projects p on p.id = l.project_id where p.name = ${name} order by t.title`).map((t) => t.title)
    await sql`delete from tasks t using lists l, projects p where t.list_id = l.id and l.project_id = p.id and p.name = ${name}`
    readRuns.push({
      kind, scope: scope ? 'the open space' : 'no space', started: run.status, job: job?.status ?? 'none', created: job?.createdCount, updated: job?.updatedCount, errors, tasks, made,
      ok: run.status === 201 && job?.status === 'completed' && job?.updatedCount === 0 && job?.createdCount === keys.length && errors.length === 0 &&
        keys.every((k) => tasks[k] === AS_MADE && made.includes(P[k].title)),
    })
  }
  chk(
    readRuns.every((r) => r.ok),
    'a merge by a member granted workspace.import matches no task they may not open — both importers, with a space named and without: a private list’s task, a private space’s and a private task stay as they were, and each row is imported as a new task, with no refusal to say the other is there',
    readRuns.map((r) => `${r.kind} into ${r.scope}: ${r.started}, job ${r.job} (created ${r.created}, updated ${r.updated}); tasks ${JSON.stringify(r.tasks)}; made ${JSON.stringify(r.made)}; errors ${JSON.stringify(r.errors)}`).join(' | '),
  )

  console.log('\n▶ a ClickUp merge by a member granted workspace.import, its rows naming their parents')
  /*
   * The second pass links a row to its Parent ID's row, and it took the tasks the run MERGED
   * into as its own: a member assigned a task at Comment merged its status, and with it put the
   * task under a new task of the import, which their `PATCH` of its parent was refused (403); a
   * new task went under a task in an Edit space, which their `POST /tasks` under it was refused,
   * Full edit being asked (measured on lane 4). A link now asks what those routes ask
   * (`assertMayLinkSubtask`).
   */
  const EDIT_SPACE = await spaceIn('Edit-level', { defaultPermission: 'edit' })
  const atComment = await assignedIn(`Linked ${TAG}`, `Assigned and linked ${TAG}`)
  const atEdit = await placed(EDIT_SPACE, `Edited ${TAG}`, `Edit-level task ${TAG}`)
  const linkCsv = [
    'Task ID,Parent ID,Task Name,List,Status',
    `cu-x,cu-np,${atComment.title},${atComment.list},complete`,
    `cu-np,,New parent ${TAG},Links ${TAG},`,
    `cu-y,,${atEdit.title},${atEdit.list},complete`,
    `cu-nc,cu-y,New child ${TAG},Links ${TAG},`,
  ].join('\n') + '\n'
  const linkRun = await M(`/workspaces/${WT}/import/clickup`, { method: 'POST', body: { csv: linkCsv, strategy: 'merge', targetProjectName: `Links ${TAG}` } })
  const linkJob = await jobOf(M, WT, 'clickup', linkRun)
  const [linkedX] = await sql`select status, parent_task_id from tasks where id = ${atComment.id}`
  const [linkedY] = await sql`select status, (select count(*)::int from tasks c where c.parent_task_id = ${atEdit.id}) as subtasks from tasks where id = ${atEdit.id}`
  const [newChild] = await sql`select parent_task_id from tasks where title = ${`New child ${TAG}`}`
  const linkErrors = linkJob?.result?.errors ?? []
  chk(
    linkRun.status === 201 && linkJob?.status === 'completed' && linkJob?.updatedCount === 2 && linkJob?.createdCount === 2 &&
      linkedX?.status === 'done' && linkedX?.parent_task_id === null && linkedY?.status === 'done' && linkedY?.subtasks === 0 &&
      !!newChild && newChild.parent_task_id === null && linkErrors.length === 2 &&
      linkErrors.includes(`Task "${atComment.title}" under "New parent ${TAG}": ${COMMENT_WORDS}`) &&
      linkErrors.some((e) => e.startsWith(`Task "New child ${TAG}" under "${atEdit.title}": This space's default permission is "Edit", which does not allow `)),
    'a ClickUp merge by a member granted workspace.import links a subtask to or under a task that was already there only as the routes let them: their task at Comment is merged and stays where it was, and nothing goes under a task they may not Full-edit — each link refused in the rule’s words',
    `${linkRun.status}, job ${linkJob?.status ?? 'none'} (created ${linkJob?.createdCount}, updated ${linkJob?.updatedCount}, subtasks linked ${linkJob?.result?.subtasksLinked}); ` +
      `the task at Comment ${JSON.stringify(linkedX ?? null)}; the task at Edit ${JSON.stringify(linkedY ?? null)}; the new child ${JSON.stringify(newChild ?? null)}; errors ${JSON.stringify(linkErrors)}`,
  )

  console.log('\n▶ a ClickUp merge whose links would nest two deep, or make a task its own parent')
  /*
   * The pass kept one level by the file alone, and a task merged into brings what it already
   * has: a task with a subtask went under a new task, and a new task under a subtask — two deep,
   * where both routes refuse it — and two rows of one list and title, one naming the other its
   * parent, made that task its own parent (measured on lane 4, the admin importing).
   */
  const nestTop = await placed(OPEN, `Nest ${TAG}`, `Top with a subtask ${TAG}`)
  const [{ list_id: nestList }] = await sql`select list_id from tasks where id = ${nestTop.id}`
  const nestTask = async (title, parentTaskId) => {
    const made = await api('/tasks', { method: 'POST', body: { listId: nestList, title, ...(parentTaskId ? { parentTaskId } : {}) } })
    if (!made.data?.id) throw new Error(`could not make "${title}": ${made.status} ${made.message}`)
    return made.data.id
  }
  await nestTask(`Its subtask ${TAG}`, nestTop.id)
  await nestTask(`A subtask ${TAG}`, await nestTask(`Second top ${TAG}`))
  await nestTask(`Alone ${TAG}`)
  const nestCsv = [
    'Task ID,Parent ID,Task Name,List',
    `cu-top,cu-np2,Top with a subtask ${TAG},Nest ${TAG}`,
    `cu-sub,,A subtask ${TAG},Nest ${TAG}`,
    `cu-s1,,Alone ${TAG},Nest ${TAG}`,
    `cu-s2,cu-s1,Alone ${TAG},Nest ${TAG}`,
    `cu-np2,,New top ${TAG},Deep ${TAG}`,
    `cu-ng,cu-sub,New grandchild ${TAG},Deep ${TAG}`,
  ].join('\n') + '\n'
  const nestRun = await api(`/workspaces/${WT}/import/clickup`, { method: 'POST', body: { csv: nestCsv, strategy: 'merge', targetProjectName: `Deep ${TAG}` } })
  const nestJob = await jobOf(api, WT, 'clickup', nestRun)
  const inWT = sql`select t.id, t.title, t.parent_task_id from tasks t join lists l on l.id = t.list_id join projects pr on pr.id = l.project_id join spaces sp on sp.id = pr.space_id where sp.workspace_id = ${WT}`
  const wtTasks = await inWT
  const parentOf = new Map(wtTasks.map((t) => [t.id, t.parent_task_id]))
  const twoDeep = wtTasks.filter((t) => t.parent_task_id && parentOf.get(t.parent_task_id)).map((t) => t.title)
  const ownParent = wtTasks.filter((t) => t.parent_task_id === t.id).map((t) => t.title)
  const nestErrors = nestJob?.result?.errors ?? []
  const NEST_REFUSED = [
    `Task "Top with a subtask ${TAG}" under "New top ${TAG}": A task with subtasks cannot become a subtask itself`,
    `Task "Alone ${TAG}" under "Alone ${TAG}": A task cannot be its own parent`,
    `Task "New grandchild ${TAG}" under "A subtask ${TAG}": Subtasks can only be nested one level deep`,
  ]
  chk(
    nestRun.status === 201 && nestJob?.status === 'completed' && twoDeep.length === 0 && ownParent.length === 0 &&
      nestErrors.length === NEST_REFUSED.length && NEST_REFUSED.every((e) => nestErrors.includes(e)),
    'a ClickUp merge makes no task its own parent and nothing two deep: a task with a subtask goes under no other, and nothing goes under a subtask — each link refused in the routes’ words',
    `${nestRun.status}, job ${nestJob?.status ?? 'none'} (subtasks linked ${nestJob?.result?.subtasksLinked}); two deep: ${JSON.stringify(twoDeep)}; its own parent: ${JSON.stringify(ownParent)}; errors ${JSON.stringify(nestErrors)}`,
  )
  // A task left its own parent would loop whatever reads up its chain; none is, after a passing run.
  await sql`update tasks set parent_task_id = null where parent_task_id = id and id in (select t.id from tasks t join lists l on l.id = t.list_id join projects pr on pr.id = l.project_id join spaces sp on sp.id = pr.space_id where sp.workspace_id = ${WT})`

  console.log('\n▶ the ClickUp enrichment, by a member granted workspace.import, naming tasks they may not open or change')
  /*
   * The enrichment asked only that a mapped task was in the workspace: this member named a
   * private space's task they are refused and a view-only space's task whose comments they are
   * refused, and was answered 201 with both enriched; given ClickUp's answer each took a comment,
   * filed under whichever member its author's name matched (measured on lane 4, at the service:
   * ClickUp is not reached from the lanes). The token here is no token, so nothing it refuses may
   * reach ClickUp to fail there.
   */
  const enrichAsked = await M(`/workspaces/${WT}/import/clickup/jobs/${linkRun.data?.jobId}/enrich`, {
    method: 'POST',
    body: { apiToken: 'not-a-token', mapping: [{ clickupTaskId: 'rv-h', taskId: P.privateSpace.id }, { clickupTaskId: 'rv-v', taskId: P.viewOnly.id }] },
  })
  const enrichErrors = enrichAsked.data?.errors ?? []
  const [wroteInto] = await sql`
    select (select count(*)::int from task_comments where task_id in (${P.privateSpace.id}, ${P.viewOnly.id})) as comments,
           (select count(*)::int from task_attachments where task_id in (${P.privateSpace.id}, ${P.viewOnly.id})) as files`
  const ENRICH_REFUSED = [
    `Enrich: task ${P.privateSpace.id}: You do not have access to this task — skipped`,
    `Comments for ClickUp task rv-v: This space's default permission is "View only", which does not allow changing its comments`,
    `Attachments for ClickUp task rv-v: This space's default permission is "View only", which does not allow changing its tasks`,
  ]
  chk(
    linkRun.data?.jobId && enrichAsked.status === 201 && enrichAsked.data?.enrichment?.tasksEnriched === 0 &&
      enrichErrors.length === ENRICH_REFUSED.length && ENRICH_REFUSED.every((e) => enrichErrors.includes(e)) &&
      wroteInto.comments === 0 && wroteInto.files === 0,
    'the ClickUp enrichment by a member granted workspace.import takes nothing into a private space’s task they may not open, nor into a view-only space’s task they may not comment on or change — each refused in its rule’s words, before ClickUp is asked',
    `${enrichAsked.status} ${JSON.stringify(enrichAsked.message || null)}: enriched ${JSON.stringify(enrichAsked.data?.enrichment?.tasksEnriched)}; errors ${JSON.stringify(enrichErrors)}; on those tasks now ${JSON.stringify(wroteInto)}`,
  )

  console.log('\n▶ a guest granted workspace.import by a custom role')
  const guestImporter = await joined('guest-importer', 'guest', ['workspace.import'])
  const GI = guestImporter.as
  const guestAsked = {
    sheetPreview: await GI(`/workspaces/${WT}/import/spreadsheet/preview`, { method: 'POST', body: { content: `Title\nGuest row ${TAG}\n`, preset: 'generic' } }),
    clickupPreview: await GI(`/workspaces/${WT}/import/clickup/preview`, { method: 'POST', body: { csv: `Task Name\nGuest row ${TAG}\n` } }),
    sheet: await GI(`/workspaces/${WT}/import/spreadsheet`, { method: 'POST', body: { content: `Title\nGuest sheet task ${TAG}\n`, preset: 'generic', targetProjectName: `Guest sheet ${TAG}` } }),
    clickup: await GI(`/workspaces/${WT}/import/clickup`, { method: 'POST', body: { csv: `Task Name\nGuest clickup task ${TAG}\n`, targetProjectName: `Guest clickup ${TAG}` } }),
    // The admin's ClickUp import of section 8: its comments and files are an import too.
    enrich: await GI(`/workspaces/${WT}/import/clickup/jobs/${capsClickup.data?.jobId}/enrich`, { method: 'POST', body: { apiToken: 'not-a-token', mapping: [] } }),
  }
  await jobOf(GI, WT, 'spreadsheet', guestAsked.sheet)
  await jobOf(GI, WT, 'clickup', guestAsked.clickup)
  const guestLeft = (await sql`
    select (select count(*)::int from spaces where workspace_id = ${WT} and name in (${`Guest sheet ${TAG}`}, ${`Guest clickup ${TAG}`})) as spaces,
           (select count(*)::int from tasks where title in (${`Guest sheet task ${TAG}`}, ${`Guest clickup task ${TAG}`})) as tasks,
           (select count(*)::int from clickup_import_jobs where workspace_id = ${WT} and created_by_id = ${guestImporter.userId}) as jobs`)[0]
  const GUEST_WORDS = 'Guests cannot import data into a workspace'
  chk(
    capsClickup.data?.jobId && Object.values(guestAsked).every((r) => r.status === 403 && r.message === GUEST_WORDS) &&
      guestLeft.spaces === 0 && guestLeft.tasks === 0 && guestLeft.jobs === 0,
    'a guest granted workspace.import by a custom role is refused both previews, both imports and the ClickUp enrichment, 403 “Guests cannot import data into a workspace” — and no space, task or job row of theirs is made',
    `${Object.entries(guestAsked).map(([k, r]) => `${k} ${r.status} ${JSON.stringify(r.message || null)}`).join('; ')}; left behind: ${JSON.stringify(guestLeft)}`,
  )

  console.log('\n▶ the import page, for that guest')
  const guestCtx = await browser.newContext({ viewport: { width: 1400, height: 950 }, serviceWorkers: 'block' })
  const guestPage = await guestCtx.newPage()
  const guestSees = {}
  try {
    await guestPage.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
    await guestPage.fill('input[type=email]', guestImporter.email)
    await guestPage.fill('input[type=password]', guestImporter.password)
    await guestPage.click('button[type=submit]')
    await guestPage.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await guestPage.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await guestPage.goto(`${stack.base}/app/${WT}/import`, { waitUntil: 'domcontentloaded' })
    await guestPage.getByTestId('import-tabs').waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {})
    /** What the open tab says to the guest, and whether it offers `offered` (a test id). */
    const tabSays = async (offered) => {
      await waitUntil(
        async () => (await guestPage.getByTestId('import-not-for-guests').count()) > 0 || (await guestPage.getByTestId(offered).count()) > 0,
        { timeoutMs: 15_000 },
      )
      return {
        said: await guestPage.getByTestId('import-not-for-guests').filter({ visible: true }).innerText({ timeout: 3000 }).catch(() => ''),
        offered: await guestPage.getByTestId(offered).count(),
      }
    }
    guestSees.sheet = await tabSays('import-sheet-file')
    await guestPage.getByTestId('import-tab-clickup').click({ timeout: 10_000 }).catch(() => {})
    guestSees.clickup = await tabSays('import-clickup-panel')
  } finally {
    await guestCtx.close().catch(() => {})
  }
  const PAGE_GUEST_WORDS = 'Guests cannot import data into a workspace.'
  chk(
    guestSees.sheet?.said === PAGE_GUEST_WORDS && guestSees.sheet?.offered === 0 && guestSees.clickup?.said === PAGE_GUEST_WORDS && guestSees.clickup?.offered === 0,
    'the import page offers that guest neither the spreadsheet nor the ClickUp import, and says why in the server’s words: “Guests cannot import data into a workspace.”',
    `the spreadsheet tab ${JSON.stringify(guestSees.sheet ?? null)}; the ClickUp tab ${JSON.stringify(guestSees.clickup ?? null)}`,
  )

  // ══ 13. IMPORTS THAT RUN WHILE EVERYTHING ELSE DOES ═════════════════════════
  /*
   * Measured on lane 4 against a run written as ONE transaction: it held one
   * of the API's ten pooled connections for the whole run and waited on
   * another for each progress write — twelve imports at once held all ten,
   * and every route of the API stopped answering until it was restarted; a
   * task the run merged stayed locked until the run ended; and a tag it made
   * was invisible to the tags route until then, which made the same tag in
   * another case beside it. Each import below is long enough to be running
   * still when it is asked about; the database is read directly, because the
   * question is whether the API answers at all. A request here gives up
   * after its own few seconds (its `signal`) rather than waiting on a stopped
   * API, and a request nothing answered reads as a status of 0 (`noAnswer`).
   */
  const noAnswer = (err) => ({ status: 0, ok: false, data: null, message: `no answer: ${err?.message ?? err}` })
  const longSheet = (head, first, rows, row) => [head, first, ...Array.from({ length: rows }, (_, i) => row(i))].join('\n') + '\n'
  const jobNow = async (id) => (id ? (await sql`select status, processed from clickup_import_jobs where id = ${id}`)[0] ?? null : null)

  console.log('\n▶ a tag a running import has made, asked for by the tags route while it runs')
  const RACE = `Race-${TAG}`
  const raceRun = await api(`/workspaces/${WT}/import/spreadsheet`, { method: 'POST', body: { content: longSheet('Title,Tags', `Race 0 ${TAG},${RACE}`, 2999, (i) => `Race ${i + 1} ${TAG},`), preset: 'generic', targetSpaceId: OPEN, targetProjectName: `Race ${TAG}` } })
  // Until the import's first row is in — its tag is there to find, or the run is well past it — and if neither comes, the tags route is asked all the same.
  await waitUntil(async () => {
    const seen = await sql`select 1 from labels where workspace_id = ${WT} and lower(name) = lower(${RACE})`
    return seen.length > 0 || ((await jobNow(raceRun.data?.jobId))?.processed ?? 0) >= 60
  }, { timeoutMs: 3000 })
  const raceAsked = await api(`/workspaces/${WT}/labels`, { method: 'POST', body: { name: RACE.toLowerCase(), color: '#22c55e' }, signal: AbortSignal.timeout(10_000) }).catch(noAnswer)
  const raceThen = (await jobNow(raceRun.data?.jobId))?.status ?? null
  const raceJob = await jobOf(api, WT, 'spreadsheet', raceRun, 120_000)
  const raceTags = (await sql`select name from labels where workspace_id = ${WT} and lower(name) = lower(${RACE}) order by name`).map((l) => l.name)
  const raceOn = await tagsOn(`Race 0 ${TAG}`)
  chk(
    raceThen === 'processing' && raceAsked.ok && raceAsked.data?.name === RACE && raceJob?.status === 'completed' &&
      raceTags.length === 1 && raceOn.length === 1 && raceOn[0] === RACE,
    'a tag a running import has made is the one the tags route finds, whatever its case, while the import is still running — no second tag beside it',
    `the import was ${raceThen ?? 'nowhere'} when the tags route was asked; it answered ${raceAsked.status} with ${JSON.stringify(raceAsked.data?.name ?? null)}; ` +
      `the import ended ${raceJob?.status ?? 'never'}; the workspace’s tags of that name: ${JSON.stringify(raceTags)}; the first row is tagged ${JSON.stringify(raceOn)}`,
  )

  console.log('\n▶ a task an import is merging, edited while the import runs')
  const lockedId = await matched(`Locked ${TAG}`)
  const lockRun = await api(`/workspaces/${WT}/import/spreadsheet`, { method: 'POST', body: { content: longSheet('Title,List', `Locked ${TAG},Merge ${TAG}`, 2999, (i) => `Filler ${i} ${TAG},Filler ${TAG}`), preset: 'generic', strategy: 'merge', targetSpaceId: OPEN, targetProjectName: `Lock ${TAG}` } })
  // Its first row — the merge — is in once the run is well past it; if the run does not move, the edit is sent all the same.
  await waitUntil(async () => ((await jobNow(lockRun.data?.jobId))?.processed ?? 0) >= 60, { timeoutMs: 3000 })
  const editStart = Date.now()
  const edit = await api(`/tasks/${lockedId}`, { method: 'PATCH', body: { title: `Locked, edited ${TAG}` }, signal: AbortSignal.timeout(15_000) }).catch(noAnswer)
  const editMs = Date.now() - editStart
  const lockThen = (await jobNow(lockRun.data?.jobId))?.status ?? null
  const lockJob = await jobOf(api, WT, 'spreadsheet', lockRun, 120_000)
  chk(
    lockRun.status === 201 && lockThen === 'processing' && edit.status === 200 && editMs < 2000 && lockJob?.status === 'completed' && lockJob?.updatedCount === 1,
    'a task an import has merged can be edited while the import runs on: the edit answers at once',
    `the merge import answered ${lockRun.status} and was ${lockThen ?? 'nowhere'} when the edit answered ${edit.status} after ${editMs} ms; it ended ${lockJob?.status ?? 'never'} (updated ${lockJob?.updatedCount})`,
  )

  console.log('\n▶ twelve imports at once — more than the API holds connections')
  const POOL_ROWS = 600
  const poolRuns = await Promise.all(Array.from({ length: 12 }, (_, k) =>
    api(`/workspaces/${WT}/import/spreadsheet`, { method: 'POST', body: { content: longSheet('Title', `Pool ${k}-0 ${TAG}`, POOL_ROWS - 1, (i) => `Pool ${k}-${i + 1} ${TAG}`), preset: 'generic', targetSpaceId: OPEN, targetProjectName: `Pool ${k} ${TAG}` }, signal: AbortSignal.timeout(20_000) }).catch(noAnswer)))
  const poolIds = poolRuns.map((r) => r.data?.jobId).filter(Boolean)
  const meStart = Date.now()
  const meWhile = await api('/auth/me', { signal: AbortSignal.timeout(5000) }).catch(noAnswer)
  const meMs = Date.now() - meStart
  const poolJobs = async () => (poolIds.length ? await sql`select status, processed from clickup_import_jobs where id in ${sql(poolIds)}` : [])
  // Until every job has ended — or none has moved for 20 s, which is a run that will not end.
  let poolMoved = { at: Date.now(), processed: -1 }
  await waitUntil(async () => {
    const jobs = await poolJobs()
    const processed = jobs.reduce((n, j) => n + (j.processed ?? 0), 0)
    if (processed !== poolMoved.processed) poolMoved = { at: Date.now(), processed }
    const ended = jobs.length === poolIds.length && jobs.every((j) => j.status === 'completed' || j.status === 'failed')
    return ended || Date.now() - poolMoved.at > 20_000
  }, { timeoutMs: 90_000 })
  const poolEnd = (await poolJobs()).map((j) => j.status)
  const poolEnded = poolEnd.length === poolIds.length && poolEnd.every((st) => st === 'completed' || st === 'failed')
  /*
   * AN API WHOSE IMPORTS HOLD ITS CONNECTIONS FOR EVER STOPS ANSWERING, AND
   * NOTHING FROM HERE GIVES THEM BACK. Measured with the defect put back:
   * ending the open transactions' backends from here did not bring the API
   * back — it went on not answering until it was restarted. So this is the
   * suite's last check, the teardown below waits on no lock for long, and the
   * lane's API has to be restarted after it fails.
   */
  if (!poolEnded) console.log("  (the imports did not end and the API holds its connections: restart the lane's API after this run)")
  const poolTasks = (await sql`select count(*)::int as n from tasks where title like ${`Pool %-% ${TAG}`}`)[0].n
  chk(
    poolRuns.every((r) => r.status === 201) && poolIds.length === 12 && poolEnded && poolEnd.every((st) => st === 'completed') &&
      poolTasks === 12 * POOL_ROWS && meWhile.ok && meMs < 3000,
    'twelve imports at once, more than the API holds connections, all complete — and the API answers while they run',
    `started ${JSON.stringify(poolRuns.map((r) => r.status))}; their jobs ${poolEnded ? 'ended' : 'had stopped moving, unended'}: ${JSON.stringify(poolEnd)}; ` +
      `${poolTasks} of ${12 * POOL_ROWS} tasks made; GET /auth/me while they ran answered ${meWhile.status} in ${meMs} ms`,
  )

  await page.close()
} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
} finally {
  if (sql) {
    // The fault section 11 put in, if the run ended inside it.
    const REFUSE = `e2e_refuse_last_write_${TAG.replace(/[^a-z0-9]/g, '')}`
    if ((await sql`select 1 from pg_proc where proname = ${REFUSE}`.catch(() => [])).length) {
      await sql.unsafe(`drop trigger if exists ${REFUSE} on clickup_import_jobs`).catch(() => {})
      await sql.unsafe(`drop function if exists ${REFUSE}()`).catch(() => {})
    }
    // The e2e database is shared; this run takes its own fixtures away with it —
    // each statement waiting at most 10 s on a lock, which an API whose imports
    // never ended holds for ever (section 13's last check).
    const bounded = (statement) => sql.begin(async (t) => {
      await t`set local lock_timeout = '10s'`
      await statement(t)
    }).catch(() => {})
    await bounded((t) => t`delete from tasks where title like ${`%${TAG}%`}`)
    await bounded((t) => t`delete from lists where name like ${`%${TAG}%`}`)
    await bounded((t) => t`delete from projects where name like ${`%${TAG}%`}`)
    await bounded((t) => t`delete from spaces where name like ${`%${TAG}%`}`)
    if (createdJobId) {
      await bounded((t) => t`delete from clickup_import_jobs where id = ${createdJobId}`)
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
