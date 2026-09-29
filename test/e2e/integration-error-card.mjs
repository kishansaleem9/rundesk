/**
 * §V2-11 — THE INTEGRATION ERROR CARD, frame `18:39`.
 *
 * Zoomed, the card in the frame reads in full:
 *
 *   ✕ We couldn't connect your Google account.
 *     Google gave us this error: OAuth authentication timed out. Please try
 *     again. If it keeps happening, try checking your permissions — that often
 *     does the trick.
 *     [ Help center article ]
 *
 * TWO THINGS ARE BEING CHECKED, and the smaller one is the link.
 *
 * The load-bearing clause is "Google gave us this error: …". Rundesk could say
 * that something had failed and nothing more: the only failure text in the
 * product was `?oauth=error&reason=` on a redirect — one page load long,
 * belonging to no particular integration, and (a defect found while building
 * this) pointed at `/app` while the banner that reads it lives on
 * `/app/:workspaceId/integrations`. `last_error` is the column that fixes
 * that, and this suite is about whether the card is really reading it.
 *
 * THE FACADE THIS IS WRITTEN AGAINST. A card that renders a constant string
 * passes every "an error card appeared" assertion ever written, and demos
 * perfectly. So the check is not that a card appears: it is that TWO
 * integrations failing for TWO different reasons produce TWO different
 * sentences, each on its own tile, and that clearing one takes exactly that
 * one away.
 *
 *   node test/e2e/integration-error-card.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'

const chromium = await resolveChromium()
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure. */
/*
 * 24 → 25. §V2-11's App Center row moved from nine facets to the fourteen
 * frame `19:07` draws, so the chip-count assertion below changed its number
 * (9 → 14) and one check was ADDED: every facet has to be able to return
 * something. The other twenty-four are untouched.
 */
const EXPECTED_CHECKS = 25

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')
const TAG = `iec-${Date.now()}`

/*
 * The provider's own words, tagged, and DIFFERENT from each other. The tag is
 * what narrows every assertion below to this run's rows on a shared database;
 * the difference between them is what tells a real reader from a constant.
 */
const GCAL_ERROR = `OAuth authentication timed out. Please try again [${TAG}]`
const GITHUB_ERROR = `The token was revoked by the organisation owner [${TAG}]`

let stack = null
let B = (process.env.BASE ?? '').replace(/\/$/, '')
if (!B) {
  stack = await startLocalStack({
    dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')),
    apiPort: Number(argOf('--api', process.env.E2E_API_PORT ?? 3011)),
  })
  B = stack.base
}
const API = `${B}/api/v1`

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
// THE SENTENCE, THEN THE REASON: a failing check that printed only its reason
// named no check `check-break-reddened.mjs` could find when the reason was
// built from the run (`found-29-sep/failing-checks-print-only-their-reason`).
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg && badMsg !== good ? `${good} \u2014 ${badMsg}` : good))

const auth = await login(API, EMAIL, PASSWORD)
const api = apiClient(API, auth.accessToken)

let sql = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite stages provider failures directly')

  /*
   * A workspace of this suite's own. The integrations page shows every tile in
   * the workspace you are looking at, so staging a failure in the shared
   * seeded workspace would put a red card in front of every other suite that
   * happens to open that page — and would make "exactly one card" a claim
   * about everybody else's rows.
   */
  const ws = (await api('/workspaces', { method: 'POST', body: { name: `Integrations ${TAG}` } })).data
  if (!ws?.id) throw new Error('could not create a workspace for this suite')
  console.log(`\x1b[2m  workspace ${ws.id}\x1b[0m`)

  /*
   * WRITTEN AS SQL, and this is the legitimate case for it: `last_error` has
   * no endpoint that writes it. It is written by the OAuth callback's failure
   * path, from a signed `state` this suite cannot forge, against a provider
   * that is not reachable from a test environment. The alternative is to skip
   * the row entirely, and a skipped check reads as a passing one.
   */
  const stageFailure = (provider, message) => sql`
    insert into workspace_integration_connections (workspace_id, provider, status, last_error, last_error_at)
    values (${ws.id}, ${provider}, 'disconnected', ${message}, now())
    on conflict (workspace_id, provider)
    do update set last_error = excluded.last_error, last_error_at = excluded.last_error_at`
  const clearFailure = (provider) => sql`
    update workspace_integration_connections set last_error = null, last_error_at = null
    where workspace_id = ${ws.id} and provider = ${provider}`

  await stageFailure('gcal', GCAL_ERROR)

  console.log('\n▶ the stored failure reaches the client verbatim')
  const conns = await api(`/workspaces/${ws.id}/integrations/connections`)
  chk(conns.status === 200, 'the connections endpoint answers',
    `GET …/integrations/connections returned ${conns.status}`)
  const gcalRow = (conns.data ?? []).find((r) => r.provider === 'gcal')
  chk(
    gcalRow?.lastError === GCAL_ERROR,
    'and carries the provider’s own message, unedited',
    `the row reported lastError=${JSON.stringify(gcalRow?.lastError)} — expected ${JSON.stringify(GCAL_ERROR)}`,
  )
  chk(!!gcalRow?.lastErrorAt, 'along with when it happened',
    'lastErrorAt came back empty — the card cannot say when, and a stale error reads as a current one')

  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})

  const openIntegrations = async () => {
    await page.goto(`${B}/app/${ws.id}/integrations`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="integrations-page"]', { timeout: 25_000 })
    await page.waitForTimeout(1400)
  }
  const cards = () => page.locator('[data-testid="integration-error-card"]')
  const cardFor = (provider) => page.locator(`[data-testid="integration-error-card"][data-provider="${provider}"]`)

  console.log('\n▶ the page is addressable at all — it had NO data-testid anywhere')
  await openIntegrations()
  chk(
    await page.getByTestId('integrations-search').count() === 1,
    'the search box can be reached by name',
    'the integrations search input is still unaddressable',
  )
  /*
   * FOURTEEN, not the nine this asserted when it was written. Frame `19:07`
   * draws the App Center's facet rail in full — All Apps · Featured ·
   * Analytics · Calendars · Cloud Storage · Communication · Connected Search ·
   * CRM & Support · Design · Development · Email · Finance & Accounting ·
   * Knowledge Base · Time Tracking — and the page shipped nine of them, two of
   * which ("Installed", "AI") are not facets in the frame at all. The rail is
   * now derived from the frame's list filtered to the facets that match at
   * least one app, so this number also fails if a facet ever loses its last
   * integration and becomes a chip that can only empty the grid.
   */
  chk(
    await page.locator('[data-testid^="integrations-category-"]').count() === 14,
    'and so is every one of the fourteen category chips frame `19:07` draws',
    `${await page.locator('[data-testid^="integrations-category-"]').count()} of 14 category chips were addressable`,
  )
  const tiles = await page.locator('[data-testid="integration-card"]').count()
  chk(tiles > 0, 'every integration tile is addressable',
    'no integration tile carries a testid — nothing on this page can be asserted')
  // `tiles > 0` is repeated on purpose: with the tile testid removed every
  // count below becomes 0 and `0 === 0` would pass on a page where nothing is
  // addressable at all — which is the state this row was opened over.
  chk(
    tiles > 0 &&
      await page.locator('[data-testid="integration-card"] [data-testid="integration-toggle"]').count() === tiles &&
      await page.locator('[data-testid="integration-card"] [data-testid="integration-action"]').count() === tiles,
    'with its switch and its button, one of each per tile',
    `${tiles} tiles, ${await page.locator('[data-testid="integration-toggle"]').count()} switches, ` +
      `${await page.locator('[data-testid="integration-action"]').count()} buttons`,
  )

  /*
   * A FACET WITH NOTHING BEHIND IT IS A CHECKBOX THAT CAN ONLY EMPTY THE GRID.
   * Seven facets were added to reach the fourteen frame `19:07` draws, and the
   * cheap way to do that is to name them and leave five of them matching no
   * app at all — which demos perfectly, because nobody clicks every chip.
   * So every chip is clicked and the grid has to still hold something.
   */
  const facetIds = await page.$$eval('[data-testid^="integrations-category-"]', (els) =>
    els.map((el) => el.getAttribute('data-testid')),
  )
  const empties = []
  for (const id of facetIds) {
    await page.locator(`[data-testid="${id}"]`).click()
    const held = await waitUntil(
      () => page.locator('[data-testid="integration-card"]').count().then((n) => n > 0),
      { timeoutMs: 4000 },
    )
    if (!held) empties.push(id)
  }
  chk(
    facetIds.length === 14 && empties.length === 0,
    'and every one of them can return something — no chip that only empties the grid',
    `${empties.length} of ${facetIds.length} facets matched no app at all: ${JSON.stringify(empties)}`,
  )
  // Back to a clean page: the checks below read the gcal tile, which is not in
  // whichever facet the loop above finished on.
  await openIntegrations()

  console.log('\n▶ `18:39` the card, on the integration it belongs to')
  chk(
    await waitUntil(() => cardFor('gcal').count().then((n) => n === 1), { timeoutMs: 10_000 }),
    'the failing integration draws an error card',
    'no error card on the tile whose connection carries a stored failure',
  )
  chk(
    await cards().count() === 1,
    'and only that one — the healthy tiles stay quiet',
    `${await cards().count()} error cards were drawn for one stored failure`,
  )
  const title = await readText(cardFor('gcal').getByTestId('integration-error-title'))
  chk(
    /Google Calendar/.test(title) && /connect/i.test(title),
    'the card names the account it could not connect',
    `the title read ${JSON.stringify(title)}`,
  )
  const body = await readText(cardFor('gcal').getByTestId('integration-error-body'))
  /*
   * THE CHECK THE WHOLE ROW IS FOR. Not "a body is present": the body has to
   * contain the exact sentence this run stored, tag and all.
   */
  chk(
    body.includes(GCAL_ERROR),
    'and quotes THIS failure’s own words',
    `the body read ${JSON.stringify(body)} — expected it to contain ${JSON.stringify(GCAL_ERROR)}`,
  )
  chk(
    /gave us this error/i.test(body),
    'framed as the provider speaking, as the frame words it',
    `the body read ${JSON.stringify(body)}`,
  )
  chk(
    (await readText(cardFor('gcal').getByTestId('integration-error-when'))).length > 0,
    'and says when it last failed',
    'the card gave no date, so a failure from last month reads as one from this morning',
  )

  console.log('\n▶ the Help-centre link the frame adds')
  const help = cardFor('gcal').getByTestId('integration-error-help')
  chk(await help.count() === 1, 'the card offers a help article',
    'no help link on the error card — the frame draws one under the message')
  chk(
    (await help.getAttribute('href').catch(() => null)) === '/app/help',
    'pointing at the help page',
    `the link pointed at ${JSON.stringify(await help.getAttribute('href').catch(() => null))}`,
  )
  // `integration-error-card-4-no-help-link` removes the link, so reading and
  // clicking it both waited out the default timeout and ended the run at 16 of 25.
  await help.click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1500)
  chk(
    /\/app\/help$/.test(page.url()) && (await page.locator('[data-testid^="book-call-"]').count()) > 0,
    'and it actually lands on a help page that renders',
    `following the link reached ${page.url()} with ` +
      `${await page.locator('[data-testid^="book-call-"]').count()} help controls on screen`,
  )

  console.log('\n▶ a second failure, with different words — the anti-facade check')
  await stageFailure('github', GITHUB_ERROR)
  await openIntegrations()
  chk(
    await waitUntil(() => cards().count().then((n) => n === 2), { timeoutMs: 10_000 }),
    'two failing integrations draw two cards',
    `${await cards().count()} cards for two stored failures`,
  )
  const githubBody = await readText(cardFor('github').getByTestId('integration-error-body'))
  chk(
    githubBody.includes(GITHUB_ERROR) && !githubBody.includes(GCAL_ERROR),
    'the second card says the SECOND provider’s error and not the first’s',
    `GitHub's card read ${JSON.stringify(githubBody)}`,
  )
  const gcalBodyAgain = await readText(cardFor('gcal').getByTestId('integration-error-body'))
  chk(
    gcalBodyAgain.includes(GCAL_ERROR) && !gcalBodyAgain.includes(GITHUB_ERROR),
    'and the first still says its own',
    `Google Calendar's card read ${JSON.stringify(gcalBodyAgain)}`,
  )
  chk(
    /GitHub/.test(await readText(cardFor('github').getByTestId('integration-error-title'))),
    'each card is titled for its own integration',
    `the GitHub card was titled ${JSON.stringify(await readText(cardFor('github').getByTestId('integration-error-title')))}`,
  )

  console.log('\n▶ clearing the stored error takes the card away — and only that card')
  await clearFailure('gcal')
  const clearedRows = await api(`/workspaces/${ws.id}/integrations/connections`)
  /*
   * The ROW has to be found first. `rows.find(…)?.lastError == null` is true
   * when the request 404'd and there is no row at all — a check that passes
   * because nothing came back is the oldest vacuous pass there is.
   */
  const clearedGcal = (clearedRows.data ?? []).find((r) => r.provider === 'gcal')
  chk(
    clearedRows.status === 200 && !!clearedGcal && clearedGcal.lastError == null,
    'the server stops reporting the cleared failure',
    `status ${clearedRows.status}, row ${clearedGcal ? 'found' : 'MISSING'}, ` +
      `lastError still ${JSON.stringify(clearedGcal?.lastError)}`,
  )
  await openIntegrations()
  chk(
    await waitUntil(() => cardFor('gcal').count().then((n) => n === 0), { timeoutMs: 10_000 }),
    'and the card is gone from the page',
    'the error card outlived the error it was reporting — it is rendering something other than last_error',
  )
  chk(
    await cardFor('github').count() === 1,
    'while the integration that is still broken still says so',
    'clearing one integration’s error removed the other one’s card too',
  )
  await clearFailure('github')
  await openIntegrations()
  chk(
    await waitUntil(() => cards().count().then((n) => n === 0), { timeoutMs: 10_000 }),
    'clearing the last one leaves the page with no error cards at all',
    `${await cards().count()} error cards survived with nothing stored behind them`,
  )

  await ctx.close()
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (sql) {
    // The workspace, and the connection rows it cascades to.
    await sql`delete from workspaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await stack?.close?.()
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
process.exit(failed() ? 1 : 0)
