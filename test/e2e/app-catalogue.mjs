/**
 * §V2-11 — THE APP CENTER, frame `19:07`.
 *
 * The frame draws App Center → Connections: a headline, a full-width
 * **Connect Custom MCP Servers** banner, twelve app tiles, a rail of fourteen
 * facets under an INTEGRATIONS heading, and one item under a second heading,
 * **AI → Suggest an app**. Four ledger rows live in that one screenshot, and
 * they share a single failure mode, which is what this suite is written
 * against:
 *
 *   A CONTROL THAT CANNOT DO THE THING IT OFFERS.
 *
 * It wears three costumes here.
 *
 *  1. **The tile you cannot press.** Six of the frame's apps had no card at
 *     all, and the cheapest way to add six is six `comingSoon: true` rows — a
 *     "Soon" badge over a switch and a button that are both greyed out. That
 *     photographs perfectly and cannot be acted on, so this suite measures the
 *     `disabled` property of every action button on the page and requires the
 *     count of disabled ones to be zero.
 *
 *  2. **The tab that promises a connection nobody can make.** `gmail` was a
 *     federated search source with its own tab in the command palette and a
 *     "Connect" link beside it, and `listSupportedProviders()` had never heard
 *     of it. The link led to a page with no way to connect Gmail. Now there is
 *     a provider, and the check is not "a provider is listed" but "the OAuth
 *     start builds a URL asking Google for the mailbox".
 *
 *  3. **The confident zero.** SharePoint was worse than Gmail, because it
 *     borrowed OneDrive's credential. A workspace with OneDrive connected saw
 *     the SharePoint tab report itself CONNECTED, over a token no code path
 *     queried and a grant (`Files.ReadWrite`) that cannot see a SharePoint site
 *     even if one did. The result was an empty list with nothing on screen to
 *     contradict it — and an empty list reads as "you have nothing there".
 *     Three checks below stage exactly that: OneDrive alone, SharePoint at the
 *     wrong scope, SharePoint at the right one.
 *
 * And a fourth, found while building and fixed in `entity-types.ts`: the
 * `?types=` whitelist knew `drive` and not `gmail` or `sharepoint`. A whitelist
 * DROPS what it does not recognise and `filters.types` is only assigned when
 * something survives, so choosing the Gmail tab ran an **unfiltered Rundesk
 * search** and presented your own tasks and docs as the contents of a mailbox.
 * Not an empty answer — a wrong one.
 *
 * Everything is staged in a workspace this run creates. The e2e database is
 * shared, and "the SharePoint source is unconnected" is a claim about stored
 * credentials: asserting it against the seeded workspace would be asserting it
 * about whatever another suite connected thirty seconds ago.
 *
 *   node test/e2e/app-catalogue.mjs --api 3011 --dist apps/web/dist
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

/**
 * "0 failed" is not "it ran". Compared with `!==`, never `<`: with `<`, a
 * branch that silently skipped turns into a shorter run that still passes, and
 * every one of the browser sections below is a branch that can skip.
 */
const EXPECTED_CHECKS = 25

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')
const TAG = `apc-${Date.now()}`

/** The six apps frame `19:07` draws that this page did not have. */
const FRAME_APPS = ['box', 'confluence', 'jira', 'gmail', 'sharepoint', 'outlook-mail']
/** Of those, the two Rundesk can genuinely connect — both federated sources. */
const CONNECTABLE = ['gmail', 'sharepoint']
/** And the four it cannot, which have to say so in words on the tile. */
const NOT_CONNECTABLE = ['box', 'confluence', 'jira', 'outlook-mail']

/** What SharePoint's query needs, and what OneDrive's grant carries instead. */
const SITES_SCOPE = 'Sites.Read.All'
const FILES_SCOPE = 'Files.ReadWrite'

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
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg ?? good))

const auth = await login(API, EMAIL, PASSWORD)
const api = apiClient(API, auth.accessToken)

let sql = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite stages OAuth grants directly')

  const ws = (await api('/workspaces', { method: 'POST', body: { name: `App Center ${TAG}` } })).data
  if (!ws?.id) throw new Error('could not create a workspace for this suite')
  console.log(`\x1b[2m  workspace ${ws.id}\x1b[0m`)

  /*
   * WRITTEN AS SQL, and this is the legitimate case for it. A connected grant
   * is produced by an OAuth callback carrying a signed `state` this suite
   * cannot forge, from a provider no test environment can reach. The
   * alternative is to skip the three checks that are the whole point of the
   * row, and a skipped check reads as a passing one.
   */
  const stageGrant = (provider, scopes) => sql`
    insert into workspace_integration_connections
      (workspace_id, provider, status, access_token, scopes)
    values (${ws.id}, ${provider}, 'connected', ${'tok-' + TAG}, ${scopes})
    on conflict (workspace_id, provider)
    do update set status = 'connected', access_token = excluded.access_token, scopes = excluded.scopes`
  const dropGrant = (provider) => sql`
    delete from workspace_integration_connections
    where workspace_id = ${ws.id} and provider = ${provider}`

  // ── 1 · the providers the frame's tabs promised ──────────────────────────
  console.log('\n▶ `19:07` the two apps whose tabs promised a connection')
  const providers = await api(`/workspaces/${ws.id}/integrations/connections/providers`)
  chk(
    providers.status === 200 && (providers.data ?? []).includes('gmail'),
    'Gmail is a provider a workspace can actually connect',
    `providers answered ${providers.status} with ${JSON.stringify(providers.data)} — ` +
      'the palette has shipped a Gmail tab and a "Connect" link the whole time',
  )
  chk(
    providers.status === 200 && (providers.data ?? []).includes('sharepoint'),
    'and so is SharePoint, in its own right rather than through OneDrive',
    `providers answered ${providers.status} with ${JSON.stringify(providers.data)}`,
  )
  /*
   * NOT "a provider is listed" — a name in an array is the cheapest possible
   * facade. The authorization URL is what a person is actually sent to, so the
   * check is that it is Google's, and that the consent it asks for is the one
   * that can read a mailbox.
   *
   * 201, NOT 200, AND THE NUMBER IS EXACT. `oauthStart` is a plain `@Post` with
   * no `@HttpCode`, and Nest answers 201 for those — which is the route's real
   * contract, not an accident to be tolerated. Both of these checks were
   * written against 200 and failed on their first run with the *right* URL and
   * the *right* scope printed in the failure line; the product was never wrong.
   * Pinned exactly rather than loosened to `< 300`, because "any success will
   * do" is how a route that quietly starts answering 204 with no body gets to
   * keep a green check.
   */
  const gmailStart = await api(
    `/workspaces/${ws.id}/integrations/connections/gmail/oauth/start`,
    { method: 'POST' },
  )
  const gmailUrl = gmailStart.data?.authUrl ?? ''
  const gmailScope = gmailUrl ? (new URL(gmailUrl).searchParams.get('scope') ?? '') : ''
  chk(
    gmailStart.status === 201 &&
      /accounts\.google\.com/.test(gmailUrl) &&
      gmailScope.includes('gmail.readonly'),
    'pressing Connect on Gmail asks Google for the mailbox itself',
    `oauth/start answered ${gmailStart.status}, url ${JSON.stringify(gmailUrl.slice(0, 120))}, ` +
      `scope ${JSON.stringify(gmailScope)}`,
  )
  const spStart = await api(
    `/workspaces/${ws.id}/integrations/connections/sharepoint/oauth/start`,
    { method: 'POST' },
  )
  const spUrl = spStart.data?.authUrl ?? ''
  const spScope = spUrl ? (new URL(spUrl).searchParams.get('scope') ?? '') : ''
  chk(
    spStart.status === 201 &&
      /login\.microsoftonline\.com/.test(spUrl) &&
      spScope.includes(SITES_SCOPE) &&
      !spScope.includes(FILES_SCOPE),
    `and SharePoint asks Microsoft for ${SITES_SCOPE}, not OneDrive's file scope`,
    `oauth/start answered ${spStart.status}, scope ${JSON.stringify(spScope)} — ` +
      `${FILES_SCOPE} reaches the signed-in user's own drive and no SharePoint site`,
  )

  // ── 2 · the confident zero, at the registry ──────────────────────────────
  console.log('\n▶ "connected" has to mean "can answer"')
  const sourcesNow = async () => {
    const res = await api(`/search/sources/${ws.id}`)
    return { status: res.status, byId: Object.fromEntries((res.data ?? []).map((s) => [s.id, s])) }
  }
  const clean = await sourcesNow()
  chk(
    clean.status === 200 && clean.byId.sharepoint?.provider === 'sharepoint',
    'the SharePoint source names its own credential',
    `sources answered ${clean.status} and SharePoint reported ` +
      `provider=${JSON.stringify(clean.byId.sharepoint?.provider)} — borrowing OneDrive's row is ` +
      'what let it claim to be connected over a token nothing could query',
  )

  await stageGrant('onedrive', [FILES_SCOPE])
  const withOneDrive = await sourcesNow()
  /*
   * `google-drive` is read alongside, and it is not decoration: it is the
   * control that proves the registry is still ANSWERING rather than having
   * been reduced to "everything is disconnected". Both halves in one check,
   * because a registry that always says false would satisfy either alone.
   */
  chk(
    withOneDrive.status === 200 &&
      withOneDrive.byId.sharepoint?.connected === false &&
      withOneDrive.byId.rundesk?.connected === true,
    'a connected OneDrive no longer makes SharePoint say it is connected',
    `with a live OneDrive grant staged, SharePoint reported ` +
      `connected=${withOneDrive.byId.sharepoint?.connected} and Rundesk itself ` +
      `connected=${withOneDrive.byId.rundesk?.connected}`,
  )

  await stageGrant('sharepoint', [FILES_SCOPE])
  const wrongScope = await sourcesNow()
  chk(
    wrongScope.status === 200 && wrongScope.byId.sharepoint?.connected === false,
    `and a SharePoint credential holding only ${FILES_SCOPE} reports itself unconnected`,
    `a grant that cannot answer the query reported connected=${wrongScope.byId.sharepoint?.connected} — ` +
      'which draws no notice, so the empty result reads as the truth about your files',
  )
  /*
   * THE MIRROR OF THE CHECK ABOVE, and it is not optional. "Reports itself
   * unconnected" is satisfied by a registry that has been broken into always
   * saying false, which would be a different bug wearing this suite's green.
   */
  await stageGrant('sharepoint', [SITES_SCOPE])
  const rightScope = await sourcesNow()
  chk(
    rightScope.status === 200 && rightScope.byId.sharepoint?.connected === true,
    `while the same credential holding ${SITES_SCOPE} reports itself connected`,
    `a grant that CAN answer reported connected=${rightScope.byId.sharepoint?.connected} — ` +
      'the scope check has been turned into a constant "no"',
  )

  // ── 3 · the type filter the controller used to discard ───────────────────
  console.log('\n▶ scoping to Gmail must not quietly search Rundesk instead')
  const DOC_TITLE = `Catalogue note ${TAG}`
  const madeDoc = await api(`/workspaces/${ws.id}/docs`, { method: 'POST', body: { title: DOC_TITLE } })
  if (madeDoc.status >= 300) throw new Error(`could not create the fixture doc: ${madeDoc.status}`)
  const searchFor = async (query) => {
    const res = await api(`/search/${ws.id}?${query}`)
    return { status: res.status, hits: res.data ?? [] }
  }
  /*
   * The positive half FIRST, and waited for rather than sampled: with Meili
   * enabled the doc reaches the index a moment after the POST returns, and a
   * suite that asks too early would conclude the term matches nothing — which
   * would make the negative check below pass over an empty database instead of
   * over a working filter.
   */
  let unscoped = { status: 0, hits: [] }
  const unscopedFound = await waitUntil(
    async () => {
      unscoped = await searchFor(`q=${encodeURIComponent(TAG)}&limit=25`)
      return unscoped.status === 200 && unscoped.hits.some((h) => h.title === DOC_TITLE)
    },
    { timeoutMs: 15000 },
  )
  chk(
    unscopedFound,
    'an unscoped search finds this run’s own document',
    `searching for ${TAG} answered ${unscoped.status} with ` +
      `${unscoped.hits.length} hits and none titled ${JSON.stringify(DOC_TITLE)}`,
  )
  const scoped = await searchFor(`q=${encodeURIComponent(TAG)}&types=gmail&limit=25`)
  chk(
    unscopedFound && scoped.status === 200 && scoped.hits.length === 0,
    'and scoping it to Gmail returns nothing rather than everything',
    `?types=gmail answered ${scoped.status} with ${scoped.hits.length} hits ` +
      `(${JSON.stringify(scoped.hits.slice(0, 3).map((h) => h.entityType))}) — an unrecognised type ` +
      'is dropped from the whitelist, and a dropped filter is an unfiltered search',
  )

  // ── 4 · the catalogue, on screen ─────────────────────────────────────────
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
    // The tiles' state comes from the providers request; waiting for a tile
    // that only a connectable app can draw is waiting for that answer rather
    // than for a number of milliseconds.
    await waitUntil(
      () => page.locator('[data-testid="integration-card"][data-provider="gmail"]').count().then((n) => n === 1),
      { timeoutMs: 20_000 },
    )
  }
  const tile = (id) => page.locator(`[data-testid="integration-card"][data-provider="${id}"]`)

  console.log('\n▶ `19:07` the six apps the frame draws')
  await openIntegrations()
  /*
   * A TESTID PREFIX IS A NAMESPACE. The rail gained two heading labels and a
   * "Suggest an app" button in this change, and the frame's facet count is what
   * `integration-error-card` counts with a prefix query. Re-asserted here so
   * that dropping a new control into `integrations-category-*` reddens the
   * suite that introduced it, not only somebody else's.
   */
  const facetCount = await page.locator('[data-testid^="integrations-category-"]').count()
  chk(
    facetCount === 14,
    'the rail still holds exactly the fourteen facets the frame names',
    `${facetCount} elements carry the integrations-category- prefix — the AI group's ` +
      'controls must live outside it or every facet count in the repo changes',
  )
  const missingTiles = []
  for (const id of FRAME_APPS) {
    if ((await tile(id).count()) !== 1) missingTiles.push(id)
  }
  chk(
    missingTiles.length === 0,
    'and each of Box, Confluence, Jira, Gmail, SharePoint and Outlook Mail has a tile',
    `no tile for ${JSON.stringify(missingTiles)}`,
  )

  /*
   * THE CHECK THE WHOLE ROW TURNS ON. Read off the DOM property, not off an
   * attribute this page sets: a tile that renders `data-actionable="yes"` over
   * a `disabled` button would pass an attribute check and fail a person.
   */
  const actionState = await page.$$eval('[data-testid="integration-card"]', (cards) =>
    cards.map((card) => {
      const button = card.querySelector('[data-testid="integration-action"]')
      return {
        provider: card.getAttribute('data-provider'),
        hasButton: !!button,
        disabled: button ? button.disabled === true : true,
      }
    }),
  )
  const dead = actionState.filter((s) => !s.hasButton || s.disabled).map((s) => s.provider)
  chk(
    actionState.length > 0 && dead.length === 0,
    `every one of the ${actionState.length} tiles offered can be acted on`,
    `${actionState.length} tiles, of which ${dead.length} offer nothing that can be pressed: ` +
      `${JSON.stringify(dead)} — a "Soon" badge over a greyed switch is a tile you cannot use`,
  )

  const unexplained = []
  const overExplained = []
  for (const id of NOT_CONNECTABLE) {
    if ((await tile(id).locator('[data-testid="integration-not-connectable"]').count()) !== 1) {
      unexplained.push(id)
    }
  }
  for (const id of CONNECTABLE) {
    if ((await tile(id).locator('[data-testid="integration-not-connectable"]').count()) !== 0) {
      overExplained.push(id)
    }
  }
  chk(
    unexplained.length === 0 && overExplained.length === 0,
    'an app Rundesk cannot connect says so in words, and one it can does not',
    `no explanation on ${JSON.stringify(unexplained)}; a stale one on ${JSON.stringify(overExplained)}`,
  )

  /*
   * And the other half of that sentence: "connectable" has to mean the connect
   * flow opens. Asserted through the dialog the button actually opens, keyed on
   * the provider it was opened for — a dialog that opened for the wrong app
   * would otherwise read as a pass.
   */
  await tile('gmail').getByTestId('integration-action').click()
  const dialogOpened = await waitUntil(
    () => page.locator('[data-testid="integration-connect-dialog"][data-provider="gmail"]').count().then((n) => n === 1),
    { timeoutMs: 10_000 },
  )
  chk(
    dialogOpened,
    'and pressing Connect on Gmail opens the connect flow for Gmail',
    'the Gmail tile’s button opened no connect dialog — it is still offering "Request access"',
  )
  await page.getByTestId('integration-connect-cancel').click().catch(() => {})
  // Waited out rather than slept on: a dialog still closing sits over the grid,
  // and the click below would land on the overlay and report a locator problem
  // about a tile that is perfectly fine.
  await waitUntil(
    () => page.locator('[data-testid="integration-connect-dialog"]').count().then((n) => n === 0),
    { timeoutMs: 10_000 },
  )

  /*
   * A request that reaches the server, read back through a FRESH API call
   * rather than off the page. `apps/web/src/lib/query.ts` holds a query for
   * thirty seconds, so re-reading the list in the browser could answer from
   * cache and report a write that never happened.
   */
  console.log('\n▶ a tile that cannot be connected still does something')
  await tile('box').getByTestId('integration-action').click()
  let boxRequested = false
  await waitUntil(async () => {
    const rows = await api(`/workspaces/${ws.id}/integrations/connections/access-requests`)
    boxRequested = rows.status === 200 && (rows.data ?? []).some((r) => r.provider === 'box')
    return boxRequested
  }, { timeoutMs: 10_000 })
  chk(
    boxRequested,
    'pressing it records the ask against this workspace',
    'the Box tile’s button left no access request on the server — it is a dead control',
  )

  // ── 5 · the rail's AI group ──────────────────────────────────────────────
  console.log('\n▶ `19:07` the rail’s second heading: AI → Suggest an app')
  await openIntegrations()
  const railOk =
    (await page.getByTestId('integrations-rail-heading-ai').count()) === 1 &&
    (await page.getByTestId('integrations-rail-heading-integrations').count()) === 1 &&
    (await page.getByTestId('integrations-suggest-app').count()) === 1
  chk(
    railOk && (await page.locator('[data-testid^="integrations-category-"]').count()) === 14,
    '"Suggest an app" sits under its own AI heading, not among the facets',
    'the AI group is missing, or its control was filed as a fifteenth facet — the frame ' +
      'draws two headings and the item under the second one filters nothing',
  )

  const SUGGESTION = `Airtable ${TAG}`
  await page.getByTestId('integrations-suggest-app').click()
  await page.waitForSelector('[data-testid="integrations-suggest-dialog"]', { timeout: 10_000 })
  await page.getByTestId('integrations-suggest-name').fill(SUGGESTION)
  await page.getByTestId('integrations-suggest-note').fill(`Wanted by ${TAG}`)
  await page.getByTestId('integrations-suggest-submit').click()
  let suggestionStored = null
  await waitUntil(async () => {
    const rows = await api(`/workspaces/${ws.id}/integrations/connections/access-requests`)
    suggestionStored = rows.status === 200
      ? (rows.data ?? []).find((r) => r.provider === SUGGESTION)
      : null
    return !!suggestionStored
  }, { timeoutMs: 10_000 })
  chk(
    !!suggestionStored && suggestionStored.note === `Wanted by ${TAG}`,
    'a suggestion reaches the server under the name that was typed, note and all',
    `the server holds ${JSON.stringify(suggestionStored)} for ${JSON.stringify(SUGGESTION)}`,
  )

  /*
   * THE REFUSAL, ASSERTED ON ITS WORDS. A 400 here can come from two different
   * mechanisms — this service's own length check, or Postgres, whose "value is
   * too long" is mapped to 400 by `all-exceptions.filter.ts` — so a check on
   * the status could not tell a working guard from a database complaining. The
   * sentence is the only thing that can.
   */
  /*
   * REOPENED, because a successful suggestion closes the dialog — which is the
   * right behaviour and would have made the next two lines type into nothing.
   */
  await page.getByTestId('integrations-suggest-app').click()
  await page.waitForSelector('[data-testid="integrations-suggest-dialog"]', { timeout: 10_000 })
  await page.getByTestId('integrations-suggest-name').fill('X'.repeat(81))
  await page.getByTestId('integrations-suggest-submit').click()
  const refusal = await readText(page.getByTestId('integrations-suggest-error'), { timeoutMs: 10_000 })
  chk(
    /80 characters at most/i.test(refusal),
    'and an over-long name is refused in the service’s own words',
    `the dialog said ${JSON.stringify(refusal)} — a name with no bound reaches a text column ` +
      'and every admin’s notification title',
  )
  await page.getByTestId('integrations-suggest-cancel').click().catch(() => {})

  // ── 6 · the Connect Custom MCP Servers banner ────────────────────────────
  console.log('\n▶ `19:07` the Connect Custom MCP Servers banner')
  await openIntegrations()
  const mcpTitle = await readText(page.getByTestId('integrations-mcp-title'))
  const mcpSubtitle = await readText(page.getByTestId('integrations-mcp-subtitle'))
  chk(
    /connect custom mcp servers/i.test(mcpTitle) && /any tool or data source/i.test(mcpSubtitle),
    'the banner carries the frame’s own two lines',
    `the banner read ${JSON.stringify(mcpTitle)} / ${JSON.stringify(mcpSubtitle)}`,
  )
  await page.getByTestId('integrations-mcp-banner').click()
  await page.waitForSelector('[data-testid="integrations-mcp-dialog"]', { timeout: 10_000 }).catch(() => {})
  const limitation = await readText(page.getByTestId('integrations-mcp-limitation'))
  chk(
    limitation.length > 0 && /cannot call an external tool yet/i.test(limitation),
    'it opens, and says plainly what the AI cannot do yet',
    `the panel said ${JSON.stringify(limitation)} — a URL field over an assistant that ` +
      'can call nothing would store rows as evidence for a feature that does not exist',
  )
  await page.getByTestId('integrations-mcp-request').click()
  let mcpRequested = false
  await waitUntil(async () => {
    const rows = await api(`/workspaces/${ws.id}/integrations/connections/access-requests`)
    mcpRequested = rows.status === 200 && (rows.data ?? []).some((r) => r.provider === 'custom-mcp')
    return mcpRequested
  }, { timeoutMs: 10_000 })
  chk(
    mcpRequested,
    'and its one action records the ask, so the banner is not a chevron to nowhere',
    'the banner’s button left nothing on the server',
  )

  // ── 7 · a source that cannot answer says so, on screen ───────────────────
  console.log('\n▶ `01:12` silence is a wrong answer wearing a right one’s clothes')
  const openPalette = async () => {
    /*
     * A FRESH PAGE, not a re-render. The palette's source strip comes from a
     * React Query key held for thirty seconds; staging a credential and then
     * reopening the palette in the same document could be answered from cache.
     * A navigation builds a new client, so the miss is by construction rather
     * than by waiting long enough.
     */
    await page.goto(`${B}/app/${ws.id}/integrations`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="integrations-page"]', { timeout: 25_000 })
    await page.keyboard.press('Control+k')
    await page.getByTestId('palette-sources').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  }
  await dropGrant('sharepoint')
  await dropGrant('onedrive')
  await openPalette()
  const gmailTab = page.getByTestId('palette-source-gmail')
  await gmailTab.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  const gmailTabThere = await gmailTab.isVisible().catch(() => false)
  chk(
    gmailTabThere,
    'the palette offers a Gmail tab in this workspace',
    'no Gmail tab under the query — the sources request did not answer',
  )
  if (gmailTabThere) await gmailTab.click()
  const notice = page.getByTestId('palette-source-disconnected')
  await notice.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  chk(
    gmailTabThere && (await notice.isVisible().catch(() => false)),
    'and choosing it says it is not connected instead of drawing an empty result',
    'an unconnected source answered with silence, which reads as "you have nothing there"',
  )

  /*
   * THE CONFIDENT ZERO, ON SCREEN. A live SharePoint credential at the scope
   * that cannot answer the query: before this row that state reported CONNECTED
   * and showed an empty list with nothing to explain it.
   */
  await stageGrant('sharepoint', [FILES_SCOPE])
  await openPalette()
  const spTab = page.getByTestId('palette-source-sharepoint')
  await spTab.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  const spTabThere = await spTab.isVisible().catch(() => false)
  if (spTabThere) await spTab.click()
  const spNotice = page.getByTestId('palette-source-disconnected')
  await spNotice.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  chk(
    spTabThere && (await spNotice.isVisible().catch(() => false)),
    'and a SharePoint credential that cannot answer the query says the same',
    `SharePoint tab present=${spTabThere}; a grant holding only ${FILES_SCOPE} drew no notice, ` +
      'so its permanently-empty result reads as the truth about your files',
  )

  await ctx.close()
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (sql) {
    // The workspace, and the connection + access-request rows it cascades to.
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
