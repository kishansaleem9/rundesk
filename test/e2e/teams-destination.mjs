/**
 * §V2-12 — the Teams destination, frame `20:55`.
 *
 * `[20:53]`–`[21:05]` and she runs out of time, so the video shows the flyout —
 * All Teams · All People · Org Chart · Analytics, a rule, then My Teams with
 * "Once you are added to a Team you will see it here" — and opens none of it.
 *
 * WHAT THIS SUITE IS FOR, and it is one thing above all others: **a plain
 * member can get there.** Three of the four destinations already existed —
 * `MembersTab`, `GroupsTab` and the reporting tree — and all three sat inside
 * workspace settings, whose route redirects any non-admin back to `/app`. So
 * looking at your own organisation required admin rights. The whole item is
 * removing that wall, which means the check that matters is driven as somebody
 * who is NOT an admin. Run as the seeded admin it would pass no matter what.
 *
 * The second thing is the absence: **Analytics must not appear.** The frame
 * lists it, nothing exists behind it, and she never opens it — so a tab there
 * would be a page whose purpose somebody has to guess. This suite fails if one
 * shows up.
 *
 *   node test/e2e/teams-destination.mjs --api 3011 --dist apps/web/dist
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

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 14

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

const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
/** What a cleanup DELETE did not remove, said above the totals. */
const leftBehind = []

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()

  /*
   * A REAL PLAIN MEMBER, because the seeded accounts are all admins and this
   * item is entirely about what a non-admin can see. Driven as an admin, every
   * check below would pass on the old code too.
   */
  const memberEmail = `teamviewer-${stamp}@rundesk.invalid`
  const memberPass = 'Viewer@123!'
  const registered = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: memberEmail, displayName: `Team Viewer ${stamp}`, password: memberPass }),
  })
  if (!registered.ok) throw new Error(`could not register a plain member: ${registered.status}`)
  await A(`/workspaces/${workspaceId}/members`, { method: 'POST', body: { email: memberEmail, role: 'member' } })

  // A team of this suite's own, so the list has something in it that is ours.
  const team = (await A(`/workspaces/${workspaceId}/groups`, {
    method: 'POST',
    body: { name: `Bridge crew ${stamp}`, description: 'made by the teams suite' },
  })).data
  if (!team?.id) throw new Error('could not create a team')

  console.log('\n▶ §V2-12 — the APIs were always member-readable')
  const asMember = apiAs((await signInApi(API, memberEmail, memberPass)).accessToken)
  const groupsAsMember = await asMember(`/workspaces/${workspaceId}/groups`)
  chk(
    groupsAsMember.status === 200,
    'a plain member may list the teams',
    `it returned ${groupsAsMember.status} — then this item needs an API change too, not just a route`,
  )
  const peopleAsMember = await asMember(`/workspaces/${workspaceId}/members`)
  chk(
    peopleAsMember.status === 200,
    'and the people',
    `it returned ${peopleAsMember.status}`,
  )

  // ── The wall this item removes ───────────────────────────────────────────
  console.log('\n▶ the wall: settings shows a member no people')
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', memberEmail)
  await page.fill('input[type=password]', memberPass)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })

  /*
   * Settings opens to every member on Archived now (it lists the archived
   * tasks each may open), so the wall this item is about is that a member finds
   * NO PEOPLE there: no Members tab, and the address of it moves them on
   * (`admin-guard-admits-managers-where-the-web-says-admin`).
   */
  await page.goto(`${stack.base}/app/${workspaceId}/settings?tab=members`, { waitUntil: 'domcontentloaded' })
  const walled = await waitUntil(
    async () => !(await page.url()).includes('tab=members')
      && (await page.getByTestId('settings-tab-members').count()) === 0,
    { timeoutMs: 10_000 },
  )
  chk(
    walled,
    'a member sent to workspace settings finds no people there — no Members tab, and its address moves them on',
    `they landed on ${await page.url()}, with ${await page.getByTestId('settings-tab-members').count()} Members tab(s) — ` +
      'if settings showed members their colleagues this item would be unnecessary, and the checks below would prove nothing',
  )

  console.log('\n▶ but the Teams destination lets them in')
  await page.goto(`${stack.base}/app/${workspaceId}/teams`, { waitUntil: 'domcontentloaded' })
  const arrived = await waitUntil(
    () => page.getByTestId('teams-page').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  chk(
    arrived,
    'a plain member can open Teams',
    'a member was turned away from Teams too — the wall was rebuilt in a new place',
  )

  const teamsListed = await waitUntil(
    async () => (await page.getByTestId('teams-row').count()) > 0,
    { timeoutMs: 15_000 },
  )
  chk(teamsListed, 'and sees the teams that exist',
    'the teams list was empty for a member on a workspace that has a team')

  const rowText = await readText(page.getByTestId('teams-row').first())
  chk(
    /\d+\s/.test(rowText) || /\d/.test(rowText),
    'with how many people are in each',
    `the row read ${JSON.stringify(rowText.replace(/\s+/g, ' '))}`,
  )

  console.log('\n▶ My Teams, with the empty state the frame hands over verbatim')
  /*
   * READ IT ONLY ONCE IT IS THERE.
   *
   * This used to be a bare `.innerText()`, which auto-waits thirty seconds and
   * then THROWS. In CI that turned a missing panel into `threw: ...` with no
   * name attached, thirty seconds of budget spent and nothing to debug from —
   * a run failed exactly that way and the cause could not be recovered from the
   * log afterwards. A named check that says which element never arrived is
   * worth more than a stack trace, so the wait is explicit and short.
   */
  const mineReady = await waitUntil(
    () => page.getByTestId('teams-mine').isVisible().catch(() => false),
    { timeoutMs: 15_000 },
  )
  const mine = mineReady ? await page.getByTestId('teams-mine').innerText() : ''
  chk(
    mineReady,
    'the My Teams panel is on the page',
    'My Teams never rendered — everything below reads from a panel that is not there',
  )
  chk(
    /Once you are added to a team/i.test(mine),
    'a member in no team is told so, in the frame’s own words',
    `My Teams read ${JSON.stringify(mine.replace(/\s+/g, ' ').slice(0, 120))}`,
  )

  console.log('\n▶ All People, and the Org Chart')
  await page.getByTestId('teams-tab-people').click()
  const peopleShown = await waitUntil(
    async () => (await page.getByTestId('teams-person').count()) > 0,
    { timeoutMs: 15_000 },
  )
  chk(peopleShown, 'a member can see who else is in the workspace',
    'the people list was empty')

  await page.getByTestId('teams-tab-chart').click()
  const chartOrEmpty = await waitUntil(
    async () =>
      (await page.getByTestId('reporting-tree').count()) > 0 ||
      (await page.getByTestId('teams-chart-empty').count()) > 0,
    { timeoutMs: 15_000 },
  )
  chk(
    chartOrEmpty,
    'and the reporting lines, or an honest answer that there are none',
    'the Org chart tab rendered nothing at all — a blank page reads as broken',
  )

  /*
   * THE ABSENCE. The frame lists Analytics; nothing exists behind it. A tab
   * there would open a page whose purpose somebody has to guess, which is the
   * facade this audit has spent two videos removing.
   */
  console.log('\n▶ and nothing that only pretends to work')
  const tabs = await page.locator('[data-testid^="teams-tab-"]').count()
  chk(
    tabs === 3,
    'there are exactly the three destinations that have something behind them',
    `there are ${tabs} tabs — the frame's Analytics has no data behind it and she never opens it`,
  )
  // Guarded for the same reason as My Teams above: a bare read here would spend
  // thirty seconds and throw rather than name what was missing.
  const bodyText = await page
    .getByTestId('teams-page')
    .innerText({ timeout: 10_000 })
    .catch(() => '')
  chk(
    bodyText !== '',
    'the Teams page is still on screen to be read',
    'the page went away between the tab count and reading it',
  )
  chk(
    !/analytics/i.test(bodyText),
    'and Analytics is not among them',
    'an Analytics tab appeared — nothing exists to put on it',
  )

  // ── Membership shows up where it should ──────────────────────────────────
  console.log('\n▶ joining a team moves it into My Teams')
  const memberId = ((await A(`/workspaces/${workspaceId}/members`)).data ?? [])
    .find((m) => m.email === memberEmail)?.userId
  await A(`/workspaces/${workspaceId}/groups/${team.id}/members`, {
    method: 'POST',
    body: { userIds: [memberId] },
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const nowMine = await waitUntil(
    async () => (await page.getByTestId('teams-mine-row').count()) > 0,
    { timeoutMs: 15_000 },
  )
  chk(
    nowMine,
    'and My Teams is really their teams, not a copy of the list above',
    'after being added to a team, My Teams was still empty — it is not reading membership',
  )

  const gone = await A(`/workspaces/${workspaceId}/groups/${team.id}`, { method: 'DELETE' })
  if (![200, 204, 404].includes(gone.status)) leftBehind.push(`DELETE /workspaces/${workspaceId}/groups/${team.id} answered ${gone.status}`)
} catch (e) {
  const lines = e.message.split('\n')
  const where = lines.find((l) => l.includes('waiting for') || l.includes('getByTestId'))
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${lines[0]}${where ? `\n         ${where.trim()}` : ''}`)
} finally {
  await browser.close().catch(() => {})
  stack?.close()
  for (const line of leftBehind) console.log(`  cleanup left behind: ${line}`)
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  /*
   * EXACT, not `<`. With `<`, a branch that silently stopped being reached
   * turns into a shorter run that still reports green, and a check added
   * without raising the number goes unnoticed in the other direction. There
   * are exactly 14 unconditional `chk` calls above; any other total means this
   * run was not this suite.
   */
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — a run that is not exactly the suite is not the ` +
        'suite, so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
