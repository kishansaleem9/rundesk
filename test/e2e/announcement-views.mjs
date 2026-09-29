/**
 * AN ANNOUNCEMENT'S VIEWS ARE THE PEOPLE SHOWN IT, AND ONLY A LIVE ONE IS
 * VIEWED OR DISMISSED.
 *
 * NOT A FRAME ROW: `found-28-sep/announcement-views-counted-per-click` and
 * `found-28-sep/announcements-flag-gates-nothing`, found by the announcement
 * research. `POST .../view` added 1 per call, and the home page's Mark seen
 * called it on every click while changing nothing on the page; `view` and
 * `dismiss` checked only the workspace and the id, so a paused or expired
 * announcement took both. And the `chat.announcements` feature flag, switched
 * in the platform console and written by sign-up's Chat pick, gated nothing.
 *
 * ClickUp has no workspace banner (the announcements controller says why), so
 * this is the product's own rule: a view is a person, recorded when the banner
 * or What's new shows the announcement; a dismissal is a view too; paused and
 * expired ones are shown to nobody, so nobody views or dismisses them; and the
 * switch that gated nothing is gone.
 *
 *   node test/e2e/announcement-views.mjs --api 3027 --dist /tmp/claude-0/dist-7
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 9

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
const ok = (res) => res.status >= 200 && res.status < 300

const stamp = Date.now()
const TAG = `anv${stamp}`
const PASSWORD = 'AnnounceViews@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the counts and each person’s rows are read by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `Views ${key}`, email, password: PASSWORD, organizationName: `Views ${key} ${stamp}`, organizationSlug: `views-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    return { email, password: PASSWORD, id: signed.user?.id, as: apiAs(signed.accessToken) }
  }
  const [one, two, three, four, five] = [await person('one'), await person('two'), await person('three'), await person('four'), await person('five')]

  const publish = async (title, extra = {}) => {
    const r = await A(`/workspaces/${WS}/announcements`, { method: 'POST', body: { title, body: `${title} body`, tone: 'info', ...extra } })
    if (!ok(r) || !r.data?.id) throw new Error(`could not publish "${title}": ${said(r)}`)
    return r.data
  }
  // The older live one first: the banner shows the newest, What's new lists both.
  const older = await publish(`${TAG} older news`)
  const paused = await publish(`${TAG} paused`, { isActive: false })
  const expired = await publish(`${TAG} expired`, { expiresAt: new Date(Date.now() - 86_400_000).toISOString() })
  await new Promise((r) => setTimeout(r, 20))
  const live = await publish(`${TAG} live`)

  const counts = async (id) => {
    const [row] = await sql`select views, dismisses from announcements where id = ${id}`
    return row ? { views: row.views, dismisses: row.dismisses } : null
  }
  /** Each person's recorded view, or null where there is no such table to read. */
  const viewRows = async (id, userId) => {
    try {
      const rows = userId
        ? await sql`select count(*)::int as n from announcement_views where announcement_id = ${id} and user_id = ${userId}`
        : await sql`select count(*)::int as n from announcement_views where announcement_id = ${id}`
      return rows[0].n
    } catch {
      return null
    }
  }
  const dismissRows = async (id) => (await sql`select count(*)::int as n from announcement_dismissals where announcement_id = ${id}`)[0].n
  const views = (id) => `/workspaces/${WS}/announcements/${id}/view`
  const dismisses = (id) => `/workspaces/${WS}/announcements/${id}/dismiss`

  // ══ 1. ONE VIEW PER PERSON ═══════════════════════════════════════════════
  console.log('\n▶ a live announcement, viewed three times by one member and once by another')
  const calls = [await one.as(views(live.id), { method: 'POST' }), await one.as(views(live.id), { method: 'POST' }), await one.as(views(live.id), { method: 'POST' }), await two.as(views(live.id), { method: 'POST' })]
  const afterViews = await counts(live.id)
  const recorded = await viewRows(live.id)
  chk(
    calls.every(ok) && afterViews?.views === 2 && recorded === 2,
    'three views by one member and one by another count two — one per person, each recorded once',
    `answers ${JSON.stringify(calls.map((c) => c.status))}; views ${afterViews?.views}; rows ${recorded}`,
  )

  // ══ 2–3. PAUSED AND EXPIRED ARE VIEWED AND DISMISSED BY NOBODY ═══════════
  for (const [what, item] of [['a paused', paused], ['an expired', expired]]) {
    console.log(`\n▶ ${what} announcement, viewed and dismissed by a member`)
    const v = await one.as(views(item.id), { method: 'POST' })
    const d = await one.as(dismisses(item.id), { method: 'POST' })
    const c = await counts(item.id)
    const dr = await dismissRows(item.id)
    chk(
      v.status === 404 && d.status === 404 && c?.views === 0 && c?.dismisses === 0 && dr === 0,
      `${what} announcement is refused a view and a dismissal (404), and its counts stay 0 — nobody is shown it`,
      `view ${said(v)}; dismiss ${said(d)}; counts ${JSON.stringify(c)}; dismissal rows ${dr}`,
    )
  }

  // ══ 4. A DISMISSAL IS A VIEW, AND ONE PER PERSON ═════════════════════════
  console.log('\n▶ a member who never viewed it dismisses the live announcement, twice')
  const beforeDismiss = await counts(live.id)
  const d1 = await three.as(dismisses(live.id), { method: 'POST' })
  const d2 = await three.as(dismisses(live.id), { method: 'POST' })
  const afterDismiss = await counts(live.id)
  const threeViewed = await viewRows(live.id, three.id)
  chk(
    ok(d1) && ok(d2) && afterDismiss?.dismisses === (beforeDismiss?.dismisses ?? -1) + 1
      && afterDismiss?.views === (beforeDismiss?.views ?? -1) + 1 && threeViewed === 1,
    'a member who dismisses without having viewed is counted a viewer too, once, and two dismissals by them are one',
    `answers ${d1.status}, ${d2.status}; before ${JSON.stringify(beforeDismiss)}; after ${JSON.stringify(afterDismiss)}; their view rows ${threeViewed}`,
  )

  // ══ 5–7. THE PAGES RECORD WHAT THEY SHOW ═════════════════════════════════
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const signedInPage = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return page
  }

  console.log('\n▶ the workspace home, for a member who has not seen the banner')
  const beforeHome = await counts(live.id)
  const hp = await signedInPage(four)
  await hp.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  const bannerShown = await waitUntil(() => hp.getByText(live.title, { exact: true }).first().isVisible().catch(() => false), { timeoutMs: 20_000 })
  const offers = {
    dismiss: await hp.getByRole('button', { name: /^Dismiss$/ }).count(),
    markSeen: await hp.getByRole('button', { name: /^Mark seen$/ }).count(),
  }
  chk(
    bannerShown && offers.dismiss >= 1 && offers.markSeen === 0,
    'the home banner offers Dismiss and no Mark seen, a button that counted a click and changed nothing',
    `banner shown ${bannerShown}; buttons ${JSON.stringify(offers)}`,
  )

  const firstVisit = await waitUntil(async () => (await viewRows(live.id, four.id)) === 1, { timeoutMs: 10_000 })
  await hp.reload({ waitUntil: 'domcontentloaded' })
  await waitUntil(() => hp.getByText(live.title, { exact: true }).first().isVisible().catch(() => false), { timeoutMs: 20_000 })
  await hp.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  const afterHome = await counts(live.id)
  const fourRows = await viewRows(live.id, four.id)
  chk(
    bannerShown && firstVisit && fourRows === 1 && afterHome?.views === (beforeHome?.views ?? -1) + 1,
    'showing the banner records the member’s view, and a second visit records nothing more',
    `recorded on the first visit ${firstVisit}; their rows ${fourRows}; views ${beforeHome?.views} → ${afterHome?.views}`,
  )

  console.log("\n▶ the planner's What's new, for a member who has seen neither announcement")
  const pp = await signedInPage(five)
  await pp.goto(`${B}/app/${WS}/calendar`, { waitUntil: 'domcontentloaded' })
  await pp.locator('[data-testid="planner-settings"]').click({ timeout: 20_000 }).catch(() => {})
  await pp.locator('[data-testid="planner-settings-footer-whatsNew"]').click({ timeout: 10_000 }).catch(() => {})
  const listed = await waitUntil(
    async () => (await pp.locator(`[data-testid="planner-whats-new-item"][data-announcement-id="${older.id}"]`).count()) === 1,
    { timeoutMs: 15_000 },
  )
  const olderSeen = await waitUntil(async () => (await viewRows(older.id, five.id)) === 1, { timeoutMs: 10_000 })
  chk(
    listed && olderSeen,
    'What’s new records a view of what it lists — the older announcement too, which the home banner never shows',
    `listed ${listed}; their view of the older one recorded ${olderSeen} (${await viewRows(older.id, five.id)} rows)`,
  )

  // ══ 8–9. THE SWITCH THAT GATED NOTHING IS GONE ═══════════════════════════
  console.log('\n▶ the Announcements feature flag')
  const switched = await A('/feature-flags/chat.announcements', { method: 'PUT', body: { enabled: false, scope: 'workspace', scopeId: WS, workspaceId: WS } })
  const stillServed = await one.as(`/workspaces/${WS}/announcements/active`)
  chk(
    switched.status === 400 && ok(stillServed) && (stillServed.data ?? []).some((a) => a.id === live.id),
    'switching the Announcements flag off is refused as a feature this build does not have (400) — it gated nothing — and the banner is served as before',
    `switch ${said(switched)}; the banner read ${said(stillServed)}`,
  )

  const pickerEmail = `${TAG}-picker@rundesk.invalid`
  const picker = await signUpApi(API, { fullName: 'Views picker', email: pickerEmail, password: PASSWORD, organizationName: `Views picker ${stamp}`, organizationSlug: `views-picker-${stamp}`, features: ['chat'] })
  const written = await sql`
    select f.flag_key from feature_flags f
    join workspace_members m on m.workspace_id = f.workspace_id
    where m.user_id = ${picker.user?.id} and f.flag_key like 'chat%'`
  const keys = written.map((r) => r.flag_key)
  chk(
    keys.includes('chat') && keys.includes('chat.channels') && !keys.includes('chat.announcements'),
    'a newcomer who picks Chat at sign-up gets its switches and no Announcements switch among them',
    `chat switches written ${JSON.stringify(keys.sort())}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  stack.close()
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
