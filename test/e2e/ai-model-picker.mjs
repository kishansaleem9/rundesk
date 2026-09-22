/**
 * §V2-S18 frame `[17:16]` — the composer's model picker, and the preference
 * behind it.
 *
 * `[17:16]`–`[17:21]` "aap ChatGPT ko bhi use kar sakte ho, Gemini ke features
 * bhi use kar sakte ho; agar aap 'Show More' pe jaoge to aap CLAUDE ke features
 * bhi use kar sakte ho." `[17:32]` "…aur us base par hi apna [preferred] AI bhi
 * set down karna hai."
 *
 * WHAT THIS SUITE IS GUARDING, in three parts, none of which is "a dropdown
 * renders":
 *
 *   1. THE PREFERENCE IS ON THE SERVER. It was `localStorage` only, under
 *      `rundesk.aiTier`, which is a habit one browser remembers rather than a
 *      preference. The proof is a SECOND BROWSER CONTEXT — no shared storage —
 *      opening the picker on the tier the first one set. Nothing local could
 *      have supplied that answer, and the suite also asserts the old key is not
 *      being written, so a reintroduced mirror shows up here.
 *
 *   2. THE UNROUTABLE PROVIDERS CANNOT BE PICKED. The frame offers ChatGPT and
 *      Gemini; `apps/api` has no OpenAI or Google client. They are listed with
 *      the reason — silence would be read as "soon" — and the API REFUSES to
 *      store either as a preference. That refusal is the check: a facade here
 *      would accept the write, resolve to Claude, and leave a row in Postgres
 *      as evidence for a feature that does not exist.
 *
 *   3. CHOOSING AND PREFERRING ARE DIFFERENT ACTS, because the transcript
 *      describes both. Choosing must NOT write; preferring must. Both halves
 *      are proven from the CAPTURED REQUEST rather than from the render —
 *      rendering the right thing for the wrong reason is the commonest way a
 *      fix is fake.
 *
 * Its own fixture is the signed-in person's preference for this workspace,
 * which is a row only this account owns; it is read first and put back in
 * `finally`.
 *
 *   node test/e2e/ai-model-picker.mjs --api 3011 --dist apps/web/dist
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
const EXPECTED_CHECKS = 32

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

const prefRoute = `/ai/preferences?workspaceId=${WS}`
const setPref = (preferredTier) => api(prefRoute, { method: 'PUT', body: { preferredTier } })

/*
 * This account's own preference, read before anything is touched so it can be
 * put back. `apiClient` NEVER THROWS — it answers `{status, data, error}` — so
 * the status is checked rather than wrapped in a `.catch` that could not fire.
 */
const before = await api(prefRoute)
const originalPreference = before.status === 200 && before.data?.isSet ? before.data.preferredTier : null

const browser = await chromium.launch(launchOptions())
let ctx = null

/** Sign in through the form and land on the AI page with the composer up. */
const openAiPage = async (page) => {
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  await page.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
  // A GATE THAT REPORTS. This element is the subject of a check below, so a patch
  // that removes it defeats the gate first and the throw ends the section before
  // the check can name itself (ledger §10).
  await page.waitForSelector('[data-testid="ai-model-tier"]', { timeout: 25_000 }).catch(() => {})
  // The trigger is disabled until the stored preference has landed; reading
  // `data-tier` before that would read the loading state, not the preference.
  await waitUntil(
    async () => (await page.getByTestId('ai-model-tier').getAttribute('data-tier')) !== '',
    { timeoutMs: 15_000 },
  )
}

/*
 * EVERY CLICK IN THIS SUITE IS BOUNDED. A control one of this suite's own break
 * patches removes is a failing check below; an unqualified `.click()` is instead
 * thirty seconds and a run that ends where it stood, with the checks after it
 * never reported. Eleven patches across nine suites did exactly that before this
 * was applied ahead of the runs rather than after them.
 */
try {
  console.log('\n▶ `GET /ai/models` — two lists, because they are two different things')
  const catalog = await api('/ai/models')
  const models = catalog.data?.models ?? []
  const unavailable = catalog.data?.unavailable ?? []
  chk(
    catalog.status === 200 && Array.isArray(models) && Array.isArray(unavailable),
    'the catalogue answers with `models` and `unavailable`',
    `it returned ${catalog.status} ${JSON.stringify(catalog.data).slice(0, 140)}`,
  )
  /*
   * THREE, since `0163`. The frame heads three rows "Best models" and puts the
   * rest behind Show more, and the third is a real tier resolving to its own
   * model — `claude-opus-5` — not a third label over one of the other two. The
   * duplicate-model check below is what keeps that honest, and it is the check
   * that would have caught a padded catalogue.
   */
  chk(
    models.length === 3,
    'three routable tiers, as `MODEL_TIERS` declares and `[17:16]` draws',
    `it offered ${models.length}: ${models.map((m) => m.id).join(', ')}`,
  )
  /*
   * EVERY ROUTABLE ENTRY NAMES A REAL ANTHROPIC MODEL. This is the check that
   * catches "ChatGPT" being quietly added to the routable list with a Claude
   * model behind it, which is the exact facade this row exists to refuse.
   */
  chk(
    models.length > 0 && models.every((m) => typeof m.model === 'string' && m.model.startsWith('claude-')),
    'and each resolves to a real Anthropic model',
    `models resolved to ${models.map((m) => m.model).join(', ')}`,
  )
  chk(
    new Set(models.map((m) => m.model)).size === models.length,
    'to a DIFFERENT model each, not two labels for one',
    `duplicate models: ${models.map((m) => m.model).join(', ')}`,
  )
  chk(
    unavailable.length === 2 &&
      unavailable.map((m) => m.label).sort().join(',') === 'ChatGPT,Gemini',
    'the two the frame names and this product cannot reach are listed by name',
    `unavailable was ${JSON.stringify(unavailable.map((m) => m.label))}`,
  )
  /*
   * NO FIELD TO PUT A MODEL IN. A boolean flag could be flipped; a shape with
   * no `model` key cannot be routed to however the picker is later rewritten.
   */
  chk(
    unavailable.length > 0 && unavailable.every((m) => m.model === undefined && typeof m.reasonKey === 'string'),
    'each carries a reason and NO model id — there is nothing to route to',
    `unavailable entries were ${JSON.stringify(unavailable)}`,
  )

  console.log('\n▶ the preference is a row, and it refuses what it cannot run')
  const refusedOpenAi = await setPref('openai')
  chk(
    refusedOpenAi.status >= 400 && refusedOpenAi.status < 500,
    'storing "openai" as a preference is REFUSED',
    `it returned ${refusedOpenAi.status} — a stored preference nothing can route to is ` +
      'the database becoming evidence for a feature that does not exist',
  )
  const refusedJunk = await setPref('turbo')
  chk(
    refusedJunk.status >= 400 && refusedJunk.status < 500,
    'and so is a tier that does not exist, rather than being coerced to the default',
    `it returned ${refusedJunk.status}`,
  )

  const savedFast = await setPref('fast')
  chk(
    savedFast.status < 300 && savedFast.data?.preferredTier === 'fast' && savedFast.data?.isSet === true,
    'a real tier is stored and reported as set',
    `it returned ${savedFast.status} ${JSON.stringify(savedFast.data)}`,
  )
  const readBack = await api(prefRoute)
  chk(
    readBack.status === 200 && readBack.data?.preferredTier === 'fast',
    'and reads back from a second request, not from the writer’s own memory',
    `the read returned ${JSON.stringify(readBack.data)}`,
  )
  const savedDeep = await setPref('deep')
  chk(
    savedDeep.data?.preferredTier === 'deep' && (await api(prefRoute)).data?.preferredTier === 'deep',
    'and it MOVES: setting it again changes what comes back',
    'the second write did not change the stored value — the row is write-only',
  )

  // ── On screen ────────────────────────────────────────────────────────────
  console.log('\n▶ the picker frame `[17:16]` draws')
  /*
   * Deliberately NOT the default. `DEFAULT_TIER` is "deep", so a composer that
   * ignored the server entirely would still open on "deep" and an assertion
   * against it would pass on exactly the bug this row is about. Every check
   * below that reads the picker's tier reads a value the default cannot
   * produce.
   */
  await setPref('fast')
  ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()

  /*
   * Every preference write this page makes. The only way to tell "it saved"
   * apart from "it looked like it saved" — and the only way to prove that
   * merely CHOOSING a model does not quietly rewrite the default.
   */
  const prefWrites = []
  page.on('request', (r) => {
    if (r.url().includes('/ai/preferences') && r.method() === 'PUT') {
      prefWrites.push({ url: r.url(), body: r.postData() ?? '' })
    }
  })

  await openAiPage(page)
  const trigger = page.getByTestId('ai-model-tier')
  // Read once, bounded and caught: a `chk` message is evaluated whether the
  // check passes or fails, so an unbounded read here would wait out the default
  // timeout and end the section. The locator is held in a variable — the shape
  // rule six could not see until it learnt to track locator variables.
  const openingTier = await trigger
    .getAttribute('data-tier', { timeout: 8000 })
    .catch(() => null)
  chk(
    openingTier === 'fast',
    'the composer opens on the stored preference, not on a hardcoded default',
    `the trigger read data-tier=${JSON.stringify(openingTier)} after the API stored ` +
      '"fast" — "deep" here means it is ignoring the server and using DEFAULT_TIER',
  )
  chk(
    (await page.getByTestId('ai-model-menu').count()) === 0,
    'and the popover is closed on arrival, as the composer shows it',
    'the model menu was already open before anything was clicked',
  )

  await trigger.click({ timeout: 8000 }).catch(() => {})
  const menuUp = await waitUntil(
    () => page.getByTestId('ai-model-menu').isVisible().catch(() => false),
    { timeoutMs: 8_000 },
  )
  chk(menuUp, 'clicking the pill opens it', 'the model menu never appeared')
  // Read once, bounded and caught: a `chk` message is evaluated whether the
  // check passes or fails, so a second read here would end the section on any
  // patch that takes the group heading away.
  const bestHeader = await page
    .getByTestId('ai-model-group-best')
    .innerText({ timeout: 6000 })
    .then((t) => t.trim())
    .catch(() => null)
  chk(
    bestHeader === 'Best models',
    'headed "Best models", as the frame heads it',
    `the header read ${JSON.stringify(bestHeader)}`,
  )

  const selectable = page.locator('[data-testid^="ai-model-option-"][data-available="true"]')
  chk(
    (await selectable.count()) === 3,
    'with exactly the three pickable tiers the frame draws before the disclosure',
    `${await selectable.count()} rows were pickable`,
  )
  chk(
    (await page.locator('[data-testid^="ai-model-option-"][data-selected="true"]').count()) === 1,
    'and exactly one tick, on the current one',
    `${await page.locator('[data-testid^="ai-model-option-"][data-selected="true"]').count()} rows were ticked`,
  )

  /*
   * THE BARS, MEASURED — NOW BEHIND A HOVER.
   *
   * `[17:16]` draws them in a card that opens when a row is hovered, and since
   * `0163` that is where they are; the previous build rendered them inline in
   * every row. The measurement is unchanged and is still the point: bars that
   * are all the same width carry no information at all, and nothing on screen
   * would look wrong. One card is open at a time, so each row is hovered and
   * measured in turn rather than read together.
   *
   * `ai-model-cards.mjs` owns the card ITSELF — that it is absent until hover,
   * that it carries the one line, that a row's own two bars differ. What is
   * asserted here is narrower and belongs with the catalogue: the claim
   * `MODEL_TIERS` makes about its tiers reaches the screen.
   */
  const widthAfterHover = async (tierId, metric) => {
    await page.getByTestId(`ai-model-option-${tierId}`).hover({ timeout: 8000 }).catch(() => {})
    const bar = page.getByTestId(`ai-model-bar-${metric}-${tierId}`)
    const up = await waitUntil(() => bar.isVisible().catch(() => false), { timeoutMs: 5_000 })
    return up ? ((await bar.boundingBox().catch(() => null))?.width ?? 0) : 0
  }
  const fastSpeed = await widthAfterHover('fast', 'speed')
  const fastIq = await widthAfterHover('fast', 'intelligence')
  const maxSpeed = await widthAfterHover('max', 'speed')
  const maxIq = await widthAfterHover('max', 'intelligence')
  chk(
    fastSpeed > maxSpeed + 2,
    'the Fast tier’s Speed bar is visibly longer than the Max tier’s',
    `speed measured fast=${Math.round(fastSpeed)}px max=${Math.round(maxSpeed)}px`,
  )
  chk(
    maxIq > fastIq + 2,
    'and the Max tier’s Intelligence bar is visibly longer than the Fast tier’s',
    `intelligence measured max=${Math.round(maxIq)}px fast=${Math.round(fastIq)}px`,
  )

  console.log('\n▶ "Show more" `[17:20]`, and what it reveals here')
  chk(
    (await page.getByTestId('ai-model-more').count()) === 0,
    'what it hides is not in the DOM before it is pressed',
    'the disclosure’s contents were rendered before the disclosure was opened',
  )
  await page.getByTestId('ai-model-show-more').click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(300)
  const hidden = page.locator('[data-testid^="ai-model-option-"][data-available="false"]')
  chk(
    (await hidden.count()) === 2,
    'pressing it reveals exactly the two unreachable providers',
    `${await hidden.count()} unavailable rows appeared`,
  )
  const openAiReason = (await page.getByTestId('ai-model-reason-openai').innerText()).trim()
  const googleReason = (await page.getByTestId('ai-model-reason-google').innerText()).trim()
  /*
   * A REASON EACH, AND DIFFERENT ONES. A missing i18n key falls back to a
   * sibling's string, so "a reason is present" would pass on exactly that bug
   * — the `VIEW_LABEL` "team" defect in another shape. Each must name its own
   * provider.
   */
  chk(
    /OpenAI/i.test(openAiReason) && /Google/i.test(googleReason) && openAiReason !== googleReason,
    'each says WHY it cannot be used, naming its own provider',
    `openai reason ${JSON.stringify(openAiReason)}, google reason ${JSON.stringify(googleReason)}`,
  )
  /*
   * AND CLICKING ONE CHANGES NOTHING. The whole row turns on this: an
   * unreachable provider that can be selected is the facade, whatever it says
   * underneath.
   */
  // Bounded too. Left unbounded, a patch that removes the trigger stalls
  // thirty seconds HERE and the check below never reports — the fix one line
  // down would have moved the exception one line up.
  const tierBefore = await trigger.getAttribute('data-tier', { timeout: 8000 }).catch(() => null)
  await page.getByTestId('ai-model-option-google').click({ force: true })
  await page.waitForTimeout(400)
  // Bounded and caught for the same reason: the message runs on the passing
  // path too, and this is a locator held in a variable — the shape rule six
  // could not see until it learnt to track locator variables.
  const tierAfterUnavailable = await trigger
    .getAttribute('data-tier', { timeout: 8000 })
    .catch(() => null)
  /*
   * `!== null` FIRST, AND IT IS NOT BELT-AND-BRACES.
   *
   * Both reads answer `null` for an element that exists with no `data-tier` on
   * it — which is what a patch stripping the attribute produces — and
   * `null === null` is TRUE. So the bounding alone would have made this check
   * PASS on exactly the facade it exists to refuse: a composer whose tier is
   * unreadable, twice, reported as a tier that did not move.
   *
   * That is the confident zero in its purest form, and it arrives THROUGH the
   * fix rather than despite it: catching a throw turns a loud failure into a
   * quiet value, and a quiet value has to be compared against something that
   * rejects it.
   */
  chk(
    tierAfterUnavailable !== null && tierAfterUnavailable === tierBefore,
    'and clicking one does not change the model in use',
    `the composer moved from ${JSON.stringify(tierBefore)} to ${JSON.stringify(tierAfterUnavailable)} ` +
      'after a provider with no client was clicked',
  )

  console.log('\n▶ `[17:28]`–`[17:32]` — choosing, and PREFERRING, are two acts')
  const writesBeforeChoice = prefWrites.length
  // The OTHER tier, so the click has something to change. Choosing the one
  // already in use would leave this check unable to fail.
  await page.getByTestId('ai-model-option-deep').click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(600)
  // Bounded and caught, once: the message is built whether or not the check
  // passes, and this trigger is a locator held in a variable — the shape rule
  // six could not see until it learnt to track locator variables.
  const tierAfterChoice = await trigger
    .getAttribute('data-tier', { timeout: 8000 })
    .catch(() => null)
  chk(
    tierAfterChoice === 'deep',
    'choosing a tier changes this conversation',
    `the composer read ${JSON.stringify(tierAfterChoice)} after Deep was chosen`,
  )
  chk(
    prefWrites.length === writesBeforeChoice,
    'and writes NOTHING — an idle experiment must not rewrite your default',
    `${prefWrites.length - writesBeforeChoice} preference writes left the browser on a bare selection`,
  )

  await trigger.click({ timeout: 8000 }).catch(() => {})
  await page.getByTestId('ai-model-set-preferred').click({ timeout: 8000 }).catch(() => {})
  const wrote = await waitUntil(() => prefWrites.length > writesBeforeChoice, { timeoutMs: 8_000 })
  chk(wrote, 'pressing "Set as my preferred model" sends a write',
    'no PUT to /ai/preferences ever left the browser')
  const lastWrite = prefWrites[prefWrites.length - 1]
  /*
   * THE REQUEST, NOT THE RENDER. A toast and a badge can both be produced by
   * client state alone; only the outgoing body proves the server was told.
   */
  chk(
    !!lastWrite && lastWrite.body.includes('"preferredTier":"deep"'),
    'carrying the chosen tier in its body',
    `the request body was ${JSON.stringify(lastWrite?.body ?? null)}`,
  )
  chk(
    !!lastWrite && lastWrite.url.includes(`workspaceId=${WS}`),
    'and this workspace in its query string — the preference is per workspace',
    `the request url was ${JSON.stringify(lastWrite?.url ?? null)}`,
  )

  console.log('\n▶ the check this row exists for: a SECOND browser')
  /*
   * A fresh context shares no localStorage, no sessionStorage and no cookies
   * with the first. If the picker opens on Fast here, the value came from the
   * server, because there is nowhere else it could have come from — and "fast"
   * is not `DEFAULT_TIER`, so a component ignoring the server could not produce
   * it either. This is the defect — `rundesk.aiTier` — stated as an assertion.
   *
   * The write is made over the API rather than reusing the browser's, so this
   * check measures the READ path and does not depend on the previous block
   * having landed.
   */
  await page.waitForTimeout(800)
  await setPref('fast')
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page2 = await ctx2.newPage()
  await openAiPage(page2)
  const secondTier = await page2
    .getByTestId('ai-model-tier')
    .getAttribute('data-tier', { timeout: 6000 })
    .catch(() => null)
  chk(
    secondTier === 'fast',
    'a browser that has never seen this account opens on the preferred tier',
    `the second browser read data-tier=${JSON.stringify(secondTier)} ` +
      '— the preference is still not following the person',
  )
  const legacyKey = await page2.evaluate(() => {
    try { return localStorage.getItem('rundesk.aiTier') } catch { return 'unreadable' }
  })
  chk(
    legacyKey === null,
    'and the old per-browser key is not being written any more',
    `localStorage still holds rundesk.aiTier=${JSON.stringify(legacyKey)} — ` +
      'two sources of truth for one setting, which is how they drift',
  )
  await page2.getByTestId('ai-model-tier').click({ timeout: 8000 }).catch(() => {})
  chk(
    (await page2.locator('[data-testid="ai-model-preferred-badge-fast"]').count()) === 1 &&
      (await page2.locator('[data-testid^="ai-model-preferred-badge-"]').count()) === 1,
    'with the Preferred badge on that row and on no other',
    `${await page2.locator('[data-testid^="ai-model-preferred-badge-"]').count()} rows claimed to be preferred`,
  )
  /*
   * This read led the condition, so nothing stood in front of it to
   * short-circuit: a missing button spent the full default timeout and threw,
   * taking the rest of the run with it. Bounded and caught, absence arrives as
   * null — and a null must FAIL this check, not be compared, so the test is
   * for `=== true` rather than for truthiness.
   */
  const setPreferredDisabled = await page2
    .getByTestId('ai-model-set-preferred')
    .isDisabled({ timeout: 8000 })
    .catch(() => null)
  chk(
    setPreferredDisabled === true,
    'and "Set as preferred" is spent, because it already is',
    'the button offers to set a preference that is already set',
  )
  await ctx2.close().catch(() => {})
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  /*
   * The preference is this account's real setting, not the suite's to keep.
   * There is no DELETE, so "never set" is restored by putting back whatever
   * was there; when nothing was, the default is restored, which is what an
   * unset preference resolves to anyway.
   */
  await api(prefRoute, { method: 'PUT', body: { preferredTier: originalPreference ?? 'deep' } })
  await ctx?.close().catch(() => {})
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
