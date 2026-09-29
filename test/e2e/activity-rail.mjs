/**
 * §V2-S04 — "Created `<date>`" AND THE ACTIVITY PANEL AS A RAIL, frame `03:40`.
 *
 * Two things the frame shows and Rundesk did not have:
 *
 *   · the header's right side reads `Created 7 Aug · Brain² · Share · ⋯`. The
 *     API had returned `createdAt` since `getTask` was written; nothing asked
 *     for it, so a task could not tell you how old it was without opening the
 *     activity feed and scrolling to the end of it.
 *
 *   · "**Activity panel is toggleable** (button top-right of the task)", and at
 *     `01:20` the feed sits to the RIGHT of the task while the field grid is
 *     still on screen. Rundesk had it as a TAB, which makes reading the history
 *     and reading the fields two different screens — so "You estimated 12
 *     hours" could never be read beside the estimate it changed.
 *
 * THE CHECK THAT MATTERS MOST is the last pair: the field grid and an activity
 * entry visible AT THE SAME MOMENT. Everything else here could pass on a build
 * that just renamed the tab.
 *
 * IT WAS ONE CHECK AND IT COULD PASS ON EXACTLY THAT BUILD. It counted rendered
 * field cells and matched text inside the rail, which is true of a rail sitting
 * 965px down a 1000px viewport with 35 pixels of itself on screen —
 * `arail-3-the-rail-goes-under-the-fields` walked through it. Rendered is not
 * readable, and below the fold is the tab again with extra scrolling. So it is
 * two checks now: both rendered, and both inside the viewport.
 *
 * AND THE ONE THAT PROTECTS THE CHIP. A chip reading "Created <today>" passes
 * any presence check while being wrong for every task older than this morning.
 * So the task is seeded with a creation date in the past and the chip has to
 * show THAT date and not today's.
 *
 *   node test/e2e/activity-rail.mjs --api 3011 --dist apps/web/dist
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
const EXPECTED_CHECKS = 13

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
const TAG = `e2e-rail-${Date.now()}`

/* A creation date well in the past, and not near a month boundary. */
const CREATED_AT = '2026-08-07T10:00:00Z'

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite seeds a task with a known creation date')

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`
    insert into tasks (list_id, title, created_at)
    values (${list.id}, ${`Rail subject ${TAG}`}, ${CREATED_AT}) returning id`

  /*
   * ONE ACTIVITY ENTRY CARRYING A STRING UNIQUE TO THIS TASK. "You created this
   * task" would appear on any task's feed, so a rail wired to the wrong id
   * would still satisfy a check written against it. A checklist item's name
   * cannot be produced by accident.
   */
  const ITEM = `rail witness ${TAG}`
  const checklist = await A(`/tasks/${task.id}/checklists`, {
    method: 'POST',
    body: { title: `Checklist ${TAG}` },
  })
  const checklistId = checklist.data?.id
  if (!checklistId) throw new Error(`could not seed a checklist: ${checklist.status}`)
  const item = await A(`/tasks/${task.id}/checklists/${checklistId}/items`, {
    method: 'POST',
    body: { content: ITEM },
  })
  if (item.status >= 400) throw new Error(`could not seed a checklist item: ${item.status}`)

  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
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

  const openTask = async () => {
    await page.goto(
      `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${task.id}`,
      { waitUntil: 'domcontentloaded' },
    )
    await settleCookies()
    /*
     * WAIT then act — never `if (visible) click`. A conditional that fires
     * before the sheet has mounted skips silently, and the first check then
     * reads as "the product does not have this".
     */
    const ready = await waitUntil(
      () => page.getByTestId('task-tab-overview').isVisible().catch(() => false),
      { timeoutMs: 25_000 },
    )
    if (!ready) throw new Error('the task sheet never mounted')
    await settleCookies()
  }

  await openTask()

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `03:40` — "Created `<date>`" on the header')

  const chipText = await readText(page.getByTestId('task-created-chip').filter({ visible: true }))
  chk(
    chipText.trim().length > 0,
    `the header carries a created-date chip — "${chipText.trim()}"`,
    'no created-date chip; the API has returned `createdAt` all along and the header never asked',
  )

  /*
   * AND IT IS THE TASK'S DATE. The seeded task was created in August; a chip
   * that renders "now" would pass the check above on every task in the product
   * while being wrong about all but the newest.
   */
  /*
   * PARSED, NOT SUBSTRING-MATCHED. This used to ask whether the chip text
   * CONTAINED today's day-of-month, which is true of "8/7/2026" on the 20th of
   * any month — because the year carries "20". It also matched on the 2nd, the
   * 6th and the 26th. A check that fails on four days in thirty is not a check,
   * it is a calendar, and it reported the failure as "it is rendering the
   * current date" while the chip was right.
   *
   * The numbers are pulled out and compared as numbers, with the year dropped
   * so it cannot stand in for a day.
   */
  const seeded = new Date(CREATED_AT)
  const todayYmd = new Date()
  const nums = (chipText.match(/\d+/g) ?? []).map(Number)
  const dayish = nums.filter((n) => n !== seeded.getFullYear() && n !== todayYmd.getFullYear())
  const hasSeededDay = dayish.includes(seeded.getDate())
  const looksLikeToday =
    dayish.includes(todayYmd.getDate()) && todayYmd.getDate() !== seeded.getDate()
  chk(
    hasSeededDay && !looksLikeToday,
    'and it shows when the task was really created, not today',
    `the chip reads "${chipText.trim()}" for a task created ${CREATED_AT} — it is ` +
      'rendering the current date rather than the task\'s',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ "Activity panel is toggleable (button top-right of the task)"')

  const toggle = page.getByTestId('task-activity-rail-toggle')
  chk(
    await toggle.isVisible().catch(() => false),
    'the header has the toggle the frame names',
    'no toggle — the activity feed is a tab and nothing else',
  )

  /*
   * MEASURED ON THE PANEL ITSELF, via a testid added to `SheetContent` for it.
   * The first version selected `[role=dialog]` — which this sheet does not set,
   * so `boundingBox()` came back null and the check compared 0 with 0 and
   * failed while the behaviour was correct.
   */
  const sheet = page.getByTestId('task-sheet')
  const widthOf = async () => (await sheet.boundingBox().catch(() => null))?.width ?? 0
  const widthBefore = await widthOf()

  await toggle.click({ timeout: 10_000 }).catch(() => {})
  chk(
    await waitUntil(() => page.getByTestId('task-activity-rail').isVisible().catch(() => false), {
      timeoutMs: 15_000,
    }),
    'turning it on puts the activity panel on screen as a rail',
    'the toggle changed nothing',
  )

  /*
   * THE RAIL SHOWS THIS TASK'S HISTORY. A column with a heading and no feed in
   * it is the facade; the witness string is what makes this about the data.
   */
  chk(
    await waitUntil(
      async () => (await readText(page.getByTestId('task-activity-rail').filter({ visible: true }))).includes(ITEM),
      { timeoutMs: 20_000 },
    ),
    'and the rail is showing this task\'s own activity',
    `the rail does not mention "${ITEM}" — it is a heading over nothing, or over ` +
      'somebody else\'s feed',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ one feed, in one place')

  /*
   * The tab has to GO while the rail is up. The same feed rendered twice is the
   * duplicated-list bug wearing a new hat, and a reader looking at the rail has
   * no use for a tab that shows them the same thing.
   */
  chk(
    !(await page.getByTestId('task-tab-activity').isVisible().catch(() => false)),
    'the Activity tab comes out of the strip while the rail is up',
    'both the tab and the rail render the feed — the same list in two places',
  )

  /*
   * WAITED FOR, not sampled — and with a real margin. The sheet animates its
   * max-width, so the first version compared a transitioning value: it caught
   * 672px, failed, and then re-measured 685px for the failure message. That is
   * the "sampled at a moment instead of waiting for a condition" mistake this
   * repo's `wait.mjs` opens by describing, made again. 300px is far more than a
   * transition frame and far less than the 672→1440 this is asserting.
   */
  const widened = await waitUntil(async () => (await widthOf()) > widthBefore + 300, {
    timeoutMs: 15_000,
  })
  chk(
    widened,
    'and the sheet widens to make room for it',
    `the sheet is ${await widthOf()}px (was ${widthBefore}px) — a 672px sheet ` +
      'split in two leaves neither half readable',
  )

  /*
   * BESIDE, not below. "A rail" is a claim about layout, and a column stacked
   * under the panel is the tab again with extra scrolling. So: the rail starts
   * to the right of the panel, and their vertical extents overlap.
   */
  const panelBox = await page.getByTestId('task-tab-panel').boundingBox().catch(() => null)
  const railBox = await page.getByTestId('task-activity-rail').boundingBox().catch(() => null)
  const sideBySide = !!panelBox && !!railBox
    && railBox.x >= panelBox.x + panelBox.width - 2
    && railBox.y < panelBox.y + panelBox.height
  chk(
    sideBySide,
    'and it sits BESIDE the panel rather than under it',
    `panel ${JSON.stringify(panelBox)} vs rail ${JSON.stringify(railBox)} — stacked ` +
      'below is the tab again, with extra scrolling',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ the point of a rail: fields AND history at once')

  /*
   * THE LOAD-BEARING CHECK. Every check above could pass on a build that simply
   * renamed the Activity tab; this one cannot. The Overview panel's field grid
   * and an activity entry have to be readable in the same instant.
   */
  const bothAtOnce = await waitUntil(async () => {
    const fieldsShowing = (await page.getByTestId('task-field').count())
      + (await page.getByTestId('task-field-empty').count()) > 0
    const activityShowing = (await readText(page.getByTestId('task-activity-rail').filter({ visible: true }))).includes(ITEM)
    return fieldsShowing && activityShowing
  }, { timeoutMs: 20_000 })
  chk(
    bothAtOnce,
    'the field grid and the activity feed are both rendered at once',
    'the rail is up but the fields are not showing beside it — which is the tab ' +
      'again, with a different name',
  )

  /*
   * AND BOTH ARE ON SCREEN, which is what "at once" meant and what this check
   * did not measure.
   *
   * The comment above claims "readable in the same instant" and said "every
   * check above could pass on a build that simply renamed the Activity tab;
   * this one cannot". It could. `arail-3-the-rail-goes-under-the-fields`
   * deletes `lg:flex-row` and the rail lands at y≈965 in a 1000px viewport —
   * 35 pixels of it on screen, below a field grid that fills the rest. Both
   * elements RENDER, both match, and the check passed. Rendered is not
   * readable, and below the fold is the tab again with extra scrolling.
   *
   * So the geometry is asserted: a readable strip of the rail inside the
   * viewport, with the fields inside it too.
   */
  const vp = page.viewportSize()
  const fieldBox = await page.getByTestId('task-field').first().boundingBox().catch(() => null)
  const railOnScreen = await page.getByTestId('task-activity-rail').boundingBox().catch(() => null)
  const STRIP = 80
  chk(
    !!vp && !!fieldBox && !!railOnScreen &&
      fieldBox.y >= 0 && fieldBox.y < vp.height &&
      railOnScreen.y >= 0 && railOnScreen.y + STRIP <= vp.height,
    `and both are inside the ${vp?.height}px viewport without scrolling`,
    `fields at y=${fieldBox?.y}, rail at y=${railOnScreen?.y} in a ${vp?.height}px viewport — ` +
      'a rail below the fold is the Activity tab with extra steps',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ and it is remembered, and reversible')

  await openTask()
  chk(
    await waitUntil(() => page.getByTestId('task-activity-rail').isVisible().catch(() => false), {
      timeoutMs: 20_000,
    }),
    'a reload still shows the rail — the preference is remembered',
    'the rail is gone after a reload; the toggle is this-session-only',
  )

  /*
   * A READER SITTING ON THE ACTIVITY TAB when the rail comes on has to be moved
   * somewhere, and Overview is the answer: that is the pairing the rail exists
   * for. Getting left on a tab that no longer exists is a blank panel.
   */
  await page.getByTestId('task-activity-rail-toggle').click({ timeout: 10_000 }).catch(() => {})
  const tabBack = await waitUntil(
    () => page.getByTestId('task-tab-activity').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  await page.getByTestId('task-tab-activity').click({ timeout: 15_000 })
  await page.getByTestId('task-activity-rail-toggle').click({ timeout: 10_000 }).catch(() => {})
  const movedToOverview = await waitUntil(async () => {
    if (!(await page.getByTestId('task-activity-rail').isVisible().catch(() => false))) return false
    return (await page.getByTestId('task-field').count())
      + (await page.getByTestId('task-field-empty').count()) > 0
  }, { timeoutMs: 20_000 })
  chk(
    tabBack,
    'turning the rail off brings the Activity tab back',
    'the tab does not return — turning the rail off loses the feed entirely',
  )
  chk(
    movedToOverview,
    'and turning it on from the Activity tab lands you on Overview, not on nothing',
    'the reader was left on a tab that no longer exists, so the panel is blank',
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('activity-rail.mjs'))
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
