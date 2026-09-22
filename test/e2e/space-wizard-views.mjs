/**
 * §V2-06 frame `07:12` — "Default settings for views → Required views".
 *
 * WHAT THE FRAME DRAWS, read off the pixels rather than off a summary: ELEVEN
 * rows, each a name with a toggle on the right.
 *
 *   List — *Required*, with a `Default` pill, toggle on and un-pressable
 *   Board ·  on
 *   Calendar · on  (hovered in the frame, so it shows "Mark as default view")
 *   Map · off
 *   Activity · off
 *   Team · on
 *   Gantt · on
 *   Mind Map · off
 *   Table · off
 *   Timeline · off
 *   Workload · off
 *
 * Rundesk renders SIX of the eleven: list, board, table, calendar, gantt, team.
 * (A correction worth writing down: Table is one of the six — it has a view
 * tab, a column panel and its own e2e coverage. The five Rundesk genuinely does
 * not have are Map, Activity, Mind Map, Timeline and Workload.)
 *
 * THE TWO THINGS THIS SUITE IS FOR.
 *
 * 1. THE `team` LABEL DEFECT. `VIEW_LABEL` in `create-space-wizard.tsx` had no
 *    `team` entry, so the Team row fell through `?? 'list.viewList'` and
 *    rendered the word **"List"**. The panel showed two rows both labelled
 *    List, and both of them toggled something real, so nothing looked broken.
 *
 *    Every check of the form "the row has a label" PASSES ON THAT BUG. So this
 *    suite asserts the SPECIFIC text of each of the six rows, one check each,
 *    and separately asserts that no two rows say the same thing — which is the
 *    exact shape the defect had.
 *
 * 2. NO TICK-BOX THAT LEADS NOWHERE. A view that can be selected here and that
 *    no surface renders is the mirror defect: a stored value no reader honours,
 *    with the database left as evidence for a feature that does not exist. The
 *    five Rundesk cannot draw are not offered, and the server will not store
 *    one even if asked directly.
 *
 * Runs against the REAL API. A stubbed one would let this suite decide what
 * the view set is, and "the panel agrees with the server" is half the point —
 * the key set was written out in four places and two had drifted.
 *
 *   node test/e2e/space-wizard-views.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, pickWorkspace, ensureSweepFixture } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'

const chromium = await resolveChromium()
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure. */
const EXPECTED_CHECKS = 15

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')
/** Everything this run makes carries the tag, and nothing else is looked at. */
const TAG = `swv-${Date.now()}`

/** The six Rundesk renders, in the order the server serves them. */
const EXPECTED_VIEWS = ['list', 'board', 'table', 'calendar', 'gantt', 'team']
/** One specific word per row. The whole suite turns on these being distinct. */
const EXPECTED_LABEL = {
  list: 'List',
  board: 'Board',
  table: 'Table',
  calendar: 'Calendar',
  gantt: 'Gantt',
  team: 'Team',
}
/** On the frame, absent from Rundesk. Neither offered nor storable. */
const FRAME_ONLY = ['map', 'activity', 'mindMap', 'timeline', 'workload']
const FRAME_ONLY_LABELS = ['Map', 'Activity', 'Mind Map', 'Timeline', 'Workload']

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
const fixture = await ensureSweepFixture(api, WS)

/** Spaces this run created, by id, taken back in `finally`. */
const madeSpaces = []
const makeSpace = async (body) => {
  const res = await api('/spaces', { method: 'POST', body: { workspaceId: WS, ...body } })
  if (res.data?.id) madeSpaces.push(res.data.id)
  return res
}

const browser = await chromium.launch(launchOptions())
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
const page = await ctx.newPage()

/** Every POST /spaces the page makes, with its body — the request, not the render. */
const spacePosts = []
page.on('request', (r) => {
  if (r.method() === 'POST' && /\/api\/v1\/spaces(\?|$)/.test(r.url())) {
    spacePosts.push(r.postData() ?? '')
  }
})

try {
  console.log('\n▶ the server offers the six Rundesk can render, and only those')
  const presets = await api('/space-presets')
  /*
   * `status` explicitly. The fixture's apiClient NEVER THROWS — it returns
   * {status, data, error} — so a 403 here would otherwise read as `views`
   * being undefined and the next check would blame the wrong thing.
   */
  chk(
    presets.status === 200 && JSON.stringify(presets.data?.views) === JSON.stringify(EXPECTED_VIEWS),
    `GET /space-presets serves exactly ${EXPECTED_VIEWS.join(', ')}`,
    `status ${presets.status}, views ${JSON.stringify(presets.data?.views)}`,
  )

  /*
   * THE MIRROR CHECK, SERVER SIDE. A view nothing renders must not be storable
   * even by something that is not the wizard — otherwise "we do not offer it"
   * is a UI decision, not a rule, and `spaces.view_config` fills up with keys
   * no reader honours.
   */
  const withGhost = await makeSpace({
    name: `ghost views ${TAG}`,
    viewConfig: { enabledViews: ['list', 'team', 'workload', 'mindMap'], defaultView: 'team' },
  })
  const storedViews = withGhost.data?.viewConfig?.enabledViews ?? []
  chk(
    withGhost.status < 400 &&
      storedViews.includes('list') && storedViews.includes('team') &&
      !FRAME_ONLY.some((v) => storedViews.includes(v)),
    'a view Rundesk cannot render is dropped rather than stored',
    `status ${withGhost.status}, enabledViews came back ${JSON.stringify(storedViews)}`,
  )

  const ghostDefault = await api('/spaces', {
    method: 'POST',
    body: { workspaceId: WS, name: `ghost default ${TAG}`, viewConfig: { defaultView: 'workload' } },
  })
  if (ghostDefault.data?.id) madeSpaces.push(ghostDefault.data.id)
  chk(
    ghostDefault.status === 400,
    'and asking for one as the DEFAULT view is refused outright (400)',
    `POST /spaces with defaultView=workload answered ${ghostDefault.status} — a space would open on a view it has no tab for`,
  )

  console.log('\n▶ the Required-views panel, as frame `07:12` draws it')
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  await page.goto(`${B}/app/${WS}/${fixture.listPath}`, { waitUntil: 'domcontentloaded' })

  await page.getByTestId('quick-create-open').click()
  await page.getByTestId('create-tab-space').click()
  await page.waitForSelector('[data-testid="space-wizard-step1"]', { timeout: 25_000 })
  await page.getByTestId('space-wizard-name').fill(`Views ${TAG}`)
  await page.getByTestId('space-wizard-continue').click()
  await page.waitForSelector('[data-testid="space-wizard-step2"]', { timeout: 15_000 })
  await page.getByTestId('space-wizard-row-views').click()
  await page.waitForSelector('[data-testid="space-wizard-views"]', { timeout: 15_000 })

  const rowKeys = await page.locator('[data-testid^="space-wizard-viewrow-"]').evaluateAll((els) =>
    els.map((e) => (e.getAttribute('data-testid') ?? '').replace('space-wizard-viewrow-', '')),
  )
  chk(
    JSON.stringify(rowKeys) === JSON.stringify(EXPECTED_VIEWS),
    `the panel draws ${EXPECTED_VIEWS.length} rows, keyed to the server's set in its order`,
    `the panel drew ${rowKeys.length}: ${JSON.stringify(rowKeys)} — the panel and the server disagree about the view set`,
  )

  /*
   * ONE CHECK PER ROW, NAMING THE WORD. Not "the row has a label": the defect
   * this replaces produced a labelled row with the WRONG label, and a presence
   * check passes on it. If `team` ever loses its entry again, exactly one of
   * the six below goes red and it says which word it expected.
   */
  const labelOf = async (view) =>
    (await page.getByTestId(`space-wizard-viewlabel-${view}`).first().innerText().catch(() => '')).trim()
  const seen = {}
  for (const view of EXPECTED_VIEWS) {
    const text = await labelOf(view)
    seen[view] = text
    /*
     * The sentence carries a LITERAL run long enough to quote. It read
     * `the ${view} row reads "${EXPECTED_LABEL[view]}"`, whose only literal
     * fragment is ` row reads "` — twelve characters, two words, and no break
     * patch can name this check without quoting something that short.
     * `space-wizard-views-1-teamlabel` reddens exactly the `team` iteration and
     * had to claim a neighbouring check instead.
     */
    chk(
      text === EXPECTED_LABEL[view],
      `the ${view} row is labelled with the frame's own word, "${EXPECTED_LABEL[view]}"`,
      `the ${view} row read ${JSON.stringify(text)}, not ${JSON.stringify(EXPECTED_LABEL[view])}` +
        (text === 'List' && view !== 'list'
          ? ' — this is the missing-VIEW_LABEL-entry bug: the key fell back to a sibling\'s string'
          : ''),
    )
  }

  const labels = EXPECTED_VIEWS.map((v) => seen[v])
  chk(
    new Set(labels).size === labels.length,
    'and no two rows say the same thing',
    `the panel drew ${JSON.stringify(labels)} — two rows with one name is what a missing label map looks like`,
  )

  chk(
    await page.getByTestId('space-wizard-view-list').isDisabled(),
    'List is Required and cannot be switched off `[07:12]`',
    'the List view could be turned off — every list falls back to it, so the space would render nothing',
  )

  /*
   * The five the frame shows and Rundesk cannot draw. Checked by testid AND by
   * the words themselves, because a row could be drawn under some other key and
   * still be a tick-box that leads nowhere.
   */
  const panelText = (await page.getByTestId('space-wizard-views').innerText()).replace(/\s+/g, ' ')
  const offeredGhosts = []
  for (const v of FRAME_ONLY) {
    if ((await page.locator(`[data-testid="space-wizard-viewrow-${v}"]`).count()) > 0) offeredGhosts.push(v)
  }
  const ghostWords = FRAME_ONLY_LABELS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(panelText))
  chk(
    offeredGhosts.length === 0 && ghostWords.length === 0,
    'none of Map, Activity, Mind Map, Timeline or Workload is offered — Rundesk cannot render them',
    `the panel offered ${JSON.stringify([...offeredGhosts, ...ghostWords])}, which no view surface draws`,
  )

  console.log('\n▶ and the toggles reach the request, so the panel is not decoration')
  await page.getByTestId('space-wizard-view-team').click() // starter has it off → on
  await page.getByTestId('space-wizard-views-done').click()
  await page.waitForSelector('[data-testid="space-wizard-step2"]', { timeout: 10_000 })
  const before = spacePosts.length
  await page.getByTestId('space-wizard-create').click()
  await page.waitForTimeout(2500)

  let sent = null
  try { sent = JSON.parse(spacePosts.slice(before).at(-1) ?? '{}') } catch { /* reported below */ }
  chk(
    Array.isArray(sent?.viewConfig?.enabledViews) && sent.viewConfig.enabledViews.includes('team'),
    'switching Team on puts it in the POST body',
    `the wizard posted enabledViews ${JSON.stringify(sent?.viewConfig?.enabledViews)}`,
  )

  const mine = (await api(`/spaces/workspace/${WS}`)).data ?? []
  const created = mine.find((s) => s.name === `Views ${TAG}`)
  if (created?.id) madeSpaces.push(created.id)
  chk(
    !!created && Array.isArray(created.viewConfig?.enabledViews) &&
      created.viewConfig.enabledViews.includes('team'),
    'and the space really comes out with Team among its views',
    created
      ? `the space stored ${JSON.stringify(created.viewConfig?.enabledViews)}`
      : `no space named "Views ${TAG}" exists — the wizard did not create one`,
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
  await page.screenshot({ path: '/tmp/claude-0/shots/space-wizard-views-fail.png', fullPage: true }).catch(() => {})
} finally {
  for (const id of madeSpaces.reverse()) {
    const res = await api(`/spaces/${id}`, { method: 'DELETE' })
    if (res.status >= 400) console.log(`\x1b[2m  could not clean up space ${id} (${res.status})\x1b[0m`)
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
