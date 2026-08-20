/**
 * Stale-chunk regression test.
 *
 * The 7 Aug review video shows the app dying the moment search is clicked:
 *
 *   Something went wrong
 *   Failed to fetch dynamically imported module:
 *   https://rundesk.theaura.agency/assets/command-palette-NaNmjPLK.js
 *
 * Every screen here is a dynamic import (47 generated lazy routes + the
 * palette + the AI dock) and every deploy publishes new content-hashed chunks.
 * A tab opened before a deploy is still running the previous index.html, so it
 * asks for filenames the server no longer has. That is why the same click
 * works in a browser that loaded the page *after* the deploy — and why
 * deploy/verify-ui.mjs, which always opens a fresh page, structurally cannot
 * catch this.
 *
 * So this test models a real deploy: two builds, a tab that loaded the first,
 * and the server flipped to the second underneath it.
 *
 *   node test/e2e/stale-chunk-recovery.mjs
 *
 * It builds both releases itself (the second with one chunk's content changed
 * so its hash moves) unless --dist-a / --dist-b are given.
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
      /* try the next one */
    }
  }
  throw new Error('playwright is not installed — run pnpm install at the repo root')
})()

// Use a preinstalled Chromium when there is one (the deploy box, this
// container); otherwise let Playwright pick the browser it installed itself.
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

// ---------------------------------------------------------------------------
// Two releases
// ---------------------------------------------------------------------------

/** The two chunks this test needs to move between releases: the palette (what
 *  the video's crash was) and one lazy route (the other 47 dynamic imports). */
const CHANGED_BY_RELEASE_B = [
  'src/components/command-palette.tsx',
  'src/routes/app.$workspaceId.docs.lazy.tsx',
]

/** Build apps/web into `dest`. `marker` perturbs the sources above so the
 *  release's chunk hashes move, exactly as a real code change would. A comment
 *  wouldn't do it — minification strips those and the hash would be unchanged;
 *  it has to be a statement that survives into the output. */
function buildRelease(dest, marker) {
  const originals = new Map()
  if (marker) {
    for (const rel of CHANGED_BY_RELEASE_B) {
      const file = path.join(WEB, rel)
      const source = fs.readFileSync(file, 'utf8')
      originals.set(file, source)
      fs.writeFileSync(file, `${source}\nconsole.debug('rundesk release ${marker}')\n`)
    }
  }
  try {
    execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd: WEB, stdio: 'pipe' })
  } finally {
    for (const [file, source] of originals) fs.writeFileSync(file, source)
  }
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(path.join(WEB, 'dist'), dest, { recursive: true })
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rundesk-stale-'))
let distA = argOf('--dist-a')
let distB = argOf('--dist-b')
if (!distA || !distB) {
  distA = path.join(tmp, 'release-a')
  distB = path.join(tmp, 'release-b')
  console.log('building release A…')
  buildRelease(distA)
  console.log('building release B (one chunk changed)…')
  buildRelease(distB, 'b')
}

const assetsOf = (dist) => new Set(fs.readdirSync(path.join(dist, 'assets')))
const A = assetsOf(distA)
const B = assetsOf(distB)
const paletteA = [...A].find((f) => f.startsWith('command-palette-'))
const paletteB = [...B].find((f) => f.startsWith('command-palette-'))
const routeA = [...A].find((f) => f.startsWith('app._workspaceId.docs.lazy-'))
const routeB = [...B].find((f) => f.startsWith('app._workspaceId.docs.lazy-'))

if (!paletteA || !paletteB || paletteA === paletteB || !routeA || routeA === routeB) {
  console.error(
    `releases must differ: palette A=${paletteA} B=${paletteB}; docs A=${routeA} B=${routeB}`,
  )
  process.exit(2)
}
console.log(`release A palette: ${paletteA}`)
console.log(`release B palette: ${paletteB}  (A's is gone from B)`)

// ---------------------------------------------------------------------------
// A server that behaves like deploy/nginx/rundesk.theaura.agency.conf
// ---------------------------------------------------------------------------

const TYPES = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

/** The release nginx is currently serving. Flipped mid-test = a deploy. */
let live = distA
/** Assets the old release had and the new one doesn't — deleted from disk. */
let keepOldAssets = false
/** A deploy that is simply broken: the chunk is missing from every release. */
let breakPalette = false
const served404 = []
let documentRequests = 0

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const isAsset = rel.startsWith('/assets/')

  let file = path.join(live, rel)
  if (breakPalette && rel.includes('/command-palette-')) {
    served404.push(rel)
    res.writeHead(404, { 'content-type': 'text/plain' })
    return res.end('Not Found')
  }
  if (isAsset && !fs.existsSync(file) && keepOldAssets) {
    // deploy-prod.sh keeps the previous release's chunks alongside the new ones
    const fallback = path.join(distA, rel)
    if (fs.existsSync(fallback)) file = fallback
  }

  if (isAsset) {
    if (!fs.existsSync(file)) {
      served404.push(rel)
      res.writeHead(404, { 'content-type': 'text/plain' })
      return res.end('Not Found')
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    })
    return fs.createReadStream(file).pipe(res)
  }

  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(live, 'index.html') // SPA fallback
  }
  // Only real navigations — the SPA fallback also answers socket.io polling.
  if (req.headers['sec-fetch-dest'] === 'document') documentRequests++
  const noCache = /(index\.html|sw\.js|registerSW\.js|push-sw\.js|manifest\.webmanifest)$/
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    ...(noCache.test(file) ? { 'cache-control': 'no-cache' } : {}),
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

const browser = await chromium.launch(LAUNCH)

/** Open a tab on release A and wait for the shell. */
async function openTab() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.route('**/api/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: route.request().url().includes('/users/me') ? JSON.stringify(USER) : '[]',
    }),
  )
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k, v),
    ['rundesk.auth', JSON.stringify(SESSION)],
  )
  await page.goto(`${BASE}/app/${WS}/inbox`, { waitUntil: 'networkidle' })
  await page
    .getByRole('textbox', { name: /search/i })
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
  return { ctx, page, errors }
}

/** Is the command palette on screen? */
async function paletteOpen(page) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await page.evaluate(
        () => !!document.querySelector('[role="dialog"],[cmdk-root]'),
      )
    } catch {
      await page.waitForTimeout(400)
    }
  }
  return false
}

const crashed = (text) => /Something went wrong/i.test(text)

/** Read the page. The recovery under test *is* a reload, so any read can land
 *  mid-navigation and find no document — retry rather than mistake that for a
 *  failure. */
async function text(page) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await page.evaluate(() => document.body?.innerText ?? '')
    } catch {
      await page.waitForTimeout(400)
    }
  }
  return ''
}

// ---------------------------------------------------------------------------
// 0. The half of this that no browser can see: the build and the vhost.
// ---------------------------------------------------------------------------
console.log('\n0. build and deployment guardrails')
{
  const sw = fs.readFileSync(path.join(distB, 'sw.js'), 'utf8')
  const precached = [...sw.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1])

  check(
    !sw.includes('NavigationRoute'),
    'navigations are not answered from the worker’s own precached shell',
  )
  check(
    !precached.some((u) => u.startsWith('assets/')),
    'hashed chunks are not precached, so a new release cannot evict them',
    precached.filter((u) => u.startsWith('assets/')).slice(0, 3).join(','),
  )

  const vhost = fs.readFileSync(
    path.join(REPO, 'deploy/nginx/rundesk.theaura.agency.conf'),
    'utf8',
  )
  const noCacheBlock = vhost
    .split(/\n\s*location\s/)
    .find((block) => block.includes('index\\.html') && block.includes('sw\\.js'))
  check(
    !!noCacheBlock && /add_header Cache-Control "no-cache"/.test(noCacheBlock),
    'index.html and sw.js are served no-cache',
  )

  const deploy = fs.readFileSync(path.join(REPO, 'deploy/deploy-prod.sh'), 'utf8')
  // dist itself is still replaced wholesale — what must not happen is losing
  // /assets/ with it. Check the order: set aside, swap, put back.
  const setAside = deploy.indexOf('mv apps/web/dist/assets apps/web/assets.prev')
  const swap = deploy.search(/^rm -rf apps\/web\/dist$/m)
  const putBack = deploy.indexOf('cp -an apps/web/assets.prev')
  check(
    setAside !== -1 && swap !== -1 && putBack !== -1 && setAside < swap && swap < putBack,
    'the deploy carries the previous release’s chunks across the swap',
    `setAside=${setAside} swap=${swap} putBack=${putBack}`,
  )
}

// ---------------------------------------------------------------------------
// 1. Deploy under an open tab, then click search.
// ---------------------------------------------------------------------------
console.log('\n1. search after a deploy (the crash from the video)')
{
  const { ctx, page } = await openTab()
  live = distB // ← deploy
  keepOldAssets = false // ← and the old chunks are gone, as they are today

  await page.getByRole('textbox', { name: /search/i }).first().click()
  await page.waitForTimeout(1500)
  const midway = await text(page)
  const announced = /Updating Rundesk/i.test(midway)

  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
  const after = await text(page)

  check(!crashed(after), 'no "Something went wrong"', after.slice(0, 120))
  check(served404.some((u) => u.includes(paletteA)), "A's palette chunk really did 404")
  check(announced || !crashed(midway), 'the interruption reads as an update, not an error')

  // and the app is usable on the new release
  const search = page.getByRole('textbox', { name: /search/i }).first()
  const back = await search
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  check(back, 'the app shell comes back', `showing: ${(await text(page)).slice(0, 200)}`)
  let open = false
  if (back) {
    await search.click()
    await page.waitForTimeout(2500)
    open = await paletteOpen(page)
  }
  check(open, 'search opens on the new release')
  await ctx.close()
}

// ---------------------------------------------------------------------------
// 2. Same deploy, but the previous release's chunks were kept (deploy-prod.sh).
//    The tab should not even notice.
// ---------------------------------------------------------------------------
console.log('\n2. search after a deploy that kept the previous chunks')
{
  live = distA
  keepOldAssets = false
  const { ctx, page } = await openTab()
  const before404 = served404.length
  live = distB
  keepOldAssets = true // ← deploy-prod.sh now leaves A's chunks in place

  await page.getByRole('textbox', { name: /search/i }).first().click()
  await page.waitForTimeout(2500)
  const after = await text(page)
  const open = await paletteOpen(page)
  check(!crashed(after), 'no error boundary')
  check(open, 'palette opened straight away — no reload needed')
  check(served404.length === before404, 'nothing 404d', served404.slice(before404).join(','))
  await ctx.close()
}

// ---------------------------------------------------------------------------
// 3. A route chunk, not the palette — the other 47 dynamic imports.
// ---------------------------------------------------------------------------
console.log('\n3. navigating to a route whose chunk the deploy removed')
{
  live = distA
  keepOldAssets = false
  const { ctx, page } = await openTab()
  const before404 = served404.length
  live = distB

  // Must be a click, not page.goto: a fresh navigation would fetch the *new*
  // index.html and never ask for the old chunk. The stale tab is the point.
  await page.locator(`a[href$="/${WS}/docs"]`).first().click()
  await page.waitForTimeout(4000)
  const after = await text(page)
  const lost404 = served404
    .slice(before404)
    .some((u) => u.includes('app._workspaceId.docs.lazy-'))

  check(lost404, "the docs route chunk really did 404", served404.slice(before404).join(','))
  check(!crashed(after), 'route navigation recovers too', after.slice(0, 120))
  const landed = await page
    .getByRole('textbox', { name: /search/i })
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => page.url().endsWith('/docs'))
    .catch(() => false)
  check(landed, 'lands on /docs with the shell intact', `${page.url()} — ${after.slice(0, 90)}`)
  await ctx.close()
}

// ---------------------------------------------------------------------------
// 4. A genuinely broken deploy must fail honestly, not reload forever.
// ---------------------------------------------------------------------------
console.log('\n4. a deploy that is actually broken')
{
  live = distA
  keepOldAssets = false
  breakPalette = false
  const { ctx, page } = await openTab()
  const documentsBefore = documentRequests

  // The chunk is missing and stays missing — reloading cannot help.
  breakPalette = true

  await page.getByRole('textbox', { name: /search/i }).first().click()
  await page.waitForTimeout(4000)
  const search = page.getByRole('textbox', { name: /search/i }).first()
  const backUp = await search
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false)
  if (backUp) await search.click().catch(() => {})
  await page.waitForTimeout(5000)

  const after = await text(page)
  const reloads = documentRequests - documentsBefore
  check(crashed(after), 'the error boundary is shown once reloading has not helped', after.slice(0, 120))
  check(reloads <= 3, `no reload loop (${reloads} document loads)`)
  breakPalette = false
  await ctx.close()
}

await browser.close()
server.close()
fs.rmSync(tmp, { recursive: true, force: true })

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
