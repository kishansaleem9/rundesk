/**
 * §V2-12 — the Teams Hub empty state, frame `20:57`.
 *
 * The frame is `app.clickup.com/…/teams-pulse/teams` with nothing in it yet:
 *
 *   "Align teams and visualize their work!"
 *   "Use Teams Hub to coordinate teams, organize priorities, and understand
 *    the details of their work."
 *   [ Browse People ] [ Create Team ]
 *   Teams Hub — "A central hub providing an overview of all activity and
 *     customizable views that let you dig into the details for each team."
 *   Member & team management — "Easily browse, find, and manage all teams and
 *     members in one convenient area. Add, remove, or update roles with ease."
 *
 * WHAT THIS SUITE IS FOR. A headline and two buttons is half a day's work and
 * worth nothing if the buttons do nothing — the DEAD CONTROL, which this audit
 * has now found in shipped code more than once. So the checks are not "the
 * button is on the page": **Browse People** has to land on All People with
 * people on it, and **Create Team** has to leave a real team behind, one the
 * API agrees exists.
 *
 * AND THE OTHER HALF, which is the half a check written only in the empty
 * condition cannot see: an empty state that renders unconditionally is
 * indistinguishable from one that is wired up, because a broken page and an
 * empty page look identical. So this asserts it APPEARS with no teams,
 * DISAPPEARS once there is one, and COMES BACK when that team is deleted —
 * three states, not one.
 *
 * ITS OWN WORKSPACE, freshly created, because "there are no teams" is a claim
 * about a whole workspace and the e2e database is shared. Run against the
 * seeded workspace this would either never see the empty state or would be
 * asserting on whatever the last suite left behind.
 *
 *   node test/e2e/teams-empty-state.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil, readText } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** Exact, never `<`: a branch that silently skipped must fail, not shorten. */
const EXPECTED_CHECKS = 21

const chromium = await resolveChromium()
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

/** The frame's own words. Not a paraphrase — the frame is the specification. */
const COPY = {
  headline: 'Align teams and visualize their work!',
  body:
    'Use Teams Hub to coordinate teams, organize priorities, and understand the details of their work.',
  cardOneTitle: 'Teams Hub',
  cardOneBody:
    'A central hub providing an overview of all activity and customizable views that let you dig into the details for each team.',
  cardTwoTitle: 'Member & team management',
  cardTwoBody:
    'Easily browse, find, and manage all teams and members in one convenient area. Add, remove, or update roles with ease.',
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
 * NEVER THROWS on a status — it answers `{status, data, error}`. A `.catch()` on
 * this is inert and a failed call would read as a success, so every call below
 * that something depends on has its `status` checked. It is lib/fixture.mjs's
 * one client, not a copy (`suite-hygiene/apiAs-duplicated-62`), and like the
 * copy it throws only when nothing answers at all.
 */
const apiAs = apiAsAt(API, { noAnswer: 'throw' })

/** Collapse the whitespace a flex layout introduces before comparing copy. */
const flat = (s) => s.replace(/\s+/g, ' ').trim()

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())

/*
 * EVERY CLICK IN THIS SUITE IS BOUNDED. A control one of this suite's own break
 * patches removes is a failing check below; an unqualified `.click()` is instead
 * thirty seconds and a run that ends where it stood, with the checks after it
 * never reported. Eleven patches across nine suites did exactly that before this
 * was applied ahead of the runs rather than after them.
 */
try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const stamp = Date.now()

  /*
   * A WORKSPACE OF THIS SUITE'S OWN.
   *
   * "No teams exist" cannot be asserted about a database other suites are
   * writing to. Creating one costs a request and makes every check below a
   * statement about something this run controls end to end.
   */
  const made = await A('/workspaces', { method: 'POST', body: { name: `Teams empty ${stamp}` } })
  const workspaceId = made.data?.id ?? made.data?.workspace?.id
  if (!workspaceId) {
    throw new Error(`could not create a workspace: ${made.status} ${JSON.stringify(made.error)}`)
  }

  console.log('\n▶ the precondition, stated rather than assumed')
  const before = await A(`/workspaces/${workspaceId}/groups`)
  chk(
    before.status === 200 && Array.isArray(before.data) && before.data.length === 0,
    'a workspace created a moment ago has no teams in it',
    `GET /groups answered ${before.status} with ${JSON.stringify(before.data)?.slice(0, 120)} — ` +
      'if it already had teams, the empty state below would be asserted against the wrong state',
  )

  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${workspaceId}/teams`, { waitUntil: 'domcontentloaded' })

  console.log('\n▶ frame `20:57` — the empty state, in the frame’s own words')
  const emptyShown = await waitUntil(
    () => page.getByTestId('teams-empty').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  chk(
    emptyShown,
    'with no teams, the Teams page is the empty state',
    'teams-empty never rendered — the page with nothing on it is still blank',
  )

  const headline = flat(await readText(page.getByTestId('teams-empty-headline').filter({ visible: true })))
  chk(
    headline === COPY.headline,
    'the headline is the frame’s headline',
    `it read ${JSON.stringify(headline)}, not ${JSON.stringify(COPY.headline)}`,
  )

  const body = flat(await readText(page.getByTestId('teams-empty-body').filter({ visible: true })))
  chk(
    body === COPY.body,
    'and the line under it says what the hub is for',
    `it read ${JSON.stringify(body)}`,
  )

  /*
   * THIS CHECK ASSERTED `cardCount === 2`, AND SAID "the frame draws exactly
   * two". IT DID NOT.
   *
   * `20:57` draws the second card CLIPPED at the right edge with `←` `→`
   * centred beneath it — a grid of two needs neither — and `21:02` shows the
   * set advanced by one, Teams Hub gone left, Member & team management centre,
   * a third card entering from the right. The frame's number is three and its
   * mechanism is a carousel.
   *
   * So the old check enforced the ABSENCE of what the frame asks for: it was
   * green over a static pair and would have gone RED the day somebody built
   * the carousel correctly. That is the worst kind of check there is, and it
   * carried the frame's authority in its own failure message while doing it.
   *
   * THE COUNT AND THE PAGER ARE ASSERTED; THE THIRD CARD'S PROSE IS NOT.
   * `21:02` cuts that card at the viewport after "Stay focused with P…", so
   * its tail is ours — and a check comparing our own string to itself proves
   * nothing. The first two cards' copy IS legible in full and is still checked
   * below, by name.
   */
  const cards = page.getByTestId('teams-empty-card')
  const cardCount = await cards.count()
  chk(
    cardCount === 3,
    'there are the frame’s three explainer cards',
    `there are ${cardCount} — \`21:02\` advances the carousel and a third card enters from the right`,
  )
  const pagerPrev = await page.getByTestId('teams-empty-pager-prev').count()
  const pagerNext = await page.getByTestId('teams-empty-pager-next').count()
  chk(
    pagerPrev === 1 && pagerNext === 1,
    'and the pager the frame centres beneath them',
    `prev ${pagerPrev}, next ${pagerNext} — \`20:57\` draws \`←\` \`→\` under the cards, which a ` +
      'static grid of two would have no use for',
  )
  /*
   * AND IT MOVES. A pager that renders and does nothing is the dead control,
   * and `data-index` is the carousel's own claim about where it is — so the
   * check reads the INDEX before and after, rather than asserting that a
   * button exists.
   */
  const carousel = page.getByTestId('teams-empty-carousel')
  const idxBefore = await carousel.getAttribute('data-index', { timeout: 5000 }).catch(() => null)
  await page.getByTestId('teams-empty-pager-next').click({ timeout: 8000 }).catch(() => {})
  const advanced = await waitUntil(
    async () => (await carousel.getAttribute('data-index')) === '1',
    { timeoutMs: 8000 },
  )
  const idxAfter = await carousel.getAttribute('data-index', { timeout: 5000 }).catch(() => null)
  chk(
    idxBefore === '0' && advanced,
    'pressing → advances it, as it advances between `20:57` and `21:02`',
    `the carousel went from ${idxBefore} to ${idxAfter}`,
  )
  /*
   * WRAPPING, because three cards and two arrows cannot express an end state
   * the frame never draws. Pressing → twice more from here has to come back to
   * the first card rather than stop dead on a control that looks broken.
   */
  await page.getByTestId('teams-empty-pager-next').click({ timeout: 8000 }).catch(() => {})
  await page.getByTestId('teams-empty-pager-next').click({ timeout: 8000 }).catch(() => {})
  const wrapped = await waitUntil(
    async () => (await carousel.getAttribute('data-index')) === '0',
    { timeoutMs: 8000 },
  )
  /*
   * Read once, bounded: a chk message is evaluated on the pass as well as on the
   * failure, so an unbounded read here would wait out the default timeout and end
   * the run when a patch removes the carousel. The locator sits in a variable —
   * the shape rule six could not see until it learnt to track locator variables.
   */
  const idxWrapped = await carousel.getAttribute('data-index', { timeout: 8000 }).catch(() => null)
  chk(
    wrapped,
    'and it wraps rather than stopping dead on an arrow that still looks live',
    `after three presses it sits at ${JSON.stringify(idxWrapped)}, not back at 0`,
  )

  const cardOne = flat(await readText(cards.nth(0).filter({ visible: true })))
  chk(
    cardOne.includes(COPY.cardOneTitle) && cardOne.includes(COPY.cardOneBody),
    'the first is Teams Hub, with what it explains',
    `the first card read ${JSON.stringify(cardOne.slice(0, 160))}`,
  )

  const cardTwo = flat(await readText(cards.nth(1).filter({ visible: true })))
  chk(
    cardTwo.includes(COPY.cardTwoTitle) && cardTwo.includes(COPY.cardTwoBody),
    'the second is Member & team management, with what it explains',
    `the second card read ${JSON.stringify(cardTwo.slice(0, 160))}`,
  )

  /*
   * The frame's nav lists Analytics and nothing exists behind it.
   * `teams-destination.mjs` guards the page for that word — but it only ever
   * sees a workspace that HAS a team, so it never reads this copy. This is the
   * same rule, applied to the text it cannot reach.
   */
  const emptyText = flat(await readText(page.getByTestId('teams-empty').filter({ visible: true })))
  chk(
    emptyText !== '' && !/analytics/i.test(emptyText),
    'and the copy promises nothing that has nothing behind it',
    `the empty state mentions Analytics: ${JSON.stringify(emptyText.slice(0, 160))}`,
  )

  console.log('\n▶ Browse People goes somewhere, and it is where it says')
  await page.getByTestId('teams-empty-browse').click({ timeout: 8000 }).catch(() => {})
  const peopleArrived = await waitUntil(
    async () => (await page.getByTestId('teams-person').count()) > 0,
    { timeoutMs: 15_000 },
  )
  chk(
    peopleArrived,
    'Browse People lands on All People, with people on it',
    'after clicking Browse People there was nobody on screen — the button is decoration',
  )
  chk(
    (await page.getByTestId('teams-empty').count()) === 0,
    'and the empty state is behind us rather than still underneath',
    'the empty state was still rendered after Browse People — the click changed nothing',
  )

  console.log('\n▶ Create Team leaves a real team behind')
  await page.getByTestId('teams-tab-teams').click({ timeout: 8000 }).catch(() => {})
  await waitUntil(() => page.getByTestId('teams-empty-create').isVisible().catch(() => false), {
    timeoutMs: 10_000,
  })
  await page.getByTestId('teams-empty-create').click({ timeout: 8000 }).catch(() => {})
  const dialogOpen = await waitUntil(
    () => page.getByTestId('teams-create-dialog').isVisible().catch(() => false),
    { timeoutMs: 10_000 },
  )
  chk(dialogOpen, 'Create Team opens somewhere to name it',
    'the Create Team dialog never opened')

  const teamName = `Bridge crew ${stamp}`
  await page.getByTestId('teams-create-name').fill(teamName)
  await page.getByTestId('teams-create-submit').click({ timeout: 8000 }).catch(() => {})

  /*
   * THE SERVER IS THE WITNESS, not the screen. A page that draws the row it
   * just typed is exactly the facade this suite exists to refuse.
   */
  const landed = await waitUntil(async () => {
    const rows = await A(`/workspaces/${workspaceId}/groups`)
    return rows.status === 200 && (rows.data ?? []).some((g) => g.name === teamName)
  }, { timeoutMs: 15_000 })
  chk(
    landed,
    'the team it created is a team the API agrees exists',
    'nothing was created — Create Team only closed a dialog',
  )

  const goneAfterCreate = await waitUntil(
    async () => (await page.getByTestId('teams-empty').count()) === 0,
    { timeoutMs: 15_000 },
  )
  chk(
    goneAfterCreate,
    'and the empty state gives way now that there is something to show',
    'the empty state was still on screen with a team in the workspace — it renders unconditionally, ' +
      'which makes it useless as a signal',
  )

  const rowText = flat(await readText(page.getByTestId('teams-row').first().filter({ visible: true })))
  chk(
    rowText.includes(teamName),
    'the new team is the one in the list',
    `the first row read ${JSON.stringify(rowText.slice(0, 120))}`,
  )

  console.log('\n▶ and it comes back, because it is driven by the teams and not by a flag')
  const created = ((await A(`/workspaces/${workspaceId}/groups`)).data ?? [])
    .find((g) => g.name === teamName)
  const removed = await A(`/workspaces/${workspaceId}/groups/${created?.id}`, { method: 'DELETE' })
  chk(
    removed.status < 400,
    'the team can be deleted again',
    `DELETE answered ${removed.status} — the state below cannot be tested`,
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  const backAgain = await waitUntil(
    () => page.getByTestId('teams-empty').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  chk(
    backAgain,
    'with the last team gone, the empty state returns',
    'the empty state did not come back after the only team was deleted — it is a one-shot, ' +
      'not a reading of the data',
  )

  console.log('\n▶ and for somebody who may not create one, it says so')
  /*
   * The API gates creation behind `WorkspaceAdminGuard`. A button that 403s is
   * a dead end wearing an enabled button's clothes, so the page disables it —
   * and this check proves the disabling matches the server rather than being a
   * decision the UI made up.
   */
  const memberEmail = `teams-empty-${stamp}@rundesk.invalid`
  const memberPass = 'Viewer@123!'
  const registered = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: memberEmail, displayName: `Empty Viewer ${stamp}`, password: memberPass }),
  })
  if (!registered.ok) throw new Error(`could not register a plain member: ${registered.status}`)
  const added = await A(`/workspaces/${workspaceId}/members`, {
    method: 'POST',
    body: { email: memberEmail, role: 'member' },
  })
  if (added.status >= 400) throw new Error(`could not add the member: ${added.status}`)

  const asMember = apiAs((await signInApi(API, memberEmail, memberPass)).accessToken)
  const refused = await asMember(`/workspaces/${workspaceId}/groups`, {
    method: 'POST',
    body: { name: `Should not exist ${stamp}` },
  })
  chk(
    refused.status === 403,
    'the server refuses a team created by a plain member',
    `it answered ${refused.status} — if a member may create teams, the button must be enabled for them`,
  )

  const memberPage = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await memberPage.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await memberPage.fill('input[type=email]', memberEmail)
  await memberPage.fill('input[type=password]', memberPass)
  await memberPage.click('button[type=submit]')
  await memberPage.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await memberPage.goto(`${stack.base}/app/${workspaceId}/teams`, { waitUntil: 'domcontentloaded' })
  const memberSeesEmpty = await waitUntil(
    () => memberPage.getByTestId('teams-empty-create').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  const disabled = memberSeesEmpty
    ? await memberPage.getByTestId('teams-empty-create').isDisabled()
    : false
  chk(
    memberSeesEmpty && disabled,
    'and the page offers them a disabled button with a reason, not a 403',
    memberSeesEmpty
      ? 'Create Team was enabled for a member the server will refuse — the click is a dead end'
      : 'the member never saw the empty state at all',
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
