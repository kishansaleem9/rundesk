/**
 * A HEADER DECLARED STICKY STAYS AT THE TOP OF WHAT SCROLLS UNDER IT.
 *
 * NOT FRAME ROWS: `resume-defects/resume-6-list-table` and
 * `resume-defects/resume-6-workload`. The list's Table view and the Workload
 * heat map each drew their header `sticky top-0` inside an `overflow-x-auto`
 * box with no height. That box is the header's scrollport (overflow-x auto
 * makes overflow-y auto too), and a box with no height never scrolls, so the
 * header could never stick: scroll the rows and it went with them. The timeline
 * page diagnosed and fixed the same shape (`workspace-timeline-page.tsx`).
 *
 * Each check scrolls whatever scrolls the rows — the nearest ancestor that
 * really does scroll — and reads where the header is afterwards. Rows are
 * planted by SQL: thirty tasks, and thirty teammates, more than either pane
 * holds, so something under each header has to scroll.
 *
 *   node test/e2e/sticky-headers.mjs --api 3021
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 3

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

/*
 * IN THE PAGE: the nearest ancestor of `el` that really scrolls vertically is
 * scrolled by `by`, and the header's offset from that scroller's top is read
 * before and after, with the first row's. A header that sticks stays at 0 and
 * the rows pass under it.
 */
const SCROLL_AND_READ = async (handle, rowSelector, by) =>
  handle.evaluate(async (el, [rowSel, dy]) => {
    const scrolls = (p) => p.scrollHeight > p.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(p).overflowY)
    let p = el.parentElement
    while (p && !scrolls(p)) p = p.parentElement
    const scroller = p ?? document.scrollingElement
    const topOf = (n) => n.getBoundingClientRect().top - (scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top)
    const row = el.parentElement?.parentElement?.querySelector(rowSel) ?? document.querySelector(rowSel)
    const before = { head: Math.round(topOf(el)), row: row ? Math.round(topOf(row)) : null }
    scroller.scrollTop += dy
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const moved = scroller.scrollTop
    const after = { head: Math.round(topOf(el)), row: row ? Math.round(topOf(row)) : null }
    return {
      scroller: scroller === document.scrollingElement ? 'the page' : `${scroller.tagName.toLowerCase()}.${String(scroller.className).split(' ').slice(0, 3).join('.')}`,
      moved,
      before,
      after,
    }
  }, [rowSelector, by])

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
const stamp = Date.now()
const TAG = `sth-${stamp}`
let browser = null
let sql = null
let WS = null
let token = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the rows are planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  token = auth.accessToken
  const call = async (route, init = {}) => {
    const res = await fetch(`${API}${route}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: init.body ? JSON.stringify(init.body) : undefined })
    return { status: res.status, data: (await res.json().catch(() => null))?.data }
  }
  const made = await call('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const make = async (route, body, what) => {
    const res = await call(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${res.status}`)
    return res.data.id
  }
  const SPACE = await make('/spaces', { workspaceId: WS, name: `${TAG} space` }, 'the space')
  const PROJECT = await make('/projects', { spaceId: SPACE, name: `${TAG} project` }, 'the project')
  const LIST = await make('/lists', { projectId: PROJECT, name: `${TAG} list` }, 'the list')
  await sql`insert into tasks (list_id, title, position) select ${LIST}, ${`${TAG} task `} || n, n from generate_series(1, 30) as n`
  // Over the table's virtualising threshold (120): its rows are drawn as they
  // scroll into view, by the pane the header sticks to.
  const BIG = await make('/lists', { projectId: PROJECT, name: `${TAG} big list` }, 'the big list')
  await sql`insert into tasks (list_id, title, position) select ${BIG}, ${`${TAG} big `} || lpad(n::text, 3, '0'), n from generate_series(1, 150) as n`
  await sql`
    with u as (
      insert into users (email, display_name)
      select ${`${TAG}-`} || n || '@rundesk.invalid', 'Teammate ' || n from generate_series(1, 30) as n
      returning id)
    insert into workspace_members (workspace_id, user_id) select ${WS}, id from u`

  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 700 } })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  // ══ 1. THE LIST'S TABLE ══════════════════════════════════════════════════
  console.log('\n▶ the Table view of a list of thirty, scrolled')
  await page.goto(`${B}/app/${WS}/${SPACE}/${PROJECT}/${LIST}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('work-view-tab-type-table').click({ timeout: 20_000 }).catch(() => {})
  const head = page.getByTestId('list-table-head')
  await head.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(800)
  const table = await head.elementHandle({ timeout: 5000 }).then((h) => SCROLL_AND_READ(h, '[data-testid="list-table-status-cell"]', 400)).catch(() => null)
  chk(
    !!table && table.moved > 0 && table.after.head === table.before.head && table.after.row !== null && table.after.row < table.after.head,
    'the list table’s header stays at the top of its pane while thirty rows scroll under it',
    table ? `scrolled ${table.scroller} by ${table.moved}px: the header went from ${table.before.head} to ${table.after.head}, the first row from ${table.before.row} to ${table.after.row}` : 'there was no table header to scroll',
  )

  // ══ 2. THE VIRTUALISED TABLE ═════════════════════════════════════════════
  console.log('\n▶ the Table view of a list of 150, scrolled to the end')
  await page.goto(`${B}/app/${WS}/${SPACE}/${PROJECT}/${BIG}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('work-view-tab-type-table').click({ timeout: 20_000 }).catch(() => {})
  await head.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(800)
  const lastTitle = `${TAG} big 150`
  const lastBefore = await page.getByText(lastTitle, { exact: true }).count()
  const big = await head.elementHandle({ timeout: 5000 }).then((h) => SCROLL_AND_READ(h, '[data-testid="list-table-status-cell"]', 100_000)).catch(() => null)
  const lastShown = await page.getByText(lastTitle, { exact: true }).first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)
  chk(
    !!big && big.moved > 0 && big.after.head === big.before.head && lastBefore === 0 && lastShown,
    'with 150 rows, drawn as they scroll into view, the header stays at the top of the pane and the pane reaches the last row',
    big ? `scrolled ${big.scroller} by ${big.moved}px: the header went from ${big.before.head} to ${big.after.head}; the last task drawn before the scroll: ${lastBefore > 0}, after it: ${lastShown}` : 'there was no table header to scroll',
  )

  // ══ 3. THE WORKLOAD HEAT MAP ═════════════════════════════════════════════
  console.log('\n▶ the Workload heat map of thirty-one teammates, scrolled')
  await page.goto(`${B}/app/${WS}/workload`, { waitUntil: 'domcontentloaded' })
  // The heat map's own header row. "Teammate" also heads the time-reporting
  // table above it, which is not sticky and not what this is about; a build
  // from before the testid is found by the sticky row it is.
  const heat = page.getByTestId('workload-heat-head')
    .or(page.locator('div.sticky', { has: page.getByText('Teammate', { exact: true }) }))
    .first()
  await heat.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await page.getByText('Teammate 30', { exact: false }).first().waitFor({ state: 'attached', timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(800)
  const map = await heat.elementHandle({ timeout: 5000 }).then((h) => SCROLL_AND_READ(h, '[data-testid^="workload-row-"], [data-testid^="workload-member-"]', 300)).catch(() => null)
  chk(
    !!map && map.moved > 0 && map.after.head === map.before.head,
    'the workload heat map’s header stays at the top of its pane while its rows scroll under it',
    map ? `scrolled ${map.scroller} by ${map.moved}px: the header went from ${map.before.head} to ${map.after.head}` : 'there was no heat-map header to scroll',
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && token) {
    const gone = await fetch(`${API}/workspaces/${WS}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).catch(() => null)
    if (![200, 204, 404].includes(gone?.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone?.status ?? 'nothing'}`)
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  if (sql) await sql`delete from users where email like ${`${TAG}-%`}`.catch(() => {})
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
