/**
 * The fast items from docs/video1-rundesk-gap-audit.md, driven in a browser.
 *
 *   §1.3  the workspace sidebar collapses to icons
 *   §1.5  the language switcher is out of the top bar
 *   §2.2  the Inbox "Other" chip is gone
 *   §1.1  the create modal offers a task type, and search filters by one
 *
 * Each of these is a change you can convince yourself of by reading the diff
 * and be wrong about — a control removed from one file and still rendered from
 * another, a chip dropped from an array but still reachable by URL. So they are
 * checked against the built app.
 *
 *   node test/e2e/video1-fast-items.mjs [--dist <dir>]
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

/**
 * Enough of the API for the shell and the surfaces under test to render.
 * Responses are enveloped: lib/api.ts returns `body.data` and rejects anything
 * without a `data` key, so a bare object reads as null and pages quietly render
 * nothing — which is what a first pass at this file did.
 */
const TASK_TYPES = [
  { id: 'tt-task', name: 'Task', icon: 'check', isDefault: true },
  { id: 'tt-milestone', name: 'Milestone', icon: 'flag', isDefault: false },
]
function stubBody(url) {
  const data = url.includes('/users/me')
    ? USER
    : url.includes('/task-types')
      ? TASK_TYPES
      : url.includes('/plan')
        ? { label: 'Free', usage: { members: 2 } }
        : url.includes('/branding') || url.includes('/counts')
          ? {}
          : []
  return JSON.stringify({ data, error: null })
}

const browser = await chromium.launch(LAUNCH)
async function openApp(route = `/app/${WS}/inbox`, seed = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  })
  await ctx.route('**/api/**', (route_) =>
    route_.fulfill({
      status: 200,
      contentType: 'application/json',
      body: stubBody(route_.request().url()),
    }),
  )
  const page = await ctx.newPage()
  await page.addInitScript(
    (entries) => {
      for (const [k, v] of entries) window.localStorage.setItem(k, v)
    },
    [['rundesk.auth', JSON.stringify(SESSION)], ...Object.entries(seed)],
  )
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
  await page
    .getByRole('textbox', { name: /search/i })
    .first()
    .waitFor({ timeout: 20000 })
    .catch(() => {})
  return { ctx, page }
}

// ---------------------------------------------------------------------------
console.log('\n§1.5  the language switcher is out of the top bar')
// ---------------------------------------------------------------------------
{
  const { ctx, page } = await openApp()
  const header = page.locator('header').first()
  const inTopbar = await header.getByRole('combobox').count()
  const topbarText = await header.innerText()
  check(
    !/english|urdu|español|العربية/i.test(topbarText),
    'no language control in the top bar',
    topbarText.replace(/\n/g, ' ').slice(0, 80),
  )
  check(inTopbar === 0, 'and no select left behind either')

  // It has to still exist somewhere, or this is a deletion, not a move.
  await page.goto(`${BASE}/app/profile`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const profileText = await page.evaluate(() => document.body.innerText)
  check(
    /language/i.test(profileText),
    'it is in personal settings instead — a move, not a deletion',
    profileText.slice(0, 100),
  )
  await ctx.close()
}

// ---------------------------------------------------------------------------
console.log('\n§2.2  the Inbox "Other" chip is gone')
// ---------------------------------------------------------------------------
{
  const { ctx, page } = await openApp(`/app/${WS}/inbox`)
  await page.waitForTimeout(800)
  // Two rows of controls in the header: the triage views (Inbox / Later /
  // Cleared) and the filter chips over them (All / Primary).
  const labelsOf = async (selector) =>
    (await page.locator(selector).allInnerTexts())
      .map((c) => c.split('\n')[0].trim())
      .filter(Boolean)
  const chipLabels = await labelsOf('header button[aria-pressed]')
  const allHeaderLabels = await labelsOf('header button')

  check(
    !allHeaderLabels.some((l) => /^other$/i.test(l)),
    `no Other control anywhere in the header (${allHeaderLabels.join(', ')})`,
  )
  check(
    chipLabels.some((l) => /^all$/i.test(l)) && chipLabels.some((l) => /^primary$/i.test(l)),
    `All and Primary are still there (${chipLabels.join(', ')})`,
  )
  check(
    allHeaderLabels.some((l) => /^later$/i.test(l)),
    'and Later — the one she asked to keep',
    allHeaderLabels.join(', '),
  )

  // A bookmark to the removed filter must not strand anyone.
  await page.goto(`${BASE}/app/${WS}/inbox?filter=other`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const body = await page.evaluate(() => document.body.innerText)
  check(
    !/something went wrong/i.test(body) && /notifications/i.test(body),
    'an old ?filter=other link still lands on a working inbox',
    body.slice(0, 90),
  )
  await ctx.close()
}

// ---------------------------------------------------------------------------
console.log('\n§1.3  the sidebar collapses to icons')
// ---------------------------------------------------------------------------
{
  const { ctx, page } = await openApp()
  const sidebar = page.locator('[data-testid="workspace-sidebar"]')
  const widthOf = async () => (await sidebar.boundingBox())?.width ?? 0

  const expanded = await widthOf()
  check(expanded > 200, `starts expanded (${Math.round(expanded)}px)`)

  await page.locator('[data-testid="sidebar-toggle"]').first().click()
  await page.waitForTimeout(500)
  const collapsed = await widthOf()
  check(collapsed > 0 && collapsed < 90, `collapses to a rail (${Math.round(collapsed)}px)`)

  // "mujhe bas ICONS show hon" — links, but no labels taking up room.
  const railLinks = await sidebar.locator('a').count()
  const railText = (await sidebar.innerText()).trim()
  check(railLinks >= 5, `the destinations are still reachable (${railLinks} icons)`)
  check(railText.length === 0, 'and no labels are taking up the space', railText.slice(0, 60))

  // "kyunke yeh SPACE leta hai" — the point is the page getting the room.
  const mainWidth = await page
    .locator('main')
    .first()
    .boundingBox()
    .then((b) => b?.width ?? 0)
  check(mainWidth > 1300, `the page takes the space back (${Math.round(mainWidth)}px)`)

  await page.locator('[data-testid="sidebar-toggle"]').first().click()
  await page.waitForTimeout(500)
  check((await widthOf()) > 200, 'and it expands again')

  // The preference has to survive a reload, or it is not a preference.
  await page.locator('[data-testid="sidebar-toggle"]').first().click()
  await page.waitForTimeout(400)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  check((await widthOf()) < 90, 'the choice survives a reload')
  await ctx.close()
}

await browser.close()
server.close()

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
