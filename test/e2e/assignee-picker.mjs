/**
 * §V2-S17 — THE ASSIGNEE PICKER, frame `15:45`.
 *
 * The frame shows a picker with a search box — *"Search or enter email…"* — a
 * **People** section with **Me** at the top, **"Invite people via email"**, an
 * **Agents** section with **+ Create Agent**, and a footer **"⚡ Assign with
 * AI"**.
 *
 * WHAT WAS THERE. `availableMembers.slice(0, 8)` rendered as chips. Eight. No
 * search, no email entry, and nothing to say anybody else existed — so in a
 * workspace with seventy members, sixty-odd of them could not be assigned to a
 * task at all. This is the sharpest kind of defect in this codebase: the
 * control was not slow or awkward, it was INCAPABLE, and it photographed as
 * finished. It was found by accident, when the previous item's suite could not
 * click the admin's own chip.
 *
 * SO THE LOAD-BEARING CHECK HERE IS THE NINTH MEMBER. The fixture puts twelve
 * people in a workspace and assigns the one that sorts last — which the old
 * chip row could not reach however long you looked at it.
 *
 * NOT BUILT, ON PURPOSE, both recorded in the re-audit:
 *   · **Agents / + Create Agent** — Rundesk has no agents. `ai.service.ts`
 *     already says so about this same frame's Agent filter: a control over a
 *     product with no agents "can only ever return everything".
 *   · **"⚡ Assign with AI"** — half of it exists (`assign_task` is a real
 *     tool, previewed and executed) and the half that does not is the whole
 *     point of the button: CHOOSING the person. A button that returns an
 *     arbitrary colleague with a confident label is worse than no button.
 *
 * AGAINST THE REAL STACK, in its own workspace, because the fixture is a
 * membership list and the invite path is permission-gated server-side.
 *
 *   node test/e2e/assignee-picker.mjs --api 3011 --dist apps/web/dist
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
const TAG = `e2e-pick-${Date.now()}`

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const me = (await A('/users/me')).data

  const made = await A('/workspaces', { method: 'POST', body: { name: `WS ${TAG}` } })
  const workspaceId = made.data?.id
  if (!workspaceId) throw new Error(`could not create a workspace: ${JSON.stringify(made.error)}`)

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite stages a task directly')

  const [space] = await sql`
    insert into spaces (workspace_id, name) values (${workspaceId}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`
    insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`
    insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`
    insert into tasks (list_id, title) values (${list.id}, ${`Pick subject ${TAG}`}) returning id`

  /*
   * TWELVE people, so the ninth is a real person and not a rounding argument.
   * Named with a leading letter that sorts late, and the one this suite assigns
   * is deliberately the LAST of them.
   */
  const mates = []
  for (let i = 0; i < 12; i += 1) {
    const email = `zz${i}-${Date.now()}@rundesk.invalid`
    const reg = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        displayName: `Zebra ${String(i).padStart(2, '0')} ${TAG}`,
        password: 'Teammate@123!',
      }),
    })
    if (!reg.ok) throw new Error(`could not register mate ${i}: ${reg.status}`)
    await A(`/workspaces/${workspaceId}/members`, { method: 'POST', body: { email, role: 'member' } })
    mates.push(email)
  }
  const roster = (await A(`/workspaces/${workspaceId}/members`)).data ?? []
  chk(
    roster.length >= 13,
    `the workspace holds ${roster.length} people — more than a chip row can show`,
    `only ${roster.length} members were staged; the point of this suite is a list longer than eight`,
  )
  const lastMate = roster.find((m) => m.email === mates[mates.length - 1])
  if (!lastMate) throw new Error('the twelfth teammate did not join')

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
  await page.goto(
    `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${task.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await waitUntil(() => page.getByTestId('task-tab-overview').isVisible().catch(() => false), {
    timeoutMs: 25_000,
  })
  await settleCookies()

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `15:45` — there is a picker, with a search box')

  chk(
    await waitUntil(
      () => page.getByTestId('assignee-picker-open').isVisible().catch(() => false),
      { timeoutMs: 20_000 },
    ),
    'the assignee field offers a picker',
    'assignment is still a row of chips with no way in',
  )
  await page.getByTestId('assignee-picker-open').click()
  chk(
    await waitUntil(
      () => page.getByTestId('assignee-search').isVisible().catch(() => false),
      { timeoutMs: 10_000 },
    ),
    'and it opens on a search box',
    'the picker has no search — which is what made a long member list unusable',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ Me comes first, as the frame has it')

  const firstRow = await readText(page.locator('[data-testid^="assign-member-"]').first())
  chk(
    firstRow.toLowerCase().includes((me.displayName || me.email).toLowerCase()),
    'the first person offered is you',
    `the first row read "${firstRow}" — most assignments are to yourself and the frame puts Me on top`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ EVERYBODY IS REACHABLE, and the search actually narrows')

  /*
   * THE FIRST VERSION OF THIS CHECK WAS VACUOUS and a break-test caught it.
   * It searched for the twelfth member and asserted the row appeared — which
   * passed with filtering removed and the list capped at eight, because that
   * member happened to sort inside the first eight anyway. "It appeared" is
   * not evidence when it would have appeared regardless.
   *
   * Two checks that cannot pass on the old behaviour:
   *   · with no query, the picker lists the WHOLE roster, not a fixed eight;
   *   · with a query matching exactly one person, it renders exactly one row.
   */
  const rowCount = () => page.locator('[data-testid^="assign-member-"]').count()
  const unfiltered = await rowCount()
  chk(
    unfiltered >= roster.length - 1,
    `all ${unfiltered} assignable members are listed, not a fixed eight`,
    `the picker listed ${unfiltered} of ${roster.length - 1} assignable members — ` +
      'a list that silently stops is the defect this replaced',
  )

  await page.getByTestId('assignee-search').fill(lastMate.displayName)
  const row = page.getByTestId(`assign-member-${lastMate.userId}`)
  chk(
    await waitUntil(async () => (await row.isVisible().catch(() => false)) && (await rowCount()) === 1,
      { timeoutMs: 10_000 }),
    'and searching a single person narrows the list to exactly them',
    `searching "${lastMate.displayName}" left ${await rowCount()} rows on screen — ` +
      'a search box that does not filter is a search box in name only',
  )

  await row.click()
  chk(
    await waitUntil(async () => {
      const rows = await sql`
        select 1 from task_assignees where task_id = ${task.id} and user_id = ${lastMate.userId}`
      return rows.length > 0
    }, { timeoutMs: 15_000 }),
    'and picking them really assigns the task',
    'the row closed the picker and assigned nobody',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ an unknown email is an invitation, not a dead end')

  await page.getByTestId('assignee-picker-open').click()
  await waitUntil(() => page.getByTestId('assignee-search').isVisible().catch(() => false), {
    timeoutMs: 10_000,
  })
  const inviteEmail = `newcomer-${Date.now()}@rundesk.invalid`
  await page.getByTestId('assignee-search').fill(inviteEmail)
  chk(
    await waitUntil(
      () => page.getByTestId('assignee-invite').isVisible().catch(() => false),
      { timeoutMs: 10_000 },
    ),
    'typing an address nobody here has offers to invite them',
    'an email that matches nobody just showed "no matches" — the frame offers an invitation',
  )

  await page.getByTestId('assignee-invite').click()
  chk(
    await waitUntil(async () => {
      const invites = (await A(`/invitations/workspace/${workspaceId}`)).data ?? []
      return invites.some((i) => i.email === inviteEmail)
    }, { timeoutMs: 15_000 }),
    'and the invitation is really created',
    'the invite button reported success and no invitation exists',
  )

  /*
   * A NAME that matches nobody is NOT an invitation — it is a miss. Offering to
   * "invite Zzzz Nobody" would be offering to email a person's name.
   */
  await page.getByTestId('assignee-search').fill('Zzzz Nobody At All')
  await page.waitForTimeout(600)
  chk(
    !(await page.getByTestId('assignee-invite').isVisible().catch(() => false)),
    'a name that matches nobody is a miss, not an invitation',
    'it offered to invite something that is not an email address',
  )
} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
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
  if (ran < EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
