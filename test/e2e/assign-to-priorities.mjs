/**
 * §V2-S16 — THE ASSIGN → PRIORITIES CHAIN, frames `15:50`–`16:05`.
 *
 * The walkthrough's own words for it are the `[15:47]`–`[16:19]` chain, and it
 * has four links:
 *
 *   `15:50`  assigning offers: "Add this task to … priorities?" with
 *            **Don't ask again** / **Add to priorities →**
 *   `15:55`  a toast, "Task added to your Priorities.", with **Open Priorities**
 *   `16:05`  the task is sitting in the Planner's Priorities rail, with a Done
 *            button and a "1 Priority" counter
 *
 * Rundesk had none of the four. Assigning wrote an assignee and stopped.
 *
 * WHY THE PROMPT ONLY APPEARS FOR YOURSELF. The frame's prompt names the
 * assignee ("…to Hamda Tahir's priorities?") and the toast that follows says
 * "your Priorities" — she was assigning to herself. Priorities are written
 * through `POST /workspaces/:id/priorities`, which deliberately takes no
 * `:userId`; `PrioritiesController` says routing it under `/people/:userId`
 * "would invite a client to pass somebody else's id and expect it to work".
 * Filling a colleague's day is a permission this product has not given, so the
 * prompt does not offer it. That is checked here, not assumed: assigning a
 * teammate must NOT raise the prompt.
 *
 * WHAT MAKES THE CHAIN EASY TO FAKE. Each link photographs fine on its own — a
 * prompt that appears, a toast that says a thing happened, a rail with a row in
 * it. So every check here crosses a boundary: the prompt is followed to the
 * server, the toast's link is followed to the Planner, and the rail is read for
 * THAT task rather than for any row at all.
 *
 *   node test/e2e/assign-to-priorities.mjs --api 3011 --dist apps/web/dist
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
const EXPECTED_CHECKS = 10

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
const TAG = `e2e-a2p-${Date.now()}`
let A = null
let workspaceId = null
const myPriorities = () => A(`/workspaces/${workspaceId}/priorities`)

try {
  const auth = await signInApi(API, ME.email, ME.password)
  A = apiAs(auth.accessToken)
  const me = (await A('/users/me')).data
  /*
   * ITS OWN WORKSPACE, so the fixture is two people rather than whatever the
   * shared one has accumulated. When this was written the assignee control was
   * a row of the first EIGHT members with no search, and the shared workspace
   * had seventy-odd — so "click your own chip" was a bet on sort order. §V2-S17
   * gave the picker a search box; the isolation is kept because a fixture that
   * depends on other suites' leftovers is a fixture that fails on its own.
   */
  const madeWorkspace = await A('/workspaces', {
    method: 'POST',
    body: { name: `WS ${TAG}` },
  })
  workspaceId = madeWorkspace.data?.id
  if (!workspaceId) throw new Error(`could not create a workspace: ${JSON.stringify(madeWorkspace.error)}`)

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite stages tasks directly')

  for (const p of (await myPriorities()).data ?? []) {
    await A(`/workspaces/${workspaceId}/priorities/${p.id}`, { method: 'DELETE' })
  }

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Chain subject ${TAG}`}) returning id`
  const [other] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Teammate subject ${TAG}`}) returning id`
  const [muteTask] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Mute subject ${TAG}`}) returning id`
  const [afterMuteTask] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`After mute ${TAG}`}) returning id`

  /* A second real person, so "only for yourself" has somebody to not-prompt for. */
  const mateEmail = `mate-${Date.now()}@rundesk.invalid`
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: mateEmail, displayName: `Mate ${TAG}`, password: 'Teammate@123!' }),
  })
  if (!reg.ok) throw new Error(`could not register a teammate: ${reg.status}`)
  await A(`/workspaces/${workspaceId}/members`, { method: 'POST', body: { email: mateEmail, role: 'member' } })
  const mateId = ((await A(`/workspaces/${workspaceId}/members`)).data ?? [])
    .find((m) => m.email === mateEmail)?.userId
  if (!mateId) throw new Error('the teammate did not join the workspace')

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })

  /*
   * The privacy banner sits bottom-right and swallows clicks meant for what is
   * behind it. Dismissed the way a person dismisses it rather than hidden with
   * CSS, so the app is in the state it is actually used in.
   */
  const settleCookies = async () => {
    const accept = page.locator('button:has-text("Accept")').first()
    if (await accept.isVisible().catch(() => false)) await accept.click().catch(() => {})
  }
  await settleCookies()

  const openTask = async (id) => {
    await page.goto(
      `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${id}`,
      { waitUntil: 'domcontentloaded' },
    )
    await waitIty()
    await settleCookies()
  }
  const waitIty = () =>
    waitUntil(() => page.getByTestId('task-tab-overview').isVisible().catch(() => false), {
      timeoutMs: 25_000,
    })

  /*
   * §V2-S17 moved assignment behind a picker with a search box, so the member
   * rows exist only once it is open. By user id rather than display name: a
   * name match is a bet on where somebody sorts.
   */
  const assignChip = async (userId) => {
    const row = page.getByTestId(`assign-member-${userId}`)
    if (!(await row.isVisible().catch(() => false))) {
      await page.getByTestId('assignee-picker-open').click({ timeout: 20_000 })
      await waitUntil(() => row.isVisible().catch(() => false), { timeoutMs: 10_000 })
    }
    return row
  }

  await openTask(task.id)

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `15:50` — assigning yourself offers the priority')

  await (await assignChip(me.id)).click({ timeout: 20_000 })
  chk(
    await waitUntil(
      () => page.getByTestId('priority-prompt').isVisible().catch(() => false),
      { timeoutMs: 15_000 },
    ),
    'assigning the task to yourself raises the prompt',
    'nothing was offered — assigning writes an assignee and the chain stops there',
  )

  const promptText = await readText(page.getByTestId('priority-prompt'))
  chk(
    /priorit/i.test(promptText) &&
      /don.t ask again/i.test(promptText),
    'and it offers both ways out the frame shows',
    `the prompt read: ${promptText}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `15:55` — taking it reaches the server, and says where it went')

  await page.getByTestId('priority-prompt-add').click()

  /*
   * THE TOAST IS READ FIRST, and its text captured immediately. A toast lives
   * about four seconds; asserting it after a fifteen-second poll of the server
   * means a failure anywhere earlier reports as "no toast" too, and three
   * checks then describe one bug.
   */
  const toast = page.locator('[data-sonner-toast]').first()
  chk(
    await waitUntil(() => toast.isVisible().catch(() => false), { timeoutMs: 10_000 }),
    'a toast confirms it',
    'the write happened silently — the frame shows a confirmation',
  )
  const toastText = (await readText(toast)).toLowerCase()
  chk(
    toastText.includes('priorities') && /open priorities/i.test(toastText),
    'and the toast offers to open Priorities',
    `the toast read: ${toastText} — "added" with no way to look is a claim taken on trust`,
  )

  /*
   * THE TOAST IS PRESSED BEFORE THE SERVER IS POLLED, and the order is the
   * check's own comment finally applied all the way.
   *
   * It already said "a toast lives about four seconds; asserting it after a
   * fifteen-second poll of the server means a failure anywhere earlier reports
   * as 'no toast' too" — and it moved the toast's TEXT above the poll and left
   * the toast's CLICK below it. So any patch that makes the poll time out also
   * kills the three checks after it: `a2p-3-priority-copies-the-title` was
   * predicted to redden one check and reddened two, stopping the run at 6 of
   * 10, because the fifteen seconds spent not finding the priority outlived
   * the toast it then tried to press.
   *
   * Pressing it first costs nothing — the server poll does not need the page,
   * and the rail read below needs the navigation this click performs.
   */
  console.log('\n▶ frame `16:05` — the link lands on the rail, with the task in it')

  await toast.getByRole('button').first().click()
  chk(
    await waitUntil(() => /\/calendar$/.test(page.url()), { timeoutMs: 15_000 }),
    'the link goes to the Planner',
    `it ended up at ${page.url()}`,
  )

  let stored = []
  chk(
    await waitUntil(async () => {
      stored = (await myPriorities()).data ?? []
      return stored.some((p) => p.taskId === task.id)
    }, { timeoutMs: 15_000 }),
    'the task is on your priorities, by id — not a copy of its title',
    `the priorities list held: ${stored.map((p) => `${p.title}(${p.taskId ?? 'no task'})`).join(' | ') || '(empty)'}`,
  )
  const railText = await readText(page.getByTestId('planner-priorities'))
  chk(
    railText.includes(`Chain subject ${TAG}`),
    'and THAT task is in the Priorities rail',
    `the rail held: ${railText.slice(0, 160)}`,
  )
  chk(
    /\b1\b/.test(await readText(page.getByTestId('planner-priority-count'))),
    'with the counter the frame shows',
    `the counter read "${await readText(page.getByTestId('planner-priority-count'))}"`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ "Don\'t ask again" is a preference, not a dismiss button')

  /*
   * Without this check the mute button is a label: it closes the prompt, which
   * is what dismissing does anyway, and the difference only shows on the NEXT
   * assignment. So the check is on a different task, after a full page load.
   */
  await openTask(muteTask.id)
  await (await assignChip(me.id)).click({ timeout: 20_000 })
  await waitUntil(
    () => page.getByTestId('priority-prompt').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  await page.getByTestId('priority-prompt-mute').click()

  await openTask(afterMuteTask.id)
  await (await assignChip(me.id)).click({ timeout: 20_000 })
  await page.waitForTimeout(1500)
  chk(
    !(await page.getByTestId('priority-prompt').isVisible().catch(() => false)),
    'after "Don\'t ask again", assigning stops offering',
    'the prompt came back on the next task — the button dismissed it and remembered nothing',
  )

  // Un-mute, so the last check below is not passing for the wrong reason.
  await page.evaluate(() => window.localStorage.removeItem('rundesk.priorityPromptOff'))

  // -------------------------------------------------------------------------
  console.log('\n▶ and it does NOT offer to fill a colleague\'s day')

  /*
   * The API takes no user id on the write, deliberately. A prompt that appeared
   * here would be offering something the product cannot do, and the person
   * whose day it claimed to fill would never know.
   */
  await openTask(other.id)
  await (await assignChip(mateId)).click({ timeout: 20_000 })
  await page.waitForTimeout(1500)
  chk(
    !(await page.getByTestId('priority-prompt').isVisible().catch(() => false)),
    'assigning a teammate raises no prompt',
    'it offered to add the task to someone else\'s priorities — a permission the API does not grant',
  )
} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
} finally {
  if (A && workspaceId) {
    for (const p of (await myPriorities()).data ?? []) {
      await A(`/workspaces/${workspaceId}/priorities/${p.id}`, { method: 'DELETE' }).catch(() => {})
    }
  }
  if (sql) {
    await sql`delete from tasks where title like ${'%' + TAG}`.catch(() => {})
    await sql`delete from lists where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from spaces where name like ${'%' + TAG}`.catch(() => {})
    /*
     * AND THE WORKSPACE. This suite creates one (`WS <TAG>`) and used to leave
     * it behind, so the shared admin account gained one more per run, for ever.
     * That matters because 46 other suites pick their workspace with
     * `workspaces[0]` — a POSITION, not an identity — and the meaning of
     * element zero drifts as the list grows. It is the mechanism behind the
     * `save-comment` 403 fixed in 5b30bd1, which surfaced as a privacy failure
     * when nothing about privacy was wrong.
     */
    await sql`delete from workspaces where name like ${'%' + TAG}`.catch(() => {})
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
