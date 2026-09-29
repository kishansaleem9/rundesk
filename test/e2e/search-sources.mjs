/**
 * §G02-9 [01:12] — the source strip under the query.
 *
 * "All | ClickUp | Google Drive | Gmail | SharePoint | Apps" is on screen in
 * every search frame of the section, and we had no concept of a SOURCE at all:
 * nothing to scope to, and nothing to say when a source was not connected.
 *
 * The half these checks care most about is the second one. Drive federation
 * already existed and returned `[]` when the workspace had no connection —
 * which reads to a person as "you have no matching files in Drive", and that is
 * false. **Silence is a wrong answer wearing the clothes of a right one**, so
 * an unconnected source has to say so and offer the way to connect it.
 *
 * WHAT IS NOT CHECKED HERE, and the reason. The Gmail and SharePoint QUERIES
 * cannot run: they need OAuth credentials for those providers, which no test
 * environment holds. What is exercised is everything up to the credential —
 * the strip, the scoping, and the honest "not connected". The federated
 * requests themselves are unexercised, and saying so is better than implying a
 * coverage that does not exist.
 *
 * AND WHOSE ACCOUNT A SOURCE IS. A connection is one person's Google or
 * Microsoft account, and every member used to search it — the connector's mail
 * subjects, senders and snippets for anybody in the workspace. It now answers
 * the person who connected it (the unit tests in `search.service.test.ts` prove
 * the query side; nothing here can reach Google). What is checked here is what
 * each person is TOLD: the source list says whose account it is, a member who
 * may not connect apps (`integrations.manage`) is not offered a Connect button,
 * the button leads to the App Center at that source's app (it led to Settings,
 * which connects no source), and the connection is staged straight into
 * Postgres (DATABASE_URL).
 *
 *   node test/e2e/search-sources.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 11

const chromium = await resolveChromium()
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

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

const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null
let A = null
let heldWs = null

try {
  const login = await signInApi(API, ME.email, ME.password)
  A = apiAs(login.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id

  console.log('\n▶ §G02-9 — a source that cannot answer says so')

  const sources = (await A(`/search/sources/${workspaceId}`)).data ?? []
  const byId = Object.fromEntries(sources.map((s) => [s.id, s]))
  chk(
    ['rundesk', 'google-drive', 'gmail', 'sharepoint'].every((id) => id in byId),
    'the workspace can be asked what it can search',
    `sources returned ${JSON.stringify(sources.map((s) => s.id))}`,
  )
  /*
   * Our own data needs no credential, so it is the one source that must always
   * be answerable. A registry that reported it unconnected would put the whole
   * product behind a "connect" prompt.
   */
  chk(byId.rundesk?.connected === true, 'and Rundesk itself is always answerable',
    `rundesk reported connected=${byId.rundesk?.connected}`)
  /*
   * These are unconnected in any test environment, which is what makes this
   * suite able to check the honest-empty behaviour at all — the state a real
   * workspace is in before anybody connects anything.
   */
  chk(
    byId.gmail?.connected === false && byId.sharepoint?.connected === false,
    'and a provider with no stored credential reports itself unconnected',
    `gmail=${byId.gmail?.connected} sharepoint=${byId.sharepoint?.connected}`,
  )

  // ── On screen ─────────────────────────────────────────────────────────────
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${stack.base}/app/${workspaceId}/inbox`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await page.keyboard.press('Control+k')

  /*
   * WAITED FOR, not slept on.
   *
   * The first version slept 1500ms and then asked whether the tabs were there.
   * That is a latency assumption, and CI does not share this machine's: the
   * sources request had not answered, the Gmail tab did not exist yet, and the
   * click after it sat for thirty seconds — a 32-second failure that says only
   * "locator timeout" about a suite that works fine locally.
   *
   * Waiting for the element instead makes the check about whether it EVER
   * appears rather than whether it appeared within a guess.
   */
  const strip = page.getByTestId('palette-sources')
  await strip.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  chk(
    await strip.isVisible().catch(() => false),
    'the palette carries a source strip',
    'no source strip under the query',
  )
  const gmailTab = page.getByTestId('palette-source-gmail')
  await gmailTab.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  const gmailThere = await gmailTab.isVisible().catch(() => false)
  chk(gmailThere, 'with a tab for each source',
    'Gmail has no tab — did the sources request answer?')

  /*
   * The whole point. Before this, choosing an unconnected source produced an
   * empty result list and nothing else — indistinguishable from "there is
   * nothing there".
   */
  // Guarded: clicking a tab that never appeared is thirty seconds of silence
  // followed by a message about locators rather than about sources.
  if (gmailThere) await gmailTab.click()
  const notice = page.getByTestId('palette-source-disconnected')
  await notice.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
  chk(
    await notice.isVisible().catch(() => false),
    'and choosing an unconnected one says so, instead of showing an empty list',
    'an unconnected source returned silence — indistinguishable from having nothing',
  )
  chk(
    await page.getByTestId('palette-source-connect').isVisible().catch(() => false),
    'and offers the way to connect it',
    'the message names no way out',
  )
  // And the way leads somewhere that connects it: the App Center, at Gmail's own
  // tile. It went to Settings → General, which connects no source at all.
  await page.getByTestId('palette-source-connect').click({ timeout: 5000 }).catch(() => {})
  await page.waitForURL(/\/integrations/, { timeout: 15_000 }).catch(() => {})
  const gmailTile = page.locator('[data-testid="integration-card"][data-provider="gmail"]')
  const tileShown = await gmailTile.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false)
  const landedAt = new URL(page.url()).pathname
  // AT the app: the catalogue opens searched for it, not at all eighty tiles.
  const searched = await page.getByTestId('integrations-search').inputValue({ timeout: 5000 }).catch(() => null)
  const tiles = await page.locator('[data-testid="integration-card"]').count()
  chk(
    landedAt.endsWith('/integrations') && tileShown && searched === 'Gmail' && tiles <= 3,
    'and that way is the App Center, at the source’s own app',
    `it led to ${landedAt}; Gmail's tile shown ${tileShown}; the catalogue searched for ${JSON.stringify(searched)}, ${tiles} tile(s) shown`,
  )

  // ══ WHOSE ACCOUNT ════════════════════════════════════════════════════════
  console.log('\n▶ a connected account answers the person who connected it, and says so to everyone else')

  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the connection is staged in Postgres; no test environment holds a Google grant')
  const stamp = Date.now()
  const made = await A('/workspaces', { method: 'POST', body: { name: `sources-${stamp}` } })
  heldWs = made.data?.id
  if (!heldWs) throw new Error(`could not make the workspace: ${made.status}`)
  const adminId = (await A('/users/me')).data?.id
  const memberEmail = `sources-member-${stamp}@rundesk.invalid`
  const memberToken = (await signUpApi(API, { fullName: 'Sources member', email: memberEmail, password: 'Member@12345!', organizationName: `Sources ${stamp}`, organizationSlug: `sources-${stamp}` }))?.accessToken
  const added = await A(`/workspaces/${heldWs}/members`, { method: 'POST', body: { email: memberEmail, role: 'member' } })
  if (!memberToken || added.status >= 300) throw new Error(`could not add the member: add ${added.status}`)
  const M = apiAs(memberToken)
  // The admin's own Gmail, as `/oauth/callback` would have stored it.
  await sql`
    insert into workspace_integration_connections (workspace_id, provider, status, scopes, access_token, connected_by_id)
    values (${heldWs}, 'gmail', 'connected', ${['https://www.googleapis.com/auth/gmail.readonly']}, 'staged-by-search-sources', ${adminId})`
  const gmailOf = async (as) => ((await as(`/search/sources/${heldWs}`)).data ?? []).find((x) => x.id === 'gmail')
  const adminGmail = await gmailOf(A)
  const memberGmail = await gmailOf(M)
  chk(
    adminGmail?.connected === true && adminGmail?.heldBy === 'you' &&
      memberGmail?.connected === false && memberGmail?.heldBy === 'someone-else',
    'the admin’s Gmail is connected for the admin, and for a member it is somebody else’s',
    `admin ${JSON.stringify(adminGmail)}; member ${JSON.stringify(memberGmail)}`,
  )

  const mpage = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await mpage.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await mpage.fill('input[type=email]', memberEmail)
  await mpage.fill('input[type=password]', 'Member@12345!')
  await mpage.click('button[type=submit]')
  await mpage.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await mpage.goto(`${stack.base}/app/${heldWs}/inbox`, { waitUntil: 'domcontentloaded' })
  await mpage.waitForTimeout(2500)
  await mpage.keyboard.press('Control+k')
  const mGmail = mpage.getByTestId('palette-source-gmail')
  await mGmail.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await mGmail.click({ timeout: 10_000 }).catch(() => {})
  const mNotice = mpage.getByTestId('palette-source-disconnected')
  await mNotice.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
  const noticeText = ((await mNotice.filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')) ?? '').trim()
  const mConnect = await mpage.getByTestId('palette-source-connect').count()
  chk(
    /someone else/i.test(noticeText) && mConnect === 0,
    'a member choosing Gmail is told it is somebody else’s account — and offered no Connect that would replace it',
    `notice ${JSON.stringify(noticeText)}; Connect buttons ${mConnect}`,
  )
  await mpage.getByTestId('palette-source-sharepoint').click({ timeout: 10_000 }).catch(() => {})
  await mpage.waitForTimeout(600)
  const spText = ((await mNotice.filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')) ?? '').trim()
  const spConnect = await mpage.getByTestId('palette-source-connect').count()
  chk(
    /not connected/i.test(spText) && !/someone else/i.test(spText) && spConnect === 0,
    'and a source nobody connected says so, with no Connect for a member who may not connect apps',
    `notice ${JSON.stringify(spText)}; Connect buttons ${spConnect}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close().catch(() => {})
  if (sql && heldWs) await sql`delete from workspace_integration_connections where workspace_id = ${heldWs}`.catch(() => {})
  if (A && heldWs) {
    try {
      const gone = await A(`/workspaces/${heldWs}`, { method: 'DELETE' })
      if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${heldWs} answered ${gone.status}`)
    } catch (err) {
      console.log(`  cleanup left behind: DELETE /workspaces/${heldWs} got no answer (${err?.message ?? err})`)
    }
  }
  await sql?.end({ timeout: 5 }).catch(() => {})
  stack?.close()
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
