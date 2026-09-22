/**
 * §V2-12 — the per-person work preview cards, frame `21:00`.
 *
 * The frame draws a grid of people, each with a face, a name, a JOB TITLE, and
 * a numbered list of what that person is working on:
 *
 *   Priya Gupta · UI designer        1 4.0 design   2 Todo page   3 Chat : …
 *   Sarah Chang · Software Engineer  1 DevForge 3.0 2 TaskFlow …  3 ChatSphere …
 *   Mei Chen · Cloud Solutions Architect
 *   Ryan Johnson · DevOps Engineer
 *
 * The entire content of the feature is that EACH CARD ANSWERS FOR ITS OWN
 * PERSON. Which makes it one of the easiest things in this product to fake, and
 * both fakes are named in the audit:
 *
 *   THE FACADE — one preview fetched once and drawn under every name (the
 *   viewer's own work, or the first person's). It demos perfectly. It is only
 *   wrong when two people have different work, which is why this suite seeds
 *   DIFFERENT work for two different people and reads both cards.
 *
 *   THE CONFIDENT ZERO — a count that is always 0 because the grouping keyed on
 *   the wrong id. In the UI that is pixel-identical to somebody who genuinely
 *   has nothing on. So this seeds a person with nothing as well, and asserts
 *   the three numbers are 2, 3 and 0 — a suite that only ever saw one person
 *   could not tell those apart.
 *
 * ITS OWN WORKSPACE with its own registered people, because the e2e database is
 * shared and "this card lists exactly these two tasks" is a claim that another
 * suite's fixtures can falsify from underneath.
 *
 *   node test/e2e/teams-person-cards.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** Exact, never `<`: a branch that silently skipped must fail, not shorten. */
const EXPECTED_CHECKS = 17

const chromium = await resolveChromium()
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

/**
 * NEVER THROWS — it answers `{status, data, error}`. A `.catch()` on this is
 * inert, so every call something depends on has its `status` checked instead.
 */
const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const flat = (s) => s.replace(/\s+/g, ' ').trim()

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const stamp = Date.now()

  const made = await A('/workspaces', { method: 'POST', body: { name: `Teams people ${stamp}` } })
  const workspaceId = made.data?.id ?? made.data?.workspace?.id
  if (!workspaceId) {
    throw new Error(`could not create a workspace: ${made.status} ${JSON.stringify(made.error)}`)
  }

  // ── Two people, and a third who has nothing ──────────────────────────────
  const register = async (label) => {
    const email = `teams-card-${label}-${stamp}@rundesk.invalid`
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, displayName: `Card ${label} ${stamp}`, password: 'Viewer@123!' }),
    })
    if (!res.ok) throw new Error(`could not register ${label}: ${res.status}`)
    const joined = await A(`/workspaces/${workspaceId}/members`, {
      method: 'POST', body: { email, role: 'member' },
    })
    if (joined.status >= 400) throw new Error(`could not add ${label}: ${joined.status}`)
    return email
  }
  const emailA = await register('alpha')
  const emailB = await register('beta')

  const members = (await A(`/workspaces/${workspaceId}/members`)).data ?? []
  const idOf = (email) => members.find((m) => m.email === email)?.userId
  const userA = idOf(emailA)
  const userB = idOf(emailB)
  const adminId = members.find((m) => m.email === ME.email)?.userId
  if (!userA || !userB || !adminId) throw new Error('could not resolve the seeded people')

  /*
   * A LIST OF THIS SUITE'S OWN, made through `POST /lists` rather than the
   * starter list the new workspace arrives with.
   *
   * WHY, because it cost this suite a run. `WorkspacesService.create` inserts
   * the starter list with `tx.insert(lists)`, and that does NOT seed
   * `list_statuses` — only `ListsService.create` does (the same trap
   * test/e2e/imports.mjs:389 records). On a list with no statuses,
   * `resolveStatusForList` (apps/api/src/modules/tasks/tasks.service.ts:1615)
   * falls back to `{ key: requested, category: 'open' }`: the PATCH to `done`
   * is accepted, the task stores `status = 'done'`, and `statusCategory` stays
   * `open`. The fixture task read as finished and was not, which is the exact
   * shape of a check that passes on a bug.
   */
  const spaces = (await A(`/spaces/workspace/${workspaceId}`)).data ?? []
  const spaceId = spaces[0]?.id
  if (!spaceId) throw new Error('the new workspace has no space to put a list in')
  const listCreated = await A('/lists', {
    method: 'POST', body: { spaceId, name: `Card work ${stamp}` },
  })
  const listId = listCreated.data?.id
  if (!listId) {
    throw new Error(`could not create a list: ${listCreated.status} ${JSON.stringify(listCreated.error)}`)
  }

  /*
   * AND THE CLOSED STATUS COMES FROM THE LIST, never from a guess. Statuses are
   * per-list in this codebase (`list_statuses.key` + `.category`, resolvable up
   * to the project or space scope), so `done` is a key this list may simply not
   * have — and passing one it does not have is answered by a silent fallback
   * rather than a 400. `ensureSweepFixture` reads them for the same reason, and
   * its comment says why: a guessed key puts every task in one bucket and looks
   * like the feature being broken.
   */
  const statuses = (await A(`/lists/${listId}/statuses`)).data ?? []
  const closedStatus = (Array.isArray(statuses) ? statuses : []).find((s) => s.category === 'closed')
  if (!closedStatus?.key) {
    throw new Error(
      'this list has no status in the closed category, so nothing can be finished in it — it carries ' +
        `${JSON.stringify((Array.isArray(statuses) ? statuses : []).map((s) => `${s.key}:${s.category}`))}`,
    )
  }

  /*
   * DIFFERENT WORK FOR DIFFERENT PEOPLE, and titles that could not be confused
   * for one another. Two for A, three for B: the counts differ, so a card that
   * reports the wrong person's total is wrong by a number and not just by a
   * list.
   */
  const seed = async (title, userId) => {
    const created = await A('/tasks', { method: 'POST', body: { listId, title } })
    if (created.status >= 400 || !created.data?.id) {
      throw new Error(`could not create "${title}": ${created.status}`)
    }
    const assigned = await A(`/tasks/${created.data.id}/assignees`, { method: 'POST', body: { userId } })
    if (assigned.status >= 400) throw new Error(`could not assign "${title}": ${assigned.status}`)
    return created.data
  }
  const aWork = [`alpha 4.0 design ${stamp}`, `alpha todo page ${stamp}`]
  const bWork = [`beta devforge 3.0 ${stamp}`, `beta taskflow central ${stamp}`, `beta chatsphere ${stamp}`]
  for (const title of aWork) await seed(title, userA)
  for (const title of bWork) await seed(title, userB)

  /*
   * One of A's that is DONE. Current work means current — and the fixture is
   * read back rather than assumed, because `statusCategory` is DERIVED from the
   * list's status set: a PATCH that was accepted and left the task open would
   * make the check below pass on a task that was never closed.
   */
  const finished = await seed(`alpha shipped already ${stamp}`, userA)
  const closed = await A(`/tasks/${finished.id}`, {
    method: 'PATCH', body: { status: closedStatus.key },
  })
  if (closed.status >= 400) {
    throw new Error(`could not close a task: ${closed.status} ${JSON.stringify(closed.error)}`)
  }
  const readBack = await A(`/tasks/${finished.id}`)
  if (readBack.data?.statusCategory !== 'closed') {
    throw new Error(
      `the fixture task did not end up closed (status=${JSON.stringify(readBack.data?.status)}, ` +
        `statusCategory=${JSON.stringify(readBack.data?.statusCategory)}, asked for ` +
        `${JSON.stringify(closedStatus.key)}) — the "finished work is not current work" check would ` +
        'pass vacuously',
    )
  }

  console.log('\n▶ the API answers per person, not once for everybody')
  const preview = await A(`/workspaces/${workspaceId}/teams/work-preview`)
  chk(
    preview.status === 200 && Array.isArray(preview.data),
    'the work preview answers any member of the workspace',
    `it returned ${preview.status}: ${JSON.stringify(preview.error)?.slice(0, 140)}`,
  )
  const rows = Array.isArray(preview.data) ? preview.data : []
  const rowFor = (id) => rows.find((r) => r.userId === id)
  const titlesOf = (id) => (rowFor(id)?.items ?? []).map((i) => i.title)

  chk(
    aWork.every((title) => titlesOf(userA).includes(title)),
    'the first person’s row holds the first person’s work',
    `it held ${JSON.stringify(titlesOf(userA))}`,
  )
  chk(
    bWork.every((title) => titlesOf(userB).includes(title)),
    'and the second person’s row holds the second person’s',
    `it held ${JSON.stringify(titlesOf(userB))}`,
  )
  chk(
    bWork.every((title) => !titlesOf(userA).includes(title)),
    'and neither is carrying the other’s — the rows are not one list drawn twice',
    `the first person’s row held ${JSON.stringify(titlesOf(userA))}, which overlaps the second’s`,
  )
  chk(
    rowFor(userA)?.openCount === 2 && rowFor(userB)?.openCount === 3,
    'the counts are each person’s own (2 and 3), not one number shared',
    `they were ${rowFor(userA)?.openCount} and ${rowFor(userB)?.openCount}`,
  )
  chk(
    !titlesOf(userA).includes(`alpha shipped already ${stamp}`),
    'work that is finished is not what somebody is working on',
    'a closed task was listed as current work',
  )
  /*
   * THE TRUE ZERO, which is the whole reason it is asserted beside a 2 and a 3:
   * the admin has nothing assigned in THIS workspace, and a preview that keyed
   * on the wrong id would give everybody this same answer.
   */
  chk(
    rowFor(adminId)?.openCount === 0 && (rowFor(adminId)?.items ?? []).length === 0,
    'somebody with nothing on comes back as a real zero, beside a 2 and a 3',
    `they came back as ${JSON.stringify(rowFor(adminId))?.slice(0, 140)}`,
  )

  console.log('\n▶ the line under the name is that person’s job title')
  const titled = await A(`/workspaces/${workspaceId}/teams/people/${userA}/title`, {
    method: 'PUT', body: { jobTitle: 'UI designer' },
  })
  chk(
    titled.status < 400,
    'a job title can be set',
    `PUT answered ${titled.status}: ${JSON.stringify(titled.error)?.slice(0, 140)}`,
  )
  const after = await A(`/workspaces/${workspaceId}/teams/work-preview`)
  const afterRows = Array.isArray(after.data) ? after.data : []
  const titleOf = (id) => afterRows.find((r) => r.userId === id)?.jobTitle ?? null
  chk(
    titleOf(userA) === 'UI designer' && titleOf(userB) === null,
    'and it belongs to the person it was set on, not to everybody',
    `the first read ${JSON.stringify(titleOf(userA))} and the second ${JSON.stringify(titleOf(userB))}`,
  )

  // ── And all of it on screen ──────────────────────────────────────────────
  console.log('\n▶ frame `21:00` — and the cards draw it')
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${workspaceId}/teams`, { waitUntil: 'domcontentloaded' })
  await waitUntil(() => page.getByTestId('teams-tab-people').isVisible().catch(() => false), {
    timeoutMs: 15_000,
  })
  await page.getByTestId('teams-tab-people').click()

  const cardOf = (id) => page.locator(`[data-testid="teams-person"][data-user-id="${id}"]`)
  const drawn = await waitUntil(
    async () => (await cardOf(userA).count()) === 1 && (await cardOf(userB).count()) === 1,
    { timeoutMs: 15_000 },
  )
  chk(
    drawn,
    'there is one card per person, addressable by who it is about',
    'the two seeded people did not each get exactly one card',
  )

  const itemsShown = await waitUntil(
    async () => (await cardOf(userA).getByTestId('teams-person-item').count()) === 2,
    { timeoutMs: 15_000 },
  )
  const textA = flat(await readText(cardOf(userA)))
  const textB = flat(await readText(cardOf(userB)))
  chk(
    itemsShown && aWork.every((title) => textA.includes(title)),
    'the first card lists the first person’s work',
    `it read ${JSON.stringify(textA.slice(0, 200))}`,
  )
  chk(
    bWork.every((title) => textB.includes(title)),
    'the second card lists the second person’s',
    `it read ${JSON.stringify(textB.slice(0, 200))}`,
  )
  /* THE FACADE, in the browser: one person's work under two people's names. */
  chk(
    bWork.every((title) => !textA.includes(title)) && aWork.every((title) => !textB.includes(title)),
    'and neither card is showing the other person’s work',
    'the two cards share work — the preview is being drawn under the wrong name',
  )

  const countOn = async (id) =>
    await cardOf(id).getByTestId('teams-person-open-count').getAttribute('data-open-count')
  const [countA, countB, countAdmin] = [await countOn(userA), await countOn(userB), await countOn(adminId)]
  chk(
    countA === '2' && countB === '3',
    'each card’s count is its own person’s (2 and 3)',
    `the cards read ${countA} and ${countB}`,
  )
  chk(
    (await cardOf(userA).getByTestId('teams-person-item').count()) === 2 &&
      (await cardOf(userB).getByTestId('teams-person-item').count()) === 3,
    'and the numbered rows are that many',
    'the row counts did not match the work each person has',
  )

  const titleText = flat(await readText(cardOf(userA).getByTestId('teams-person-title')))
  chk(
    titleText === 'UI designer',
    'the job title is under the name, as the frame draws it',
    `the line under the name read ${JSON.stringify(titleText)}`,
  )

  const adminEmpty = await cardOf(adminId).getByTestId('teams-person-empty').count()
  chk(
    countAdmin === '0' && adminEmpty === 1,
    'and the card for somebody with nothing on says so, rather than borrowing a list',
    `that card read count=${countAdmin} with ${adminEmpty} empty notes`,
  )
} catch (e) {
  const lines = e.message.split('\n')
  const where = lines.find((l) => l.includes('waiting for') || l.includes('getByTestId'))
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${lines[0]}${where ? `\n         ${where.trim()}` : ''}`)
} finally {
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — a run that is not exactly the suite is not the suite, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
