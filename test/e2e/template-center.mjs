/**
 * §V2-13 frame `12:14` — the TEMPLATE CENTER's faceted browse.
 *
 * The re-audit row read "a page, not a modal; no type facet, complexity,
 * use-cases or categories". Zoomed, the frame is unambiguous about all four:
 *
 *   · a left rail **Template Types** — Space · Folder · List · Task · Doc ·
 *     View · Whiteboard — as CHECKBOXES, two of them ticked
 *   · under it **Complexity** — Beginner · Intermediate · Advanced
 *   · a top bar of **search · Use Cases · Tags · Created by**
 *   · a body of CATEGORY sections, each with a heading and a "See N more"
 *     ("Marketing — See 92 more", "PMO – Project Management — See 139 more")
 *   · and, four seconds later at `12:18`, the rail's counts arrive:
 *     **Featured 5 · Workspace Templates 0 · ClickUp Templates 708** — the zero
 *     GREYED, not hidden. The frame says zero out loud.
 *
 * Rundesk offers three of the seven types, because three is how many a project
 * template can genuinely be and `apply` honours all three. The other four would
 * be checkboxes that can only ever empty the grid.
 *
 * WHAT THIS SUITE IS REALLY FOR. A facet rail is the easiest thing in this
 * audit to fake: render the chips, filter the array the page already has, put
 * `array.filter(…).length` beside each one and every count is "right". It is
 * right about the page and silent about the corpus — the confident zero with a
 * number next to it. So the checks below are built around the one thing a
 * client-side rail cannot do:
 *
 *   · the facet parameter must LEAVE THE BROWSER (`page.on('request', …)`)
 *   · the counts must NOT MOVE when a box is ticked, because they are taken
 *     over the corpus and the grid is not
 *
 * Narrowed to its own fixtures throughout: the e2e database is shared, so every
 * template this run asserts on carries a timestamped tag in its name and the
 * page's own search box is used to narrow to it. The counts are then exactly
 * this run's, which is the only way an exact count means anything here.
 *
 *   node test/e2e/template-center.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, pickWorkspace } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil, waitForCount, readText } from './lib/wait.mjs'

const chromium = await resolveChromium()
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure. */
const EXPECTED_CHECKS = 53

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')
const TAG = `tc-${Date.now()}`

let stack = null
let B = (process.env.BASE ?? '').replace(/\/$/, '')
if (!B) {
  stack = await startLocalStack({
    dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')),
    apiPort: Number(argOf('--api', process.env.E2E_API_PORT ?? 3011)),
  })
  B = stack.base
}

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg ?? good))

const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
const api = apiClient(`${B}/api/v1`, auth.accessToken)
const WS = process.env.E2E_WS ?? (await pickWorkspace(api)).id

/*
 * TEN TEMPLATES THIS RUN OWNS, with a distribution chosen so that every number
 * asserted below is distinct from every other. If two facets shared a count the
 * suite could not tell a correct count from a count copied out of the wrong
 * bucket — which is the bug most worth catching here.
 *
 *   type        space 2 · folder 5 · list 3
 *   complexity  beginner 4 · intermediate 4 · advanced 2
 *   category    engineering 7 · marketing 2 · operations 1 · product 0
 *   use case    planning 4 · launch 2 · onboarding 1 · support 2 · none 1
 *
 * Seven in one category on purpose: the gallery caps a section at six and
 * offers "See N more", so seven is the smallest number that makes that control
 * exist and makes its N checkable (it must read 1).
 */
const ONE_LIST = { lists: [{ name: 'Queue', position: 0, tasks: [{ title: 'first', status: 'todo' }] }] }
const TWO_LISTS = {
  lists: [
    { name: 'Doing', position: 0, tasks: [{ title: 'first', status: 'todo' }] },
    { name: 'Done', position: 1, tasks: [] },
  ],
}
const FIXTURES = [
  { n: 'eng-a', targetType: 'folder', complexity: 'beginner',     category: 'engineering', useCase: 'planning' },
  { n: 'eng-b', targetType: 'folder', complexity: 'beginner',     category: 'engineering', useCase: 'planning' },
  { n: 'eng-c', targetType: 'folder', complexity: 'intermediate', category: 'engineering', useCase: 'planning' },
  { n: 'eng-d', targetType: 'folder', complexity: 'intermediate', category: 'engineering', useCase: 'planning' },
  { n: 'eng-e', targetType: 'list',   complexity: 'beginner',     category: 'engineering', useCase: 'support' },
  { n: 'eng-f', targetType: 'list',   complexity: 'intermediate', category: 'engineering', useCase: 'support' },
  { n: 'eng-g', targetType: 'space',  complexity: 'advanced',     category: 'engineering' },
  { n: 'mkt-a', targetType: 'folder', complexity: 'beginner',     category: 'marketing',   useCase: 'launch' },
  { n: 'mkt-b', targetType: 'list',   complexity: 'intermediate', category: 'marketing',   useCase: 'launch' },
  { n: 'ops-a', targetType: 'space',  complexity: 'advanced',     category: 'operations',  useCase: 'onboarding' },
]

const created = []
for (const f of FIXTURES) {
  const res = await api(`/workspaces/${WS}/project-templates`, {
    method: 'POST',
    body: {
      name: `${TAG} ${f.n}`,
      description: `fixture for ${TAG}`,
      icon: 'ListChecks',
      payload: f.targetType === 'list' ? ONE_LIST : TWO_LISTS,
      targetType: f.targetType,
      complexity: f.complexity,
      category: f.category,
      ...(f.useCase ? { useCase: f.useCase } : {}),
    },
  })
  /*
   * `apiClient` NEVER THROWS — it hands back `{status, data, error}`. A
   * `.catch()` here would be inert and a 403 would read as a template that
   * exists. Checked explicitly, and loudly, because every count below is a
   * claim about these ten rows existing.
   */
  if (res.status >= 300 || !res.data?.id) {
    throw new Error(`could not create fixture ${f.n}: HTTP ${res.status} ${JSON.stringify(res.error ?? res.data)}`)
  }
  created.push(res.data.id)
}
console.log(`\x1b[2m  workspace ${WS}, ${created.length} templates tagged ${TAG}\x1b[0m`)

const browser = await chromium.launch(launchOptions())
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } })
const page = await ctx.newPage()

/*
 * Every browse request the page makes, with its query string. THE check that a
 * client-side rail cannot pass: a facet that filters an array in the browser
 * leaves no trace here, and this list is how "the grid narrowed" is told apart
 * from "the server was asked to narrow it".
 */
const browseCalls = []
page.on('request', (r) => {
  const u = r.url()
  if (u.includes('/project-templates/browse')) browseCalls.push(u)
})

/*
 * TEN TEMPLATES, NINE CARDS. Engineering holds seven and a section shows six
 * before it offers "See N more", so the unfiltered gallery draws nine. Both
 * numbers are asserted, and the gap between them is itself a check: the total
 * badge reads the server's count, which is the one thing counting the DOM
 * cannot produce.
 */
const TOTAL = 10
const ALL_SHOWN = 9

const cards = () => page.locator('[data-testid="templates-card"]')
const facetRows = (name) => page.locator(`[data-testid^="templates-facet-${name}-row-"]`)
const allCounts = async (name) =>
  facetRows(name).evaluateAll((els) =>
    els.map((e) => [e.getAttribute('data-value'), Number(e.getAttribute('data-count'))]),
  )
const sinceLast = (n) => browseCalls.slice(n)
const settle = async (expected) => waitForCount(cards(), expected, { timeoutMs: 12_000 })

try {
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  await page.goto(`${B}/app/${WS}/templates`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="template-center"]', { timeout: 25_000 })

  console.log('\n▶ a page, not a modal — the half the row already had, kept')
  chk(new URL(page.url()).pathname.endsWith('/templates'),
    'the Template Center has a URL of its own',
    `it is at ${new URL(page.url()).pathname}`)
  chk(await page.locator('[role="dialog"] [data-testid="templates-facets"]').count() === 0 &&
      await page.locator('[data-testid="templates-facets"]').count() === 1,
    'and the facet rail is on the page, not inside a dialog',
    'the facets are rendered inside a [role=dialog] — this became a modal')

  /*
   * NARROW TO THIS RUN'S OWN TEN. The search box is the page's own control and
   * it goes to the server, so from here on every count on screen is a count of
   * rows this suite made — not of whatever else the shared database holds.
   */
  await page.getByTestId('templates-search').fill(TAG)
  /*
   * Not just "nine cards" — nine cards that are THIS RUN'S. Nine is a number
   * the shared gallery could be showing before the search lands, and a suite
   * that starts measuring one render too early reports the corpus as its own.
   */
  const onlyMine = async () => {
    const ids = await cards().evaluateAll((els) => els.map((e) => e.getAttribute('data-template-id')))
    return ids.length === ALL_SHOWN && ids.every((id) => created.includes(id))
  }
  chk(await waitUntil(onlyMine, { timeoutMs: 15_000 }),
    'searching this run\'s tag leaves exactly its nine visible cards, and nobody else\'s',
    `the grid drew ${await cards().count()} cards for ${TAG}`)
  chk((await readText(page.getByTestId('templates-total'))).trim() === `${TOTAL} available`,
    'while the total says 10 — the server\'s count, not the DOM\'s',
    `the total badge read ${JSON.stringify((await readText(page.getByTestId('templates-total'))).trim())}`)

  console.log('\n▶ the two rails the frame draws, in the frame\'s order')
  const typeRows = await allCounts('type')
  const cxRows = await allCounts('complexity')
  chk(typeRows.length === 3, 'Template Types offers three values',
    `it offered ${typeRows.length}: ${JSON.stringify(typeRows)}`)
  chk(JSON.stringify(typeRows.map(([v]) => v)) === JSON.stringify(['space', 'folder', 'list']),
    'and in the frame\'s order — Space, Folder, List',
    `the rail read ${JSON.stringify(typeRows.map(([v]) => v))}`)
  chk(cxRows.length === 3, 'Complexity offers three values',
    `it offered ${cxRows.length}: ${JSON.stringify(cxRows)}`)
  chk(JSON.stringify(cxRows.map(([v]) => v)) === JSON.stringify(['beginner', 'intermediate', 'advanced']),
    'and in the frame\'s order — Beginner, Intermediate, Advanced',
    `the rail read ${JSON.stringify(cxRows.map(([v]) => v))}`)
  chk(await page.getByTestId('templates-facet-usecase').count() === 1,
    'the top bar carries the frame\'s Use Cases control',
    'no Use Cases control in the top bar')

  console.log('\n▶ the counts, which are this run\'s own and are not the grid\'s')
  chk(JSON.stringify(typeRows) === JSON.stringify([['space', 2], ['folder', 5], ['list', 3]]),
    'Template Types counts 2 / 5 / 3, as this run seeded',
    `it counted ${JSON.stringify(typeRows)}`)
  chk(JSON.stringify(cxRows) === JSON.stringify([['beginner', 4], ['intermediate', 4], ['advanced', 2]]),
    'Complexity counts 4 / 4 / 2',
    `it counted ${JSON.stringify(cxRows)}`)
  const attr = async (locator, name) =>
    Number(await locator.getAttribute(name, { timeout: 6_000 }).catch(() => 'missing'))
  const scopeCount = (v) => attr(page.getByTestId(`templates-scope-${v}`), 'data-count')
  chk(await scopeCount('all') === 10 && await scopeCount('custom') === 10 && await scopeCount('builtin') === 0,
    'the scope rail counts All 10 · Built-in 0 · Workspace 10',
    `it counted all=${await scopeCount('all')} builtin=${await scopeCount('builtin')} custom=${await scopeCount('custom')}`)
  const ucOptions = await page.locator('[data-testid="templates-facet-usecase"] option').evaluateAll(
    (els) => els.map((e) => [e.getAttribute('value'), (e.textContent ?? '').replace(/\s+/g, ' ').trim()]),
  )
  chk(JSON.stringify(ucOptions.map(([v]) => v)) ===
      JSON.stringify(['', 'planning', 'launch', 'onboarding', 'support', 'other']),
    'Use Cases offers the four, in the server\'s canonical order, plus the null bucket',
    `it offered ${JSON.stringify(ucOptions.map(([v]) => v))}`)
  /*
   * "Other (1)" matters as much as the four: one fixture carries no use case at
   * all, and a facet that quietly drops it would be right about every bucket it
   * shows and wrong about the corpus, with nothing on screen to say so.
   */
  chk(JSON.stringify(ucOptions.slice(1).map(([, label]) => label)) ===
      JSON.stringify(['Planning (4)', 'Launch (2)', 'Onboarding (1)', 'Support (2)', 'Other (1)']),
    'with its counts — Planning 4, Launch 2, Onboarding 1, Support 2, and the one with none at all',
    `it read ${JSON.stringify(ucOptions.slice(1).map(([, label]) => label))}`)

  console.log('\n▶ ticking a type — and the parameter leaving the browser')
  let mark = browseCalls.length
  await page.getByTestId('templates-facet-type-folder').click()
  chk(await settle(5), 'ticking Folder narrows the grid to the five folder templates',
    `the grid drew ${await cards().count()} cards`)
  chk(await waitUntil(() => sinceLast(mark).some((u) => /[?&]type=folder(&|$)/.test(u)), { timeoutMs: 8_000 }),
    'and the page asked the SERVER for them (type=folder)',
    `no browse request carried type=folder: ${JSON.stringify(sinceLast(mark))}`)
  chk(await cards().evaluateAll((els) => els.every((e) => e.getAttribute('data-type') === 'folder')),
    'every card left is a folder template',
    `types on screen: ${JSON.stringify(await cards().evaluateAll((els) => els.map((e) => e.getAttribute('data-type'))))}`)
  /*
   * THE CHECK THIS WHOLE SUITE EXISTS FOR. A rail that counts the array it was
   * handed now says space 0 · folder 5 · list 0, because that is all the page
   * is holding. The counts are taken over the corpus, so they must not move —
   * and a person looking at them must still be able to see that unticking
   * Folder and ticking List would find three.
   */
  chk(JSON.stringify(await allCounts('type')) === JSON.stringify([['space', 2], ['folder', 5], ['list', 3]]),
    'the type counts do NOT move — they count the corpus, not the grid',
    `after ticking Folder the rail read ${JSON.stringify(await allCounts('type'))}`)
  chk(JSON.stringify(await allCounts('complexity')) === JSON.stringify([['beginner', 4], ['intermediate', 4], ['advanced', 2]]),
    'nor do the complexity counts',
    `they read ${JSON.stringify(await allCounts('complexity'))}`)

  console.log('\n▶ unticking restores it — and takes the value out of the state')
  await page.getByTestId('templates-facet-type-folder').click()
  chk(await settle(ALL_SHOWN), 'unticking Folder brings all of them back',
    `the grid drew ${await cards().count()} cards`)
  /*
   * NO REQUEST FIRES HERE, AND THAT IS CORRECT. Unticking returns to a
   * queryKey fetched seconds ago and `lib/query.ts` sets `staleTime: 30_000`,
   * so TanStack serves it from cache. This suite originally asserted "no
   * restoring request carried type=", which over an empty array is trivially
   * true — a check that cannot fail, and one whose outcome would have depended
   * on whether thirty seconds of wall clock had gone by. It is gone.
   *
   * The falsifiable question the untick actually raises is whether Folder came
   * OUT OF THE STATE or merely stopped being drawn. Ticking a different box
   * answers it, and does so against a queryKey that has never been fetched, so
   * a request is guaranteed by construction rather than by timing.
   */
  mark = browseCalls.length
  await page.getByTestId('templates-facet-type-list').click()
  chk(await settle(3), 'ticking List instead leaves the three list templates',
    `the grid drew ${await cards().count()} cards`)
  const afterList = sinceLast(mark)
  chk(afterList.length > 0 &&
      afterList.every((u) => /[?&]type=list(&|$)/.test(u)) &&
      !afterList.some((u) => /[?&]type=[^&]*folder/.test(u)),
    'and it asks the server for List ALONE — the untick removed Folder from the state, it did not just stop drawing it',
    `the requests were ${JSON.stringify(afterList)}`)
  await page.getByTestId('templates-facet-type-list').click()
  chk(await settle(ALL_SHOWN), 'and unticking List brings them back again',
    `the grid drew ${await cards().count()} cards`)

  console.log('\n▶ complexity is a second axis, not the same one twice')
  mark = browseCalls.length
  await page.getByTestId('templates-facet-complexity-advanced').click()
  chk(await settle(2), 'ticking Advanced leaves the two advanced templates',
    `the grid drew ${await cards().count()} cards`)
  chk(await waitUntil(() => sinceLast(mark).some((u) => /[?&]complexity=advanced(&|$)/.test(u)), { timeoutMs: 8_000 }),
    'and complexity=advanced went to the server',
    `no request carried complexity=advanced: ${JSON.stringify(sinceLast(mark))}`)
  chk(await cards().evaluateAll((els) => els.every((e) => e.getAttribute('data-complexity') === 'advanced')),
    'and both cards say so',
    `complexities on screen: ${JSON.stringify(await cards().evaluateAll((els) => els.map((e) => e.getAttribute('data-complexity'))))}`)
  await page.getByTestId('templates-facet-complexity-advanced').click()
  chk(await settle(ALL_SHOWN), 'and unticking it restores the nine', `the grid drew ${await cards().count()} cards`)

  console.log('\n▶ Use Cases — the frame\'s top-bar dropdown')
  mark = browseCalls.length
  await page.getByTestId('templates-facet-usecase').selectOption('onboarding')
  chk(await settle(1), 'choosing Onboarding leaves the one template that has it',
    `the grid drew ${await cards().count()} cards`)
  chk(await waitUntil(() => sinceLast(mark).some((u) => /[?&]useCase=onboarding(&|$)/.test(u)), { timeoutMs: 8_000 }),
    'and useCase=onboarding went to the server',
    `no request carried useCase=onboarding: ${JSON.stringify(sinceLast(mark))}`)
  await page.getByTestId('templates-facet-usecase').selectOption('')
  chk(await settle(ALL_SHOWN), 'and clearing it restores the nine', `the grid drew ${await cards().count()} cards`)

  console.log('\n▶ categories — sections with counts, and a "See N more" that means it')
  const sectionKeys = await page.locator('[data-testid^="templates-section-"]').evaluateAll(
    (els) => els.map((e) => e.getAttribute('data-testid').replace('templates-section-', '')),
  )
  chk(JSON.stringify(sectionKeys) === JSON.stringify(['engineering', 'marketing', 'operations']),
    'the body groups into the three categories this run filled, in the rail\'s order',
    `the sections were ${JSON.stringify(sectionKeys)}`)
  chk(await page.locator('[data-testid="templates-section-product"]').count() === 0,
    'and draws no section for a category with nothing in it',
    'an empty "Product" section was drawn — a heading with nothing behind it')
  const catCount = (k) => attr(page.getByTestId(`templates-category-${k}`), 'data-count')
  chk(await catCount('engineering') === 7 && await catCount('marketing') === 2 && await catCount('operations') === 1,
    'the section headings carry 7 / 2 / 1',
    `they read ${await catCount('engineering')} / ${await catCount('marketing')} / ${await catCount('operations')}`)
  /*
   * Six shown out of seven, and the control says ONE more — not "more", not
   * the section's own total. The frame's "See 92 more" is a number that has to
   * be computed from what is on screen versus what is behind it, and a label
   * that just says "See all" would pass any check that looked for a button.
   */
  const engCards = () => page.locator('[data-testid="templates-section-engineering"] [data-testid="templates-card"]')
  chk(await engCards().count() === 6, 'Engineering shows six of its seven',
    `it showed ${await engCards().count()}`)
  chk((await readText(page.getByTestId('templates-category-more-engineering'))).trim() === 'See 1 more',
    'and offers "See 1 more" — the number it is actually holding back',
    `it read ${JSON.stringify((await readText(page.getByTestId('templates-category-more-engineering'))).trim())}`)
  chk(await page.getByTestId('templates-category-more-marketing').count() === 0,
    'a section that fits offers nothing to expand',
    'Marketing had two templates and still offered a "See N more"')

  mark = browseCalls.length
  // Bounded and caught: the check above it is allowed to fail, and an unbounded
  // press on a control that is not there ends the section instead (ledger §10).
  await page.getByTestId('templates-category-more-engineering').click({ timeout: 10_000 }).catch(() => {})
  chk(await settle(7), 'pressing it drills into Engineering and shows all seven',
    `the grid drew ${await cards().count()} cards`)
  chk(await waitUntil(() => sinceLast(mark).some((u) => /[?&]category=engineering(&|$)/.test(u)), { timeoutMs: 8_000 }),
    'and category=engineering went to the server — it is a query, not a client-side slice',
    `no request carried category=engineering: ${JSON.stringify(sinceLast(mark))}`)
  await page.getByTestId('templates-category-engineering').click({ timeout: 10_000 }).catch(() => {})
  chk(await settle(ALL_SHOWN), 'and clicking the heading again clears it',
    `the grid drew ${await cards().count()} cards`)

  console.log('\n▶ the scope rail still narrows, and says zero out loud')
  mark = browseCalls.length
  await page.getByTestId('templates-scope-builtin').click()
  chk(await waitUntil(() => page.getByTestId('templates-empty').count().then((n) => n === 1), { timeoutMs: 10_000 }),
    'none of this run\'s templates are built-in, and the page says so rather than showing stale cards',
    `the grid drew ${await cards().count()} cards under scope=builtin`)
  chk(await waitUntil(() => sinceLast(mark).some((u) => /[?&]scope=builtin(&|$)/.test(u)), { timeoutMs: 8_000 }),
    'and scope=builtin went to the server',
    `no request carried scope=builtin: ${JSON.stringify(sinceLast(mark))}`)
  /*
   * The rail's OTHER counts must survive standing inside an empty scope —
   * count the built-ins among the built-ins and every row reports the same
   * number, which is the counting bug that looks most like working software.
   */
  chk(await scopeCount('custom') === TOTAL && await scopeCount('all') === TOTAL,
    'and the rail still knows there are ten in the other scope',
    `from inside Built-in the rail read all=${await scopeCount('all')} custom=${await scopeCount('custom')}`)
  /*
   * The frame's greyed "Workspace Templates  0". A zero drawn and SAID is
   * honest; a zero hidden makes the rail change shape under you, and a zero
   * left tickable is a control whose only possible effect is to empty a grid
   * that is already empty.
   */
  chk(await waitUntil(async () =>
      JSON.stringify(await allCounts('type')) === JSON.stringify([['space', 0], ['folder', 0], ['list', 0]]),
    { timeoutMs: 8_000 }),
    'the type rail reads 0 / 0 / 0 inside a scope with nothing in it, rather than keeping its old numbers',
    `it read ${JSON.stringify(await allCounts('type'))}`)
  const folderDisabled = await page.getByTestId('templates-facet-type-folder')
    .isDisabled({ timeout: 6_000 }).catch(() => 'missing')
  chk(folderDisabled === true,
    'and a zero facet is drawn and disabled, as the frame greys its zero',
    'a facet with nothing behind it was still tickable')
  await page.getByTestId('templates-scope-all').click()
  chk(await settle(ALL_SHOWN), 'going back to All restores them', `the grid drew ${await cards().count()} cards`)

  console.log('\n▶ Clear filters puts every axis back at once')
  await page.getByTestId('templates-facet-type-list').click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('templates-facet-complexity-beginner').click({ timeout: 8000 }).catch(() => {})
  chk(await settle(1), 'List + Beginner together leave one template',
    `the grid drew ${await cards().count()} cards`)
  /*
   * ALL FOUR AXES ON, not two. A Clear that resets the two checkbox rails and
   * forgets the dropdown and the category heading lands on the same nine cards
   * whenever the forgotten axis happens not to bite — so counting cards after
   * clearing is not enough to say the clear worked. The one template left here
   * carries all four values, which is what lets all four be switched on at once
   * without the grid changing under the sequence.
   */
  await page.getByTestId('templates-facet-usecase').selectOption('support')
  await waitUntil(() => page.getByTestId('templates-category-engineering').count().then((n) => n === 1),
    { timeoutMs: 8_000 })
  await page.getByTestId('templates-category-engineering').click({ timeout: 8000 }).catch(() => {})
  chk(await settle(1), 'adding Use Case and Category on top still leaves that one',
    `the grid drew ${await cards().count()} cards with all four axes on`)
  chk(await page.getByTestId('templates-facet-clear').count() === 1,
    'the Clear filters control appears once something is on',
    'nothing offered to clear the filters')
  await page.getByTestId('templates-facet-clear').click({ timeout: 10_000 }).catch(() => {})
  chk(await settle(ALL_SHOWN), 'pressing it restores all of them', `the grid drew ${await cards().count()} cards`)
  /*
   * Read back off the CONTROLS, not off the card count: this is the check that
   * can tell "cleared" from "cleared the two I happened to look at".
   */
  const stillTicked = await page.locator('[data-testid^="templates-facet-"][role="checkbox"]').evaluateAll(
    (els) => els.filter((e) => e.getAttribute('aria-checked') === 'true').map((e) => e.getAttribute('data-testid')),
  )
  const ucValue = await page.getByTestId('templates-facet-usecase').inputValue({ timeout: 6_000 }).catch(() => 'missing')
  const pressedCats = await page.locator('[data-testid^="templates-category-"][aria-pressed="true"]').count()
  chk(stillTicked.length === 0 && ucValue === '' && pressedCats === 0,
    'and every one of the four axes reads cleared — the rail, the dropdown and the category heading, not just the grid',
    `still ticked ${JSON.stringify(stillTicked)}; use case ${JSON.stringify(ucValue)}; ${pressedCats} category heading(s) still pressed`)
  /*
   * And the unfiltered tagged set is something the SERVER answered at some
   * point in this run, rather than something the page assembled for itself.
   * Asserted over the whole log rather than a window, because which window it
   * landed in is a fact about the cache, not about the product.
   */
  chk(browseCalls.some((u) => /[?&]q=/.test(u) && !/[?&](type|complexity|useCase|category)=/.test(u)),
    'and the unfiltered tagged set is a query the server really answered',
    `no browse request in the run asked for the tag with no facet on it: ${JSON.stringify(browseCalls)}`)

  console.log('\n▶ the type facet is a behaviour, not a badge')
  /*
   * The row this suite would otherwise never notice: a `targetType` that the
   * card prints and `apply` ignores is the mirror of a facade — a column, a
   * filter, a count, and nothing at the end of it. Applied through the API
   * because the assertion is about what the SERVER makes, not about a dialog.
   */
  const spaceTpl = created[6]
  const applied = await api(`/workspaces/${WS}/project-templates/apply`, {
    method: 'POST',
    body: { templateId: spaceTpl, projectName: `${TAG} applied space` },
  })
  chk(applied.status < 300 && Boolean(applied.data?.space?.id),
    'applying a Space template makes a space, with no target space asked for',
    `HTTP ${applied.status}, space=${JSON.stringify(applied.data?.space ?? null)} err=${JSON.stringify(applied.error ?? null)}`)
  if (applied.data?.space?.id) {
    await api(`/spaces/${applied.data.space.id}`, { method: 'DELETE' })
  }
  const listTpl = created[4]
  const noTarget = await api(`/workspaces/${WS}/project-templates/apply`, {
    method: 'POST',
    body: { templateId: listTpl, projectName: `${TAG} applied list` },
  })
  chk(noTarget.status === 400,
    'and a List template refuses to apply with nowhere to put the list',
    `it answered HTTP ${noTarget.status} instead of 400`)
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
  await page.screenshot({ path: '/tmp/claude-0/shots/template-center-fail.png', fullPage: true }).catch(() => {})
} finally {
  // Everything this run made, taken back. `apiClient` never throws, so there is
  // nothing to catch — a failed delete shows up as a leftover row, not as noise.
  for (const id of created.reverse()) {
    await api(`/workspaces/${WS}/project-templates/${id}`, { method: 'DELETE' })
  }
  await browser.close().catch(() => {})
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
await stack?.close?.()
process.exit(failed() ? 1 : 0)
