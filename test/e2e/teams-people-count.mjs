/**
 * ALL PEOPLE CARRIES THE WORKSPACE'S HEAD COUNT.
 *
 * Frame `21:00`: the Teams Hub's nav draws All Teams · All People · Org Chart ·
 * Analytics, and All People alone carries a number — `2`, muted, at the right
 * of the row. `ledger-rows/row-2398-remainder`: the re-audit's carousel row
 * named the badge and left it open, where no count could see it, and the People
 * tab drew a label and an icon and nothing else.
 *
 * ClickUp (help centre, from search snippets): the "All people" page is for
 * viewing "the people who've joined your Workspace", and people invited who
 * have not joined are filtered apart, as Pending. Here the People tab lists
 * the workspace's members, and the number is theirs.
 *
 * The number is read off the tab and held against the API's list and the cards
 * the tab draws; then a fourth person joins and it has to move, so a number
 * written into the page cannot pass. While the list is on its way the tab has
 * to draw nothing — a 0 there would say the workspace is empty.
 *
 * Its own workspace, and nobody's settings: the admin makes it and is its
 * first member, two newcomers join it, and one of them looks.
 *
 *   node test/e2e/teams-people-count.mjs --api 3024 --dist /tmp/claude-0/dist-4
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 6

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(text) } catch { /* no body */ }
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `tpc${stamp}`
const PASSWORD = 'PeopleCount@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
let WS = null
let A = null
let browser = null

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (key) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    await signUpApi(API, {
      fullName: `${TAG} ${key}`, email, password: PASSWORD,
      organizationName: `People ${key} ${stamp}`, organizationSlug: `people-${key}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
    if (added.status >= 300) throw new Error(`could not add ${key}: ${said(added)}`)
    return email
  }
  const viewer = await person('one')
  await person('two')
  const members = async () => {
    const listed = await A(`/workspaces/${WS}/members`)
    return { res: listed, count: Array.isArray(listed.data) ? listed.data.length : -1 }
  }

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', viewer)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  const badge = page.getByTestId('teams-people-count')
  const badgeText = async () => (await badge.filter({ visible: true }).innerText({ timeout: 3000 }).catch(() => '')).trim()
  const cards = () => page.getByTestId('teams-person').filter({ visible: true }).count()

  // ══ 1. WHILE THE LIST IS ON ITS WAY ═══════════════════════════════════════
  console.log('\n▶ the member list held back')
  // Every read of this workspace's members waits here until the check below
  // has looked, so the page is caught with the list unanswered.
  let release = () => {}
  const gate = new Promise((resolve) => { release = resolve })
  let held = 0
  const theMembers = (url) => url.pathname === `/api/v1/workspaces/${WS}/members`
  await page.route(theMembers, async (route) => {
    held += 1
    await gate
    await route.continue().catch(() => {})
  })
  await page.goto(`${B}/app/${WS}/teams`, { waitUntil: 'domcontentloaded' })
  const tabDrawn = await waitUntil(() => page.getByTestId('teams-tab-people').isVisible().catch(() => false), { timeoutMs: 20_000 })
  const caught = await waitUntil(() => held > 0, { timeoutMs: 10_000 })
  const drawnWhileHeld = await badge.count()
  // Unfiltered, like the two tab reads below: the claim is that NO number is drawn, and a
  // hidden tab read whole is the stricter read (`found-29-sep/innertext-reads-hidden-leaves`).
  const tabWhileHeld = await page.getByTestId('teams-tab-people').innerText({ timeout: 3000 }).catch(() => '') // text-read: absence — no digit on the tab
  chk(
    tabDrawn && caught && drawnWhileHeld === 0 && tabWhileHeld !== '' && !/\d/.test(tabWhileHeld),
    'while the member list is still on its way, the People tab draws no number — not a 0',
    `tab drawn ${tabDrawn}; the list was held ${held} time(s); count drawn ${drawnWhileHeld}; the tab read ${JSON.stringify(tabWhileHeld)}`,
  )
  release()
  await page.unroute(theMembers).catch(() => {})

  // ══ 2. THE LIST HAS ANSWERED ══════════════════════════════════════════════
  console.log('\n▶ the list has answered')
  const counted = await waitUntil(() => badge.isVisible().catch(() => false), { timeoutMs: 15_000 })
  const first = await badgeText()
  const listed = await members()
  chk(
    counted && listed.count === 3 && first === '3',
    'the People tab carries the workspace’s head count, 3, the number of members the API lists',
    `the tab read ${JSON.stringify(first)}; the API listed ${listed.count} (${said(listed.res)})`,
  )
  const teamsTab = await page.getByTestId('teams-tab-teams').innerText({ timeout: 3000 }).catch(() => '') // text-read: absence — no digit on the tab
  const chartTab = await page.getByTestId('teams-tab-chart').innerText({ timeout: 3000 }).catch(() => '') // text-read: absence — no digit on the tab
  chk(
    teamsTab !== '' && chartTab !== '' && !/\d/.test(teamsTab) && !/\d/.test(chartTab),
    'and it is the only tab that carries a number, as in the frame',
    `All teams read ${JSON.stringify(teamsTab)}; Org chart read ${JSON.stringify(chartTab)}`,
  )

  // ══ 3. THE PEOPLE TAB ═════════════════════════════════════════════════════
  console.log('\n▶ the People tab')
  await page.getByTestId('teams-tab-people').click({ timeout: 8000 }).catch(() => {})
  const drew = await waitUntil(async () => (await cards()) === 3, { timeoutMs: 15_000 })
  const drawn = await cards()
  chk(
    drew && first !== '' && Number(first) === drawn,
    'and it is the number of people the tab draws, one card each',
    `the tab read ${JSON.stringify(first)} and drew ${drawn} card(s)`,
  )
  await page.getByTestId('teams-search').fill(`${TAG} two`, { timeout: 5000 }).catch(() => {})
  const narrowed = await waitUntil(async () => (await cards()) === 1, { timeoutMs: 8000 })
  const whileSearched = await badgeText()
  const cardsSearched = await cards()
  chk(
    narrowed && whileSearched === '3',
    'a search narrows the cards to one and leaves the count at 3',
    `the search left ${cardsSearched} card(s) and the tab read ${JSON.stringify(whileSearched)}`,
  )

  // ══ 4. A FOURTH PERSON ════════════════════════════════════════════════════
  console.log('\n▶ a fourth person joins')
  await person('three')
  await page.reload({ waitUntil: 'domcontentloaded' })
  const moved = await waitUntil(async () => (await badgeText()) === '4', { timeoutMs: 15_000 })
  const after = await badgeText()
  const namedAs = await badge.getAttribute('aria-label', { timeout: 3000 }).catch(() => null)
  const relisted = await members()
  chk(
    moved && relisted.count === 4 && namedAs === '4 people in this workspace',
    'a fourth person joining moves it to 4 on the next load, and it says what it counts: “4 people in this workspace”',
    `the tab read ${JSON.stringify(after)}, named ${JSON.stringify(namedAs)}; the API listed ${relisted.count}`,
  )
  await ctx.close().catch(() => {})
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
