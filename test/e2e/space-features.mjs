/**
 * §V2-06 — a switched-off ClickApp actually disappears.
 *
 * Frame `07:19` is a grid of switches. This is the suite that decides whether
 * that grid is a feature or a picture of one. Everything else in V2-06 —
 * `space-presets.mjs`, `space-wizard.mjs` — proves a value is chosen, sent and
 * stored. None of that matters if nothing reads it.
 *
 * So: the same list, rendered twice. Once in a space with every feature on,
 * once in a space that has switched Priority, Tags, Custom Fields, Milestones
 * and Email-to-List off. The check is that the second one is genuinely missing
 * what the first one shows.
 *
 * DEFAULTS ARE PART OF THE CONTRACT. Every space made before this column
 * existed has `features: null`, and that has to read as ALL ON. The first half
 * of this run is that check: shipping a switch that hides Priority from every
 * existing space in every existing workspace is not a feature, it is an outage.
 *
 *   node test/e2e/space-features.mjs --dist apps/web/dist
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
const EXPECTED_CHECKS = 12

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const WEB = path.join(ROOT, 'apps/web')

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  // The SENTENCE, then the reason. This printed `${bad ?? good}`, so a failing
  // check named only its reason and never itself — and for a check inside a
  // loop the reason is all a reader (or `check-break-reddened.mjs`) has to go
  // on. Seventy suites shared the line.
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` \u2014 ${bad}` : ''}`) }
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
const OPEN_SPACE = '11111111-1111-4111-8111-111111111111'
const SHUT_SPACE = '99999999-9999-4999-8999-999999999999'
/*
 * A space whose stored map PREDATES some of the keys — written when `priority`
 * was the only switch there was.
 *
 * `useSpaceFeatures` merges the stored map over ALL_SPACE_FEATURES rather than
 * using it directly, and says why: "a stored map written before a new feature
 * key existed must not read as 'that new feature is off'." Nothing exercised
 * that. Both fixtures above carry either NO map or a COMPLETE one, so
 * `{ ...ALL, ...stored }` and `stored` are the same answer for each of them —
 * the merge could have been deleted with this suite green.
 */
const PARTIAL_SPACE = '77777777-7777-4777-8777-777777777777'
const PROJECT = '22222222-2222-4222-8222-222222222222'
const LIST = '33333333-3333-4333-8333-333333333333'

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
 * The open space carries `features: null` — the shape every space made before
 * this column existed has. The shut one names each switch false explicitly.
 */
const SPACES = [
  { id: OPEN_SPACE, name: 'Open', workspaceId: WS, viewConfig: null, features: null },
  {
    id: SHUT_SPACE, name: 'Shut', workspaceId: WS, viewConfig: null,
    features: { priority: false, tags: false, customFields: false, milestones: false, wipLimits: false, listEmail: false },
  },
  // One key, switched off. Every other key is ABSENT, not false.
  { id: PARTIAL_SPACE, name: 'Partial', workspaceId: WS, viewConfig: null, features: { priority: false } },
]

const TASKS = [
  {
    id: 't1', title: 'A task', description: null, priority: 'urgent',
    status: 'todo', statusCategory: 'open', isMilestone: true,
    assignees: [], labels: [{ id: 'l1', name: 'bug', color: '#ef4444' }],
    createdAt: '2026-08-01T00:00:00.000Z', dueDate: null,
  },
]

const envelope = (data) => JSON.stringify({ data, error: null })
const browser = await chromium.launch(LAUNCH)

/** Open the same list under a given space and report what the toolbar offers. */
async function inspect(spaceId) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'block' })
  await ctx.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    ['rundesk.auth', JSON.stringify(SESSION)],
  )
  await ctx.route('**/api/**', (route) => {
    const req = route.request()
    const url = req.url()
    const reply = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: envelope(data) })
    if (url.includes('/users/me')) return reply(USER)
    if (url.includes('/spaces/workspace/')) return reply(SPACES)
    if (url.includes(`/tasks/list/${LIST}`)) return reply(TASKS)
    if (url.match(new RegExp(`/lists/${LIST}(\\?|$)`))) {
      return reply({ id: LIST, name: 'Backlog', projectId: PROJECT, spaceId })
    }
    return reply([])
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/app/${WS}/${spaceId}/${PROJECT}/${LIST}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="list-customize"]', { timeout: 20_000 })

  // Grouping and sorting by a field the space switched off must not be offered.
  const groupOptions = await page.locator('[data-testid="list-group-by"] option').allInnerTexts()
  const emailButton = await page.locator('[data-testid="list-email-button"]').count()
  const toolbar = await page.locator('body').innerText()

  // The filter panel's field list.
  await page.locator('[data-testid="list-filter-builder"]').click()
  await page.locator('[data-testid="list-filter-add"]').click()
  const fieldOptions = await page.locator('[data-testid="list-filter-rule"] select').first().locator('option').allInnerTexts()

  await ctx.close()
  return { groupOptions, emailButton, fieldOptions, toolbar }
}

try {
  console.log('\n▶ a space that has never seen the switches shows everything')
  const open = await inspect(OPEN_SPACE)
  chk(
    open.groupOptions.some((o) => /priorit/i.test(o)),
    'features: null reads as every switch ON — grouping by Priority is offered',
    `the group-by offered ${JSON.stringify(open.groupOptions)}; a null features column must not hide anything`,
  )
  chk(open.emailButton === 1, 'and Email to List is on the toolbar',
    'the Email button was missing from a space with no feature map')
  chk(
    open.fieldOptions.some((o) => /priorit/i.test(o)) && open.fieldOptions.some((o) => /tag/i.test(o)),
    'and the filter panel offers Priority and Tags',
    `the filter fields were ${JSON.stringify(open.fieldOptions)}`,
  )

  console.log('\n▶ and a space that switched them off does not')
  const shut = await inspect(SHUT_SPACE)
  chk(
    !shut.groupOptions.some((o) => /priorit/i.test(o)),
    'Priority is gone from the group-by',
    `the group-by still offered ${JSON.stringify(shut.groupOptions)} — the switch stores a value nobody reads`,
  )
  chk(
    shut.groupOptions.length === open.groupOptions.length - 1,
    'and exactly one option went — the rest of the control is intact',
    `open had ${open.groupOptions.length} options, shut had ${shut.groupOptions.length}`,
  )
  chk(shut.emailButton === 0, 'Email to List is gone from the toolbar',
    'the Email button survived a space that switched it off')
  chk(
    !shut.fieldOptions.some((o) => /priorit/i.test(o)),
    'Priority is gone from the filter fields',
    `filtering by Priority was still offered: ${JSON.stringify(shut.fieldOptions)}`,
  )
  chk(
    !shut.fieldOptions.some((o) => /^tags?$/i.test(o.trim())),
    'and so is Tags',
    `filtering by Tags was still offered: ${JSON.stringify(shut.fieldOptions)}`,
  )
  /*
   * The control that stops the two halves above passing for the wrong reason:
   * if the shut space simply failed to render, everything would be "missing".
   */
  chk(
    shut.fieldOptions.length > 0 && shut.groupOptions.length > 0,
    'the list still rendered — the switches hid features, they did not break the page',
    'the shut space rendered no controls at all, so "missing" means nothing here',
  )
  chk(
    shut.toolbar.includes('Backlog'),
    'and it is still the same list',
    'the list name was not on screen — this run was not looking at the list',
  )

  /*
   * ── A STORED MAP THAT PREDATES A KEY ──────────────────────────────────────
   *
   * `useSpaceFeatures` merges over ALL_SPACE_FEATURES so an ABSENT key reads as
   * ON, and the two fixtures above could not tell that apart from using the
   * stored map directly: one has no map and the other has a complete one. The
   * merge could have been deleted with this suite green — the same defect as a
   * switch that writes a column nobody reads, one level in.
   *
   * This space says `{ priority: false }` and nothing else, which is what a row
   * written before `listEmail` existed looks like.
   */
  console.log('\n▶ and a map written before a key existed does not switch it off')
  const partial = await inspect(PARTIAL_SPACE)
  chk(
    !partial.groupOptions.some((o) => /priorit/i.test(o)),
    'the key the map names is honoured — Priority is gone',
    `the group-by still offered ${JSON.stringify(partial.groupOptions)}`,
  )
  chk(
    partial.emailButton === 1,
    'and a key the map never mentions stays ON — Email to List is still there',
    'an absent key read as "off", so every space stored before a new switch shipped loses it',
  )
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
