/**
 * §V2-S18 frame `[17:16]` — THE POPOVER'S PRESENTATION: three rows, a hover
 * card per row, and a disclosure holding the rest.
 *
 * WHAT THE FRAME DRAWS, zoomed rather than remembered. A popover headed **Best
 * models** with THREE rows — `Brain² [Max]` ticked, `GPT-5.6 Luna` hovered,
 * `Gemini 3.5 Flash` — a rule, and **Show more**. Beside the hovered row, a dark
 * card: the model's name, one line saying what it is for (*"Fast, lightweight
 * GPT-5.6 model"*), a rule, and two labelled meters. **Speed** fills its whole
 * track; **Intelligence** fills about three quarters of it. The two bars are
 * different lengths, and that is the entire reason they are drawn.
 *
 * WHAT THIS SUITE IS GUARDING, and what it deliberately leaves to its
 * neighbour:
 *
 *   1. THE CARD IS A CARD. Absent from the DOM until a row is hovered, one at a
 *      time, anchored beside the row as the frame anchors it, and reachable by
 *      KEYBOARD as well — a measurement only a mouse can see is one a lot of
 *      people never see at all.
 *
 *   2. THE LINE IS THE MODEL'S OWN. Asserted against the catalogue's `hint` for
 *      that exact tier, and asserted to DIFFER between two rows. "A description
 *      is present" would pass on one hardcoded sentence shown under every name,
 *      which is the same shape as the missing-i18n-key defect: the fallback
 *      renders a sibling's string and every "it has a label" check passes.
 *
 *   3. THE BARS MEASURE SOMETHING. Two ways, because they are two different
 *      failures: within ONE model the two metrics must differ (or the card
 *      draws two identical bars and calls one of them Intelligence), and across
 *      TWO models the SAME metric must differ (or every card is the same
 *      picture with a different name on it). Both in pixels, off
 *      `getBoundingClientRect`, because "it looks right" is not a check.
 *
 *   4. THE CUT IS THE SERVER'S. `[17:16]` shows three and a disclosure; the
 *      bound lives in `model-tiers.ts` and is SERVED as `best` / `more` /
 *      `visible`. So this asserts the screen agrees with the served cut, and
 *      that the cut loses nothing — every routable tier is reachable, either in
 *      the group or behind the disclosure.
 *
 * `ai-model-picker.mjs` keeps the routing and the preference: that each tier
 * resolves to its own real model, that the unroutable providers cannot be
 * stored, and that choosing and preferring are different acts. This suite does
 * not repeat any of that.
 *
 * ITS FIXTURES. There are none to own: the catalogue is a constant of the
 * build, and every count below is against it rather than against shared
 * workspace data. The signed-in person's model preference is READ and never
 * written, so this suite and `ai-model-picker` — which does own that row — can
 * run either order without either one moving the other's ground.
 *
 * NO PROVIDER KEY IS NEEDED. Nothing here calls a model: `GET /ai/models`
 * returns a static catalogue and the popover is rendered from it.
 *
 *   node test/e2e/ai-model-cards.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, pickWorkspace } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const chromium = await resolveChromium()
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure. */
const EXPECTED_CHECKS = 24

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')

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

let browser = null
let ctx = null

try {
  console.log('\n▶ `GET /ai/models` — the cut `[17:16]` makes, made on the server')
  /*
   * `apiClient` NEVER THROWS — it answers `{status, data, error}` — so the
   * status is read rather than wrapped in a `.catch` that could not fire.
   */
  const catalog = await api('/ai/models')
  const models = catalog.data?.models ?? []
  const best = catalog.data?.best ?? []
  const more = catalog.data?.more ?? []
  const unavailable = catalog.data?.unavailable ?? []
  chk(
    catalog.status === 200 && Array.isArray(best) && Array.isArray(more),
    'the catalogue serves `best` and `more` beside `models`',
    `it returned ${catalog.status} with keys ${JSON.stringify(Object.keys(catalog.data ?? {}))} — ` +
      'a browser slicing the list itself is a second copy of the bound',
  )
  chk(
    best.length === 3 && catalog.data?.visible === 3,
    'headed by the three rows the frame draws, at the bound the server declares',
    `best had ${best.length} row(s) at a declared bound of ${catalog.data?.visible}`,
  )
  /*
   * THE CUT LOSES NOTHING. A `slice` that dropped the tail would look identical
   * on screen today — `more` is empty — and would silently hide the fourth
   * tier the day one lands. So the arithmetic is asserted, not the appearance.
   */
  chk(
    best.length + more.length === models.length,
    'and the two halves account for every routable tier — the cut hides none of them',
    `best ${best.length} + more ${more.length} against a catalogue of ${models.length}`,
  )
  chk(
    models.length > 0 && best.every((m, i) => m.id === models[i]?.id),
    'with `best` the FRONT of the catalogue, not a separately maintained list',
    `best was ${JSON.stringify(best.map((m) => m.id))} against ${JSON.stringify(models.map((m) => m.id))}`,
  )
  /*
   * EVERY CARD HAS SOMETHING TO SAY, AND ITS OWN. The frame's card is a name
   * over one line; a tier with an empty hint draws a card with a gap in it, and
   * two tiers sharing a hint draws two cards that differ in nothing but the
   * name — which is the defect this whole row is about, one layer down.
   */
  chk(
    best.length > 0 && best.every((m) => typeof m.hint === 'string' && m.hint.trim().length > 0),
    'each of the three carries the one line its card is built from',
    `the hints were ${JSON.stringify(best.map((m) => m.hint))}`,
  )
  chk(
    new Set(best.map((m) => m.hint)).size === best.length,
    'and a DIFFERENT one each — three cards saying the same sentence explain nothing',
    `duplicate hints in ${JSON.stringify(best.map((m) => m.hint))}`,
  )

  // ── On screen ──────────────────────────────────────────────────────────────
  console.log('\n▶ the popover, and the card that opens beside a row')
  browser = await chromium.launch(launchOptions())
  ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()

  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  await page.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="ai-model-tier"]', { timeout: 25_000 })
  // The trigger is disabled until the stored preference has landed; clicking
  // before that is a click on a disabled button, which does nothing quietly.
  await waitUntil(
    async () => (await page.getByTestId('ai-model-tier').getAttribute('data-tier')) !== '',
    { timeoutMs: 15_000 },
  )

  await page.getByTestId('ai-model-tier').click()
  const menuUp = await waitUntil(
    () => page.getByTestId('ai-model-menu').isVisible().catch(() => false),
    { timeoutMs: 8_000 },
  )
  chk(menuUp, 'the popover opens', 'the model menu never appeared')

  const rows = page.locator('[data-testid^="ai-model-option-"][data-available="true"]')
  chk(
    (await rows.count()) === best.length,
    'drawing exactly the rows the server put in "Best models"',
    `${await rows.count()} rows on screen against ${best.length} served`,
  )

  const cards = page.locator('[data-testid^="ai-model-card-"]')
  /*
   * NOT IN THE DOM UNTIL HOVERED. A card rendered always and hidden with CSS
   * would pass a visibility check on a build where hover did nothing at all,
   * and the frame's card is an event, not a style.
   */
  chk(
    (await cards.count()) === 0,
    'with no hover card anywhere before anything is hovered',
    `${await cards.count()} card(s) were already in the DOM`,
  )
  /*
   * AND THE PREFIX IS A SEPARATE NAMESPACE. `ai-model-card-*` must not fall
   * under `ai-model-option-*`: an 18-for-6 miscount is exactly what a variant
   * added beneath an existing prefix produces, and every prefix query in this
   * file and in `ai-model-picker.mjs` would start counting cards as rows.
   */
  const rowsBeforeHover = await rows.count()
  const fastRow = page.getByTestId('ai-model-option-fast')
  await fastRow.hover()
  const fastCard = page.getByTestId('ai-model-card-fast')
  const cardUp = await waitUntil(() => fastCard.isVisible().catch(() => false), { timeoutMs: 5_000 })
  chk(cardUp, 'hovering a row opens that row’s card', 'no card appeared on hover')
  chk(
    (await rows.count()) === rowsBeforeHover,
    'and the card does not land under the row testid prefix, which would change every count',
    `pickable rows went from ${rowsBeforeHover} to ${await rows.count()} when a card opened`,
  )
  chk(
    (await cards.count()) === 1,
    'exactly one card is up — two would overlap illegibly, and the frame has one',
    `${await cards.count()} cards were open at once`,
  )

  const fastHint = best.find((m) => m.id === 'fast')?.hint ?? ''
  chk(
    fastHint.length > 0 && (await page.getByTestId('ai-model-hint-fast').innerText()).trim() === fastHint,
    'carrying that model’s OWN one line, the same one the catalogue serves',
    `the card read ${JSON.stringify((await page.getByTestId('ai-model-hint-fast').innerText()).trim())} ` +
      `against a served hint of ${JSON.stringify(fastHint)}`,
  )

  /*
   * ANCHORED BESIDE THE ROW, as `[17:16]` anchors it — the card sits clear of
   * the popover's right edge rather than over the list it is describing. A card
   * covering the rows would make the comparison it exists for impossible.
   */
  const rowBox = await fastRow.boundingBox()
  const cardBox = await fastCard.boundingBox()
  chk(
    !!rowBox && !!cardBox && cardBox.x >= rowBox.x + rowBox.width - 1,
    'and drawn beside the row rather than over the list',
    `the row ends at x=${Math.round((rowBox?.x ?? 0) + (rowBox?.width ?? 0))} and the card starts at ` +
      `x=${Math.round(cardBox?.x ?? 0)}`,
  )

  console.log('\n▶ the two bars, measured')
  const widthOf = async (testid) => {
    const bar = page.getByTestId(testid)
    if (!(await bar.isVisible().catch(() => false))) return 0
    return (await bar.boundingBox())?.width ?? 0
  }
  const fastSpeed = await widthOf('ai-model-bar-speed-fast')
  const fastIq = await widthOf('ai-model-bar-intelligence-fast')
  chk(
    fastSpeed > 0 && fastIq > 0,
    'the card draws both meters',
    `speed measured ${Math.round(fastSpeed)}px and intelligence ${Math.round(fastIq)}px`,
  )
  /*
   * WITHIN ONE MODEL. The frame's card draws Speed at full track and
   * Intelligence at about three quarters. Two bars at one length is a
   * decoration with two labels on it, and nothing on screen would look wrong.
   */
  chk(
    Math.abs(fastSpeed - fastIq) > 8,
    'and its Speed and Intelligence are visibly DIFFERENT lengths, as the frame draws them',
    `the Fast card drew speed=${Math.round(fastSpeed)}px and intelligence=${Math.round(fastIq)}px — ` +
      'two bars the same length carry no information at all',
  )
  /*
   * THE TRACK IS DRAWN TOO. The frame shows the unfilled remainder, which is
   * what makes "four out of five" readable rather than "a bar of unknown
   * scale"; a fill at 100% of a track the same width as the fill is a bar that
   * can only ever mean one thing.
   */
  const track = await page.getByTestId('ai-model-bar-intelligence-fast').evaluate((el) => {
    const parent = el.parentElement
    return parent ? parent.getBoundingClientRect().width : 0
  })
  chk(
    track > fastIq + 8,
    'over a visible track, so a part-filled meter reads as part-filled',
    `the intelligence fill was ${Math.round(fastIq)}px inside a ${Math.round(track)}px track`,
  )

  // The other model. One card at a time, so this is a second hover, not a
  // second read of the same open card.
  await page.getByTestId('ai-model-option-max').hover()
  const maxCardUp = await waitUntil(
    () => page.getByTestId('ai-model-card-max').isVisible().catch(() => false),
    { timeoutMs: 5_000 },
  )
  chk(maxCardUp, 'moving to another row opens that row’s card', 'the second card never appeared')
  chk(
    (await cards.count()) === 1 && (await page.getByTestId('ai-model-card-fast').count()) === 0,
    'and closes the first — one card at a time',
    `${await cards.count()} card(s) open, with the first still ` +
      `${(await page.getByTestId('ai-model-card-fast').count()) ? 'up' : 'gone'}`,
  )
  const maxHint = best.find((m) => m.id === 'max')?.hint ?? ''
  chk(
    maxHint.length > 0 &&
      maxHint !== fastHint &&
      (await page.getByTestId('ai-model-hint-max').innerText()).trim() === maxHint,
    'saying something different about a different model',
    `the second card read ${JSON.stringify((await page.getByTestId('ai-model-hint-max').innerText()).trim())} ` +
      `against ${JSON.stringify(fastHint)} on the first`,
  )
  const maxSpeed = await widthOf('ai-model-bar-speed-max')
  /*
   * ACROSS TWO MODELS. The same metric, measured on two cards, must differ —
   * otherwise every card is one picture with a different name on it, which is
   * the version of this that demos perfectly.
   */
  chk(
    Math.abs(fastSpeed - maxSpeed) > 8,
    'and its Speed bar is a visibly different length from the other model’s',
    `speed measured fast=${Math.round(fastSpeed)}px max=${Math.round(maxSpeed)}px — ` +
      'the same bar on every card measures nothing',
  )

  console.log('\n▶ reachable without a mouse, and `[17:20]` "Show more"')
  /*
   * A measurement you can only get at by hovering is one a keyboard user never
   * sees. The same card, opened by FOCUS — and the mouse is moved away from the
   * popover first so a leftover hover cannot be what answers this.
   */
  await page.mouse.move(5, 5)
  await waitUntil(async () => (await cards.count()) === 0, { timeoutMs: 5_000 })
  await page.getByTestId('ai-model-option-deep').focus()
  const focusCard = await waitUntil(
    () => page.getByTestId('ai-model-card-deep').isVisible().catch(() => false),
    { timeoutMs: 5_000 },
  )
  chk(focusCard, 'focusing a row with the keyboard opens its card too', 'the card is mouse-only')

  await page.getByTestId('ai-model-show-more').click()
  await waitUntil(() => page.getByTestId('ai-model-more').isVisible().catch(() => false), { timeoutMs: 5_000 })
  const hidden = page.locator('[data-testid^="ai-model-option-"][data-available="false"]')
  chk(
    (await hidden.count()) === unavailable.length && unavailable.length > 0,
    'the disclosure reveals exactly what the server said it holds',
    `${await hidden.count()} unreachable row(s) appeared against ${unavailable.length} served`,
  )
  /*
   * NOTHING IS UNREACHABLE. Every routable tier plus every named provider is on
   * screen once the disclosure is open. This is the check that would fail the
   * day a fourth tier is added and the component keeps rendering only `best`.
   */
  const allRows = page.locator('[data-testid^="ai-model-option-"]')
  chk(
    (await allRows.count()) === models.length + unavailable.length,
    'and with it open, every model in the catalogue is on screen — the bound hides, it does not drop',
    `${await allRows.count()} rows against ${models.length} routable + ${unavailable.length} unreachable`,
  )
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await ctx?.close().catch(() => {})
  await browser?.close().catch(() => {})
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
await stack?.close?.()
process.exit(failed() ? 1 : 0)
