/**
 * §V2-06 — the Create-a-Space wizard, driven in a browser.
 *
 * Frames `06:52` (Icon & name · Description · Default permission · Make
 * Private · Continue) and `07:06` (four workflow presets, then "Customize
 * defaults" over Default views, Task statuses and ClickApps).
 *
 * WHAT THIS IS FOR. `space-presets.mjs` proves the API applies what it is
 * sent. This proves a person can send it — which used to be the whole gap:
 * both create-a-space dialogs collected a name, and `description`, `color` and
 * `icon` were live parameters no UI could reach.
 *
 * So the assertions are about the REQUEST the wizard makes, not about what
 * the DOM looks like afterwards. A wizard that renders four beautiful preset
 * cards and posts `{workspaceId, name}` is exactly the failure this is
 * watching for.
 *
 *   node test/e2e/space-wizard.mjs --dist apps/web/dist
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
const EXPECTED_CHECKS = 11

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
const USER = { id: 'u1', email: 'admin@rundesk.test', displayName: 'Admin', role: 'owner', avatarUrl: null }
const AUTH_KEY = 'rundesk.auth'
const SESSION = {
  state: {
    user: USER,
    organizations: [{ id: 'o1', name: 'Aura', slug: 'aura', role: 'owner' }],
    workspaces: [{ id: WS, name: 'Rundesk', slug: 'rundesk', organizationId: 'o1', role: 'owner' }],
  },
  version: 0,
}

/** The shape `GET /space-presets` really returns, so the UI has real input. */
const PRESETS = {
  presets: [
    { key: 'starter', views: ['list', 'board'], defaultView: 'list',
      statuses: [{ key: 'todo', name: 'To do', color: '#94a3b8', category: 'open' }],
      features: ['priority', 'tags'], seedLists: ['Tasks'] },
    { key: 'marketing', views: ['list', 'board', 'calendar'], defaultView: 'board',
      statuses: [{ key: 'todo', name: 'To do', color: '#94a3b8', category: 'open' }],
      features: ['priority', 'tags', 'listEmail'], seedLists: ['Campaigns', 'Content calendar'] },
    { key: 'project', views: ['list', 'board', 'gantt'], defaultView: 'list',
      statuses: [{ key: 'todo', name: 'To do', color: '#94a3b8', category: 'open' }],
      features: ['priority', 'timeTracking'], seedLists: ['Project plan'] },
    { key: 'product', views: ['list', 'board', 'table'], defaultView: 'board',
      statuses: [{ key: 'todo', name: 'To do', color: '#94a3b8', category: 'open' }],
      features: ['priority', 'wipLimits'], seedLists: ['Roadmap'] },
  ],
  features: ['priority', 'tags', 'customFields', 'multipleAssignees', 'timeTracking',
    'timeEstimates', 'milestones', 'wipLimits', 'listEmail'],
  views: ['list', 'board', 'table', 'calendar', 'gantt'],
}

const envelope = (data) => JSON.stringify({ data, error: null })
const browser = await chromium.launch(LAUNCH)
const calls = []

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  await ctx.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [AUTH_KEY, JSON.stringify(SESSION)],
  )
  await ctx.route('**/api/**', (route) => {
    const req = route.request()
    const url = req.url()
    calls.push({ method: req.method(), url, body: req.postData() ?? '' })
    const reply = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: envelope(data) })
    if (url.includes('/users/me')) return reply(USER)
    if (url.includes('/space-presets')) return reply(PRESETS)
    if (req.method() === 'POST' && /\/spaces(\?|$)/.test(url)) {
      return reply({ id: 'new-space-1', name: 'Rundex' })
    }
    if (url.includes('/spaces/workspace/')) {
      return reply([{ id: SPACE, name: 'Space', workspaceId: WS, viewConfig: null }])
    }
    if (url.match(new RegExp(`/lists/${LIST}(\\?|$)`))) {
      return reply({ id: LIST, name: 'Backlog', projectId: PROJECT, spaceId: SPACE })
    }
    return reply([])
  })

  /*
   * Driven from the LIST route rather than the workspace home. The wizard is
   * reachable from the topbar "+" on both, and the workspace home reads shapes
   * a blanket empty-array stub cannot satisfy — it threw
   * "Cannot read properties of undefined (reading 'space')" and the run proved
   * nothing about the wizard. The list route is the one `list-save-view.mjs`
   * already stubs successfully.
   */
  const page = await ctx.newPage()
  await page.goto(`${BASE}/app/${WS}/${SPACE}/${PROJECT}/${LIST}`, { waitUntil: 'networkidle' })

  // Reached the way a person reaches it: the topbar "+".
  await page.locator('[data-testid="quick-create-open"]').click()
  await page.locator('[data-testid="create-tab-space"]').click()
  await page.waitForSelector('[data-testid="space-wizard-step1"]', { timeout: 20_000 })

  console.log('\n▶ step one asks more than a name `[frame 06:52]`')
  for (const [testId, label] of [
    ['space-wizard-description', 'a description'],
    ['space-wizard-permission', 'a default permission'],
    ['space-wizard-private', 'a Make Private switch'],
  ]) {
    chk(
      (await page.locator(`[data-testid="${testId}"]`).count()) === 1,
      `the form offers ${label}`,
      `${label} is missing — this was the whole gap: the form collected a name`,
    )
  }

  await page.locator('[data-testid="space-wizard-name"]').fill('Rundex')
  await page.locator('[data-testid="space-wizard-description"]').fill('Made by the wizard')
  await page.locator('[data-testid="space-wizard-permission"]').selectOption('comment')
  await page.locator('[data-testid="space-wizard-private"]').click()
  await page.locator('[data-testid="space-wizard-continue"]').click()

  console.log('\n▶ step two is the workflow presets `[frame 07:06]`')
  await page.waitForSelector('[data-testid="space-wizard-step2"]', { timeout: 10_000 })
  const cards = await page.locator('[data-testid^="space-wizard-preset-"]').count()
  chk(cards === 4, 'all four cards are on screen', `found ${cards} preset card(s)`)
  chk(
    (await page.locator('[data-testid="space-wizard-seed-note"]').innerText()).includes('Tasks'),
    'and it says which lists the Space will be created with `[07:46]`',
    'nothing warned that the Space arrives with lists nobody made',
  )

  await page.locator('[data-testid="space-wizard-preset-marketing"]').click()

  // The Required-views panel: List cannot be turned off.
  await page.locator('[data-testid="space-wizard-row-views"]').click()
  await page.waitForSelector('[data-testid="space-wizard-views"]', { timeout: 10_000 })
  chk(
    await page.locator('[data-testid="space-wizard-view-list"]').isDisabled(),
    'List is Required and cannot be switched off `[frame 07:12]`',
    'the List view could be turned off — every list falls back to it, so the space would render nothing',
  )
  await page.locator('[data-testid="space-wizard-view-calendar"]').click() // marketing has it on → off
  await page.locator('[data-testid="space-wizard-views-done"]').click()

  // The ClickApps grid.
  await page.locator('[data-testid="space-wizard-row-features"]').click()
  await page.waitForSelector('[data-testid="space-wizard-features"]', { timeout: 10_000 })
  const tiles = await page.locator('[data-testid^="space-wizard-feature-"]').count()
  chk(tiles === PRESETS.features.length, 'every feature the server offers has a switch',
    `the grid drew ${tiles} of ${PRESETS.features.length}`)
  await page.locator('[data-testid="space-wizard-feature-milestones"]').click() // off → on
  await page.locator('[data-testid="space-wizard-features-done"]').click()

  console.log('\n▶ and what it POSTs is what was chosen, not just the name')
  await page.locator('[data-testid="space-wizard-create"]').click()
  await page.waitForTimeout(1500)

  const post = calls.filter((c) => c.method === 'POST' && /\/spaces(\?|$)/.test(c.url)).at(-1)
  let sent = null
  try { sent = JSON.parse(post?.body ?? '{}') } catch { /* reported below */ }
  chk(
    sent?.name === 'Rundex' && sent?.description === 'Made by the wizard' &&
      sent?.visibility === 'private' && sent?.defaultPermission === 'comment',
    'step one reaches the request — description, private and permission included',
    `the body was ${JSON.stringify(sent)}`,
  )
  chk(
    sent?.presetKey === 'marketing' && !!sent?.icon && !!sent?.color,
    'along with the chosen preset, and the icon and colour the API always accepted',
    `presetKey=${JSON.stringify(sent?.presetKey)} icon=${JSON.stringify(sent?.icon)} color=${JSON.stringify(sent?.color)}`,
  )
  chk(
    Array.isArray(sent?.viewConfig?.enabledViews) &&
      !sent.viewConfig.enabledViews.includes('calendar') &&
      sent.viewConfig.enabledViews.includes('list'),
    'the view the person switched off is genuinely absent from the request',
    `enabledViews was ${JSON.stringify(sent?.viewConfig?.enabledViews)} — the panel would be decoration`,
  )
  chk(
    Array.isArray(sent?.features) && sent.features.includes('milestones'),
    'and so is the feature they switched on',
    `features was ${JSON.stringify(sent?.features)}`,
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
  if (ran < EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
