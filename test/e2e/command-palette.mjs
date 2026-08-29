/**
 * ⌘K must show the results the server found.
 *
 * The palette rendered search hits inside a cmdk `<Command>` that still had its
 * own fuzzy filter switched on. cmdk scores an item by its `value` string, and
 * a hit's value was `${entityType}-${id}-${title}` — the title and nothing
 * else. The server searches titles AND bodies, so every hit that matched on a
 * description, a doc body, a comment or a chat message scored 0 and cmdk
 * unmounted it. The user saw "no matches" over results the browser was already
 * holding, with the matching snippet rendered underneath the title.
 *
 * Chat messages could never appear at all: the server titles them the literal
 * string "Chat message" (search.service.ts) and puts the body in `content`, so
 * the words the user typed are never in the string being scored.
 *
 *   node test/e2e/command-palette.mjs [--dist <dir>]
 *
 * The instrument is the stub: every hit below matches ONLY on content. If the
 * palette filters by title again, every assertion here fails.
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

const argOf = (flag) => {
  const i = process.argv.indexOf(flag)
  return i > -1 ? process.argv[i + 1] : null
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
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}`

const WS = '5a842aa9-cede-423a-ae26-bb4ba074849f'
const USER = { id: 'u1', email: 'admin@rundesk.test', displayName: 'Admin', role: 'owner', avatarUrl: null }
const SESSION = {
  state: {
    user: USER,
    organizations: [{ id: 'o1', name: 'Aura', slug: 'aura', role: 'owner' }],
    workspaces: [{ id: WS, name: 'Rundesk', slug: 'rundesk', organizationId: 'o1', role: 'owner' }],
  },
  version: 0,
}

/*
 * The query is "kubernetes". It appears in NO title — only in bodies. That is
 * the whole point: under the old filter every one of these scored 0.
 */
const QUERY = 'kubernetes'
const HITS = [
  {
    id: 'task-11111111-1111-4111-8111-111111111111',
    entityType: 'task',
    title: 'Q3 Finance Plan',
    content: 'we should migrate the kubernetes cluster before the freeze',
    url: `/app/${WS}/s1/p1/l1?task=11111111-1111-4111-8111-111111111111`,
  },
  {
    id: 'doc-22222222-2222-4222-8222-222222222222',
    entityType: 'doc',
    title: 'Onboarding',
    content: 'day two: get kubernetes access from platform',
    url: `/app/${WS}/docs?doc=22222222-2222-4222-8222-222222222222`,
  },
  {
    // The one that could NEVER render: the server hardcodes this title.
    id: 'message-33333333-3333-4333-8333-333333333333',
    entityType: 'message',
    title: 'Chat message',
    content: 'anyone know why kubernetes is throttling us',
    url: `/app/${WS}/chat?channel=c1&message=33333333-3333-4333-8333-333333333333`,
  },
  {
    id: 'comment-44444444-4444-4444-8444-444444444444',
    entityType: 'comment',
    title: 'Comment on “Q3 Finance Plan”',
    content: 'the kubernetes bill is the line item to watch',
    url: `/app/${WS}/s1/p1/l1?task=11111111-1111-4111-8111-111111111111`,
  },
]

const results = []
const ok = (m) => { results.push([true, m]); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push([false, m]); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, g, b) => (c ? ok(g) : bad(b))

const browser = await chromium.launch(LAUNCH)
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })

// Every response goes back in the API's `{data,error}` envelope — lib/api.ts
// returns `parsed.data`, so a bare array arrives as undefined and renders
// nothing, which looks exactly like the bug this file is testing for.
const envelope = (data) => JSON.stringify({ data, error: null })

await ctx.route('**/api/**', async (route) => {
  const url = route.request().url()
  let data = []
  if (url.includes('/users/me')) data = USER
  else if (/\/search\/[^/?]+\?/.test(url)) {
    // Answer only the query under test, so an unrelated prefetch cannot
    // populate the list and make this pass for the wrong reason.
    data = new URL(url).searchParams.get('q') === QUERY ? HITS : []
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: envelope(data) })
})

const page = await ctx.newPage()
// DBG=1 surfaces page errors. Worth keeping: the first draft of this file
// stubbed bare arrays, every api() call threw on the missing {data,error}
// envelope, and the only visible symptom was an empty result list — which is
// indistinguishable from the bug under test.
page.on('console', (m) => {
  if (process.env.DBG && m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200))
})
page.on('pageerror', (e) => {
  if (process.env.DBG) console.log('PAGEERROR', String(e).slice(0, 300))
})
await page.addInitScript(
  ([k, v]) => window.localStorage.setItem(k, v),
  ['rundesk.auth', JSON.stringify(SESSION)],
)

try {
  /*
   * Inbox, not Home. The palette is mounted in the /app shell so any route
   * exercises it, and Home derives a space/project tree from several endpoints
   * at once — stubbing all of those faithfully would make this file a fixture
   * for a page it is not testing.
   */
  await page.goto(`${BASE}/app/${WS}/inbox`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)

  await page.keyboard.press('Control+k')
  await page.waitForTimeout(800)
  const input = page.locator('[cmdk-input]').first()
  chk((await input.count()) > 0, 'the palette opens on ⌘K', 'the palette did not open')

  await input.fill(QUERY)
  await page.waitForTimeout(1500)

  const seen = (await page.locator('[cmdk-list]').first().innerText()).replace(/\s+/g, ' ')

  // Each hit is checked by its TITLE, which does not contain the query — so a
  // title-scoring filter cannot let these through.
  for (const [label, title] of [
    ['a task that matched in its description', 'Q3 Finance Plan'],
    ['a doc that matched in its body', 'Onboarding'],
    ['a chat message (title is always "Chat message")', 'Chat message'],
    ['a comment that matched in its body', 'Comment on'],
  ]) {
    chk(seen.includes(title), `${label} is shown`, `${label} was dropped — the palette is filtering by title again`)
  }

  // The snippet is what tells the user WHY a row matched.
  chk(
    /throttling us|migrate the kubernetes/i.test(seen),
    'and the matching snippet is rendered with it',
    'the row rendered without the snippet that justifies it',
  )

  // "No matches" over results the browser is holding was the visible symptom.
  chk(
    !/No matches/i.test(seen),
    'the palette does not claim "no matches" while holding results',
    'the palette says "no matches" over results it has',
  )

  /*
   * Server order must survive. cmdk re-sorts by its own score when filtering,
   * so leaving the filter on silently discarded the ranking the search engine
   * had just computed. Tasks come first in ENTITY_ORDER, so the task group
   * must appear above the doc group.
   */
  chk(
    seen.indexOf('Q3 Finance Plan') < seen.indexOf('Onboarding'),
    'and the server’s ordering is preserved, not re-scored',
    'the results were re-ordered by the client',
  )

  // Command mode does its own filtering; turning cmdk's off must not break it.
  await input.fill('/')
  await page.waitForTimeout(600)
  const allCommands = (await page.locator('[cmdk-item]').count())
  await input.fill('/doc')
  await page.waitForTimeout(600)
  const narrowed = (await page.locator('[cmdk-item]').count())
  chk(
    allCommands > 0 && narrowed > 0 && narrowed < allCommands,
    `/ still narrows commands itself (${allCommands} -> ${narrowed})`,
    `command mode no longer filters (${allCommands} -> ${narrowed})`,
  )
} catch (e) {
  bad(`threw: ${e.message.split('\n')[0]}`)
  await page.screenshot({ path: '/tmp/command-palette-fail.png', fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  server.close()
}

const failed = results.filter(([p]) => !p)
console.log(`\n\x1b[1m${results.length - failed.length} passed, ${failed.length} failed\x1b[0m`)
process.exit(failed.length ? 1 : 0)
