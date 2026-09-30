/**
 * THE SERVICE WORKER KEEPS THE APP'S OWN FILES, AND NOBODY'S DATA.
 *
 * NOT A FRAME ROW: found on 23 September when a route in `webhook-access` never
 * fired. The worker sent every `GET /api/v1/*` through `NetworkFirst` into a
 * `rundesk-api` cache keyed by URL alone and kept for a day. Measured on lane 1:
 * signed in as the super admin it held `/users/me` (with the email),
 * `/ops/metrics`, `/ops/tenant-databases` and the organisation's workspaces, and
 * after the session was cleared all eleven answers were still there — served to
 * whoever signed in next on that browser when a request took over five seconds.
 *
 * And signing out: the super-admin console's own copy of "Sign out" called the
 * logout endpoint only when a refresh token was stored, which a cookie session
 * never has — `/auth/refresh` with the cookies left behind answered 200 after
 * it. Both sign-outs are now one function, and both are checked here.
 *
 * So this runs WITH the worker, the one suite that must: every other browser
 * suite that routes requests blocks it. Each absence is paired with what makes
 * it mean something — the worker live and caching the app's files — and each
 * deletion is of a cache the suite itself planted, the way an older worker
 * would have left it.
 *
 *   node test/e2e/sw-api-cache.mjs --api 3011
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { madeAccount } from './lib/made.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 5

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const API_CACHE = 'rundesk-api'

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
let browser = null

try {
  browser = await chromium.launch(launchOptions())
  // NO `serviceWorkers: 'block'` — the worker is what this suite is about.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const tab = await ctx.newPage()

  /** Every cache and the URLs in it, read inside the page. */
  const cacheMap = () =>
    tab.evaluate(async () => {
      if (typeof caches === 'undefined') return null
      const out = {}
      for (const name of await caches.keys()) {
        const keys = await (await caches.open(name)).keys()
        out[name] = keys.map((r) => new URL(r.url).pathname)
      }
      return out
    }).catch(() => null)
  const controlled = () => tab.evaluate(() => Boolean(navigator.serviceWorker?.controller)).catch(() => false)
  /** An API answer in the cache an older worker used, as it would have written it. */
  const plant = () =>
    tab.evaluate(async (name) => {
      const c = await caches.open(name)
      await c.put('/api/v1/users/me', new Response(JSON.stringify({ data: { email: 'somebody-else@rundesk.invalid' } }), { headers: { 'content-type': 'application/json' } }))
      return (await caches.keys()).includes(name)
    }, API_CACHE).catch(() => false)
  const hasApiCache = () => tab.evaluate((name) => caches.has(name), API_CACHE).catch(() => true)
  /** What the server says to the cookies left in this browser: 200 is a live session. */
  const refreshStatus = (page) =>
    page.evaluate(async () => {
      const m = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/)
      const headers = { 'content-type': 'application/json' }
      if (m) headers['X-CSRF-Token'] = decodeURIComponent(m[1])
      return (await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include', headers, body: '{}' })).status
    }).catch(() => 0)

  await tab.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await tab.fill('input[type=email]', EMAIL)
  await tab.fill('input[type=password]', PASSWORD)
  await tab.click('button[type=submit]')
  await tab.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await tab.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  // The worker installs on the first load and takes the page on a later one.
  await waitUntil(async () => {
    if (await controlled()) return true
    await tab.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
    return false
  }, { timeoutMs: 45_000, stepMs: 3000 })

  // ══ 1. WHAT THE WORKER KEEPS ═════════════════════════════════════════════
  console.log('\n▶ the worker keeps the app’s files and no API answer')

  // Read the app the way somebody does, so the API is asked for plenty.
  for (const route of ['/app', '/app/profile', '/app']) {
    await tab.goto(`${B}${route}`, { waitUntil: 'domcontentloaded' })
    await tab.waitForTimeout(2500)
  }
  const map = (await cacheMap()) ?? {}
  const assets = Object.entries(map).filter(([name]) => name !== API_CACHE).reduce((n, [, urls]) => n + urls.length, 0)
  const isController = await controlled()
  chk(
    isController && assets > 0,
    'the service worker controls the page and keeps the app’s own files',
    `controlled ${isController}; ${assets} file(s) across ${JSON.stringify(Object.keys(map))}`,
  )
  const apiAnswers = Object.entries(map).flatMap(([name, urls]) => urls.filter((u) => u.startsWith('/api/')).map((u) => `${name}: ${u}`))
  chk(
    isController && apiAnswers.length === 0 && !(API_CACHE in map),
    'and after reading home and the profile, not one API answer is in any cache',
    `${apiAnswers.length} API answer(s) cached: ${JSON.stringify(apiAnswers.slice(0, 5))}`,
  )

  // ══ 2. WHAT AN OLDER WORKER LEFT ═════════════════════════════════════════
  console.log('\n▶ what an older worker stored is deleted')

  const plantedAtStart = await plant()
  await tab.reload({ waitUntil: 'domcontentloaded' })
  await waitUntil(async () => !(await hasApiCache()), { timeoutMs: 10_000 })
  const afterStart = await hasApiCache()
  chk(
    plantedAtStart && !afterStart,
    'an API cache left from before is gone once the app starts again',
    `planted ${plantedAtStart}; still there after the reload: ${afterStart}`,
  )

  // ══ 3. SIGNING OUT ═══════════════════════════════════════════════════════
  console.log('\n▶ signing out — from the super-admin console and from the topbar — ends the session and deletes it')

  // The super admin's pages live in the console, which has its own Sign out.
  await tab.goto(`${B}/app/admin`, { waitUntil: 'domcontentloaded' })
  const plantedLater = await plant()
  await tab.getByRole('button', { name: /^Sign out$/ }).click({ timeout: 15_000 }).catch(() => {})
  await tab.waitForURL(/\/login/, { timeout: 15_000 }).catch(() => {})
  await waitUntil(async () => !(await hasApiCache()), { timeoutMs: 10_000 })
  const afterSignOut = await hasApiCache()
  const onLogin = /\/login/.test(tab.url())
  const consoleRefresh = await refreshStatus(tab)
  chk(
    plantedLater && onLogin && !afterSignOut && consoleRefresh === 401,
    'the console’s Sign out ends the session — the cookies left behind refresh nothing — and deletes an API cache written after start-up',
    `planted ${plantedLater}; on the sign-in page ${onLogin}; cache still there ${afterSignOut}; refresh answered ${consoleRefresh}`,
  )

  // A member's pages have the topbar, and its Sign out.
  const memberEmail = `sw-${Date.now()}@rundesk.invalid`
  // Registered, so the account is removed when the run ends (`lib/made.mjs`).
  madeAccount({ email: memberEmail })
  const signup = await fetch(`${B}/api/v1/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fullName: 'Worker member', email: memberEmail, password: 'Member@12345!', organizationName: `Worker ${memberEmail}`, organizationSlug: `worker-${Date.now()}` }),
  })
  if (!signup.ok) throw new Error(`could not sign the member up: ${signup.status}`)
  const mctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const mt = await mctx.newPage()
  await mt.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await mt.fill('input[type=email]', memberEmail)
  await mt.fill('input[type=password]', 'Member@12345!')
  await mt.click('button[type=submit]')
  await mt.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await mt.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  // As above: the worker's first activation reloads the page, and a press
  // made before then lands on a page that is about to go away.
  await waitUntil(async () => {
    if (await mt.evaluate(() => Boolean(navigator.serviceWorker?.controller)).catch(() => false)) return true
    await mt.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
    return false
  }, { timeoutMs: 45_000, stepMs: 3000 })
  await mt.getByTestId('user-menu').waitFor({ timeout: 20_000 }).catch(() => {})
  const memberPlanted = await mt.evaluate(async (name) => {
    await (await caches.open(name)).put('/api/v1/users/me', new Response('{}'))
    return caches.has(name)
  }, API_CACHE).catch(() => false)
  await mt.getByTestId('user-menu').click({ timeout: 15_000 }).catch(() => {})
  // The menu used to run past the bottom of a 900px window, Sign out with it.
  await mt.getByTestId('menu-sign-out').waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {})
  const menuFits = await mt.evaluate(() => {
    const menu = document.querySelector('[role=menu]')
    if (!menu) return false
    return menu.getBoundingClientRect().bottom <= window.innerHeight
  }).catch(() => false)
  await mt.getByTestId('menu-sign-out').click({ timeout: 10_000 }).catch(() => {})
  await mt.waitForURL(/\/login/, { timeout: 15_000 }).catch(() => {})
  await waitUntil(async () => !(await mt.evaluate((name) => caches.has(name), API_CACHE).catch(() => true)), { timeoutMs: 10_000 })
  const memberCache = await mt.evaluate((name) => caches.has(name), API_CACHE).catch(() => true)
  const memberRefresh = await refreshStatus(mt)
  chk(
    menuFits && memberPlanted && /\/login/.test(mt.url()) && !memberCache && memberRefresh === 401,
    'and the topbar’s Sign out — its menu inside a 1440×900 window — does the same for a member',
    `menu fits ${menuFits}; planted ${memberPlanted}; on the sign-in page ${/\/login/.test(mt.url())}; cache still there ${memberCache}; refresh answered ${memberRefresh}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
