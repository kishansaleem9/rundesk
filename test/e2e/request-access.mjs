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
 * a real private task, the real refusal out of the resource guard, the real
 * button, and then the owner's inbox to see whether anybody was actually told.
 *
 * THE REFUSAL IS THE 404 AN ID NAMING NOTHING GETS (`found-30-sep/private-task-reads-say-403`).
 * It was a 403 "This task is private", and the card was drawn on the 403 alone,
 * so the card itself said the task was there. Now the private task and a task
 * that does not exist are answered alike, the card is offered on both in words
 * that say neither, and the ask about nothing reaches nobody — which is what
 * sections 3 and 8–9 below hold it to.
 *
 * The member has to be created. Every seeded account is a workspace_admin, and
 * a manager can see private items by design — run as one of those and the
 * refusal never happens, the card never renders, and the suite reports a dead
 * end that is not there.
 *
 *   node test/e2e/request-access.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt, madeAccount, madeRow } from './lib/fixture.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/*
 * How many checks a complete run performs. "0 failed" is not "it ran": a
 * selector that matched nothing reports a clean sweep of whatever it reached.
 */
const EXPECTED_CHECKS = 10

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
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
}

// lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`).
// It throws when nothing answers, as the copy did, so a dead API stops the run
// rather than answering a status of 0 that a check could take for success.
const apiAs = apiAsAt(API, { noAnswer: 'throw' })

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
  /*
   * Through `signUpApi`, which waits out the route's ten-a-minute limit as the
   * API asks: a direct POST stopped this suite at its first line when the
   * suite before it on the lane had signed three people up (429, measured on
   * lane 2, 30 September). Throws, naming the answer, on anything else.
   */
  const signup = {
    data: await signUpApi(API, {
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
    }),
  }
  if (!signup.data?.accessToken) throw new Error(`signup answered no token: ${JSON.stringify(signup.data).slice(0, 200)}`)
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
  // In a shared list, where it stayed after the run: registered, so it goes when the run ends (`lib/made.mjs`).
  if (taskId) madeRow('tasks', taskId)
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

  // ── The refusal itself ────────────────────────────────────────────────────
  console.log('\n▶ §G10 — a private task is refused as a missing one is, and the refusal still offers the ask')
  const asMember = apiAs(signup.data.accessToken)
  /*
   * Ids that name nothing, minted fresh each run: an ask about one is recorded,
   * and a run that broke the fan-out would leave a notification about a fixed id
   * in the admin's inbox for every later run to find (`FRESH_NOTHING` below).
   */
  const unique12 = String(stamp).slice(-12).padStart(12, '0')
  const NOTHING = `00000000-0000-4000-8000-${unique12}`
  const denied = await asMember(`/tasks/${taskId}`)
  const missing = await asMember(`/tasks/${NOTHING}`)
  chk(
    denied.status === 404 && missing.status === 404 && denied.message === missing.message && denied.message !== '',
    'the member is refused the private task with the 404 an id naming nothing gets, in the same words — the refusal says nothing about whether it is there',
    `GET /tasks/<the private task> answered ${denied.status} ${JSON.stringify(denied.message)}; GET /tasks/<nothing> answered ${missing.status} ${JSON.stringify(missing.message)}`,
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
  /*
   * The card is drawn once the task's read has come back refused, so it is
   * waited for — bounded, and the checks below still fail when it never comes.
   * It was six fixed seconds, and a sweep's load outran them
   * (`found-24-sep/three-suites-fail-under-a-full-sweep`).
   */
  await page.getByTestId('request-access-card').waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})

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

  // Bounded and caught: the check above it is allowed to fail, and an unbounded
  // press on a control that is not there ends the section instead (ledger §10).
  await page.getByTestId('request-access-button').click({ timeout: 10_000 }).catch(() => {})
  // The confirmation replaces the button once the ask has been answered.
  await page.getByTestId('request-access-sent').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
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
  /*
   * READ AMONG THE ADMIN'S ACCESS REQUESTS, AND UNTIL IT ARRIVES. A bare
   * `GET /notifications` is the newest 50 of every kind, and under a sweep the
   * other suites filled those 50 before this one read them: the row was there,
   * below the page. `types=access_requested` asks only for the kind this row is
   * (the route's own filter), which leaves out only rows that could never match.
   */
  let owned = []
  let mine = []
  await waitUntil(async () => {
    owned = (await A('/notifications?types=access_requested&limit=100')).data ?? []
    mine = owned.filter(
      (n) => n.type === 'access_requested' && (n.target?.entityId ?? n.entityId) === taskId,
    )
    return mine.length > 0
  }, { timeoutMs: 15_000, stepMs: 300 })
  chk(
    mine.length > 0,
    'and whoever can grant it hears about THIS object',
    `no access_requested notification naming ${taskId} among ${owned.length} rows`,
  )

  /*
   * A TASK THAT DOES NOT EXIST GETS THE SAME CARD, IN THE SAME WORDS.
   *
   * It used to get none: the card was drawn on the 403 a private task got and
   * not on the 404 a missing one got, so the card was the proof the task was
   * there. Both are the one 404 now, and the card, drawn on it, must read the
   * same for both — or the page says what the API no longer does. Its words
   * are read against the private task's, so a card that said "It exists" on
   * one and not the other fails here.
   */
  const cardWords = async () => (await page.getByTestId('request-access-card').filter({ visible: true }).innerText({ timeout: 5_000 }).catch(() => '')).replace(/\s+/g, ' ').trim()
  await page.goto(`${origin}/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=${taskId}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('request-access-card').waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
  const onPrivate = await cardWords()
  await page.goto(`${origin}/app/${workspaceId}/${spaceId}/${projectId}/${listId}?task=${NOTHING}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('request-access-card').waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {})
  const onNothing = await cardWords()
  chk(
    onNothing !== '' && onNothing === onPrivate && !/\bexists\b/i.test(onNothing),
    'and a task that does not exist offers the same card in the same words, so the card says nothing about which it is',
    `on the private task: ${JSON.stringify(onPrivate)}; on an id naming nothing: ${JSON.stringify(onNothing)}`,
  )

  /*
   * ASKING ABOUT NOTHING IS ANSWERED AS ASKING ABOUT A PRIVATE TASK, AND TELLS NOBODY.
   *
   * The card is on every "not found" now, so the ask must not become the
   * oracle the refusal stopped being: a second private task, never asked about,
   * and a fresh id naming nothing are each asked for once, straight to the
   * route, and must be answered alike. Then the admin must hold a notification
   * about the private task and none about either id that names nothing — the
   * one pressed on the page above, or this one — since there is nothing to
   * give. It told every admin "… asked for access to this task" about any id.
   */
  await page.getByTestId('request-access-button').click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('request-access-sent').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  const second = await A('/tasks', { method: 'POST', body: { listId, title: `Another private plan ${stamp}` } })
  const secondId = second.data?.id
  if (secondId) await A(`/tasks/${secondId}`, { method: 'PATCH', body: { visibility: 'private' } })
  const FRESH_NOTHING = `00000000-0000-4000-9000-${unique12}`
  const askedReal = secondId ? await asMember(`/shares/task/${secondId}/request`, { method: 'POST', body: { workspaceId } }) : { status: 0, data: null }
  const askedNothing = await asMember(`/shares/task/${FRESH_NOTHING}/request`, { method: 'POST', body: { workspaceId } })
  let toldReal = []
  let toldNothing = []
  await waitUntil(async () => {
    const rows = (await A('/notifications?types=access_requested&limit=100')).data ?? []
    const about = (id) => rows.filter((n) => n.type === 'access_requested' && (n.target?.entityId ?? n.entityId) === id)
    toldReal = about(secondId)
    toldNothing = [...about(FRESH_NOTHING), ...about(NOTHING)]
    return toldReal.length > 0
  }, { timeoutMs: 15_000, stepMs: 300 })
  chk(
    !!secondId && askedReal.ok && askedNothing.ok && askedReal.status === askedNothing.status
      && JSON.stringify(askedReal.data) === JSON.stringify(askedNothing.data)
      && toldReal.length > 0 && toldNothing.length === 0,
    'asking for access to an id that names nothing is answered as asking for a private task, word for word — and tells nobody, where the private task’s ask reaches the admin',
    `the private task's ask answered ${askedReal.status} ${JSON.stringify(askedReal.data)}; nothing's ${askedNothing.status} ${JSON.stringify(askedNothing.data)}; ` +
      `the admin was told about the private task ${toldReal.length} time(s), about ids naming nothing ${toldNothing.length}`,
  )
  void ownerId

  /*
   * Put the workspace back. The account itself stays — signup made it and
   * there is no endpoint to unmake it — but it leaves the roster, which is
   * what every other suite reads.
   */
  const outsiderId = signup.data?.user?.id ?? signup.data?.id
  // Judged by the roster read below; its answer goes in that check's reason.
  const removed = outsiderId
    ? await A(`/workspaces/${workspaceId}/members/${outsiderId}`, { method: 'DELETE' })
    : null
  const roster = (await A(`/workspaces/${workspaceId}/members`)).data ?? []
  chk(
    !roster.some((m) => (m.user?.email ?? m.email) === outsider.email),
    'and the check left the roster as it found it',
    `${outsider.email} is still a member of the workspace (the DELETE answered ${removed?.status ?? 'nothing: no id to remove'})`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  // Whatever happened above, the workspace gets its roster back. Idempotent:
  // the happy path already removed them and this is a 404 it accepts; any
  // other answer leaves them on the roster, and is said above the totals.
  if (cleanupA && cleanupWorkspaceId && cleanupOutsiderId) {
    const route = `/workspaces/${cleanupWorkspaceId}/members/${cleanupOutsiderId}`
    try {
      const res = await cleanupA(route, { method: 'DELETE' })
      if (![200, 204, 404].includes(res.status)) console.log(`  cleanup left behind: DELETE ${route} answered ${res.status}`)
    } catch (err) {
      console.log(`  cleanup left behind: DELETE ${route} got no answer (${err?.message ?? err})`)
    }
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
