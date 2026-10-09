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
 * AND THE TOP ROW'S OTHER TWO, `ledger-rows/row-1874`: the frame draws
 * **Use Cases · Tags · Created by** and only Use Cases was built. ClickUp
 * (help centre, "Find a template"): "click Tags to filter by tags, and click
 * Created by to filter by creator"; a template is saved with "a template name,
 * description, tags" and its tags can be changed "in the Template Center at
 * any time". So three of this run's ten are made by a second person (a
 * manager, who holds `template.manage`), the ten carry tags in mixed case, one
 * more is saved through the page's own dialog with tags, one has its tags
 * changed from its card, and a member without the key is refused. The two
 * people join the shared workspace for the run and are removed after it.
 *
 * AND WHICH SPELLING A TAG IS SHOWN IN, `found-30-sep/template-tags-spelled-by-collation`.
 * The facet showed `min(t)`: "Client" and "Q3" under C.UTF-8, which the lanes
 * run, "client" and "q3" under en_US, which CI's Postgres runs. It is a rule
 * now — the spelling most of a word's templates carry, then the one written
 * last — so the seed spells "client" mostly in lower case and "Q3" mostly in
 * upper, and whichever collation the database has, `min()` would disagree
 * with the rule on one of them. (ClickUp forces a tag to lower case, from its
 * feedback board, "Allow Tags to use capital letters"; Rundesk keeps the case
 * each template was tagged in, so the facet has to choose.)
 *
 *   node test/e2e/template-center.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, pickWorkspace, firstSweepList, madeRow, madeSpace } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS, signUpApi } from './lib/signin.mjs'
import { waitUntil, waitForCount, readText } from './lib/wait.mjs'
import { openDb } from './lib/db.mjs'

const chromium = await resolveChromium()
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure. */
const EXPECTED_CHECKS = 85

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
// THE SENTENCE, THEN THE REASON: a failing check that printed only its reason
// named no check `check-break-reddened.mjs` could find when the reason was
// built from the run (`found-29-sep/failing-checks-print-only-their-reason`).
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg && badMsg !== good ? `${good} \u2014 ${badMsg}` : good))

const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
const api = apiClient(`${B}/api/v1`, auth.accessToken)
const WS = process.env.E2E_WS ?? (await pickWorkspace(api)).id
const ADMIN = { id: auth.user?.id, name: auth.user?.displayName }
// The tags and the maker are read back from the rows themselves.
const sql = await openDb()

/*
 * `ledger-rows/row-1874` — A SECOND MAKER, AND A MEMBER WITHOUT THE KEY. With
 * one maker, "Created by" could answer the signed-in person with the total and
 * pass; two, with 7 and 3 between them, cannot be faked that way. A manager
 * holds `template.manage` by default; a plain member does not, and is who the
 * tags edit refuses. Signed up here, joined to the shared workspace for the
 * run, and removed from it in the `finally` — or at once, if the setup itself
 * fails, before the error is thrown on. Their accounts, organizations and
 * personal workspaces, the templates and the applied space are registered
 * (`signUpApi`, `madeRow`, `madeSpace`) and deleted when the run ends, and a
 * run killed before then has them swept by the next one
 * (`found-30-sep/killed-suites-leave-members-behind`).
 */
const joined = []
const created = []
const leave = async () => {
  // By name as well as by id: a row whose id this run never learned (the page's
  // save, on a build that broke it) is still this run's, and still goes.
  const named = sql
    ? (await sql`select id from project_templates where workspace_id = ${WS} and name like ${`${TAG} %`}`.catch(() => [])).map((r) => r.id)
    : []
  for (const id of [...new Set([...created, ...named])].reverse()) {
    const gone = await api(`/workspaces/${WS}/project-templates/${id}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: template ${id} answered ${gone.status}`)
  }
  created.length = 0
  for (const id of joined) {
    const gone = await api(`/workspaces/${WS}/members/${id}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: member ${id} answered ${gone.status}`)
  }
  joined.length = 0
}
const person = async (key, role) => {
  const email = `${TAG}-${key}@rundesk.invalid`
  const signed = await signUpApi(`${B}/api/v1`, {
    fullName: `${TAG} ${key}`,
    email,
    password: 'TemplateCenter@12345!',
    organizationName: `${TAG} ${key}`,
    organizationSlug: `${TAG}-${key}`,
  })
  const added = await api(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
  if (added.status >= 300 || !signed.user?.id) {
    throw new Error(`could not add the ${key}: HTTP ${added.status} ${JSON.stringify(added.error ?? added.data)}`)
  }
  joined.push(signed.user.id)
  return { id: signed.user.id, name: signed.user.displayName ?? `${TAG} ${key}`, as: apiClient(`${B}/api/v1`, signed.accessToken) }
}

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
 *   created by  the signed-in admin 7 · the second maker 3
 *   tags        client 3 · Q3 6 · Retro 1 — each in more than one case, and
 *               eng-a's given messily (" Q3 ", "q3" twice over) to be cleaned
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
  { n: 'eng-a', targetType: 'folder', complexity: 'beginner',     category: 'engineering', useCase: 'planning', tags: [' Q3 ', 'client', 'q3'] },
  { n: 'eng-b', targetType: 'folder', complexity: 'beginner',     category: 'engineering', useCase: 'planning', tags: ['Q3'] },
  { n: 'eng-c', targetType: 'folder', complexity: 'intermediate', category: 'engineering', useCase: 'planning', tags: ['q3', 'Retro'] },
  { n: 'eng-d', targetType: 'folder', complexity: 'intermediate', category: 'engineering', useCase: 'planning' },
  { n: 'eng-e', targetType: 'list',   complexity: 'beginner',     category: 'engineering', useCase: 'support', tags: ['Client'] },
  { n: 'eng-f', targetType: 'list',   complexity: 'intermediate', category: 'engineering', useCase: 'support', tags: ['client'] },
  { n: 'eng-g', targetType: 'space',  complexity: 'advanced',     category: 'engineering', tags: ['Q3'] },
  { n: 'mkt-a', targetType: 'folder', complexity: 'beginner',     category: 'marketing',   useCase: 'launch', tags: ['Q3'], by: 'maker' },
  { n: 'mkt-b', targetType: 'list',   complexity: 'intermediate', category: 'marketing',   useCase: 'launch', by: 'maker' },
  { n: 'ops-a', targetType: 'space',  complexity: 'advanced',     category: 'operations',  useCase: 'onboarding', tags: ['q3'], by: 'maker' },
]
/** Which of the ten carry a tag, whatever its case, and which the maker made — by index into `created`. */
const TAGGED = (word) => FIXTURES.flatMap((f, i) => ((f.tags ?? []).some((x) => x.trim().toLowerCase() === word) ? [i] : []))
const MADE_BY_MAKER = FIXTURES.flatMap((f, i) => (f.by === 'maker' ? [i] : []))

let maker = null
let plain = null
try {
  maker = await person('maker', 'manager')
  plain = await person('plain', 'member')
  for (const f of FIXTURES) {
    const as = f.by === 'maker' ? maker.as : api
    const res = await as(`/workspaces/${WS}/project-templates`, {
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
        ...(f.tags ? { tags: f.tags } : {}),
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
    madeRow('project_templates', res.data.id)
  }
} catch (e) {
  // Nothing half-made is left in the shared workspace: no template, no member.
  await leave()
  await sql?.end?.({ timeout: 5 })
  throw e
}
console.log(`\x1b[2m  workspace ${WS}, ${created.length} templates tagged ${TAG}; a second maker and a plain member joined\x1b[0m`)

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

// The built-in the tags route is asked to tag, and what it held, for the `finally`.
let builtInTried = null
let builtInTagsBefore = null

const cards = () => page.locator('[data-testid="templates-card"]')
const facetRows = (name) => page.locator(`[data-testid^="templates-facet-${name}-row-"]`)
const allCounts = async (name) =>
  facetRows(name).evaluateAll((els) =>
    els.map((e) => [e.getAttribute('data-value'), Number(e.getAttribute('data-count'))]),
  )
const sinceLast = (n) => browseCalls.slice(n)
const settle = async (expected) => waitForCount(cards(), expected, { timeoutMs: 12_000 })

/*
 * `ledger-rows/row-1874` — the top row's menus as [value, shown label], read
 * only while the menu itself is drawn (Playwright counts no <option> visible,
 * so the select is the guard), lower-cased where a check is about the words
 * and their counts. That tags are stored and shown in lower case is checked
 * unlowered (`found-30-sep/template-tags-keep-their-case`).
 */
const optionsOf = (testId) =>
  page.locator(`[data-testid="${testId}"]`).filter({ visible: true }).locator('option').evaluateAll(
    (els) => els.map((e) => [e.getAttribute('value') ?? '', (e.textContent ?? '').replace(/\s+/g, ' ').trim()]),
  ).catch(() => [])
const lowered = (opts) => opts.map(([v, label]) => [v.toLowerCase(), label.toLowerCase()])
const cardIds = () => cards().evaluateAll((els) => els.map((e) => e.getAttribute('data-template-id')))
const sameIds = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
/** A template's tags as the database holds them, or why they could not be read. */
const tagsInDb = async (id) => {
  if (!sql) return 'no DATABASE_URL to read them from'
  try {
    const [row] = await sql`select tags from project_templates where id = ${id ?? null}`
    return row ? row.tags : 'no such row'
  } catch (e) {
    return `unreadable: ${String(e?.message ?? e).split('\n')[0]}`
  }
}
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
  chk((await readText(page.getByTestId('templates-total').filter({ visible: true }))).trim() === `${TOTAL} available`,
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
  // A select offers its options only while it is shown itself (an option's innerText is its textContent).
  const ucOptions = await page.locator('[data-testid="templates-facet-usecase"]').filter({ visible: true }).locator('option').evaluateAll(
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
  /*
   * Bounded because a check in this suite asserts this facet EXISTS, which is
   * the suite saying a patch can take it away — and every press here is
   * followed by a `settle(N)` that reports what the grid did. Caught, a missing
   * facet fails those checks; bare, it spends thirty seconds and ends the
   * section with them unrun.
   */
  await page.getByTestId('templates-facet-type-list').click({ timeout: 8000 }).catch(() => {})
  chk(await settle(3), 'ticking List instead leaves the three list templates',
    `the grid drew ${await cards().count()} cards`)
  const afterList = sinceLast(mark)
  chk(afterList.length > 0 &&
      afterList.every((u) => /[?&]type=list(&|$)/.test(u)) &&
      !afterList.some((u) => /[?&]type=[^&]*folder/.test(u)),
    'and it asks the server for List ALONE — the untick removed Folder from the state, it did not just stop drawing it',
    `the requests were ${JSON.stringify(afterList)}`)
  await page.getByTestId('templates-facet-type-list').click({ timeout: 8000 }).catch(() => {})
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
  // Bounded for the reason above: `templates-facet-usecase` is asserted to
  // exist by a check in this suite, so it is an element that can be taken away.
  await page
    .getByTestId('templates-facet-usecase')
    .selectOption('onboarding', { timeout: 8000 })
    .catch(() => {})
  chk(await settle(1), 'choosing Onboarding leaves the one template that has it',
    `the grid drew ${await cards().count()} cards`)
  chk(await waitUntil(() => sinceLast(mark).some((u) => /[?&]useCase=onboarding(&|$)/.test(u)), { timeoutMs: 8_000 }),
    'and useCase=onboarding went to the server',
    `no request carried useCase=onboarding: ${JSON.stringify(sinceLast(mark))}`)
  await page.getByTestId('templates-facet-usecase').selectOption('', { timeout: 8000 }).catch(() => {})
  chk(await settle(ALL_SHOWN), 'and clearing it restores the nine', `the grid drew ${await cards().count()} cards`)

  console.log('\n▶ the frame\'s top row — Use Cases · Tags · Created by (ledger-rows/row-1874)')
  const TOP_ROW = ['templates-facet-usecase', 'templates-facet-tag', 'templates-facet-createdby']
  const topRow = () => page.locator('[data-testid="templates-top-row"] select').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  chk(await waitUntil(async () => JSON.stringify(await topRow()) === JSON.stringify(TOP_ROW), { timeoutMs: 8_000 }),
    'the top row offers the frame\'s three facets — Use Cases, Tags, Created by — in that order',
    `its menus were ${JSON.stringify(await topRow())}`)
  /*
   * Read off what each menu SHOWS while nothing is chosen, which is the
   * button's face in the frame: a menu that said "All" three times would pass
   * a count of selects and tell a person nothing about which is which.
   */
  const faces = async () => Promise.all(TOP_ROW.map(async (id) => (await optionsOf(id))[0]?.[1] ?? null))
  chk(await waitUntil(async () => JSON.stringify(await faces()) === JSON.stringify(['All use cases', 'All tags', 'Created by anyone']), { timeoutMs: 8_000 }),
    'and each says which it is while nothing is chosen — All use cases, All tags, Created by anyone',
    `they read ${JSON.stringify(await faces())}`)

  console.log('\n▶ Created by — the people who made them, counted by the server')
  /*
   * Seven by the signed-in admin and three by the second maker, each read with
   * its id and its name. The count is the server's, over the searched corpus,
   * so a menu that counted the grid, or that answered "you, with everything",
   * reads 10 or 9 here, not 7 and 3.
   */
  const makers = async () => (await optionsOf('templates-facet-createdby')).slice(1)
  const MAKERS_WANTED = JSON.stringify([[ADMIN.id, `${ADMIN.name} (7)`], [maker.id, `${maker.name} (3)`]].sort())
  chk(await waitUntil(async () => JSON.stringify((await makers()).sort()) === MAKERS_WANTED, { timeoutMs: 8_000 }),
    'Created by lists this run\'s two makers, each with how many they made — 7 and 3',
    `it listed ${JSON.stringify(await makers())}`)
  const makerIds = MADE_BY_MAKER.map((i) => created[i])
  mark = browseCalls.length
  await page.getByTestId('templates-facet-createdby').selectOption(maker.id, { timeout: 8000 }).catch(() => {})
  chk(await settle(3) && sameIds(await cardIds(), makerIds),
    'choosing the second maker leaves exactly the three templates they made',
    `the grid drew ${JSON.stringify(await cardIds())}, theirs are ${JSON.stringify(makerIds)}`)
  chk(await waitUntil(() => sinceLast(mark).some((u) => u.includes(`createdBy=${maker.id}`)), { timeoutMs: 8_000 }),
    'and createdBy=<their id> went to the server',
    `no browse request carried createdBy=${maker.id}: ${JSON.stringify(sinceLast(mark))}`)
  // Read from the server too: the same question, asked without the page.
  const byMaker = await api(`/workspaces/${WS}/project-templates/browse?q=${encodeURIComponent(TAG)}&createdBy=${maker.id}`)
  const byMakerRows = byMaker.data?.templates ?? []
  chk(byMaker.status === 200 && sameIds(byMakerRows.map((r) => r.id), makerIds) && byMakerRows.every((r) => r.createdById === maker.id),
    'and the server, asked the same, answers with those three and nobody else\'s',
    `HTTP ${byMaker.status}: ${JSON.stringify(byMakerRows.map((r) => [r.name, r.createdById]))}`)
  /*
   * The built-ins have no maker. They are counted in the scope rail and in no
   * Created-by bucket — not in an "unknown" one, and not under whoever asked.
   */
  const builtIns = await api(`/workspaces/${WS}/project-templates/browse?scope=builtin`)
  const builtInCount = builtIns.data?.facets?.scope?.find((b) => b.value === 'builtin')?.count ?? 0
  chk(builtIns.status === 200 && builtInCount > 0 && JSON.stringify(builtIns.data?.facets?.createdBy ?? null) === '[]',
    'the built-ins, which nobody in the workspace made, are counted under nobody',
    `HTTP ${builtIns.status}: ${builtInCount} built-ins, Created by ${JSON.stringify(builtIns.data?.facets?.createdBy ?? null)}`)
  /*
   * A restore holds only FROM the three: against a page with no Created-by at
   * all, "the nine are there" was true before anything was chosen, and this
   * check passed on the unchanged product.
   */
  const fromThree = sameIds(await cardIds(), makerIds)
  await page.getByTestId('templates-facet-createdby').selectOption('', { timeout: 8000 }).catch(() => {})
  chk(fromThree && await settle(ALL_SHOWN), 'and choosing anyone again brings the nine back from their three',
    `from ${fromThree ? 'their three' : 'a grid that had not narrowed'}, the grid drew ${await cards().count()} cards`)

  console.log('\n▶ Tags — one per word whatever its case, counted by the server, and a filter')
  /*
   * "Q3" on four, "q3" on two, "client" and "Client" on three, "Retro" on one.
   * Grouped by `lower()` there are three words; grouped as typed there are
   * five, and a grid-counted menu would say whatever the page holds.
   */
  const TAGS_WANTED = [['client', 'client (3)'], ['q3', 'q3 (6)'], ['retro', 'retro (1)']]
  const tagMenu = async () => lowered((await optionsOf('templates-facet-tag')).slice(1))
  chk(await waitUntil(async () => JSON.stringify(await tagMenu()) === JSON.stringify(TAGS_WANTED), { timeoutMs: 8_000 }),
    'Tags counts client 3, Q3 6 and Retro 1 — one word whatever the case it was tagged in, in alphabetical order',
    `it read ${JSON.stringify(await optionsOf('templates-facet-tag'))}`)
  /*
   * `found-30-sep/template-tags-keep-their-case` — AND IN LOWER CASE, as each is
   * stored and as ClickUp keeps a tag, read unlowered: the seed typed "Q3",
   * "Client" and "Retro", and each template kept its own spelling, so the facet
   * had to choose one per word (`found-30-sep/template-tags-spelled-by-collation`).
   */
  const SPELLED = [['client', 'client (3)'], ['q3', 'q3 (6)'], ['retro', 'retro (1)']]
  const tagOptions = async () => (await optionsOf('templates-facet-tag')).slice(1)
  const spelledNow = await waitUntil(async () => JSON.stringify(await tagOptions()) === JSON.stringify(SPELLED), { timeoutMs: 8_000 })
  chk(spelledNow,
    'and shows each word in lower case, as the templates carry it — client, q3, retro — whatever case it was typed in',
    `it read ${JSON.stringify(await tagOptions())}`)
  const q3Option = (await optionsOf('templates-facet-tag')).find(([v]) => v.toLowerCase() === 'q3')?.[0] ?? 'Q3'
  const q3Ids = TAGGED('q3').map((i) => created[i])
  mark = browseCalls.length
  await page.getByTestId('templates-facet-tag').selectOption(q3Option, { timeout: 8000 }).catch(() => {})
  chk(await settle(6) && sameIds(await cardIds(), q3Ids),
    'choosing Q3 leaves exactly the six templates tagged with it, in either case',
    `the grid drew ${JSON.stringify(await cardIds())}, the six are ${JSON.stringify(q3Ids)}`)
  chk(await waitUntil(() => sinceLast(mark).some((u) => /[?&]tag=q3(&|$)/i.test(u)), { timeoutMs: 8_000 }),
    'and tag=Q3 went to the server',
    `no browse request carried tag=Q3: ${JSON.stringify(sinceLast(mark))}`)
  /*
   * And a card SAYS so — the tag is drawn on it, not only filtered on — read
   * per card, off chips that are shown.
   */
  const shownTags = async () => {
    const out = []
    for (let i = 0; i < await cards().count(); i++) {
      out.push(await cards().nth(i).locator('[data-testid="templates-card-tag"]').filter({ visible: true }).allInnerTexts())
    }
    return out
  }
  const q3Shown = await shownTags()
  chk(q3Shown.length === 6 && q3Shown.every((tags) => tags.some((x) => x.trim().toLowerCase() === 'q3')),
    'and every card left shows its Q3 tag',
    `the cards showed ${JSON.stringify(q3Shown)}`)
  // From the six, for the reason Created by's restore gives.
  const fromSix = sameIds(await cardIds(), q3Ids)
  await page.getByTestId('templates-facet-tag').selectOption('', { timeout: 8000 }).catch(() => {})
  chk(fromSix && await settle(ALL_SHOWN), 'and choosing all tags again brings the nine back from the six',
    `from ${fromSix ? 'the six' : 'a grid that had not narrowed'}, the grid drew ${await cards().count()} cards`)
  // eng-a was made with " Q3 ", "client" and "q3": what the row holds is the cleaned list.
  const engA = await tagsInDb(created[0])
  chk(JSON.stringify(engA) === JSON.stringify(['q3', 'client']),
    'a template made with " Q3 ", "client" and "q3" carries q3 and client, in lower case, trimmed and once each (read from the database)',
    `the row holds ${JSON.stringify(engA)}`)

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
  chk((await readText(page.getByTestId('templates-category-more-engineering').filter({ visible: true }))).trim() === 'See 1 more',
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
  await page
    .getByTestId('templates-facet-usecase')
    .selectOption('support', { timeout: 8000 })
    .catch(() => {})
  await waitUntil(() => page.getByTestId('templates-category-engineering').count().then((n) => n === 1),
    { timeoutMs: 8_000 })
  await page.getByTestId('templates-category-engineering').click({ timeout: 8000 }).catch(() => {})
  chk(await settle(1), 'adding Use Case and Category on top still leaves that one',
    `the grid drew ${await cards().count()} cards with all four axes on`)
  /*
   * `ledger-rows/row-1874` — and the top row's other two on top of those: the
   * one left (eng-e) is the admin's and is tagged "Client", so it survives
   * both, and both must reach the server in one request.
   */
  mark = browseCalls.length
  const clientOption = (await optionsOf('templates-facet-tag')).find(([v]) => v.toLowerCase() === 'client')?.[0] ?? 'client'
  await page.getByTestId('templates-facet-tag').selectOption(clientOption, { timeout: 8000 }).catch(() => {})
  await page.getByTestId('templates-facet-createdby').selectOption(ADMIN.id ?? '', { timeout: 8000 }).catch(() => {})
  chk(await waitUntil(() => sinceLast(mark).some((u) => /[?&]tag=client(&|$)/i.test(u) && u.includes(`createdBy=${ADMIN.id}`)), { timeoutMs: 8_000 }) &&
      await settle(1),
    'and Tags and Created by on top of those four still leave it, asked of the server together',
    `requests ${JSON.stringify(sinceLast(mark))}; the grid drew ${await cards().count()} cards`)
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
  const tagValue = await page.getByTestId('templates-facet-tag').inputValue({ timeout: 6_000 }).catch(() => 'missing')
  const makerValue = await page.getByTestId('templates-facet-createdby').inputValue({ timeout: 6_000 }).catch(() => 'missing')
  chk(tagValue === '' && makerValue === '',
    'and Tags and Created by read cleared too',
    `tag ${JSON.stringify(tagValue)}; created by ${JSON.stringify(makerValue)}`)
  /*
   * And the unfiltered tagged set is something the SERVER answered at some
   * point in this run, rather than something the page assembled for itself.
   * Asserted over the whole log rather than a window, because which window it
   * landed in is a fact about the cache, not about the product.
   */
  chk(browseCalls.some((u) => /[?&]q=/.test(u) && !/[?&](type|complexity|useCase|category)=/.test(u)),
    'and the unfiltered tagged set is a query the server really answered',
    `no browse request in the run asked for the tag with no facet on it: ${JSON.stringify(browseCalls)}`)

  console.log('\n▶ a template saved from the page with tags carries them (ledger-rows/row-1874)')
  /*
   * Through the page's own Save dialog, because that is where a person gives a
   * template its tags (ClickUp: "Add a template name, description, tags").
   * Its name carries this run's tag, so from here on the searched corpus holds
   * eleven: every count below says so. The project saved is the first one the
   * sweep fixture walks to, chosen in the dialog rather than left to whichever
   * space happens to come first.
   */
  const SAVED = `${TAG} saved`
  const home = await firstSweepList(api, WS)
  /*
   * A FRESH PAGE for each of the last two sections, searched to this run's tag.
   * They save and edit through the page, and state an earlier defect left
   * behind — a Clear that forgot an axis, a grid a save did not refresh —
   * would hide the card they need and redden them for a defect they are not
   * about (measured: `template-center-10`, `-23` and `-26` each reddened the
   * tag editor's two checks before this).
   */
  const freshPage = async () => {
    await page.goto(`${B}/app/${WS}/templates`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('templates-search').fill(TAG, { timeout: 25_000 }).catch(() => {})
  }
  await freshPage()
  await waitUntil(onlyMine, { timeoutMs: 15_000 })
  await page.getByTestId('templates-save-open').click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('templates-save-space').selectOption(home?.spaceId ?? '', { timeout: 10_000 }).catch(() => {})
  await waitUntil(
    async () => (await page.locator(`[data-testid="templates-save-project"] option[value="${home?.projectId}"]`).count()) === 1,
    { timeoutMs: 10_000 },
  )
  await page.getByTestId('templates-save-project').selectOption(home?.projectId ?? '', { timeout: 8000 }).catch(() => {})
  await page.getByTestId('templates-save-name').fill(SAVED, { timeout: 8000 }).catch(() => {})
  for (const word of ['Q3', '  Launch   day ', 'q3']) {
    await page.getByTestId('templates-save-tags-input').fill(word, { timeout: 8000 }).catch(() => {})
    await page.getByTestId('templates-save-tags-input').press('Enter', { timeout: 8000 }).catch(() => {})
  }
  // Before Save, the chips say what will be kept: in lower case, one per word (`found-30-sep/template-tags-keep-their-case`).
  const typedChips = () => page.getByTestId('templates-save-tags-chip').filter({ visible: true }).allInnerTexts().catch(() => [])
  let chipsBeforeSave = []
  await waitUntil(async () => JSON.stringify(chipsBeforeSave = (await typedChips()).map((s) => s.trim())) === JSON.stringify(['q3', 'launch day']), { timeoutMs: 5000 })
  chk(JSON.stringify(chipsBeforeSave) === JSON.stringify(['q3', 'launch day']),
    'typed into the save dialog, Q3, "  Launch   day " and q3 show as q3 and launch day before Save — as they will be kept',
    `the dialog's chips read ${JSON.stringify(chipsBeforeSave)}`)
  await page.getByTestId('templates-save-submit').click({ timeout: 10_000 }).catch(() => {})
  // The row by its name alone, so it is found and taken back even where the tags cannot be read.
  let savedId = null
  await waitUntil(async () => {
    const [row] = sql ? await sql`select id from project_templates where workspace_id = ${WS} and name = ${SAVED}`.catch(() => []) : []
    savedId = row?.id ?? null
    return Boolean(savedId)
  }, { timeoutMs: 15_000 })
  if (savedId) {
    created.push(savedId)
    madeRow('project_templates', savedId)
  }
  const savedTags = await tagsInDb(savedId)
  chk(JSON.stringify(savedTags) === JSON.stringify(['q3', 'launch day']),
    'a template saved from the page with Q3, "  Launch   day " and q3 carries q3 and launch day (read from the database)',
    `the row ${savedId ?? '(none saved)'} holds ${JSON.stringify(savedTags)}`)
  chk(await waitUntil(async () => (await makers()).some(([v, label]) => v === ADMIN.id && label === `${ADMIN.name} (8)`), { timeoutMs: 10_000 }),
    'and Created by counts it under the admin who saved it — 8 now',
    `it listed ${JSON.stringify(await makers())}`)
  const TAGS_AFTER_SAVE = [['client', 'client (3)'], ['launch day', 'launch day (1)'], ['q3', 'q3 (7)'], ['retro', 'retro (1)']]
  chk(await waitUntil(async () => JSON.stringify(await tagMenu()) === JSON.stringify(TAGS_AFTER_SAVE), { timeoutMs: 10_000 }),
    'and the Tags facet counts its tags too — Q3 7, Launch day 1',
    `it read ${JSON.stringify(await optionsOf('templates-facet-tag'))}`)

  console.log('\n▶ a template\'s tags, changed afterwards — and by whom')
  /*
   * ClickUp: "Under the template name, click the tag icon", and "You can add
   * or edit tags in the Template Center at any time". From the saved
   * template's own card: Launch day off, retro on.
   */
  await freshPage()
  await waitUntil(async () => (await page.locator(`[data-testid="templates-card"][data-template-id="${savedId}"]`).count()) === 1,
    { timeoutMs: 15_000 })
  await page.locator(`[data-testid="templates-card-edit-tags"][data-template-id="${savedId}"]`).click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('templates-tags-dialog').getByRole('button', { name: 'Remove tag launch day' }).click({ timeout: 8000 }).catch(() => {})
  // Typed in capitals: kept, as every tag is, in lower case (`found-30-sep/template-tags-keep-their-case`).
  await page.getByTestId('templates-tags-input').fill('Retro', { timeout: 8000 }).catch(() => {})
  await page.getByTestId('templates-tags-input').press('Enter', { timeout: 8000 }).catch(() => {})
  await page.getByTestId('templates-tags-save').click({ timeout: 8000 }).catch(() => {})
  let editedTags = null
  await waitUntil(async () => JSON.stringify(editedTags = await tagsInDb(savedId)) === JSON.stringify(['q3', 'retro']), { timeoutMs: 10_000 })
  chk(JSON.stringify(editedTags) === JSON.stringify(['q3', 'retro']),
    'the tag icon on its card changes a saved template\'s tags — launch day off, Retro typed on — and the database holds q3 and retro',
    `the row holds ${JSON.stringify(editedTags)}`)
  const TAGS_AFTER_EDIT = [['client', 'client (3)'], ['q3', 'q3 (7)'], ['retro', 'retro (2)']]
  chk(await waitUntil(async () => JSON.stringify(await tagMenu()) === JSON.stringify(TAGS_AFTER_EDIT), { timeoutMs: 10_000 }),
    'and the Tags facet follows — Retro 2, and Launch day gone',
    `it read ${JSON.stringify(await optionsOf('templates-facet-tag'))}`)
  /*
   * `found-30-sep/template-tags-keep-their-case` — the tag typed in capitals in
   * the dialog is one word with eng-c's, which the seed typed "Retro": both
   * carry retro, and the facet shows retro twice, unlowered.
   */
  const SPELLED_AFTER_EDIT = [['client', 'client (3)'], ['q3', 'q3 (7)'], ['retro', 'retro (2)']]
  chk(await waitUntil(async () => JSON.stringify(await tagOptions()) === JSON.stringify(SPELLED_AFTER_EDIT), { timeoutMs: 10_000 }),
    'and Retro typed in the dialog is kept in lower case, one word with the seed’s Retro — the facet shows retro (2)',
    `it read ${JSON.stringify(await tagOptions())}`)
  /*
   * WHO MAY. The route asks `template.manage`, the key that saves and deletes
   * a template. A plain member holds none and is refused with the guard's own
   * sentence; the row is read before and after, so a refusal that wrote first
   * is not a refusal.
   */
  const refusedBefore = await tagsInDb(savedId)
  const refused = await plain.as(`/workspaces/${WS}/project-templates/${savedId}/tags`, { method: 'PATCH', body: { tags: ['sneaked in'] } })
  const refusedAfter = await tagsInDb(savedId)
  chk(refused.status === 403 && refused.error?.message === 'Missing required permission: template.manage' &&
      Array.isArray(refusedBefore) && JSON.stringify(refusedAfter) === JSON.stringify(refusedBefore),
    'a member without template.manage is refused a template\'s tags — 403, "Missing required permission: template.manage" — and they stay as they were',
    `HTTP ${refused.status} ${JSON.stringify(refused.error?.message ?? null)}; before ${JSON.stringify(refusedBefore)}, after ${JSON.stringify(refusedAfter)}`)
  // And the second maker, a manager, may — on a template somebody else made (eng-d, the admin's, untagged).
  const byManager = await maker.as(`/workspaces/${WS}/project-templates/${created[3]}/tags`, { method: 'PATCH', body: { tags: ['Q3'] } })
  const engD = await tagsInDb(created[3])
  chk(byManager.status === 200 && JSON.stringify(engD) === JSON.stringify(['q3']),
    'a manager, who holds template.manage by default, may tag a template somebody else made',
    `HTTP ${byManager.status} ${JSON.stringify(byManager.error?.message ?? null)}; the row holds ${JSON.stringify(engD)}`)
  /*
   * THE BOUNDS ARE REFUSED IN WORDS, never cut to fit: a tag cut short is not
   * the tag typed, and a twenty-first dropped in silence is one its saver
   * believes is there. Nothing is written either time.
   */
  // Each read before and after its own request, so one bound let through is not blamed on the other.
  const beforeMany = await tagsInDb(savedId)
  const tooMany = await api(`/workspaces/${WS}/project-templates/${savedId}/tags`, {
    method: 'PATCH',
    body: { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) },
  })
  const afterMany = await tagsInDb(savedId)
  chk(tooMany.status === 400 && tooMany.error?.message === 'A template can carry at most 20 tags, and these are 21' &&
      Array.isArray(beforeMany) && JSON.stringify(afterMany) === JSON.stringify(beforeMany),
    'twenty-one tags are refused in words — 400, "A template can carry at most 20 tags…" — and nothing is written',
    `HTTP ${tooMany.status} ${JSON.stringify(tooMany.error?.message ?? null)}; before ${JSON.stringify(beforeMany)}, after ${JSON.stringify(afterMany)}`)
  const beforeLong = await tagsInDb(savedId)
  const tooLong = await api(`/workspaces/${WS}/project-templates/${savedId}/tags`, {
    method: 'PATCH',
    body: { tags: ['Q3', 'L'.repeat(41)] },
  })
  const afterLong = await tagsInDb(savedId)
  chk(tooLong.status === 400 && /^A tag can be at most 40 characters, and "L{24}…" has 41$/.test(tooLong.error?.message ?? '') &&
      Array.isArray(beforeLong) && JSON.stringify(afterLong) === JSON.stringify(beforeLong),
    'a tag of forty-one characters is refused in words, saying the bound and its length, and nothing is written',
    `HTTP ${tooLong.status} ${JSON.stringify(tooLong.error?.message ?? null)}; before ${JSON.stringify(beforeLong)}, after ${JSON.stringify(afterLong)}`)
  /*
   * A built-in is one row every workspace is shown: a tag written on it from
   * here would be in everybody's Template Center. Its tags are read before and
   * after, and put back in the `finally` if a broken build wrote them.
   */
  builtInTried = (builtIns.data?.templates ?? [])[0]?.id ?? null
  builtInTagsBefore = await tagsInDb(builtInTried)
  const onBuiltIn = await api(`/workspaces/${WS}/project-templates/${builtInTried}/tags`, { method: 'PATCH', body: { tags: ['ours'] } })
  const builtInTagsAfter = await tagsInDb(builtInTried)
  chk(onBuiltIn.status === 400 && onBuiltIn.error?.message === 'A built-in template cannot be tagged' &&
      Array.isArray(builtInTagsBefore) && JSON.stringify(builtInTagsAfter) === JSON.stringify(builtInTagsBefore),
    'a built-in, shown to every workspace, cannot be tagged from one — 400, "A built-in template cannot be tagged" — and keeps what it had',
    `HTTP ${onBuiltIn.status} ${JSON.stringify(onBuiltIn.error?.message ?? null)}; before ${JSON.stringify(builtInTagsBefore)}, after ${JSON.stringify(builtInTagsAfter)}`)

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
  // Registered, so it is deleted when the run ends: `DELETE /spaces/:id` only
  // archives, and 59 archived "applied space"s were in Main Workspace on lane 6
  // (`found-30-sep/suite-runs-leave-accounts-behind`).
  if (applied.data?.space?.id) madeSpace(applied.data.space.id)
  const listTpl = created[4]
  const noTarget = await api(`/workspaces/${WS}/project-templates/apply`, {
    method: 'POST',
    body: { templateId: listTpl, projectName: `${TAG} applied list` },
  })
  chk(noTarget.status === 400,
    'and a List template refuses to apply with nowhere to put the list',
    `it answered HTTP ${noTarget.status} instead of 400`)

  console.log('\n▶ a list, and a folder, saved as a template from the sidebar (found-30-sep/no-save-list-or-folder-as-template)')
  /*
   * ClickUp saves a List or a Folder as a template from its ⋯ in the sidebar,
   * Templates › Save as Template: "a name first, and adding a description or
   * tags is optional" (help centre, "Use List templates", through search
   * excerpts). The only save here was the page's "Save project as template",
   * which never made a list template. A space of this run's own (registered,
   * so it goes when the run ends) with a folder of two lists, a task in each,
   * so that "the list alone" is a fact about the template.
   */
  const sbSpace = (await api('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} sidebar space` } })).data?.id
  const sbProject = sbSpace ? (await api('/projects', { method: 'POST', body: { spaceId: sbSpace, name: `${TAG} sidebar folder` } })).data?.id : null
  const SB_LISTS = [`${TAG} first list`, `${TAG} second list`]
  /*
   * THE SECOND LIST IS MADE FIRST, and the first is then dated a minute before
   * it (`found-8-oct/folder-template-lists-in-any-order`). Both share a
   * position, as two lists made without a reorder do, so the folder's order is
   * by when each was made — first, second, as the sidebar draws them — while
   * the table holds them the other way round. A read by position alone came
   * back in the table's order, which CI's fresh database showed in the
   * rehearsal of 4d37f9a once; made so, it shows it every time.
   */
  const sbLists = [null, null]
  for (const i of [1, 0]) {
    const name = SB_LISTS[i]
    const list = sbProject ? (await api('/lists', { method: 'POST', body: { projectId: sbProject, name } })).data?.id : null
    if (list) await api('/tasks', { method: 'POST', body: { listId: list, title: `${name} task` } })
    sbLists[i] = list
  }
  if (sql && sbLists[0]) await sql`update lists set created_at = created_at - interval '1 minute' where id = ${sbLists[0]}`
  const templateRow = async (name) => {
    const [row] = sql ? await sql`select id, target_type, payload, tags from project_templates where workspace_id = ${WS} and name = ${name}`.catch(() => []) : []
    if (row?.id && !created.includes(row.id)) {
      created.push(row.id)
      madeRow('project_templates', row.id)
    }
    return row ?? null
  }
  const listsHeld = (row) => (row?.payload?.lists ?? []).map((l) => ({ name: l.name, tasks: (l.tasks ?? []).map((t) => t.title) }))
  const fromSidebar = async (menuTestId, itemTestId, name, tags) => {
    await page.goto(`${B}/app/${WS}/${sbSpace}/${sbProject}/${sbLists[0]}`, { waitUntil: 'domcontentloaded' })
    /*
     * The tree draws every space collapsed (`undo-delete` opens both levels by
     * id for the same reason), so the space, then the folder, is opened where
     * its row is not yet there — each asked first, since a toggle pressed on an
     * open level closes it.
     */
    const shown = (testId) => page.getByTestId(testId).isVisible().catch(() => false)
    if (!(await waitUntil(() => shown(`project-actions-${sbProject}`), { timeoutMs: 8000 }))) {
      await page.getByTestId(`space-toggle-${sbSpace}`).click({ timeout: 15_000 }).catch(() => {})
    }
    if (!(await waitUntil(() => shown(`list-actions-${sbLists[0]}`), { timeoutMs: 8000 }))) {
      await page.getByTestId(`project-toggle-${sbProject}`).click({ timeout: 15_000 }).catch(() => {})
    }
    await waitUntil(() => shown(menuTestId), { timeoutMs: 15_000 })
    await page.getByTestId(menuTestId).click({ timeout: 15_000 }).catch(() => {})
    await page.getByTestId(itemTestId).click({ timeout: 8000 }).catch(() => {})
    const offered = await page.getByTestId('sidebar-save-template-name').inputValue({ timeout: 8000 }).catch(() => null)
    await page.getByTestId('sidebar-save-template-name').fill(name, { timeout: 5000 }).catch(() => {})
    await page.getByTestId('sidebar-save-template-tags').fill(tags, { timeout: 5000 }).catch(() => {})
    await page.getByTestId('sidebar-save-template-confirm').click({ timeout: 5000 }).catch(() => {})
    let row = null
    await waitUntil(async () => !!(row = await templateRow(name)), { timeoutMs: 10_000 })
    return { offered, row }
  }
  const SB_LIST_TPL = `${TAG} sidebar list template`
  const viaList = await fromSidebar(`list-actions-${sbLists[0]}`, `list-save-template-${sbLists[0]}`, SB_LIST_TPL, 'Sprint, sidebar')
  chk(viaList.offered === SB_LISTS[0] && viaList.row?.target_type === 'list'
      && JSON.stringify(listsHeld(viaList.row)) === JSON.stringify([{ name: SB_LISTS[0], tasks: [`${SB_LISTS[0]} task`] }])
      && JSON.stringify(viaList.row?.tags ?? null) === JSON.stringify(['sprint', 'sidebar']),
    'a list’s ⋯ in the sidebar saves it as a List template, under the list’s name to begin with: the list alone, with its task, and the tags typed (read from the database)',
    `the name box offered ${JSON.stringify(viaList.offered)}; the row ${viaList.row ? JSON.stringify({ type: viaList.row.target_type, lists: listsHeld(viaList.row), tags: viaList.row.tags }) : 'was not made'}`)
  const SB_FOLDER_TPL = `${TAG} sidebar folder template`
  const viaFolder = await fromSidebar(`project-actions-${sbProject}`, `project-save-template-${sbProject}`, SB_FOLDER_TPL, '')
  chk(viaFolder.row?.target_type === 'folder'
      && JSON.stringify(listsHeld(viaFolder.row)) === JSON.stringify(SB_LISTS.map((name) => ({ name, tasks: [`${name} task`] }))),
    'and a folder’s ⋯ saves it as a Folder template, with both its lists and their tasks',
    `the row ${viaFolder.row ? JSON.stringify({ type: viaFolder.row.target_type, lists: listsHeld(viaFolder.row) }) : 'was not made'}`)
  // The list a save names is one of the folder's: another folder's list is not found in it, and nothing is saved.
  const sbOtherProject = sbSpace ? (await api('/projects', { method: 'POST', body: { spaceId: sbSpace, name: `${TAG} other folder` } })).data?.id : null
  const sbForeignList = sbOtherProject ? (await api('/lists', { method: 'POST', body: { projectId: sbOtherProject, name: `${TAG} other list` } })).data?.id : null
  const SB_FOREIGN_TPL = `${TAG} foreign list template`
  const foreign = await api(`/workspaces/${WS}/project-templates/save-from-project`, {
    method: 'POST',
    body: { projectId: sbProject, listId: sbForeignList, targetType: 'list', name: SB_FOREIGN_TPL },
  })
  const foreignRow = await templateRow(SB_FOREIGN_TPL)
  chk(!!sbForeignList && foreign.status === 404 && foreign.message === 'List not found in this project' && !foreignRow,
    'and a list of another folder, named with this one, is refused as not found in it (404), and no template is made',
    `the route answered ${foreign.status} ${JSON.stringify(foreign.message)}; the row ${foreignRow ? 'was made' : 'was not made'}`)
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
  await page.screenshot({ path: '/tmp/claude-0/shots/template-center-fail.png', fullPage: true }).catch(() => {})
} finally {
  /*
   * Everything this run made, taken back: its templates, the one saved through
   * the page among them, then the two people it joined to the shared
   * workspace. `leave` reads every answer and names anything left behind.
   * And a built-in's tags, put back by SQL only where a broken build let the
   * route write them — the route itself refuses to, so there is no other way.
   */
  await leave()
  if (sql && builtInTried && Array.isArray(builtInTagsBefore)) {
    const now = await tagsInDb(builtInTried)
    if (JSON.stringify(now) !== JSON.stringify(builtInTagsBefore)) {
      try {
        /*
         * Through jsonb, so an empty list is `{}` rather than an array whose
         * type the driver must guess — and as `sql.json`, since the driver
         * JSON-encodes a jsonb parameter itself: a string passed there arrived
         * as a JSON string, and the first restore failed on it ("cannot
         * extract elements from a scalar"), measured under
         * `template-center-33`.
         */
        await sql`update project_templates
          set tags = array(select jsonb_array_elements_text(${sql.json(builtInTagsBefore)}::jsonb))
          where id = ${builtInTried} and is_built_in`
        console.log(`  put back the tags a broken build wrote on built-in ${builtInTried}: ${JSON.stringify(now)}`)
      } catch (e) {
        console.log(`  cleanup left behind: built-in ${builtInTried} carries ${JSON.stringify(now)} (${String(e?.message ?? e).split('\n')[0]})`)
      }
    }
  }
  await browser.close().catch(() => {})
  await sql?.end?.({ timeout: 5 })
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
await stack?.close?.()
process.exit(failed() ? 1 : 0)
