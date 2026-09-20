/**
 * §V2-07 `[11:35]` — the "Save view" chip.
 *
 * Frame `11:41`: a highlighted **Save view ▾** sits in the list toolbar, and
 * the frame observations record it as appearing "once the view is modified —
 * unsaved-state affordance".
 *
 * Rundesk had none. You could change the filters, the sort, the grouping and
 * the columns, walk away, and come back to find them gone — with nothing
 * having said they were temporary, and "Update view" buried in a … menu on the
 * tab. So the check that matters is not "the button works": it is that the
 * button is ABSENT until there is something to save, present the moment there
 * is, and gone again once it has been.
 *
 * Runs the real built app against a stubbed API, so what it asserts about the
 * PATCH is what the app actually sent.
 *
 *   node test/e2e/list-save-view.mjs --dist apps/web/dist
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 7

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const WEB = path.join(ROOT, 'apps/web')

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
}

const chromium = await resolveChromium()
const LAUNCH = launchOptions()

let DIST = argOf('--dist')
if (!DIST) {
  console.log('building apps/web…')
  execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd: WEB, stdio: 'pipe' })
  DIST = path.join(WEB, 'dist')
}
if (!path.isAbsolute(DIST)) DIST = path.join(ROOT, DIST)

const TYPES = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}
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
const SPACE = '11111111-1111-4111-8111-111111111111'
const PROJECT = '22222222-2222-4222-8222-222222222222'
const LIST = '33333333-3333-4333-8333-333333333333'
const VIEW = '44444444-4444-4444-8444-444444444444'

const USER = { id: 'u1', email: 'admin@rundesk.test', displayName: 'Admin', role: 'owner', avatarUrl: null }
/*
 * The exact shape zustand-persist writes: key `rundesk.auth`, and only the
 * three fields `partialize` keeps. Tokens are NOT persisted any more — auth
 * rides an httpOnly cookie and `isAuthenticated()` is just "is there a user" —
 * so seeding a token here would be seeding something the app ignores.
 */
const AUTH_KEY = 'rundesk.auth'
const SESSION = {
  state: {
    user: USER,
    organizations: [{ id: 'o1', name: 'Aura', slug: 'aura', role: 'owner' }],
    workspaces: [{ id: WS, name: 'Rundesk', slug: 'rundesk', organizationId: 'o1', role: 'owner' }],
  },
  version: 0,
}

const envelope = (data) => JSON.stringify({ data, error: null })

const browser = await chromium.launch(LAUNCH)
/** Everything the app sent, so the assertions are about the request, not the DOM. */
const calls = []

try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, serviceWorkers: 'block' })
  await ctx.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [AUTH_KEY, JSON.stringify(SESSION)],
  )

  /*
   * The view the list starts on, and the one the chip should update. Held in a
   * variable rather than re-created per request: a stub that forgets a write
   * is not a stand-in for a server, it is a contradiction — the app saves,
   * re-reads, sees the old value, and the chip lights again.
   */
  const savedView = {
    id: VIEW,
    listId: LIST,
    name: 'Everything',
    type: 'list',
    isDefault: true,
    isPinned: false,
    visibility: 'everyone',
    autosave: false,
    createdById: 'u1',
    config: { activeView: 'list', groupBy: 'status', statusFilter: 'all', sort: { field: 'created', dir: 'desc' } },
  }

  await ctx.route('**/api/**', (route) => {
    const req = route.request()
    const url = req.url()
    const body = req.postData() ?? ''
    calls.push({ method: req.method(), url, body })

    const reply = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: envelope(data) })

    if (url.includes('/users/me')) return reply(USER)
    if (url.includes(`/lists/${LIST}/views`)) return reply([savedView])
    if (req.method() === 'PATCH' && url.includes(`/views/${VIEW}`)) {
      try { Object.assign(savedView.config, JSON.parse(body || '{}').config ?? {}) } catch { /* the test's problem */ }
      return reply(savedView)
    }
    if (url.includes(`/lists/${LIST}/filters`)) return reply([])
    if (url.match(new RegExp(`/lists/${LIST}(\\?|$)`))) {
      return reply({ id: LIST, name: 'Backlog', projectId: PROJECT, spaceId: SPACE })
    }
    if (url.includes(`/tasks/list/${LIST}`)) {
      return reply([
        {
          id: 't1', title: 'A task', description: null, priority: 'normal',
          status: 'todo', statusCategory: 'open', assignees: [], labels: [],
          createdAt: '2026-08-01T00:00:00.000Z', dueDate: null,
        },
      ])
    }
    if (url.includes('/spaces/workspace/')) {
      return reply([{ id: SPACE, name: 'Space', workspaceId: WS, viewConfig: null }])
    }
    // Everything else this route asks for — members, statuses, custom fields,
    // notifications — is legitimately empty for this test.
    return reply([])
  })

  const page = await ctx.newPage()
  await page.goto(`${BASE}/app/${WS}/${SPACE}/${PROJECT}/${LIST}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="list-customize"]', { timeout: 20_000 })

  console.log('\n▶ §V2-07 `[11:35]` — the chip is the message')
  chk(
    (await page.locator('[data-testid="list-save-view"]').count()) === 0,
    'a view you have not touched offers nothing to save',
    'the Save view chip was showing on a freshly loaded, unmodified view',
  )

  // Change the grouping — one of the ten things `currentViewConfig` carries
  // (eight, plus §V2-S13 `10:35`'s Card size and Card cover).
  const groupBy = page.locator('[data-testid="list-group-by"]')
  const groupCount = await groupBy.count()
  chk(groupCount > 0, 'the grouping control is on the toolbar',
    'could not find the group-by select — the rest of this run means nothing')
  await groupBy.selectOption('priority')

  await page.waitForSelector('[data-testid="list-save-view"]', { timeout: 10_000 }).catch(() => {})
  chk(
    (await page.locator('[data-testid="list-save-view"]').count()) === 1,
    'changing the view raises the chip',
    'the view was modified and nothing said the change was unsaved — which is how it used to be lost',
  )

  const before = calls.filter((c) => c.method === 'PATCH' && c.url.includes(`/views/${VIEW}`)).length
  await page.locator('[data-testid="list-save-view"]').click()
  await page.waitForTimeout(1200)

  const patches = calls.filter((c) => c.method === 'PATCH' && c.url.includes(`/views/${VIEW}`))
  chk(patches.length === before + 1, 'clicking it saves the view you are on',
    `expected one PATCH to the view, saw ${patches.length - before}`)
  let sent = null
  try { sent = JSON.parse(patches.at(-1)?.body ?? '{}') } catch { /* reported below */ }
  chk(
    sent?.config?.groupBy === 'priority',
    'and sends the change that raised it',
    `the PATCH body carried groupBy=${JSON.stringify(sent?.config?.groupBy)}`,
  )
  chk(
    typeof sent?.config?.filterRules !== 'undefined' && typeof sent?.config?.sort !== 'undefined',
    'along with the rest of the layout, not just the field that changed',
    `the config sent was ${JSON.stringify(Object.keys(sent?.config ?? {}))}`,
  )

  await page.waitForTimeout(600)
  chk(
    (await page.locator('[data-testid="list-save-view"]').count()) === 0,
    'and the chip goes once there is nothing left to save',
    'the chip stayed up after a successful save, so it says nothing about state',
  )

  await ctx.close()
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close().catch(() => {})
  server.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
