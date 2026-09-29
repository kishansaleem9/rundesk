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
import { readText, waitUntil } from './lib/wait.mjs'
import { ALL_PERMISSIONS } from './lib/permissions.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/**
 * "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure.
 *
 * 11 → 23 in §V2-S08: frame `06:45`'s Use-Templates footer (4), frame `07:50`'s
 * copy-configuration bar (5) and frame `07:12`'s Default View Templates tab (3).
 */
const EXPECTED_CHECKS = 23

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
const SPACE = '11111111-1111-4111-8111-111111111111'
/** The space frame `07:50`'s bar copies FROM. */
const SOURCE = '44444444-4444-4444-8444-444444444444'
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

/**
 * The shape `GET /space-presets` really returns, so the UI has real input.
 *
 * §V2-06 RE-AUDIT — this stub had drifted from the server it stands in for. Its
 * `features` listed `multipleAssignees`, `timeTracking` and `timeEstimates`,
 * none of which `SPACE_FEATURE_KEYS` has ever contained (they live on the task
 * detail sheet, which does not know its task's space), and its `views` was
 * missing `team`. A stub that describes a server that does not exist is a
 * sixth copy of a list this audit has already found five copies of — and the
 * one place the drift could never be noticed, because the suite reading it
 * also wrote it. Both now match `apps/api/.../space-presets.ts` exactly.
 *
 * No plan block here on purpose: the un-scoped route has none, and its absence
 * is what an ungated workspace looks like, so the panel below draws no
 * padlocks. `clickapps-plan-gating.mjs` covers the gated case against the real
 * API, where the plan is a fact rather than a fixture's opinion.
 */
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
      features: ['priority', 'customFields'], seedLists: ['Project plan'] },
    { key: 'product', views: ['list', 'board', 'table'], defaultView: 'board',
      statuses: [{ key: 'todo', name: 'To do', color: '#94a3b8', category: 'open' }],
      features: ['priority', 'wipLimits'], seedLists: ['Roadmap'] },
  ],
  features: ['priority', 'tags', 'customFields', 'milestones', 'wipLimits', 'listEmail'],
  views: ['list', 'board', 'table', 'calendar', 'gantt', 'team'],
}

/**
 * `GET /workspaces/:id/project-templates`, trimmed to the columns the wizard
 * reads. Two of the real built-in `targetType: 'space'` rows, plus one folder
 * row the panel must leave out.
 */
const TEMPLATES = [
  { id: 'tpl-space-1', name: 'Agency client space', description: 'A space per client.', targetType: 'space', isBuiltIn: true },
  { id: 'tpl-space-2', name: 'Product team space', description: 'Discovery, delivery, release log.', targetType: 'space', isBuiltIn: true },
  { id: 'tpl-folder-1', name: 'Software sprint', description: 'Backlog → done.', targetType: 'folder', isBuiltIn: true },
]

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
    // What the Create menu reads before it offers Space (an empty stub offers none).
    if (url.includes('/roles/me/permissions')) return reply({ permissions: ALL_PERMISSIONS })
    if (url.includes('/space-presets')) return reply(PRESETS)
    if (req.method() === 'POST' && /\/spaces(\?|$)/.test(url)) {
      return reply({ id: 'new-space-1', name: 'Rundex' })
    }
    /*
     * §V2-S08 frame `06:45` — the Use-Templates footer, and what it offers.
     * A FOLDER-targeted row is included on purpose: the panel must show the
     * two space templates and not the third, so "it lists templates" cannot
     * pass for "it lists the ones that make a Space".
     */
    if (url.includes('/project-templates/apply')) {
      return reply({
        space: { id: 'tpl-space-made', name: 'Agency client space' },
        project: { id: 'tpl-project-made', name: 'Agency client space' },
        targetType: 'space',
        listsCreated: 3,
        tasksCreated: 5,
      })
    }
    if (url.includes('/project-templates')) return reply(TEMPLATES)
    if (url.includes('/spaces/workspace/')) {
      /*
       * §V2-S08 frame `07:50` — the `from: Personal Space ▾` dropdown. A
       * SECOND space, carrying a real `viewConfig` and `features`, because the
       * copy bar has nothing to copy from a workspace with one blank space.
       * The original row keeps `viewConfig: null` so nothing else here moves.
       */
      return reply([
        { id: SPACE, name: 'Space', workspaceId: WS, viewConfig: null, features: null },
        {
          id: SOURCE,
          name: 'Personal Space',
          workspaceId: WS,
          viewConfig: { enabledViews: ['list', 'board', 'gantt', 'team'], defaultView: 'gantt' },
          features: { priority: true, customFields: true, tags: false },
        },
      ])
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
  /*
   * EVERY CONTROL THIS SUITE CLICKS IS ONE OF ITS OWN PATCHES' TARGETS, so an
   * unqualified `.click()` here is thirty seconds and a run that ends where it
   * stood. `sw-1-no-templates-footer` removes the Use Templates button and
   * reported `only 2 of 23 checks ran`; `sw-10-one-tab-only` removes the
   * templates TAB and reported 16 of 23. In both cases the check immediately
   * above the click had already said the control was missing, and then the run
   * died instead of reporting the twenty-one or seven checks that follow.
   *
   * Bounded, and it answers a boolean: a caller that ignores it goes on to find
   * nothing changed, which is the honest failure.
   */
  const press = (testId) =>
    page
      .locator(`[data-testid="${testId}"]`)
      .click({ timeout: 8000 })
      .then(() => true)
      .catch(() => false)
  const openWizard = async () => {
    await page.goto(`${BASE}/app/${WS}/${SPACE}/${PROJECT}/${LIST}`, { waitUntil: 'networkidle' })
    // Reached the way a person reaches it: the topbar "+".
    await press('quick-create-open')
    await press('create-tab-space')
    /*
   * GATES THAT REPORT. Each of these waits for a panel some patch in this
   * suite removes — `sw-1-no-templates-footer` takes the templates step away,
   * `sw-10-one-tab-only` the views step — and a throw here ends the run before
   * the checks that say the panel is missing get to say it (ledger §10).
   */
  await page.waitForSelector('[data-testid="space-wizard-step1"]', { timeout: 20_000 }).catch(() => {})
  }

  /*
   * §V2-S08 frame `06:45` FIRST, because applying a template CLOSES the wizard
   * — which is itself one of the claims. The main flow below reopens it.
   */
  await openWizard()
  console.log('\n▶ step one has the frame\'s Use-Templates footer `[frame 06:45]`')
  chk(
    (await page.locator('[data-testid="space-wizard-use-templates"]').count()) === 1,
    'the Create-a-Space dialog offers Use Templates beside Continue',
    'the footer was Continue alone — the one dialog where a template is obviously worth ' +
      'offering was the one place that did not offer it',
  )

  await press('space-wizard-use-templates')
  await page.waitForSelector('[data-testid="space-wizard-templates"]', { timeout: 15_000 }).catch(() => {})
  const offered = await page.locator('[data-testid^="space-wizard-tplcard-"]').evaluateAll((els) =>
    els.map((e) => (e.getAttribute('data-testid') ?? '').replace('space-wizard-tplcard-', '')),
  )
  chk(
    JSON.stringify(offered) === JSON.stringify(['tpl-space-1', 'tpl-space-2']),
    'and lists ONLY the templates that make a Space — the folder one is left out',
    `it offered ${JSON.stringify(offered)}; a folder template applied from here would create a ` +
      'container of a different kind than the button beside it',
  )

  const applyBefore = calls.length
  await press('space-wizard-tplgo-tpl-space-2')
  const applied = await waitUntil(
    () => calls.slice(applyBefore).some((c) => c.method === 'POST' && c.url.includes('/project-templates/apply')),
    { timeoutMs: 15_000 },
  )
  const applyCall = calls.slice(applyBefore).filter((c) => c.method === 'POST' && c.url.includes('/project-templates/apply')).at(-1)
  let appliedBody = null
  try { appliedBody = JSON.parse(applyCall?.body ?? '{}') } catch { /* reported below */ }
  chk(
    // NON-EMPTY FIRST, in the same check: "no apply carried the wrong id" is
    // vacuously true when nothing was applied.
    applied && appliedBody?.templateId === 'tpl-space-2',
    'pressing Use applies THAT template, by id',
    `the apply body was ${JSON.stringify(appliedBody)}`,
  )
  chk(
    await waitUntil(async () => (await page.locator('[data-testid="space-wizard-templates"]').count()) === 0, { timeoutMs: 15_000 }),
    'and the wizard closes on success rather than sitting there over a Space that now exists',
    'the templates panel was still on screen after a successful apply',
  )

  await openWizard()

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
  await press('space-wizard-private')
  await press('space-wizard-continue')

  console.log('\n▶ step two is the workflow presets `[frame 07:06]`')
  await page.waitForSelector('[data-testid="space-wizard-step2"]', { timeout: 10_000 }).catch(() => {})
  const cards = await page.locator('[data-testid^="space-wizard-preset-"]').count()
  chk(cards === 4, 'all four cards are on screen', `found ${cards} preset card(s)`)
  chk(
    (await readText(page.locator('[data-testid="space-wizard-seed-note"]').filter({ visible: true }))).includes('Tasks'),
    'and it says which lists the Space will be created with `[07:46]`',
    'nothing warned that the Space arrives with lists nobody made',
  )

  /*
   * §V2-S08 frame `07:50` — the copy bar, BEFORE the preset card is chosen,
   * because choosing one is supposed to drop what was copied and the last
   * check here is exactly that.
   */
  console.log('\n▶ copy configuration from another Space `[frame 07:50]`')
  const copyChips = await page.locator('[data-testid^="space-wizard-copypart-"]').evaluateAll((els) =>
    els.map((e) => (e.getAttribute('data-testid') ?? '').replace('space-wizard-copypart-', '')),
  )
  chk(
    JSON.stringify(copyChips) === JSON.stringify(['views', 'features']) &&
      (await page.locator('[data-testid="space-wizard-copy-source"]').count()) === 1,
    'the bar offers the two parts Rundesk can really copy, and a Space to copy them from',
    `it drew chips ${JSON.stringify(copyChips)} and ` +
      `${await page.locator('[data-testid="space-wizard-copy-source"]').count()} source picker(s)`,
  )

  await press('space-wizard-copy-hide')
  const wentAway = await waitUntil(
    async () =>
      (await page.locator('[data-testid="space-wizard-copy"]').count()) === 0 &&
      (await page.locator('[data-testid="space-wizard-copy-show"]').count()) === 1,
    { timeoutMs: 8000 },
  )
  // `press` rather than a bare `.catch`: the catch swallowed the error and still
  // waited out the default thirty seconds to get it.
  await press('space-wizard-copy-show')
  const cameBack = await waitUntil(
    async () => (await page.locator('[data-testid="space-wizard-copy"]').count()) === 1,
    { timeoutMs: 8000 },
  )
  chk(
    wentAway && cameBack,
    'Hide puts the bar away and there is a way back — it is not a one-way dismissal',
    `Hide ${wentAway ? 'worked but could not be undone' : 'did nothing'}`,
  )

  // `sw-6-hide-is-one-way` leaves the bar hidden with no way back, which the
  // check above reports — and then this picked at a select that is not on
  // screen for thirty seconds.
  await page
    .locator('[data-testid="space-wizard-copy-source"]')
    .selectOption(SOURCE, { timeout: 8000 })
    .catch(() => {})
  await press('space-wizard-copy-apply')
  chk(
    await waitUntil(async () => {
      const row = (await readText(page.locator('[data-testid="space-wizard-row-views"]').filter({ visible: true }))).replace(/\s+/g, ' ')
      return /Gantt/.test(row) && /Team/.test(row)
    }, { timeoutMs: 10_000 }),
    'Apply puts the source Space\'s own views into this wizard — Gantt and Team, which no preset here has together',
    `the Default views row read "${(await readText(page.locator('[data-testid="space-wizard-row-views"]'))).replace(/\s+/g, ' ')}"`,
  )
  chk(
    (await readText(page.locator('[data-testid="space-wizard-copy-note"]').filter({ visible: true }))).includes('Personal Space'),
    'and says where they came from, by name',
    'nothing on screen named the Space the configuration was taken from',
  )

  await press('space-wizard-preset-marketing')
  /*
   * NO GANTT, READ OFF A ROW THAT SHOWS THE CARD'S OWN VIEWS. `readText` answers
   * '' for a row it cannot read, and '' holds no "Gantt" — so a wizard that
   * drew no views row passed this. The row read has to name every view the
   * marketing card carries before Gantt's absence from it counts: that is the
   * card's configuration replacing the copy, rather than nothing replacing it.
   */
  const marketingViews = PRESETS.presets.find((p) => p.key === 'marketing').views
  const showsCard = (row) => marketingViews.every((v) => new RegExp(`\\b${v}\\b`, 'i').test(row))
  chk(
    await waitUntil(async () => {
      const row = (await readText(page.locator('[data-testid="space-wizard-row-views"]').filter({ visible: true }))).replace(/\s+/g, ' ')
      return showsCard(row) && !/Gantt/.test(row) &&
        (await page.locator('[data-testid="space-wizard-copy-note"]').count()) === 0
    }, { timeoutMs: 10_000 }),
    'and choosing a workflow card drops the copy — it was a customisation OF the old card',
    showsCard((await readText(page.locator('[data-testid="space-wizard-row-views"]'))).replace(/\s+/g, ' '))
      ? 'the copied views survived a preset change, so the space would be built from a mixture ' +
          'nobody chose and the note would still name a Space that no longer decides anything'
      : `the Default views row did not show the marketing card's ${JSON.stringify(marketingViews)} — it read ` +
          `"${(await readText(page.locator('[data-testid="space-wizard-row-views"]'))).replace(/\s+/g, ' ')}", ` +
          'so what it lacks says nothing',
  )

  // The Required-views panel: List cannot be turned off.
  await press('space-wizard-row-views')
  await page.waitForSelector('[data-testid="space-wizard-views"]', { timeout: 10_000 }).catch(() => {})

  console.log('\n▶ the views panel has the frame\'s TWO tabs `[frame 07:12]`')
  chk(
    (await readText(page.locator('[data-testid="space-wizard-viewstab-required"]').filter({ visible: true }))).trim().toLowerCase() === 'required views' &&
      (await readText(page.locator('[data-testid="space-wizard-viewstab-templates"]').filter({ visible: true }))).trim().toLowerCase() === 'default view templates',
    'the panel is tabbed Required views | Default View Templates, as the frame draws',
    'the second tab is missing or misnamed — Rundesk drew only the switch list',
  )

  await press('space-wizard-viewstab-templates')
  const tplKeys = await page.locator('[data-testid^="space-wizard-viewtplcard-"]').evaluateAll((els) =>
    els.map((e) => (e.getAttribute('data-testid') ?? '').replace('space-wizard-viewtplcard-', '')),
  )
  chk(
    JSON.stringify(tplKeys) === JSON.stringify(PRESETS.presets.map((p) => p.key)) &&
      (await readText(page.locator('[data-testid="space-wizard-viewtplset-project"]').filter({ visible: true }))).includes('Gantt'),
    'the tab offers one named view set per workflow, each naming the views it carries',
    `it offered ${JSON.stringify(tplKeys)} and the project set read ` +
      `"${await readText(page.locator('[data-testid="space-wizard-viewtplset-project"]'))}"`,
  )

  /*
   * PRESS A SET THAT IS NOT ALREADY IN EFFECT, or the check proves nothing.
   *
   * Step two chose the Marketing workflow card, so the switches underneath
   * already ARE Marketing's. The panel reads "applied" off those switches
   * rather than latching a flag when the button is pressed, so it draws the
   * Marketing card `data-applied="true"`, labels its button "Applied" and
   * disables it. Pressing it there is a no-op the product correctly refuses —
   * `locator.click()` waits for an enabled element and times out — and had the
   * press gone through, `calendar=on, gantt=off` was ALREADY true before it, so
   * the assertion it fed could not have failed for any build.
   *
   * So the presses are made against sets that genuinely differ: Project, which
   * carries Gantt and no Calendar, and then back to Marketing. Each one is
   * asserted across EVERY switch the panel draws, not just two of them, and
   * both moves feed the one check — the switches have to leave Marketing and
   * come back, which stops being true the moment `onClick` stops calling
   * `setViews`.
   */
  const markedApplied =
    (await page
      .locator('[data-testid="space-wizard-viewtplcard-marketing"]')
      .getAttribute('data-applied', { timeout: 6000 })
      .catch(() => null)) === 'true'

  /**
   * Press ONE view set and answer whether the switches underneath moved to
   * exactly it. A set that is already in effect answers false rather than
   * being pressed: that press would be the vacuous one.
   */
  const applyViewTemplate = async (key) => {
    const preset = PRESETS.presets.find((p) => p.key === key)
    await press('space-wizard-viewstab-templates')
    const already = await page
      .locator(`[data-testid="space-wizard-viewtplcard-${key}"]`)
      .getAttribute('data-applied')
      .catch(() => null)
    if (already !== 'false') return false
    await press(`space-wizard-viewtplgo-${key}`)
    await press('space-wizard-viewstab-required')
    return waitUntil(async () => {
      for (const view of PRESETS.views) {
        const on =
          (await page.locator(`[data-testid="space-wizard-view-${view}"]`).getAttribute('aria-checked')) === 'true'
        if (on !== preset.views.includes(view)) return false
      }
      return true
    }, { timeoutMs: 8000 })
  }

  const wentToProject = await applyViewTemplate('project')
  const cameBackToMarketing = await applyViewTemplate('marketing')
  await press('space-wizard-viewstab-required')
  chk(
    markedApplied && wentToProject && cameBackToMarketing,
    'applying a view set moves the switches underneath it — Project brings Gantt on, and Marketing moves them ' +
      'back to Calendar on and Gantt off',
    'the switches did not follow the template, so the tab would be a set of buttons over nothing: ' +
      `marketing-already-applied=${markedApplied} project=${wentToProject} marketing=${cameBackToMarketing}, ` +
      `calendar=${await page.locator('[data-testid="space-wizard-view-calendar"]').getAttribute('aria-checked').catch(() => null)} ` +
      `gantt=${await page.locator('[data-testid="space-wizard-view-gantt"]').getAttribute('aria-checked').catch(() => null)}`,
  )

  /*
   * The read sits FIRST in the condition, so no `&&` in front of it can
   * short-circuit: drop the List switch and `isDisabled()` waits out the
   * default 30s and throws, taking every check below with it. Bound it, catch
   * it, and compare to `true` — a missing switch answers null, and null is not
   * `true`, so absence fails the check instead of quietly passing it.
   */
  const listLocked = await page
    .locator('[data-testid="space-wizard-view-list"]')
    .isDisabled({ timeout: 8000 })
    .catch(() => null)
  chk(
    listLocked === true,
    'List is Required and cannot be switched off `[frame 07:12]`',
    'the List view could be turned off — every list falls back to it, so the space would render nothing',
  )
  await press('space-wizard-view-calendar') // marketing has it on → off
  await press('space-wizard-views-done')

  // The ClickApps grid.
  await press('space-wizard-row-features')
  await page.waitForSelector('[data-testid="space-wizard-features"]', { timeout: 10_000 })
  const tiles = await page.locator('[data-testid^="space-wizard-feature-"]').count()
  chk(tiles === PRESETS.features.length, 'every feature the server offers has a switch',
    `the grid drew ${tiles} of ${PRESETS.features.length}`)
  await press('space-wizard-feature-milestones') // off → on
  await press('space-wizard-features-done')

  console.log('\n▶ and what it POSTs is what was chosen, not just the name')
  await press('space-wizard-create')
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
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
