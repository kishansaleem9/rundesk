/**
 * §2.8 gap 7 — the emoji picker, in a real browser, against the BUILT app.
 *
 *   `[20:22]` "poori ki poori emoji icons ki list"
 *
 * The picker's decisions have unit tests. What they cannot see is the one thing
 * most likely to be wrong in production: the emoji list is 1,914 entries in a
 * separate 34 kB chunk, fetched by a dynamic `import()` the first time somebody
 * opens the picker. If that chunk 404s, or Vite names it something the built
 * index cannot resolve, the picker shows its loading skeleton forever — and
 * every unit test still passes, because the module resolves perfectly well from
 * source.
 *
 * So this drives the built bundle off a plain static server, which is the same
 * thing a CDN does, and watches the network.
 *
 *   node test/e2e/emoji-picker.mjs [--dist <dir>]
 */
import http from 'node:http'
import fs from 'node:fs'
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

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
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
// Deliberately dumb: serve the file if it exists, otherwise the SPA shell.
// A chunk that is missing therefore comes back as HTML with a 200, which is
// exactly how a real CDN fails and exactly what breaks a dynamic import.
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.join(DIST, rel)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}`

const WS = '5a842aa9-cede-423a-ae26-bb4ba074849f'
const CHANNEL = 'c1'
const USER = { id: 'u1', email: 'admin@rundesk.test', displayName: 'Admin', role: 'owner', avatarUrl: null }
const SESSION = {
  state: {
    user: USER,
    organizations: [{ id: 'o1', name: 'Aura', slug: 'aura', role: 'owner' }],
    workspaces: [{ id: WS, name: 'Rundesk', slug: 'rundesk', organizationId: 'o1', role: 'owner' }],
  },
  version: 0,
}

/** Enough of the API for the chat page to render a channel with a composer. */
function stubBody(url) {
  const data = url.includes('/users/me')
    ? USER
    : /\/chat\/channels\/[^/]+\/messages/.test(url)
      ? []
      : /\/chat\/workspaces\/[^/]+\/custom-emoji/.test(url)
        ? [{ id: 'ce1', shortcode: 'shipit', imageUrl: `${BASE}/favicon.ico` }]
        : /\/chat\/(workspaces\/[^/]+\/)?channels(\?|$)/.test(url)
          ? [{ id: CHANNEL, name: 'general', isDm: false, workspaceId: WS, unreadCount: 0 }]
          : /\/chat\/spaces/.test(url)
            ? []
            : /\/calls\/live/.test(url)
              ? null
              : []
  return JSON.stringify({ data, error: null })
}

const browser = await chromium.launch(LAUNCH)

/** Every asset the page asked for, so a missing chunk is visible. */
const requested = []
const failedRequests = []

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
await ctx.route('**/api/**', (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: stubBody(r.request().url()) }),
)
const page = await ctx.newPage()
page.on('response', (r) => requested.push({ url: r.url(), status: r.status() }))
page.on('requestfailed', (r) => failedRequests.push(r.url()))
const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})

await page.addInitScript(
  (entries) => {
    for (const [k, v] of entries) window.localStorage.setItem(k, v)
  },
  [['rundesk.auth', JSON.stringify(SESSION)]],
)
await page.goto(`${BASE}/app/${WS}/chat?channel=${CHANNEL}`, { waitUntil: 'networkidle' })

// ---------------------------------------------------------------------------
console.log('\n1. the picker opens from the composer')
// ---------------------------------------------------------------------------
const trigger = page.locator('button[title="Emoji"]').first()
await trigger.waitFor({ timeout: 20000 }).catch(() => {})
check(await trigger.isVisible().catch(() => false), 'the composer has an emoji button')

// Before it is opened, the emoji chunk must NOT have been fetched — the whole
// point of splitting it out is that nobody pays for it until they ask.
const chunkBefore = requested.filter((r) => /emoji-data/.test(r.url))
check(chunkBefore.length === 0, 'and the 1,914-emoji chunk has not been downloaded yet', `${chunkBefore.length} early fetches`)

await trigger.click()
const picker = page.locator('[data-testid="emoji-picker"]')
await picker.waitFor({ timeout: 10000 }).catch(() => {})
check(await picker.isVisible().catch(() => false), 'clicking it opens the picker')

// ---------------------------------------------------------------------------
console.log('\n2. the list actually arrives — the thing no unit test can see')
// ---------------------------------------------------------------------------
await page
  .locator('[data-testid="emoji-section-people"] button')
  .first()
  .waitFor({ timeout: 15000 })
  .catch(() => {})

const peopleCount = await page.locator('[data-testid="emoji-section-people"] button').count()
check(peopleCount > 300, `Smiles & People rendered ${peopleCount} emoji`, `only ${peopleCount} — the dynamic chunk did not load`)

const chunk = requested.find((r) => /emoji-data/.test(r.url))
check(!!chunk, 'the emoji chunk was fetched on open, not before', 'no emoji-data chunk was ever requested')
check(
  !!chunk && chunk.status === 200 && /\.js(\?|$)/.test(chunk.url),
  'and came back as JavaScript',
  chunk ? `${chunk.status} for ${chunk.url}` : 'no chunk',
)
// Only what this server serves. Google Fonts is a third-party host and there
// is no outbound network in the sandbox this runs in — a filter on the ORIGIN
// keeps the thing under test (a chunk served from 127.0.0.1) fully covered
// while dropping noise the app is not responsible for.
const localFailures = failedRequests.filter((u) => u.startsWith(BASE))
check(localFailures.length === 0, 'with nothing served from here failing to load', localFailures.slice(0, 3).join(', '))

const total = await page.locator('[data-testid="emoji-scroll"] button[data-emoji]').count()
check(total > 1500, `${total} emoji are on screen — "poori ki poori list"`, `only ${total}`)

// ---------------------------------------------------------------------------
console.log('\n3. the controls she names')
// ---------------------------------------------------------------------------
check(await page.locator('[data-testid="emoji-search"]').isVisible(), 'a Search field')
check(await page.locator('[data-testid="emoji-tone"]').isVisible(), 'a skin-tone control')
check(await page.locator('[data-testid="emoji-add-custom"]').isVisible(), 'and a + to add a custom one')
const tabs = await page.locator('[data-testid="emoji-tabs"] button').count()
check(tabs >= 9, `a category strip of ${tabs}`, `only ${tabs} tabs`)
check(
  await page.locator('[data-testid="emoji-section-frequent"]').isVisible(),
  'with Frequently Used at the top',
)

// ---------------------------------------------------------------------------
console.log('\n4. search, over the real list')
// ---------------------------------------------------------------------------
await page.fill('[data-testid="emoji-search"]', 'tada')
await page.waitForTimeout(300)
const firstHit = await page
  .locator('[data-testid="emoji-scroll"] button[data-emoji]')
  .first()
  .getAttribute('data-emoji')
  .catch(() => null)
// "tada" appears in no Unicode name. Finding 🎉 proves the alias table is
// wired to the real dataset rather than to a fixture.
check(firstHit === '🎉', 'searching "tada" finds 🎉 — a word Unicode never uses', `got ${firstHit}`)

await page.fill('[data-testid="emoji-search"]', 'zzzqqq')
await page.waitForTimeout(300)
check(
  await page.locator('[data-testid="emoji-no-results"]').isVisible().catch(() => false),
  'and it says so when nothing matches',
)

// ---------------------------------------------------------------------------
console.log('\n4b. the category strip works WHILE searching')
// ---------------------------------------------------------------------------
// While a query is typed the category sections are not rendered, so their refs
// are gone. Looking one up before clearing the query made every tab in the
// strip dead the moment anybody typed — it returned before it even cleared the
// search. Nothing moved and nothing said why.
await page.fill('[data-testid="emoji-search"]', 'cat')
await page.waitForTimeout(250)
await page.locator('[data-testid="emoji-tab-food"]').click()
await page.waitForTimeout(400)
check(
  (await page.inputValue('[data-testid="emoji-search"]')) === '',
  'pressing a tab mid-search clears the search',
  `the search box still reads ${JSON.stringify(await page.inputValue('[data-testid="emoji-search"]'))}`,
)
check(
  await page.locator('[data-testid="emoji-section-food"]').isVisible().catch(() => false),
  'and the category it names is on screen',
)

// ---------------------------------------------------------------------------
console.log('\n5. picking one puts it in the message')
// ---------------------------------------------------------------------------
await page.fill('[data-testid="emoji-search"]', '')
await page.waitForTimeout(200)
const firstFrequent = page.locator('[data-testid="emoji-section-frequent"] button[data-emoji]').first()
const picked = await firstFrequent.getAttribute('data-emoji')
await firstFrequent.click()
await page.waitForTimeout(300)
const draft = await page.locator('textarea').first().inputValue().catch(() => '')
check(draft.includes(picked), `picking ${picked} inserts it into the draft`, `the draft is ${JSON.stringify(draft)}`)

// Frequently Used is per-person and remembered. Re-opening must show it first.
await trigger.click()
await page.waitForTimeout(200)
await trigger.click()
await page.locator('[data-testid="emoji-section-frequent"]').waitFor({ timeout: 10000 }).catch(() => {})
const nowFirst = await page
  .locator('[data-testid="emoji-section-frequent"] button[data-emoji]')
  .first()
  .getAttribute('data-emoji')
  .catch(() => null)
check(nowFirst === picked, 'and it leads Frequently Used next time', `Frequently Used leads with ${nowFirst}`)

// ---------------------------------------------------------------------------
console.log('\n6. nothing broke')
// ---------------------------------------------------------------------------
// Chunk-load failures surface here rather than as a visibly empty picker, so
// this stays broad. The two exclusions are things this harness genuinely does
// not provide, named specifically rather than pattern-matched loosely:
// a realtime server (the app opens a socket on load) and outbound network for
// the webfont. Neither can mask a failed import — that arrives as a
// "Failed to fetch dynamically imported module" error, which is not excluded.
// Resource-load noise is excluded here because it is checked PROPERLY above:
// `localFailures` asserts that nothing served from this origin failed, which is
// the only part the app is responsible for. Chrome does not name the host in a
// "Failed to load resource" console line, so filtering these by message text
// would be guesswork — and would quietly grow to cover a real failure.
//
// What is left is script-level: uncaught exceptions, and specifically
// "Failed to fetch dynamically imported module", which is exactly how a broken
// emoji chunk announces itself and is NOT excluded by anything here.
const real = consoleErrors.filter(
  (e) =>
    !/favicon|manifest/i.test(e) &&
    !/socket\.io/.test(e) &&
    !/^Failed to load resource/.test(e),
)
check(real.length === 0, 'no script errors — a failed chunk import would appear here', real.slice(0, 2).join(' | '))

// ---------------------------------------------------------------------------
console.log('\n7. the chunk does not arrive — and Try again actually tries')
// ---------------------------------------------------------------------------
/*
 * The production failure the unit tests cannot reach.
 *
 * Vite rewrites every dynamic import to a preload helper that dispatches
 * `vite:preloadError` and then, if a listener called preventDefault, SWALLOWS
 * the error and resolves with `undefined` instead of rejecting. chunk-reload.ts
 * calls preventDefault unconditionally — it has to, because the router preloads
 * route chunks on hover and an unhandled throw there takes the page down.
 *
 * So a `.catch` on `import()` never ran in the shipped build: the loader was
 * handed nothing, threw a TypeError from inside its own `.then`, and memoised
 * that rejection for the session. The picker offered a Try again button that
 * made no request and could not ever succeed. From source — where the import
 * is a plain import and rejects properly — everything looked fine.
 *
 * Driven here against the BUILT bundle, which is the only place the preload
 * wrapper exists at all.
 */
{
  const fresh = await ctx.newPage()
  const asked = []
  fresh.on('request', (r) => {
    if (/emoji-data/.test(r.url())) asked.push(r.url())
  })
  let blocked = true
  // Aborted, not 404'd: a dead network is what actually reaches the preload
  // helper as an error, and this server answers a missing file with the SPA
  // shell rather than a failure.
  await fresh.route('**/emoji-data*.js', (r) => (blocked ? r.abort() : r.continue()))
  await fresh.addInitScript(
    (entries) => {
      for (const [k, v] of entries) window.localStorage.setItem(k, v)
      // The recovery reload stands down for 30s after one attempt, so that it
      // cannot loop on a broken deploy. Stamped here so the page stays put and
      // the picker has to cope on its own — which is the case being tested.
      window.sessionStorage.setItem('rundesk.chunk-reload-at', String(Date.now()))
    },
    [['rundesk.auth', JSON.stringify(SESSION)]],
  )
  await fresh.goto(`${BASE}/app/${WS}/chat?channel=${CHANNEL}`, { waitUntil: 'networkidle' })

  const freshTrigger = fresh.locator('button[title="Emoji"]').first()
  await freshTrigger.waitFor({ timeout: 20000 }).catch(() => {})
  await freshTrigger.click()
  const failure = fresh.locator('[data-testid="emoji-load-failed"]')
  await failure.waitFor({ timeout: 15000 }).catch(() => {})
  check(
    await failure.isVisible().catch(() => false),
    'a chunk that never arrives is reported, not spun on forever',
    `the picker showed no failure state; it asked for the chunk ${asked.length} time(s)`,
  )

  /*
   * Trying again in place is IMPOSSIBLE, and this is where that was learned.
   *
   * The browser records a failed module in its module map, so a second
   * `import()` of the same URL returns the recorded failure and makes no
   * request — even after the network is healthy again. (Checked directly in
   * this Chromium: two imports of an aborted URL produce exactly one request;
   * only a different URL fetches again.) So a Try again that re-ran the import
   * was a second dead button behind the first, no matter what the loader did
   * with its memo.
   *
   * It reloads instead: a fresh document has a fresh module map, and it
   * re-reads index.html, so it also picks up a chunk whose hash moved in a
   * deploy — the common way this happens at all.
   */
  const beforeRetry = asked.length
  blocked = false
  const reloaded = fresh
    .waitForEvent('load', { timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  await fresh.locator('[data-testid="emoji-retry"]').click()
  check(await reloaded, 'Try again reloads rather than re-importing a module the browser has already given up on')
  check(
    asked.length === beforeRetry,
    'and does not pretend to re-fetch in the dead document',
    `${asked.length - beforeRetry} request(s) were made before the reload`,
  )

  // And the reloaded app, with the chunk reachable again, works.
  const againTrigger = fresh.locator('button[title="Emoji"]').first()
  await againTrigger.waitFor({ timeout: 20000 }).catch(() => {})
  await againTrigger.click()
  await fresh
    .locator('[data-testid="emoji-section-people"] button')
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => {})
  const recovered = await fresh.locator('[data-testid="emoji-section-people"] button').count()
  check(recovered > 300, `and the list is there after it (${recovered})`, `only ${recovered} rendered after the reload`)
  await fresh.close()
}

await browser.close()
server.close()

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
