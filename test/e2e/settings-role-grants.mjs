/**
 * A ROLE'S GRANT IS REACHABLE WHERE IT IS USED, AND NOTHING IS OFFERED THAT BOUNCES.
 *
 * NOT A FRAME ROW: the last open half of
 * `product-siblings/custom-role-permissions-unread-by-web`. The API honours
 * `webhook.manage`, `sso.manage` and `integrations.manage` from a custom role;
 * the web never let the holder reach them. Workspace settings admitted admins
 * only, Slack's routes asked for a workspace admin rather than the key the
 * catalog files Slack under, and the App Center offered every member a Connect
 * switch that the connect route refused. The other way round, the avatar menu
 * and the palette offered Workspace settings to every member, and the route
 * sent them back to the start.
 *
 * ClickUp (help centre, search snippets; the pages cannot be fetched here): a
 * workspace-level connection is managed by owners and admins, or a role given
 * the permission, and a member without it finds the connect option unavailable.
 *
 * Roles are made and granted through the API as the admin; every write is read
 * back by SQL beside the same write refused to someone it is not theirs to make.
 *
 *   node test/e2e/settings-role-grants.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 6

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `srg${stamp}`
const SLACK_URL = `https://hooks.slack.com/services/T${stamp}/B${stamp}/srg`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — every write is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id

  const person = async (who, role = 'member') => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const password = 'Granted@12345!'
    const signed = await signUpApi(API, {
      fullName: `Granted ${who}`, email, password,
      organizationName: `Granted ${who} ${stamp}`, organizationSlug: `granted-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${who}: ${added.status}`)
    return { id: signed.user?.id, email, password, as: apiAs(signed.accessToken) }
  }
  const grant = async (who, key) => {
    const role = await A(`/workspaces/${WS}/roles`, { method: 'POST', body: { name: `${TAG} ${key}`, permissions: [key] } })
    if (role.status >= 300 || !role.data?.id) throw new Error(`could not make the ${key} role: ${role.status}`)
    const row = ((await A(`/workspaces/${WS}/members`)).data ?? []).find((m) => (m.userId ?? m.user?.id) === who.id)
    const granted = row ? await A(`/workspaces/${WS}/members/${row.workspaceMemberId}/roles/${role.data.id}`, { method: 'POST', body: {} }) : { status: 0 }
    if (granted.status >= 300) throw new Error(`could not grant ${key}: ${granted.status}`)
  }
  const plain = await person('plain')
  const hooker = await person('hooker')
  const ssoer = await person('ssoer')
  const connector = await person('connector')
  // A guest: Settings opens to every member but a guest, so a gate that offers
  // it to everyone shows here.
  const guest = await person('guest', 'guest')
  await grant(hooker, 'webhook.manage')
  await grant(ssoer, 'sso.manage')
  await grant(connector, 'integrations.manage')
  // Both members' docks carry Settings by their own choice, so the dock's answer
  // is the gate's alone: the plain member's choice must be filtered out.
  for (const who of [plain, hooker, guest]) {
    const dock = await who.as(`/dashboards/dock/${WS}`, { method: 'POST', body: { pinnedLinks: ['home', 'settings'] } })
    if (dock.status >= 300) throw new Error(`could not arrange the dock: ${dock.status}`)
  }

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const signIn = async (who) => {
    const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 }, serviceWorkers: 'block' })).newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', who.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return page
  }
  /** Whether the avatar menu offers "Workspace settings", once the menu has drawn. */
  const menuOffers = async (page) => {
    await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('user-menu').click({ timeout: 20_000 }).catch(() => {})
    await page.getByRole('menuitem', { name: /Account settings/i }).waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(1500)
    const n = await page.getByRole('menuitem', { name: /^Workspace settings$/ }).count()
    await page.keyboard.press('Escape').catch(() => {})
    return n
  }
  /**
   * The sidebar's ways into Settings: the dock's tool, the browse list's link
   * (together, every link to its address while the sidebar is open), the
   * switcher's shortcut, and — collapsed — the rail's entry.
   */
  const sidebarOffers = async (page) => {
    await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
    const toggle = page.getByTestId('sidebar-toggle').first()
    await toggle.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(2000)
    const open = {
      dock: await page.getByTestId('dock-tool-settings').count(),
      links: await page.locator(`a[href="/app/${WS}/settings"]`).count(),
      switcher: await page.getByTestId('switcher-settings').count(),
    }
    await toggle.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(1200)
    const rail = await page.getByTestId('rail-settings').count()
    await page.getByTestId('sidebar-toggle').first().click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(600)
    return { ...open, rail }
  }
  /** Whether the palette's command mode offers Settings. */
  const paletteOffers = async (page) => {
    await page.goto(`${B}/app/${WS}/inbox`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('user-menu').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(1500)
    await page.keyboard.press('Control+k')
    const input = page.locator('[cmdk-input]').first()
    await input.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
    await input.fill('/sett').catch(() => {})
    await page.waitForTimeout(1200)
    const n = await page.locator('[cmdk-item]').filter({ hasText: /^\s*Settings\s*$/ }).count()
    await page.keyboard.press('Escape').catch(() => {})
    return n
  }
  /**
   * THIS PERSON'S KEYS ANSWERING — `GET /roles/me/permissions`, which settings'
   * tabs and the Integrations cards are drawn from. Registered BEFORE the
   * navigation it is for, so the answer cannot slip past; bounded, and it
   * resolves either way, leaving the checks to judge whatever is on screen.
   */
  const keysAnswered = (page) =>
    page
      .waitForResponse((r) => r.url().includes(`/workspaces/${WS}/roles/me/permissions`) && r.ok(), { timeout: 30_000 })
      .then((r) => r.finished())
      .catch(() => null)
  /**
   * Where the settings address leaves this person, and the tabs it shows them —
   * read once THEIR KEYS HAVE ANSWERED. The route asks for them before it draws
   * a tab or sends anybody away, so the tabs are read after that answer and
   * after the strip is drawn (or the address has left settings), not three
   * fixed seconds after landing: under a sweep's load the integrations holder's
   * tabs were read before their grants had loaded
   * (`found-24-sep/three-suites-fail-under-a-full-sweep`). Both waits are
   * bounded, and whatever is on screen when they end is what the checks judge.
   */
  const settingsAt = async (page) => {
    const keys = keysAnswered(page)
    await page.goto(`${B}/app/${WS}/settings`, { waitUntil: 'domcontentloaded' })
    await keys
    await waitUntil(
      async () =>
        !new URL(page.url()).pathname.endsWith('/settings') ||
        (await page.locator('[data-testid^="settings-tab-"]').count()) > 0,
      { timeoutMs: 20_000 },
    )
    const url = new URL(page.url())
    const tabs = await page.locator('[data-testid^="settings-tab-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('settings-tab-', '')))
    return { path: url.pathname, tab: url.searchParams.get('tab'), tabs }
  }

  // ══ 1. THE WAY IN ════════════════════════════════════════════════════════
  console.log('\n▶ Workspace settings, offered and opened: a plain member, and the member a role grants webhooks')
  const pPage = await signIn(plain)
  const pMenu = await menuOffers(pPage)
  const pPalette = await paletteOffers(pPage)
  const pSide = await sidebarOffers(pPage)
  const pAt = await settingsAt(pPage)
  const hPage = await signIn(hooker)
  const hMenu = await menuOffers(hPage)
  const hPalette = await paletteOffers(hPage)
  const hSide = await sidebarOffers(hPage)
  const hAt = await settingsAt(hPage)
  const gPage = await signIn(guest)
  const gMenu = await menuOffers(gPage)
  const gPalette = await paletteOffers(gPage)
  const gSide = await sidebarOffers(gPage)
  const gAt = await settingsAt(gPage)
  const none = (side) => side.dock === 0 && side.links === 0 && side.switcher === 0 && side.rail === 0
  const every = (side) => side.dock === 1 && side.links >= 2 && side.switcher === 1 && side.rail === 1
  chk(
    // Archived, Trash and Features open to every member but a guest (the
    // archived tasks each may open, what they deleted, and which ClickApps are
    // on), so Settings is offered to a plain member too, landing on Archived
    // (`admin-guard-admits-managers-where-the-web-says-admin`,
    // `members-have-no-trash-to-open`, `members-see-no-clickapps-list`).
    pMenu === 1 && pPalette === 1 && every(pSide) && pAt.path.endsWith('/settings') && JSON.stringify(pAt.tabs) === '["features","archived","trash"]'
      && hMenu === 1 && hPalette === 1 && every(hSide) && hAt.path.endsWith('/settings') && hAt.tabs.includes('integrations')
      && gMenu === 0 && gPalette === 0 && none(gSide) && !gAt.path.includes('/settings'),
    'Workspace settings is offered to every member, and a plain member lands on Archived, with only Trash and Features beside it (avatar menu, palette, dock, browse list, switcher, rail) — the tabs no key opens; the webhook holder is offered it everywhere too, and lands with Integrations beside it; a guest is offered it nowhere and is sent away from its address',
    `the plain member: the menu offers ${pMenu}, the palette ${pPalette}, the sidebar ${JSON.stringify(pSide)}, the address left them at ${pAt.path} with tabs ${JSON.stringify(pAt.tabs)}; the guest: the menu ${gMenu}, the palette ${gPalette}, the sidebar ${JSON.stringify(gSide)}, at ${gAt.path}; the webhook holder: the menu ${hMenu}, the palette ${hPalette}, the sidebar ${JSON.stringify(hSide)}, at ${hAt.path} with tabs ${JSON.stringify(hAt.tabs)}`,
  )

  // ══ 2. EACH GRANT, ITS OWN TAB ═══════════════════════════════════════════
  console.log('\n▶ the tabs, and the Integrations cards, each grant opens')
  /**
   * The Integrations cards, read once the keys they are drawn from have
   * answered and had two frames to be drawn in. Webhooks, Slack and Export each
   * ask a key, while an admin's Import is drawn at once — so "the first card,
   * then 1.5 fixed seconds" could read an admin's Import alone before the rest.
   */
  const cards = async (page) => {
    const keys = keysAnswered(page)
    await page.goto(`${B}/app/${WS}/settings?tab=integrations`, { waitUntil: 'domcontentloaded' })
    await page.locator('[data-testid^="settings-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    await keys
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {})
    return page.locator('[data-testid^="settings-card-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('settings-card-', '')))
  }
  const sPage = await signIn(ssoer)
  const sAt = await settingsAt(sPage)
  const cPage = await signIn(connector)
  const cAt = await settingsAt(cPage)
  const hCards = await cards(hPage)
  const cCards = await cards(cPage)
  const aPage = await signIn(ADMIN)
  const aAt = await settingsAt(aPage)
  const aCards = await cards(aPage)
  // Archived, Trash and Features open to every member but a guest, beside
  // whatever a key opens, so "alone" is read without them
  // (`admin-guard-admits-managers-where-the-web-says-admin`, `members-have-no-trash-to-open`,
  // `members-see-no-clickapps-list`).
  const only = (list, want) => {
    const own = list.filter((t) => !['features', 'archived', 'trash'].includes(t))
    return own.length === want.length && want.every((w) => own.includes(w))
  }
  chk(
    only(hAt.tabs, ['integrations']) && only(hCards, ['webhooks']) && only(sAt.tabs, ['sso']) && only(cAt.tabs, ['integrations']) && only(cCards, ['slack'])
      && aAt.tabs.length > 10 && ['webhooks', 'slack', 'import', 'export'].every((k) => aCards.includes(k)),
    'each grant opens its own tab and card alone — webhooks: Integrations, with Webhooks; SSO: SSO; integrations: Integrations, with Slack — and an admin, every one',
    `webhooks: ${JSON.stringify(hAt.tabs)} ${JSON.stringify(hCards)}; SSO: ${JSON.stringify(sAt.tabs)}; integrations: ${JSON.stringify(cAt.tabs)} ${JSON.stringify(cCards)}; the admin: ${aAt.tabs.length} tabs, ${JSON.stringify(aCards)}`,
  )

  // ══ 3. A WEBHOOK, MADE BY ITS HOLDER ═════════════════════════════════════
  console.log('\n▶ the webhook holder makes a webhook from Settings')
  await hPage.goto(`${B}/app/${WS}/settings?tab=integrations`, { waitUntil: 'domcontentloaded' })
  await hPage.getByTestId('webhook-add').click({ timeout: 20_000 }).catch(() => {})
  await hPage.getByTestId('webhook-form-name').fill(`${TAG} hook`, { timeout: 8000 }).catch(() => {})
  await hPage.getByTestId('webhook-form-url').fill('https://example.invalid/hook', { timeout: 8000 }).catch(() => {})
  await hPage.getByTestId('webhook-form-save').click({ timeout: 8000 }).catch(() => {})
  const secretShown = await hPage.getByText(/copied it/i).first().waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false)
  const hooks = (await sql`select count(*)::int as n from webhooks where workspace_id = ${WS} and name = ${`${TAG} hook`}`)[0].n
  chk(
    secretShown && hooks === 1,
    'the webhook holder makes a webhook from Settings — it is made, and its secret is shown once',
    `the secret shown: ${secretShown}; webhooks made ${hooks}`,
  )

  // ══ 4. SSO, SAVED BY ITS HOLDER ══════════════════════════════════════════
  console.log('\n▶ the SSO holder saves an OIDC connection, and reads it back after a reload')
  const ISSUER = `https://idp-${stamp}.example.invalid`
  await sPage.goto(`${B}/app/${WS}/settings?tab=sso`, { waitUntil: 'domcontentloaded' })
  await sPage.getByTestId('sso-oidc-issuer').fill(ISSUER, { timeout: 20_000 }).catch(() => {})
  await sPage.getByTestId('sso-oidc-save').click({ timeout: 8000 }).catch(() => {})
  let saved = null
  for (let i = 0; i < 20 && !saved; i++) {
    saved = (await sql`select oidc_issuer from sso_connections where workspace_id = ${WS} and provider = 'oidc'`)[0]?.oidc_issuer ?? null
    if (!saved) await new Promise((r) => setTimeout(r, 500))
  }
  await sPage.goto(`${B}/app/${WS}/settings?tab=sso`, { waitUntil: 'domcontentloaded' })
  const shown = await sPage.getByTestId('sso-oidc-issuer').inputValue({ timeout: 20_000 }).catch(() => null)
  await sPage.waitForTimeout(1500)
  const shownLater = await sPage.getByTestId('sso-oidc-issuer').inputValue({ timeout: 5000 }).catch(() => null)
  // And when what is saved cannot be read, the tab says so — rather than an
  // empty form to be saved over it.
  await sPage.route('**/api/v1/workspaces/*/sso', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"held"}' }))
  await sPage.goto(`${B}/app/${WS}/settings?tab=sso`, { waitUntil: 'domcontentloaded' })
  const saidFailed = await sPage.getByTestId('sso-load-failed').waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false)
  const formWhileFailed = await sPage.getByTestId('sso-oidc-issuer').count()
  await sPage.unroute('**/api/v1/workspaces/*/sso')
  chk(
    saved === ISSUER && shownLater === ISSUER && saidFailed && formWhileFailed === 0,
    'the SSO holder saves an OIDC connection from Settings — it is saved, after a reload the form shows what was saved, and when it cannot be read the tab says so instead of an empty form',
    `saved ${JSON.stringify(saved)}; the form after a reload shows ${JSON.stringify(shownLater)} (first read ${JSON.stringify(shown)}); unreadable: said so ${saidFailed}, a form drawn ${formWhileFailed}`,
  )

  // ══ 5. SLACK, BY THE KEY THE CATALOG FILES IT UNDER ══════════════════════
  console.log('\n▶ Slack, connected by the plain member and by the integrations holder')
  const slackRows = async () => (await sql`select count(*)::int as n from slack_integrations where workspace_id = ${WS}`)[0].n
  const pSlack = await plain.as(`/workspaces/${WS}/integrations/slack`, { method: 'POST', body: { webhookUrl: SLACK_URL, channelName: '#plain' } })
  const afterPlain = await slackRows()
  const cSlack = await connector.as(`/workspaces/${WS}/integrations/slack`, { method: 'POST', body: { webhookUrl: SLACK_URL, channelName: '#granted' } })
  const afterGranted = await slackRows()
  chk(
    pSlack.status === 403 && afterPlain === 0 && cSlack.status < 300 && afterGranted === 1,
    'Slack is connected by the holder of integrations.manage, as the catalog files it — a plain member is refused (403, none made)',
    `the plain member ${pSlack.status} (${afterPlain} made); the holder ${cSlack.status} (${afterGranted} made)`,
  )

  // ══ 6. THE APP CENTER ════════════════════════════════════════════════════
  console.log('\n▶ the App Center’s Slack tile, for the plain member and for the holder')
  await sql`delete from slack_integrations where workspace_id = ${WS}`
  const tile = async (page) => {
    await page.goto(`${B}/app/${WS}/integrations`, { waitUntil: 'domcontentloaded' })
    const card = page.locator('[data-testid="integration-card"][data-provider="slack"]')
    await card.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(2000)
    const toggle = card.getByTestId('integration-toggle')
    return {
      live: (await toggle.count()) === 1 && (await toggle.isEnabled().catch(() => false)),
      // Read as DRAWN: an offer in the page but hidden is not one anybody can take.
      action: ((await card.getByTestId('integration-action').filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')) ?? '').trim(),
      why: await card.getByTestId('integration-needs-permission').count(),
    }
  }
  const pTile = await tile(pPage)
  const cTile = await tile(cPage)
  chk(
    !pTile.live && pTile.why === 1 && /Request access/i.test(pTile.action) && cTile.live && cTile.why === 0 && /^Connect$/i.test(cTile.action),
    'the App Center offers the plain member no live switch for Slack — it says who connects apps, and offers to ask — while the holder’s switch is live, with Connect',
    `the plain member: live ${pTile.live}, reason ${pTile.why}, action "${pTile.action}"; the holder: live ${cTile.live}, reason ${cTile.why}, action "${cTile.action}"`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
