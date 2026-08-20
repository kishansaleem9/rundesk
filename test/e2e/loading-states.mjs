/**
 * Waiting states — §2.9a of docs/video1-rundesk-gap-audit.md.
 *
 * The first note in the 7 Aug review, at 00:08:
 *
 *   "humare end pe bhi waiting ka jo time period hai woh BLANK SCREEN na ho —
 *    woh icons hi hon."
 *
 * The app had three separate blank waits, and none of them are visible unless
 * something is slow — which is why they survived every previous browser pass.
 * So this test makes them slow on purpose: it delays the exact response each
 * wait depends on and looks at the screen while it is outstanding.
 *
 *   node test/e2e/loading-states.mjs [--dist <dir>]
 *
 * Builds apps/web unless --dist points at one already built.
 */
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const REPO = path.resolve(import.meta.dirname, '../..')
const WEB = path.join(REPO, 'apps/web')
const require_ = createRequire(path.join(REPO, 'noop.cjs'))
const { chromium } = (() => {
  for (const id of ['playwright', '@playwright/test', 'playwright-core']) {
    try {
      return require_(id)
    } catch {
      /* next */
    }
  }
  throw new Error('playwright is not installed — run pnpm install at the repo root')
})()

const CHROME =
  process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const LAUNCH = fs.existsSync(CHROME)
  ? { executablePath: CHROME, args: ['--no-sandbox'] }
  : { args: ['--no-sandbox'] }

const argOf = (name) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

let passed = 0
let failed = 0
const check = (ok, label, detail = '') => {
  if (ok) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

let DIST = argOf('--dist')
if (!DIST) {
  console.log('building apps/web…')
  execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd: WEB, stdio: 'pipe' })
  DIST = path.join(WEB, 'dist')
}

const TYPES = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.join(DIST, rel)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, 'index.html')
  }
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
  })
  fs.createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}`

const WS = '5a842aa9-cede-423a-ae26-bb4ba074849f'
const USER = {
  id: 'u1', email: 'admin@rundesk.test', displayName: 'Admin',
  role: 'owner', avatarUrl: null,
}
const SESSION = {
  state: {
    user: USER,
    organizations: [{ id: 'o1', name: 'Aura', slug: 'aura', role: 'owner' }],
    workspaces: [
      { id: WS, name: 'Rundesk', slug: 'rundesk', organizationId: 'o1', role: 'owner' },
    ],
  },
  version: 0,
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch(LAUNCH)

/**
 * A tab with the session seeded and the API stubbed. `delay` decides how long
 * to hold a given request — that is the whole instrument here.
 */
async function openContext({ delay = () => 0 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // The worker would serve assets from its own cache and step around the
    // delays below; this test is about the network path.
    serviceWorkers: 'block',
  })
  await ctx.route('**/api/**', async (route) => {
    const url = route.request().url()
    const ms = delay(url)
    if (ms) await sleep(ms)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: url.includes('/users/me') ? JSON.stringify(USER) : '[]',
    })
  })
  await ctx.route('**/assets/**', async (route) => {
    const ms = delay(route.request().url())
    if (ms) await sleep(ms)
    return route.continue()
  })
  const page = await ctx.newPage()
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    ['rundesk.auth', JSON.stringify(SESSION)],
  )
  return { ctx, page }
}

/** Does the viewport contain anything a person would see? */
async function paintedElements(page) {
  return page.evaluate(() => {
    const seen = []
    // Can genuinely be null: a blocking script in <head> stops the parser
    // before <body> exists, which is one of the failures under test.
    if (!document.body) return 0
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.width < 8 || r.height < 8) continue
      if (r.bottom < 0 || r.top > window.innerHeight) continue
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) continue
      const painted =
        s.backgroundImage !== 'none' ||
        (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent')
      if (painted || (el.textContent || '').trim().length > 0) seen.push(el.tagName)
    }
    return seen.length
  })
}

// ---------------------------------------------------------------------------
console.log('\n1. boot — before any of the app has run')
// ---------------------------------------------------------------------------
{
  // Hold the entry chunk. This is the wait a cold load has always had, and it
  // is the one she is describing: nothing on screen until the bundle parses.
  const entry = fs.readdirSync(path.join(DIST, 'assets')).find((f) => /^index-.*\.js$/.test(f))
  const { ctx, page } = await openContext({
    delay: (url) => (entry && url.includes(entry) ? 3000 : 0),
  })
  page.goto(`${BASE}/app/${WS}/inbox`).catch(() => {})

  const bootShowed = await page
    .waitForSelector('#boot', { timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  check(bootShowed, 'index.html paints something before the bundle arrives')
  const shapes = await page.locator('#boot i').count()
  const painted = await paintedElements(page)
  check(shapes >= 8, `the shell is drawn while the bundle loads (${shapes} shapes)`)
  check(painted > 5, 'the screen is not blank', `${painted} painted elements`)

  const rootEmpty = await page.evaluate(
    () => document.getElementById('root')?.children.length === 0,
  )
  check(rootEmpty, 'and React genuinely has not mounted yet — this is the real wait')

  // …and it gets out of the way once the app is up.
  await page
    .getByRole('textbox', { name: /search/i })
    .first()
    .waitFor({ timeout: 20000 })
    .catch(() => {})
  await page.waitForTimeout(600)
  const bootGone = (await page.locator('#boot').count()) === 0
  check(
    bootShowed && bootGone,
    'the boot skeleton is removed once the app renders',
    bootShowed ? 'still on screen' : 'there was never one to remove',
  )
  await ctx.close()
}

// ---------------------------------------------------------------------------
console.log('\n2. theme — no light-to-dark flash before the bundle parses')
// ---------------------------------------------------------------------------
{
  // Hold the bundle. Otherwise the store corrects the class before we look and
  // the check passes without the inline script existing at all.
  const entry = fs.readdirSync(path.join(DIST, 'assets')).find((f) => /^index-.*\.js$/.test(f))
  const { ctx, page } = await openContext({
    delay: (url) => (entry && url.includes(entry) ? 3000 : 0),
  })
  await page.addInitScript(() =>
    window.localStorage.setItem(
      'rundesk.theme',
      JSON.stringify({ state: { theme: 'light' }, version: 0 }),
    ),
  )
  page.goto(`${BASE}/app/${WS}/inbox`).catch(() => {})
  await page.waitForTimeout(900)
  const cls = await page
    .evaluate(() => document.documentElement.className)
    .catch(() => '(document not parsed)')
  check(
    cls.includes('light') && !cls.includes('dark'),
    'a light-theme session paints light from the first frame',
    `html class="${cls}"`,
  )
  await ctx.close()
}

// ---------------------------------------------------------------------------
console.log('\n3. route change — one of 47 lazy chunks arriving')
// ---------------------------------------------------------------------------
{
  const { ctx, page } = await openContext({
    delay: (url) => (url.includes('docs.lazy-') ? 3000 : 0),
  })
  await page.goto(`${BASE}/app/${WS}/inbox`, { waitUntil: 'networkidle' })
  await page
    .getByRole('textbox', { name: /search/i })
    .first()
    .waitFor({ timeout: 20000 })
    .catch(() => {})

  await page.locator(`a[href$="/${WS}/docs"]`).first().click().catch(() => {})
  await page.waitForTimeout(900)

  const busy = await page.locator('main [aria-busy="true"]').count()
  const shells = await page.locator('main .animate-shimmer').count()
  const shellStillThere = await page
    .getByRole('textbox', { name: /search/i })
    .first()
    .isVisible()
  check(busy > 0, 'the content area announces itself as busy')
  check(shells >= 4, `and draws placeholder shapes (${shells})`)
  check(shellStillThere, 'the sidebar and top bar stay put — only the column swaps')
  await ctx.close()
}

// ---------------------------------------------------------------------------
console.log('\n4. search — the palette chunk arriving')
// ---------------------------------------------------------------------------
{
  const { ctx, page } = await openContext({
    delay: (url) => (url.includes('command-palette-') ? 3000 : 0),
  })
  await page.goto(`${BASE}/app/${WS}/inbox`, { waitUntil: 'networkidle' })
  const search = page.getByRole('textbox', { name: /search/i }).first()
  await search.waitFor({ timeout: 20000 }).catch(() => {})
  await search.click().catch(() => {})
  await page.waitForTimeout(900)

  const shapes = await page.locator('.animate-shimmer').count()
  check(shapes >= 4, `clicking search shows a palette-shaped wait (${shapes} shapes)`)
  await ctx.close()
}

// ---------------------------------------------------------------------------
console.log('\n5. inbox — the request that decides whether it is empty')
// ---------------------------------------------------------------------------
{
  const { ctx, page } = await openContext({
    delay: (url) => (url.includes('/notifications?') ? 3000 : 0),
  })
  await page.goto(`${BASE}/app/${WS}/inbox`, { waitUntil: 'domcontentloaded' })
  await page
    .getByRole('textbox', { name: /search/i })
    .first()
    .waitFor({ timeout: 20000 })
    .catch(() => {})
  await page.waitForTimeout(700)

  const text = await page.evaluate(() => document.body.innerText)
  const shapes = await page.locator('main .animate-shimmer').count()
  // The page reads `notifsQuery.data ?? []`, so before this fix it rendered the
  // "you're all caught up" empty state while the request was still in flight.
  const claimsEmpty = /caught up|no notifications|nothing here/i.test(text)
  check(shapes >= 4, `rows are drawn while the list loads (${shapes})`)
  check(!claimsEmpty, 'and it does not claim the inbox is empty before it knows')
  await ctx.close()
}

// ---------------------------------------------------------------------------
console.log('\n6. deep link — the worst of them, and the one no page had covered')
// ---------------------------------------------------------------------------
{
  // Landing directly on a route (a shared link, a bookmark, a refresh) makes
  // the router hold back *every* match, the layout included. Measured before
  // the fix: an entirely empty <body> for as long as the chunk took — no
  // sidebar, no top bar, nothing. The boot skeleton is already gone by then,
  // because React has mounted; it just has nothing to render yet.
  const { ctx, page } = await openContext({
    delay: (url) => (url.includes('docs.lazy-') ? 4000 : 0),
  })
  page.goto(`${BASE}/app/${WS}/docs`).catch(() => {})
  await page.waitForTimeout(2200)

  const painted = await paintedElements(page)
  // On this path React has mounted but rendered nothing, so the wait is held by
  // the boot skeleton rather than a React one — either is a pass, blank is not.
  const shapes =
    (await page.locator('#boot i').count()) +
    (await page.locator('.animate-shimmer').count())
  const announced = await page.locator('#boot[role="status"], [aria-busy="true"]').count()
  const rootEmpty = await page.evaluate(
    () => document.getElementById('root')?.children.length === 0,
  )

  check(painted > 5, 'the screen is not blank', `${painted} painted elements`)
  check(shapes >= 8, `the shell is drawn as shapes (${shapes})`)
  check(announced > 0, 'and the wait is announced to assistive tech')
  check(rootEmpty, 'this really is the router rendering nothing — the case that was blank')

  // …and it gives way to the real page.
  await page
    .getByRole('textbox', { name: /search/i })
    .first()
    .waitFor({ timeout: 20000 })
    .catch(() => {})
  await page.waitForTimeout(900)
  check(
    shapes >= 8 &&
      (await page.locator('#boot').count()) === 0 &&
      (await page.locator('.animate-shimmer').count()) === 0,
    'every skeleton clears once the route lands',
  )
  await ctx.close()
}

await browser.close()
server.close()

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
