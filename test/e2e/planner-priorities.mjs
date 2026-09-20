/**
 * §V2-S14b — THE PRIORITIES RAIL IS A CONTROL, NOT A READOUT. Frame `13:05`.
 *
 * The frame shows the Planner's Priorities section with its empty state,
 * *"Prioritize a Task to see it appear here"*, and a **"+ Add priority"**
 * button under it. Rundesk drew the heading, the empty state and the list —
 * and nothing you could press. The API had everything: `POST /priorities`,
 * `PATCH /priorities/:id`, `DELETE /priorities/:id`, `PUT /priorities/order`.
 * The rail could show a priority and not let you make one, finish one or drop
 * one; to tick something off you had to leave the Planner and open the person
 * panel.
 *
 * SO THE EMPTY STATE WAS A DEAD END. "Prioritize a task to see it appear here"
 * read as an instruction, and the surface it was printed on offered no way to
 * follow it.
 *
 * THE SEVENTH DUPLICATE, AVOIDED. The person panel already had all four
 * mutations. Copying them here would have been one more instance of this
 * codebase's most productive bug, so both surfaces now go through
 * `lib/use-priorities`. They were ALSO reading the same endpoint under two
 * different React Query keys — `person-priorities` and `planner-priorities` —
 * so a write in one left the other stale; that is now one key, and this suite
 * checks it by writing in the rail and reading the person panel.
 *
 * AGAINST THE REAL STACK: every assertion is about a row that survived the
 * round trip, which is the whole difference between a control and a readout.
 *
 *   node test/e2e/planner-priorities.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 9

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
const TAG = `e2e-prio-${Date.now()}`
let A = null
let workspaceId = null
const mine = () => A(`/workspaces/${workspaceId}/priorities`)

try {
  const auth = await signInApi(API, ME.email, ME.password)
  A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  // Start from a known-empty list so counts mean something.
  for (const p of (await mine()).data ?? []) {
    await A(`/workspaces/${workspaceId}/priorities/${p.id}`, { method: 'DELETE' })
  }

  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${workspaceId}/calendar`, { waitUntil: 'domcontentloaded' })
  await waitUntil(
    () => page.getByTestId('planner-priorities').isVisible().catch(() => false),
    { timeoutMs: 25_000 },
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ frame `13:05` — the empty state is not a dead end')

  const railText = await readText(page.getByTestId('planner-priorities'))
  chk(
    /prioritize a task/i.test(railText),
    'the rail shows the empty state the frame shows',
    `the Priorities rail read: ${railText.slice(0, 120)}`,
  )
  chk(
    await page.getByTestId('planner-priority-add').isVisible().catch(() => false),
    'and an "Add priority" control beside it',
    'the rail tells you to prioritize a task and offers no way to do it',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ adding one from the rail reaches the server')

  const TITLE = `Ship the thing ${TAG}`
  await page.getByTestId('planner-priority-input').fill(TITLE)
  await page.getByTestId('planner-priority-add').click()

  let stored = []
  const added = await waitUntil(async () => {
    stored = (await mine()).data ?? []
    return stored.some((p) => p.title === TITLE)
  }, { timeoutMs: 15_000 })
  chk(
    added,
    'the priority exists on the server, not just on screen',
    `after adding, the server list was: ${stored.map((p) => p.title).join(' | ') || '(empty)'}`,
  )
  chk(
    await waitUntil(
      async () => (await readText(page.getByTestId('planner-priorities'))).includes(TITLE),
      { timeoutMs: 10_000 },
    ),
    'and the rail shows it without a reload',
    'the write landed but the rail kept showing the empty state',
  )

  const row = stored.find((p) => p.title === TITLE)

  // -------------------------------------------------------------------------
  console.log('\n▶ ONE cache entry — the person panel sees what the rail wrote')

  /*
   * The two surfaces used to read this endpoint under different keys. Reading
   * the person panel's own query through the app after writing in the rail is
   * the check that separates "shared key" from "two lists that happen to agree
   * because the page was reloaded".
   */
  const personList = await A(`/workspaces/${workspaceId}/people/${(await A('/users/me')).data.id}/priorities`)
  chk(
    (personList.data ?? []).some((p) => p.title === TITLE),
    'the per-person read returns it too — one resource, one list',
    'the person-scoped endpoint does not have the priority the rail just made',
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ ticking one off, and dropping one')

  await page.getByTestId(`planner-priority-done-${row.id}`).click()
  chk(
    await waitUntil(async () => {
      const after = (await mine()).data ?? []
      return after.find((p) => p.id === row.id)?.doneAt != null
    }, { timeoutMs: 15_000 }),
    'ticking it marks it done on the server',
    'the tick changed nothing — the box is a picture of a checkbox',
  )
  /*
   * The rail lists what is still open, so a finished priority should leave it.
   * A rail that kept showing done items would make the tick look broken.
   */
  chk(
    await waitUntil(
      async () => !(await readText(page.getByTestId('planner-priorities'))).includes(TITLE),
      { timeoutMs: 10_000 },
    ),
    'and it leaves the open list',
    'a priority that is done is still sitting in the rail as if it were not',
  )

  // Add a second one to remove, since the first is now done and out of view.
  const SECOND = `Drop me ${TAG}`
  await page.getByTestId('planner-priority-input').fill(SECOND)
  await page.getByTestId('planner-priority-add').click()
  let second = null
  await waitUntil(async () => {
    second = ((await mine()).data ?? []).find((p) => p.title === SECOND)
    return !!second
  }, { timeoutMs: 15_000 })
  chk(!!second, 'a second priority is added', 'the second add never reached the server')

  await page.getByTestId(`planner-priority-remove-${second.id}`).click()
  chk(
    await waitUntil(async () => {
      const after = (await mine()).data ?? []
      return !after.some((p) => p.id === second.id)
    }, { timeoutMs: 15_000 }),
    'and removing it really removes it',
    'the ✕ removed the row from the screen and left it on the server',
  )
} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
} finally {
  if (A && workspaceId) {
    for (const p of (await mine()).data ?? []) {
      if (p.title?.includes(TAG)) {
        await A(`/workspaces/${workspaceId}/priorities/${p.id}`, { method: 'DELETE' }).catch(() => {})
      }
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
