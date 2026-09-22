/**
 * §V2-S07 — SEARCH AND FILTER ON THE ACTIVITY FEED, frames `01:55`, `05:20`,
 * `15:20`.
 *
 * The Activity panel's header draws three controls at its right: a magnifier, a
 * bell carrying the watcher count, and a three-bar filter glyph. The bell was
 * built. The other two were not, and `GET /tasks/:id/activity` took no query
 * parameters at all.
 *
 * WHAT THIS SUITE IS REALLY GUARDING.
 *
 * `TasksService.listActivity` answers with `limit = 100`, newest first, and the
 * controller passes no limit — so the panel has never held more than the
 * hundred most recent entries. The cheap way to build this row is an
 * `Array.filter` over the entries the component already has. That version
 * passes every screenshot: type a word that occurs in the last hundred and the
 * feed narrows correctly. It is wrong for everything older, and it is wrong
 * SILENTLY — the reader is told "nothing matches", which is exactly what a
 * genuine absence looks like. This audit calls that the *confident zero*, and a
 * search box is the control people trust most to settle the question.
 *
 * So the fixture puts the needle BENEATH the hundred-entry ceiling: one entry
 * from last year, then a hundred and twenty newer ones on top of it. A
 * client-side filter cannot see it. The same shape settles the action filter:
 * the per-action counts must be the real totals, not a tally of the page.
 *
 * Staged in Postgres because the API cannot produce a hundred and twenty
 * activity rows with chosen timestamps, and doing it by a hundred and twenty
 * PATCHes would make the suite a minute long and still not date them.
 *
 *   DATABASE_URL=... node test/e2e/task-activity-filter.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 15

const REPO = path.resolve(import.meta.dirname, '../..')
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

/* `apiClient` never throws — it resolves `{status, data, error}`, so a
 * `.catch()` on it is inert. Every call is judged on `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null

const TAG = `e2e-actfilter-${Date.now()}`
/** A word no other row in a shared database can contain. */
const NEEDLE = `needle-${TAG}`
/** How many entries sit on top of the needle. Must exceed the API's limit of 100. */
const FILLERS = 120

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const me = (await A('/users/me')).data
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  if (!workspaceId) throw new Error('no workspace')

  sql = await openDb()
  if (!sql) {
    throw new Error(
      'no DATABASE_URL — this suite stages a hundred-and-twenty-deep activity log with ' +
        'chosen timestamps, which no endpoint can write',
    )
  }

  const space = (await A('/spaces', { method: 'POST', body: { workspaceId, name: `Space ${TAG}` } })).data
  const project = (await A('/projects', { method: 'POST', body: { spaceId: space.id, name: `Project ${TAG}` } })).data
  const list = (await A('/lists', { method: 'POST', body: { projectId: project.id, name: `List ${TAG}` } })).data
  const task = (await A('/tasks', { method: 'POST', body: { listId: list.id, title: `Subject ${TAG}` } })).data
  if (!task?.id) throw new Error('could not make a task')

  /*
   * The needle: one `commented` entry from last year, carrying the unique word
   * in its meta. Deliberately an action the fillers do not use, so the action
   * filter has something to find that the newest hundred do not contain either.
   */
  await sql`
    insert into task_activity (task_id, actor_id, action, meta, created_at)
    values (${task.id}, ${me.id}, 'commented',
            ${sql.json({ content: `deep ${NEEDLE} entry` })},
            '2025-03-04T09:00:00Z')`

  /*
   * Two rows that make the wildcard question answerable: `LIKE` treats `%` and
   * `_` as wildcards, so an unescaped search for "50%" matches "50x" too and
   * reports more hits than exist.
   */
  await sql`
    insert into task_activity (task_id, actor_id, action, meta, created_at)
    values (${task.id}, ${me.id}, 'updated', ${sql.json({ content: `pct50% ${TAG}` })}, '2025-03-05T09:00:00Z'),
           (${task.id}, ${me.id}, 'updated', ${sql.json({ content: `pct50x ${TAG}` })}, '2025-03-06T09:00:00Z')`

  const fillerRows = Array.from({ length: FILLERS }, (_, i) => ({
    task_id: task.id,
    actor_id: me.id,
    action: 'status_changed',
    meta: sql.json({ from: 'todo', to: 'in_progress', n: i }),
    created_at: new Date(Date.now() - (FILLERS - i) * 1000).toISOString(),
  }))
  await sql`insert into task_activity ${sql(fillerRows, 'task_id', 'actor_id', 'action', 'meta', 'created_at')}`

  // -------------------------------------------------------------------------
  console.log('\n▶ the fixture: the needle is beneath the feed\'s hundred-entry ceiling')

  const plain = await A(`/tasks/${task.id}/activity`)
  const plainRows = plain.data ?? []
  chk(
    plain.status === 200 && plainRows.length >= 100
      && !plainRows.some((r) => JSON.stringify(r.meta ?? {}).includes(NEEDLE)),
    `the unfiltered feed came back with ${plainRows.length} entries and the needle is not among them`,
    plain.status !== 200
      ? `GET /tasks/:id/activity answered ${plain.status}`
      : plainRows.length < 100
        ? `only ${plainRows.length} entries came back, so nothing here is past the ceiling`
        : 'the needle is inside the first page, so a client-side filter could find it too — ' +
          'this fixture no longer tests what it claims to',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the search narrows on the SERVER, in front of the limit')

  const found = await A(`/tasks/${task.id}/activity/search?q=${encodeURIComponent(NEEDLE)}`)
  const foundRows = found.data ?? []
  chk(
    found.status === 200 && foundRows.length === 1
      && JSON.stringify(foundRows[0]?.meta ?? {}).includes(NEEDLE),
    'searching for it finds exactly the one entry, from below a hundred and twenty newer ones',
    `the search answered ${found.status} with ${foundRows.length} rows — ` +
      'an entry past the first page is unreachable, which is the confident zero this row exists to kill',
  )

  const broad = await A(`/tasks/${task.id}/activity/search?q=${encodeURIComponent(TAG)}`)
  const broadRows = broad.data ?? []
  chk(
    broad.status === 200 && broadRows.length > 0
      && broadRows.every((r) => JSON.stringify(r.meta ?? {}).includes(TAG)),
    `a broader word returns ${broadRows.length} rows and EVERY one of them matches it`,
    broadRows.length === 0
      ? 'nothing came back at all, so "every row matches" would have been vacuously true'
      : 'rows came back that do not contain the search word — the filter is not filtering',
  )

  const wildcard = await A(`/tasks/${task.id}/activity/search?q=${encodeURIComponent('pct50%')}`)
  const wildcardRows = wildcard.data ?? []
  chk(
    wildcard.status === 200 && wildcardRows.length === 1,
    'searching "pct50%" finds one row, not two — the `%` is escaped rather than passed to LIKE',
    `it found ${wildcardRows.length} rows; an unescaped "%" matches "pct50x" as well and the ` +
      'reader is told there are more hits than there are',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the action filter, and the counts behind it')

  const actions = await A(`/tasks/${task.id}/activity/actions`)
  const actionRows = actions.data ?? []
  const statusRow = actionRows.find((r) => r.action === 'status_changed')
  chk(
    actions.status === 200 && statusRow?.count === FILLERS,
    `the actions endpoint counts ${FILLERS} \`status_changed\` entries — the real total, not the page`,
    `it reports ${statusRow?.count ?? 'nothing'} for \`status_changed\` against ${FILLERS} rows; ` +
      'a count taken from the loaded page would read 100 or fewer',
  )
  chk(
    actionRows.some((r) => r.action === 'commented' && r.count === 1),
    'and it offers `commented`, whose only occurrence is the year-old entry',
    'the `commented` action is missing from the options, so the filter cannot offer the one ' +
      'action a reader would have to scroll a year to find',
  )

  const byAction = await A(`/tasks/${task.id}/activity/search?action=commented`)
  const byActionRows = byAction.data ?? []
  chk(
    byAction.status === 200 && byActionRows.length === 1 && byActionRows[0]?.action === 'commented',
    'filtering to `commented` returns that one entry and nothing else',
    `filtering by action answered ${byAction.status} with ${byActionRows.length} rows ` +
      `(${[...new Set(byActionRows.map((r) => r.action))].join(',')})`,
  )

  const nonsense = await A(`/tasks/${task.id}/activity/search?action=not_a_real_action`)
  chk(
    nonsense.status === 200 && (nonsense.data ?? []).length === 0,
    'an action key the enum does not have answers 200 with nothing, rather than a cast error',
    `it answered ${nonsense.status} — an unknown enum member reaching the query is a 500 that ` +
      'reads as a broken server',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the panel: the two controls the frame draws beside the bell')

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  /* Every request the page makes, so "the filter went out over the wire" is a
   * measurement rather than an inference from what got rendered. */
  const requests = []
  page.on('request', (r) => requests.push(r.url()))

  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const settleCookies = async () => {
    const accept = page.locator('button:has-text("Accept")').first()
    if (await accept.isVisible().catch(() => false)) await accept.click().catch(() => {})
  }
  await settleCookies()
  await page.goto(
    `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${task.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await settleCookies()
  if (!(await waitUntil(() => page.getByTestId('task-tab-overview').isVisible().catch(() => false), { timeoutMs: 25_000 }))) {
    throw new Error('the task sheet never mounted')
  }
  await page.getByTestId('task-tab-activity').click()
  if (!(await waitUntil(() => page.getByTestId('activity-filter-bar').isVisible().catch(() => false), { timeoutMs: 20_000 }))) {
    throw new Error('the activity panel never mounted')
  }

  chk(
    await page.getByTestId('activity-search').isVisible().catch(() => false),
    'the Activity header carries the magnifier\'s search box',
    'no search input on the Activity panel',
  )
  chk(
    await page.getByTestId('activity-action-filter').isVisible().catch(() => false),
    'and the filter glyph\'s action picker',
    'no action filter on the Activity panel',
  )

  /*
   * A CACHE MISS BY CONSTRUCTION. `apps/web/src/lib/query.ts` sets a 30-second
   * `staleTime`, so asking for a key this run has already fetched fires no
   * request at all and a request-based check becomes a race with the runner.
   * The needle carries this run's timestamp, so this key has never been fetched.
   */
  requests.length = 0
  await page.getByTestId('activity-search').fill(NEEDLE)
  const count = page.getByTestId('activity-match-count')
  /* Settled, not merely in flight: a request on its way also draws 0 rows, and
   * "no matches" and "not answered yet" must not be the same measurement. */
  const settled = async (n) =>
    (await count.getAttribute('data-pending')) === 'false'
    && (await count.getAttribute('data-count')) === n
  const narrowed = await waitUntil(() => settled('1'), { timeoutMs: 20_000 })
  chk(
    narrowed,
    'typing the needle narrows the feed to the single matching entry',
    `the feed still shows ${await page.getByTestId('activity-match-count').getAttribute('data-count').catch(() => '?')} ` +
      'entries after searching for a word only one of them has',
  )

  const searchRequests = requests.filter((u) => u.includes('/activity/search') && u.includes(`q=${encodeURIComponent(NEEDLE)}`))
  chk(
    searchRequests.length > 0,
    'and it went out as a request carrying `q=` — the server did the narrowing',
    'no request carried the search term, so whatever narrowed was the array already in the browser ' +
      '— which holds a hundred entries and cannot see the needle',
  )

  /*
   * The RENDER, not just the attribute: one row on screen, and it is the
   * year-old `commented` entry. Read off `data-action` rather than the label,
   * because a missing i18n key falls back to a sibling's string and a text
   * assertion would pass on that bug.
   */
  const entries = page.getByTestId('activity-entry')
  const renderedOne = await waitUntil(async () => (await entries.count()) === 1, { timeoutMs: 15_000 })
  chk(
    renderedOne && (await entries.first().getAttribute('data-action')) === 'commented',
    'and the single row drawn is the year-old `commented` entry the search was for',
    `the feed drew ${await entries.count()} rows, the first of them ` +
      `"${await entries.first().getAttribute('data-action').catch(() => '—')}" — a count of one from the wrong row`,
  )

  console.log('\n▶ a search that matches nothing still leaves you a way out')
  await page.getByTestId('activity-search').fill(`absent-${TAG}`)
  const emptied = await waitUntil(() => settled('0'), { timeoutMs: 20_000 })
  chk(
    emptied && (await page.getByTestId('activity-filter-clear').isVisible().catch(() => false)),
    'a word nothing matches empties the feed and keeps the Clear button on screen',
    'the panel emptied and took its own filter bar with it, so the filter could not be undone',
  )

  await page.getByTestId('activity-filter-clear').click()
  const wholeFeed = async () =>
    (await count.getAttribute('data-pending')) === 'false'
    && Number(await count.getAttribute('data-count')) >= 100
  const restored = await waitUntil(wholeFeed, { timeoutMs: 20_000 })
  /*
   * AND IT HAS TO STAY BACK, which this could not tell.
   *
   * `taf-8-clear-leaves-the-search-box` removes `setSearchDraft('')` from the
   * Clear handler: the applied search is cleared, the BOX keeps the term, and
   * the 200ms debounce puts it straight back — so the feed recovers for a
   * fraction of a second and then empties again for good. `waitUntil` polls, so
   * it caught that fraction and returned true, and the patch ran green against
   * a check whose sentence is exactly the thing that is broken.
   *
   * One second is five debounce windows, so a term that is coming back has
   * come back by the time this reads the count again.
   */
  await page.waitForTimeout(1000)
  const stayed = restored && (await wholeFeed())
  chk(
    stayed,
    'and Clear brings the whole feed back',
    restored
      ? `the feed came back and then narrowed again — data-count=${await count.getAttribute('data-count')} ` +
        'a second later, so Clear reset the applied search and left the box that feeds it'
      : 'clearing the filters left the feed narrowed',
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('task-activity-filter.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  if (sql) {
    await sql`delete from tasks where title like ${'%' + TAG}`.catch(() => {})
    await sql`delete from lists where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from spaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
