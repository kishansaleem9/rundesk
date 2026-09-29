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
 * so a write in one left the other stale; that is now one key.
 *
 * THE KEY ITSELF IS PINNED BY A UNIT TEST, not by this suite, and that is a
 * correction of two earlier attempts. The first claimed to read "the person
 * panel's own query through the app" and called the endpoint directly, which
 * goes nowhere near a cache. The second really did read the panel through the
 * app — and a break patch that gave the panel its own key ran GREEN, because
 * the panel MOUNTS when it opens, which is after the write, and a fresh mount
 * fetches. There is no moment at which this screen can show a stale panel.
 * `apps/web/src/lib/use-priorities.test.ts` asserts the one key instead.
 *
 * What this suite proves is that both surfaces answer about the same list, and
 * that every control in the rail reaches the server.
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
import { makeChain } from './lib/chain.mjs'

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
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
}
// A path that cannot go on fails what is left with the reason — `lib/chain.mjs`.
const chain = makeChain(chk)

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
  // Bounded and caught: the check above it is allowed to fail, and an unbounded
  // press on a control that is not there ends the section instead (ledger §10).
  await page.getByTestId('planner-priority-add').click({ timeout: 10_000 }).catch(() => {})

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
   * The two surfaces used to read this endpoint under different keys.
   *
   * THE PARAGRAPH THAT USED TO BE HERE DESCRIBED A CHECK THIS FILE DID NOT
   * HAVE. It said: "Reading the person panel's own query through the app after
   * writing in the rail is the check that separates 'shared key' from 'two
   * lists that happen to agree because the page was reloaded'." The code below
   * it called the API directly with `A(...)`, which goes nowhere near the app's
   * cache — so it asserted that two ENDPOINTS agree about a row, which is a
   * server fact that was never in doubt and cannot be broken by any number of
   * React Query keys. The stale-reason defect, in a comment explaining why a
   * check is strong.
   *
   * Both halves are here now and they are different claims. This one is the
   * server's.
   */
  /*
   * THE ID IS READ OPTIONALLY. This was `(await A('/users/me')).data.id` inline
   * in the route: a /users/me that answered with no body threw a TypeError here
   * and ended the run with six checks unreported. Now that check fails, naming
   * the read, and the run goes on.
   */
  const me = await A('/users/me')
  const meId = me.data?.id
  const perPerson = chain('the per-person read returns it too — one resource, one list')
  if (!meId) {
    perPerson.rest(`skipped: GET /users/me answered ${me.status} with no id, so there was no person to read`)
  } else {
    const personList = await A(`/workspaces/${workspaceId}/people/${meId}/priorities`)
    perPerson.step(
      (personList.data ?? []).some((p) => p.title === TITLE),
      'the person-scoped endpoint does not have the priority the rail just made',
    )
  }

  /*
   * And this one is the panel's: opened in the same page, with no reload,
   * showing what the rail wrote.
   *
   * IT IS NOT THE CACHE-KEY CHECK, AND THE FIRST VERSION OF THIS COMMENT SAID
   * IT WAS. `planner-priorities-1` — which puts the panel back on its own
   * React Query key — ran GREEN against it, and the reason is the panel's
   * lifecycle rather than anything about keys: the panel is MOUNTED when it
   * opens, which is after the write, and a `useQuery` whose key holds no data
   * fetches on mount. With React Query's default `staleTime: 0` even a
   * populated key refetches on remount. There is no moment at which this
   * screen can show a stale panel, because the panel does not exist until
   * after the thing that would have made it stale.
   *
   * So "one cache entry, not two" is not observable from a browser here at
   * all, and a check that claims it would be a stale reason of exactly the
   * kind this audit exists to find. The key is pinned by a unit test instead —
   * `apps/web/src/lib/use-priorities.test.ts` — which is where a fact about
   * source belongs.
   *
   * What this check does prove is worth keeping on its own: the panel and the
   * rail answer about the same list, so a panel pointed at a different
   * endpoint, or reading a different person, fails here.
   */
  await page.getByTestId('user-menu').click()
  await page.waitForTimeout(700)
  await page.getByTestId('menu-my-profile').click()
  chk(
    await waitUntil(
      async () => (await readText(page.getByTestId('person-priorities'))).includes(TITLE),
      { timeoutMs: 12_000 },
    ),
    'and the person panel lists it too — both surfaces answer about the same list',
    'the panel opened on a list that does not have the priority the rail just wrote',
  )
  await page.keyboard.press('Escape')
  await waitUntil(
    async () => !(await page.getByTestId('person-panel').isVisible().catch(() => false)),
    { timeoutMs: 5_000 },
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ ticking one off, and dropping one')

  /*
   * `row` IS UNDEFINED WHEN THE WRITE DID NOT LAND, which is the whole point of
   * `planner-priorities-2-the-rail-is-a-readout-again`. It makes the rail a
   * readout, the four checks above redden exactly as claimed — and then
   * `row.id` threw `TypeError: Cannot read properties of undefined` and the run
   * ended at 7 of 10.
   *
   * Reported rather than thrown, so both paths report four checks and
   * `EXPECTED_CHECKS` stays exact. Same shape as `list-statuses-seeded`, and
   * the same reason it is not `skipRest`: a rail that cannot write is a product
   * regression, not a gate on the machine.
   */
  const lifecycle = chain(
    'ticking it marks it done on the server',
    'and it leaves the open list',
    'a second priority is added',
    'and removing it really removes it',
  )
  if (!row?.id) {
    lifecycle.rest('the rail never wrote a priority to the server, so there was nothing to tick off or remove')
  } else {
    await page.getByTestId(`planner-priority-done-${row.id}`).click()
    lifecycle.step(
      await waitUntil(async () => {
        const after = (await mine()).data ?? []
        return after.find((p) => p.id === row.id)?.doneAt != null
      }, { timeoutMs: 15_000 }),
      'the tick changed nothing — the box is a picture of a checkbox',
    )
    /*
     * The rail lists what is still open, so a finished priority should leave it.
     * A rail that kept showing done items would make the tick look broken.
     */
    lifecycle.step(
      await waitUntil(
        async () => !(await readText(page.getByTestId('planner-priorities'))).includes(TITLE),
        { timeoutMs: 10_000 },
      ),
      'a priority that is done is still sitting in the rail as if it were not',
    )

    // Add a second one to remove, since the first is now done and out of view.
    const SECOND = `Drop me ${TAG}`
    // Both bounded: the Add control is asserted to exist by a check in this
    // suite, and bounding the press alone would move the thirty seconds onto —
    // or leave it on — the fill above it. `second` below is read from the
    // SERVER, so an add that never happened fails that check rather than this
    // line, which is the guard the comment further down already describes.
    await page.getByTestId('planner-priority-input').fill(SECOND, { timeout: 8000 }).catch(() => {})
    await page.getByTestId('planner-priority-add').click({ timeout: 8000 }).catch(() => {})
    let second = null
    await waitUntil(async () => {
      second = ((await mine()).data ?? []).find((p) => p.title === SECOND)
      return !!second
    }, { timeoutMs: 15_000 })
    lifecycle.step(!!second, 'the second add never reached the server')

    // And the same guard one step down: the check above is allowed to find that
    // the add never landed, and `second.id` would then throw where it stands.
    if (!second?.id) {
      lifecycle.rest('the second add never reached the server, so there was nothing to remove')
    } else {
      await page.getByTestId(`planner-priority-remove-${second.id}`).click()
      lifecycle.step(
        await waitUntil(async () => {
          const after = (await mine()).data ?? []
          return !after.some((p) => p.id === second.id)
        }, { timeoutMs: 15_000 }),
        'the ✕ removed the row from the screen and left it on the server',
      )
    }
  }
} catch (err) {
  failed += 1
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err)
} finally {
  // Gone, or already gone (404), is fine; any other answer, or none, leaves a
  // priority behind, and is said here above the totals.
  if (A && workspaceId) {
    try {
      for (const p of (await mine()).data ?? []) {
        if (p.title?.includes(TAG)) {
          const route = `/workspaces/${workspaceId}/priorities/${p.id}`
          const res = await A(route, { method: 'DELETE' })
          if (![200, 204, 404].includes(res.status)) console.log(`  cleanup left behind: DELETE ${route} answered ${res.status}`)
        }
      }
    } catch (err) {
      console.log(`  cleanup left behind: this run's priorities got no answer (${err?.message ?? err})`)
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
