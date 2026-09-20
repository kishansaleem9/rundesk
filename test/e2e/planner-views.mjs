/**
 * §V2-S14c — THE PLANNER'S SPAN SELECTOR, frame `13:50`.
 *
 * The frame shows **Day (d) · 4 days (x) · Week (w) · Month (m)** with those
 * single-key shortcuts, and a **Show weekends** toggle beside them.
 *
 * The Planner drew a seven-day week and nothing else — `Array.from({length: 7})`
 * — with the arrows hardcoded to ±7 days. There was no selector at all.
 *
 * WHAT THIS SUITE IS REALLY CHECKING. A span selector is easy to build wrongly
 * in ways that photograph fine:
 *
 *   · the label changes and the grid does not;
 *   · the grid changes and the ARROWS still move a week, so Month shows the
 *     same fortnight twice;
 *   · the grid changes and the FETCH still asks for a week, so twenty-three
 *     days of a month look genuinely empty (this one was real — the range came
 *     from `weekStart` while the grid came from the view);
 *   · the shortcut fires while you are typing in the person search.
 *
 * There is a check for each. The date arithmetic itself is covered by unit
 * tests in `apps/web/src/lib/planner-view.test.ts`, which is where off-by-one
 * belongs; this suite is about the four things above.
 *
 *   node test/e2e/planner-views.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 11

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
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
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

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null
const TAG = `e2e-views-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite stages a block late in the month')

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Late month ${TAG}`}) returning id`

  /*
   * A BLOCK ON THE 28th OF THIS MONTH — outside the current week unless today
   * happens to be near it, which is the point: it is the day that proves the
   * FETCH follows the view rather than the week. If the 28th is inside this
   * week, the 1st is used instead; one of the two is always far away.
   */
  const now = new Date()
  const far = new Date(now.getFullYear(), now.getMonth(), Math.abs(now.getDate() - 28) > 8 ? 28 : 1)
  far.setHours(10, 0, 0, 0)
  const farEnd = new Date(far.getTime() + 60 * 60 * 1000)
  const meId = (await A('/users/me')).data.id
  await sql`
    insert into task_time_blocks (workspace_id, user_id, task_id, title, starts_at, ends_at, is_all_day)
    values (
      ${workspaceId}, ${meId}, ${task.id}, ${`Late month ${TAG}`},
      ${far.toISOString()}, ${farEnd.toISOString()}, false
    )`

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
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
  await page.goto(`${stack.base}/app/${workspaceId}/calendar`, { waitUntil: 'domcontentloaded' })
  await waitUntil(() => page.getByTestId('planner-view-selector').isVisible().catch(() => false), {
    timeoutMs: 25_000,
  })
  await settleCookies()

  const columns = () => page.getByTestId('planner-day-header').count()

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `13:50` — all four spans are offered')

  const wanted = ['day', 'four', 'week', 'month']
  const there = []
  for (const v of wanted) {
    if (await page.getByTestId(`planner-view-${v}`).isVisible().catch(() => false)) there.push(v)
  }
  chk(
    there.length === 4,
    'Day, 4 days, Week and Month are all there',
    `only ${there.join(', ') || 'none'} — the frame lists four`,
  )
  chk(
    await page.getByTestId('planner-weekends-toggle').isVisible().catch(() => false),
    'and "Show weekends" sits with them',
    'the weekends toggle is only in settings; the frame puts it beside the spans',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ choosing a span changes the GRID, not just the label')

  await page.getByTestId('planner-view-day').click()
  chk(
    await waitUntil(async () => (await columns()) === 1, { timeoutMs: 10_000 }),
    'Day draws one column',
    `Day drew ${await columns()} columns — the label moved and the grid did not`,
  )

  await page.getByTestId('planner-view-four').click()
  chk(
    await waitUntil(async () => (await columns()) === 4, { timeoutMs: 10_000 }),
    '4 days draws four',
    `"4 days" drew ${await columns()} columns`,
  )

  await page.getByTestId('planner-view-month').click()
  chk(
    await waitUntil(() => page.getByTestId('planner-month-grid').isVisible().catch(() => false), {
      timeoutMs: 10_000,
    }),
    'and Month draws a month grid rather than thirty columns of hour gutter',
    'Month reused the time grid — at that width every block is an unreadable sliver',
  )
  const cells = await page.getByTestId('planner-month-cell').count()
  chk(
    cells >= 28,
    `the month grid has a cell for every day (${cells})`,
    `it drew ${cells} day cells`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ THE FETCH FOLLOWS THE VIEW — the bug this nearly shipped with')

  /*
   * The block is on a day outside the current week. The range used to be
   * computed from `weekStart`, so in Month view the grid asked for seven days
   * and drew thirty: the other twenty-three looked empty, and nothing anywhere
   * said otherwise.
   */
  chk(
    await waitUntil(
      async () => (await readText(page.getByTestId('planner-month-grid'))).includes(`Late month ${TAG}`),
      { timeoutMs: 15_000 },
    ),
    'a block late in the month is actually fetched and drawn',
    'the month drew empty cells for days it never asked the server about',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the arrows move ONE SPAN, not always a week')

  // The header's month name is the thing that must change; `planner-month` is
  // that label (the grid is `planner-month-grid` — they used to share a testid,
  // which is how this check first failed against working code).
  const before = await readText(page.getByTestId('planner-month'))
  await page.getByTestId('planner-next').click()
  chk(
    await waitUntil(async () => (await readText(page.getByTestId('planner-month'))) !== before, {
      timeoutMs: 10_000,
    }),
    'next in Month view moves to a different month',
    'the arrow moved a week inside a month view, so it shows the same fortnight twice',
  )
  await page.getByTestId('planner-prev').click()

  // -------------------------------------------------------------------------
  console.log('\n▶ the shortcuts the frame prints, and where they must not fire')

  await page.getByTestId('planner-view-week').click()
  await waitUntil(async () => (await columns()) >= 5, { timeoutMs: 10_000 })
  await page.keyboard.press('d')
  chk(
    await waitUntil(async () => (await columns()) === 1, { timeoutMs: 10_000 }),
    '"d" switches to Day',
    `after pressing "d" the grid had ${await columns()} columns`,
  )

  /*
   * AND NOT WHILE TYPING. The rail has a person search and a priority box; a
   * bare "w" that jumped the calendar mid-word would make both unusable.
   */
  const TYPED = 'week ahead'
  await page.getByTestId('planner-priority-input').fill('')
  await page.getByTestId('planner-priority-input').pressSequentially(TYPED, { delay: 30 })

  /*
   * THE CHECK IS ON THE TEXT THAT ARRIVED, and it took two wrong versions to
   * get here — both worth recording, because both passed against a build with
   * the typing guard removed.
   *
   * The first read the column count on the line after typing: the assertion
   * simply ran before React re-rendered. The second gave it time, and still
   * passed — because "week ahead" contains BOTH shortcut letters, `w` and `d`,
   * and `d` comes last. The span bounced to Week and back to Day and ended
   * exactly where it started. My own fixture defeated my own check.
   *
   * The input's value cannot be fooled that way. The handler calls
   * `preventDefault`, so an unguarded shortcut EATS the character: on the
   * broken build this field reads "eek ahea".
   */
  const arrived = await page.getByTestId('planner-priority-input').inputValue()
  chk(
    arrived === TYPED,
    `typing "${TYPED}" into the rail types "${TYPED}" — the shortcuts stay out of the way`,
    `the field received "${arrived}" — the span shortcuts swallowed the letters they share ` +
      'with the word, so the box cannot be typed in at all',
  )
  const jumped = await waitUntil(async () => (await columns()) !== 1, { timeoutMs: 1_500 })
  chk(
    !jumped,
    'and the span is where it was',
    `the grid jumped to ${await columns()} columns while a word was being typed`,
  )
} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
} finally {
  if (sql) {
    await sql`delete from task_time_blocks where task_id in (select id from tasks where title like ${'%' + TAG})`.catch(() => {})
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
