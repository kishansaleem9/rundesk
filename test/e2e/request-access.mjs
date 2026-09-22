/**
 * §G10 [12:16–12:20] — "ask the people who can grant it".
 *
 * The server half of this shipped alone and nothing ever called it. The
 * endpoint existed, the table existed, the fan-out to whoever holds admin
 * existed — and hitting a private object was still a dead end that said "Task
 * not found." and stopped. This suite exists because a check that reads the
 * component in isolation would have passed the whole time it was unreachable.
 *
 * So it drives the real thing end to end: a real member who is not a manager,
 * a real private task, the real 403 out of the resource guard, the real button,
 * and then the owner's inbox to see whether anybody was actually told.
 *
 * The member has to be created. Every seeded account is a workspace_admin, and
 * a manager can see private items by design — run as one of those and the 403
 * never happens, the card never renders, and the suite reports a dead end that
 * is not there.
 *
 *   node test/e2e/request-access.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/*
 * How many checks a complete run performs. "0 failed" is not "it ran": a
 * selector that matched nothing reports a clean sweep of whatever it reached.
 */
const EXPECTED_CHECKS = 9

const chromium = await resolveChromium()
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`

const ADMIN = {
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
    ...init,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const origin = stack.base
const browser = await chromium.launch(launchOptions())

/*
 * THE ROSTER IS PUT BACK IN `finally`, NOT WHERE THE CHECK IS.
 *
 * The removal used to live at the end of the `try`, after eight checks — so
 * any run that threw before reaching it left a freshly-signed-up
 * "Asking Member <stamp>" in the workspace permanently. That is not a
 * hypothetical: a break patch that stops the card from rendering makes the
 * click below it throw, and every such run would have added another member.
 * The file's own comment already records what an accumulating roster costs —
 * `ui-sweep`'s reports-to picker failed on ten identically-named people.
 *
 * Cleanup belongs where it runs whatever happened. The check that the roster
 * is clean stays in the `try`, because that is an assertion rather than a
 * tidy-up, and the `finally` pass is idempotent.
 */
let cleanupA = null
let cleanupWorkspaceId = null
let cleanupOutsiderId = null

try {
  // ── Arrange ───────────────────────────────────────────────────────────────
  const login = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(login.accessToken)
  const ownerId = login.user?.id ?? login.id

  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  if (!workspaceId) throw new Error('no workspace')
  cleanupA = A
  cleanupWorkspaceId = workspaceId

  // A list to hang the private task off.
  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  let listId = null
  let spaceId = null
  let projectId = null
  for (const space of spaces) {
    const projects = (await A(`/projects/space/${space.id}`)).data ?? []
    for (const project of projects) {
      const lists = (await A(`/lists/project/${project.id}`)).data ?? []
      if (lists[0]?.id) {
        spaceId = space.id
        projectId = project.id
        listId = lists[0].id
        break
      }
    }
    if (listId) break
  }
  if (!listId) throw new Error('no list to put a task in')

  /*
   * A member, freshly made. Signup mints their account; the admin then adds
   * them to THIS workspace as `member` — the role that is not a manager, which
   * is the only role the 403 under test can happen to.
   */
  const stamp = Date.now()
  const outsider = {
    email: `member-${stamp}@rundesk.invalid`,
    password: 'Member@12345!',
  }
  const signup = await apiAs(null)('/auth/signup', {
    method: 'POST',
    body: {
      /*
       * Stamped, and removed again below.
       *
       * The first version named every one of them "Asking Member" and left
       * them in the workspace. Ten runs later `ui-sweep`'s reports-to picker —
       * which finds a person by "Who <name> reports to" — matched ten
       * identical labels and failed on a strict-mode violation. A suite that
       * accumulates identically-named people is a fixture that breaks other
       * suites, which this document has already recorded twice.
       */
      fullName: `Asking Member ${stamp}`,
      email: outsider.email,
      password: outsider.password,
      organizationName: `Asking ${stamp}`,
      organizationSlug: `asking-${stamp}`,
    },
  })
  if (!signup.data?.accessToken) throw new Error(`signup failed: ${signup.status} ${JSON.stringify(signup.error)}`)
  cleanupOutsiderId = signup.data?.user?.id ?? signup.data?.id

  const added = await A(`/workspaces/${workspaceId}/members`, {
    method: 'POST',
    body: { email: outsider.email, role: 'member' },
  })
  chk(added.status < 400, 'a plain member can be put in the workspace',
    `addMember returned ${added.status}: ${JSON.stringify(added.error)}`)

  // The private task. Created BY the admin, so the member is neither creator
  // nor assignee — the two other ways past the guard.
  const created = await A('/tasks', {
    method: 'POST',
    body: { listId, title: `Private plan ${stamp}` },
  })
  const taskId = created.data?.id
  // Private on the PATCH, not the POST: create does not take a visibility, so
  // asking for one there silently yields a public task and the 403 under test
  // never happens — which is how this fixture failed the first time.
  const madePrivate = taskId
    ? await A(`/tasks/${taskId}`, { method: 'PATCH', body: { visibility: 'private' } })
    : { status: 0 }
  chk(
    !!taskId && madePrivate.data?.visibility === 'private',
    'a private task exists to be locked out of',
    `create ${created.status}, visibility now ${JSON.stringify(madePrivate.data?.visibility)}`,
  )

  // ── The 403 itself ────────────────────────────────────────────────────────
  console.log('\n▶ §G10 — a private object is not a missing one')
  const asMember = apiAs(signup.data.accessToken)
  const denied = await asMember(`/tasks/${taskId}`)
  chk(
    denied.status === 403,
    'the member is refused with 403, not 404 — it exists, they cannot see it',
    `GET /tasks/:id returned ${denied.status}`,
  )

  // ── The screen ────────────────────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', outsider.email)
  await page.fill('input[type=password]', outsider.password)
  await page.click('button[type=submit]')
  // Not /app/<id>: signup gave this account its own workspace too, and where a
  // fresh login lands is not the thing under test.
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS }).catch(async () => {
    await page.screenshot({ path: '/tmp/request-access-login.png' }).catch(() => {})
    throw new Error(`login did not reach /app — landed on ${page.url()}`)
  })
  /*
   * The full list path, not `/app/<workspace>?task=…`. The detail sheet is
   * mounted by the LIST route and nowhere else, so the short URL renders the
   * workspace home with the parameter ignored — a screen with no card on it,
   * which reads exactly like the defect this suite is here to catch.
   */
  await page.goto(`${origin}/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=${taskId}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(6000)

  chk(
    await page.getByTestId('request-access-card').isVisible().catch(() => false),
    'the dead end offers a way to ask instead of just saying "not found"',
    'no request-access card on a task the viewer is locked out of',
  )
  chk(
    await page.getByTestId('request-access-button').isVisible().catch(() => false),
    'and the ask is a control, not a sentence',
    'no request-access button',
  )

  await page.getByTestId('request-access-button').click()
  await page.waitForTimeout(2500)
  chk(
    await page.getByTestId('request-access-sent').isVisible().catch(() => false),
    'pressing it says so',
    'no confirmation after asking',
  )

  /*
   * And somebody was actually told, ABOUT THIS TASK.
   *
   * The first version of this check asked only whether the owner's inbox held
   * any `access_requested` row, and it passed against a deliberately inert
   * button — because a previous run had left one there. An accumulating inbox
   * makes "some row of this kind exists" true forever after the first success,
   * which is a check that stops checking. The task id is minted fresh each run,
   * so matching on it is the difference between "somebody once asked for
   * something" and "this click asked for this".
   */
  const owned = (await A('/notifications')).data ?? []
  const mine = owned.filter(
    (n) => n.type === 'access_requested' && (n.target?.entityId ?? n.entityId) === taskId,
  )
  chk(
    mine.length > 0,
    'and whoever can grant it hears about THIS object',
    `no access_requested notification naming ${taskId} among ${owned.length} rows`,
  )

  /*
   * A task that does not exist gets no card.
   *
   * The guard answers 404 there, and offering to "request access" would confirm
   * the existence of something the caller was never told about — the exact
   * thing private is for. Checked because the first version of the card keyed
   * off "any error at all" and this run never exercised a 404, so nothing
   * caught it.
   */
  await page.goto(
    `${origin}/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=00000000-0000-4000-8000-000000000000`,
    { waitUntil: 'domcontentloaded' },
  )
  await page.waitForTimeout(6000)
  chk(
    !(await page.getByTestId('request-access-card').isVisible().catch(() => false)),
    'but a task that does not exist offers nothing to ask for',
    'the card renders on a 404, confirming objects the caller was never told about',
  )
  void ownerId

  /*
   * Put the workspace back. The account itself stays — signup made it and
   * there is no endpoint to unmake it — but it leaves the roster, which is
   * what every other suite reads.
   */
  const outsiderId = signup.data?.user?.id ?? signup.data?.id
  if (outsiderId) {
    await A(`/workspaces/${workspaceId}/members/${outsiderId}`, { method: 'DELETE' }).catch(() => {})
  }
  const roster = (await A(`/workspaces/${workspaceId}/members`)).data ?? []
  chk(
    !roster.some((m) => (m.user?.email ?? m.email) === outsider.email),
    'and the check left the roster as it found it',
    `${outsider.email} is still a member of the workspace`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  // Whatever happened above, the workspace gets its roster back. Idempotent:
  // the happy path already removed them and this is a 404 it ignores.
  if (cleanupA && cleanupWorkspaceId && cleanupOutsiderId) {
    await cleanupA(`/workspaces/${cleanupWorkspaceId}/members/${cleanupOutsiderId}`, {
      method: 'DELETE',
    }).catch(() => {})
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
