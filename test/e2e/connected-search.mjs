/**
 * CONNECTED SEARCH, PERSON BY PERSON (`found-23-sep/connected-search-per-person`).
 *
 * ClickUp (help centre, "Connected Search" and "Connect an app", through search
 * excerpts, 12 October): a personal connection is its person's alone — "no one
 * else is able to search for files from your personal connections" — and finds
 * their private files and mail too; a Workspace connection, made by an owner or
 * admin, lets every member find "only files and folders accessible to your
 * entire organization"; Gmail connects personally only; guests cannot use
 * Connected Search.
 *
 * Measured before it was built (lane 7, the tree before it): one connection per
 * workspace and provider answered the person who made it and nobody else, every
 * other member was told "connected with someone else's account", there was no
 * way to connect one's own, and no federated query reached anything but Google
 * itself — so none had ever run here.
 *
 * A workspace of this run's own, made by Olga, its owner; Mia and Max, members;
 * a guest. The lane's Google and Graph stub (`calendar-stub.mjs`) answers each
 * search from the account its token opens; the workspace's connections are
 * staged in Postgres, as an admin's App Center connect writes them, and Mia's
 * own Gmail is connected through the consent flow itself.
 *
 *   node test/e2e/connected-search.mjs --api 3030 --dist /tmp/claude-0/dist-10
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { calendarBase, seedSearchAccount, searchesAsked, seedConsentCode } from './lib/calendar.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 11

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const STUB = calendarBase(API_PORT, argOf('--calendar', undefined))

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

// The API's own words (`integration-connections.service.ts`).
const GUEST_REFUSAL = 'Guests do not use Connected Search'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const SITES_SCOPE = 'Sites.Read.All'

const stamp = Date.now()
const TAG = `cs${stamp}`
const PASSWORD = 'ConnectedSearch@12345!'
// Bearer tokens the stub answers for: the workspace's Drive and SharePoint, its Gmail, and Mia's own.
const WS_DRIVE = `${TAG}-ws-drive`
const WS_GMAIL = `${TAG}-ws-gmail`
const WS_SHAREPOINT = `${TAG}-ws-sharepoint`
const MIA_DRIVE = `${TAG}-mia-drive`
const MIA_GMAIL = `${TAG}-mia-gmail`

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error, message}`. Every call site reads `status`. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the workspace’s connections are staged, and Mia’s read back, by SQL')
  const owner = await signUpApi(API, { fullName: `olga ${stamp}`, email: `${TAG}-olga@rundesk.invalid`, password: PASSWORD, organizationName: `Search olga ${stamp}`, organizationSlug: `search-olga-${stamp}` })
  A = apiAs(owner.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: `Search ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `${who} ${stamp}`, email, password: PASSWORD, organizationName: `Search ${who} ${stamp}`, organizationSlug: `search-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add ${who}: ${said(added)}`)
    return { email, id: signed.user.id, api: apiAs(signed.accessToken) }
  }
  const mia = await person('mia', 'member')
  const max = await person('max', 'member')
  const gus = await person('gus', 'guest')
  const M = mia.api
  const X = max.api

  const sources = async (C) => {
    const res = await C(`/search/sources/${WS}`)
    return Object.fromEntries((Array.isArray(res.data) ? res.data : []).map((s) => [s.id, s]))
  }
  const hits = async (C, q, type) => {
    const res = await C(`/search/${WS}?q=${encodeURIComponent(q)}&types=${type}`)
    const list = Array.isArray(res.data) ? res.data : (res.data?.results ?? [])
    return list.filter((h) => h.entityType === type).map((h) => h.title)
  }

  // ══ 1. NOTHING CONNECTED ═══════════════════════════════════════════════════
  console.log('\n▶ before anything is connected')
  const maxNone = await sources(X)
  const gusNone = await sources(gus.api)
  chk(
    ['google-drive', 'gmail', 'sharepoint'].every((id) => maxNone[id]?.connected === false && maxNone[id]?.canConnect === true)
      && ['google-drive', 'gmail', 'sharepoint'].every((id) => gusNone[id]?.connected === false && gusNone[id]?.canConnect === false),
    'with nothing connected, a member is told each source is not connected and may connect their own; a guest may not',
    JSON.stringify({ max: maxNone, gus: gusNone }),
  )

  // The workspace's own: Drive, Gmail and SharePoint, connected by Olga in the App Center.
  const BUDGET_SHARED = `${TAG} budget for the whole team`
  const BUDGET_OLGA = `${TAG} budget Olga keeps to herself`
  await seedSearchAccount(STUB, {
    token: WS_DRIVE,
    drive: [
      { id: `${TAG}-f1`, name: BUDGET_SHARED, visibility: 'domainCanFind' },
      { id: `${TAG}-f2`, name: BUDGET_OLGA, visibility: 'limited' },
    ],
  })
  await seedSearchAccount(STUB, { token: WS_GMAIL, gmail: [{ id: `${TAG}-m0`, subject: `${TAG} budget sign-off`, from: 'cfo@example.test', snippet: 'please approve' }] })
  await seedSearchAccount(STUB, {
    token: WS_SHAREPOINT,
    sharepoint: [
      { id: `${TAG}-s1`, name: `${TAG} budget policy`, webUrl: 'https://contoso.sharepoint.com/sites/finance/budget-policy.docx' },
      { id: `${TAG}-s2`, name: `${TAG} budget notes Olga's OneDrive`, webUrl: 'https://contoso-my.sharepoint.com/personal/olga/budget-notes.docx' },
    ],
  })
  await sql`insert into workspace_integration_connections (workspace_id, provider, status, scopes, access_token, external_account_email, connected_by_id) values
    (${WS}, 'google-drive', 'connected', ${[DRIVE_SCOPE]}, ${WS_DRIVE}, 'olga@example.test', ${owner.user.id}),
    (${WS}, 'gmail', 'connected', ${[GMAIL_SCOPE]}, ${WS_GMAIL}, 'olga@example.test', ${owner.user.id}),
    (${WS}, 'sharepoint', 'connected', ${[SITES_SCOPE]}, ${WS_SHAREPOINT}, 'olga@example.test', ${owner.user.id})`

  // ══ 2. THE WORKSPACE'S CONNECTIONS ═════════════════════════════════════════
  console.log('\n▶ Max searches through the workspace’s connections')
  const maxShared = await sources(X)
  const maxDrive = await hits(X, `${TAG} budget`, 'drive')
  const askedDrive = (await searchesAsked(STUB, WS_DRIVE)) ?? []
  chk(
    maxShared['google-drive']?.heldBy === 'workspace' && maxDrive.includes(BUDGET_SHARED) && !maxDrive.includes(BUDGET_OLGA)
      && askedDrive.length > 0 && askedDrive.every((a) => a.query.includes("visibility = 'domainCanFind'")),
    'through the workspace’s Drive a member finds what is shared with the whole organization and not the connector’s private file — Drive was asked for the shared ones alone',
    JSON.stringify({ heldBy: maxShared['google-drive']?.heldBy, found: maxDrive, asked: askedDrive.map((a) => a.query) }),
  )
  const maxSp = await hits(X, `${TAG} budget`, 'sharepoint')
  chk(
    maxShared.sharepoint?.heldBy === 'workspace' && maxSp.includes(`${TAG} budget policy`) && !maxSp.some((t) => t.includes('OneDrive')),
    'through the workspace’s SharePoint a member finds the organization’s sites, not the connector’s own OneDrive',
    JSON.stringify({ heldBy: maxShared.sharepoint?.heldBy, found: maxSp }),
  )
  const maxGmail = await hits(X, `${TAG} budget`, 'gmail')
  const olgaGmail = await hits(A, `${TAG} budget`, 'gmail')
  chk(
    maxShared.gmail?.connected === false && maxGmail.length === 0 && olgaGmail.includes(`${TAG} budget sign-off`),
    'a mailbox is personal: the Gmail Olga connected for the workspace is searched for her alone, and for Max it is not connected',
    JSON.stringify({ max: maxShared.gmail, maxFound: maxGmail, olgaFound: olgaGmail }),
  )
  const olgaDrive = await hits(A, `${TAG} budget`, 'drive')
  chk(
    olgaDrive.includes(BUDGET_SHARED) && !olgaDrive.includes(BUDGET_OLGA),
    'and through the workspace’s Drive its connector finds the shared files too, not her own private ones',
    JSON.stringify({ found: olgaDrive }),
  )

  // ══ 3. MIA CONNECTS HER OWN GMAIL, THROUGH THE CONSENT FLOW ═══════════════
  console.log('\n▶ Mia connects her own Gmail')
  const start = await M(`/workspaces/${WS}/search/connect/gmail`, { method: 'POST' })
  const state = start.data?.authUrl ? new URL(start.data.authUrl).searchParams.get('state') : null
  const CODE = `${TAG}-code`
  await seedConsentCode(STUB, { code: CODE, accessToken: MIA_GMAIL, refreshToken: `${MIA_GMAIL}-refresh`, email: `${TAG}-mia@gmail.test`, sub: `${TAG}-mia`, scopes: ['openid', 'email', GMAIL_SCOPE] })
  await seedSearchAccount(STUB, { token: MIA_GMAIL, gmail: [{ id: `${TAG}-m1`, subject: `${TAG} quarterly offsite`, from: 'events@example.test', snippet: 'the venue is booked' }] })
  const back = state ? await fetch(`${API}/integrations/oauth/gmail/callback?code=${CODE}&state=${encodeURIComponent(state)}`, { redirect: 'manual' }) : null
  const landed = back?.headers.get('location') ?? ''
  const [row] = await sql`select provider, status, external_account_email, access_token from user_search_connections where workspace_id = ${WS} and user_id = ${mia.id}`
  const [{ n: wsRows }] = await sql`select count(*)::int as n from workspace_integration_connections where workspace_id = ${WS}`
  chk(
    (start.status === 200 || start.status === 201) && !!state && back?.status === 302 && landed.includes(`/app/${WS}/search`) && landed.includes('connected=gmail')
      && row?.provider === 'gmail' && row?.status === 'connected' && row?.access_token === MIA_GMAIL && wsRows === 3,
    'a member connects their own Gmail: the consent comes back to search, and her own connection is kept — the workspace’s untouched (read by SQL)',
    JSON.stringify({ start: start.status, state: !!state, back: back?.status, landed: landed.replace(B, ''), row: row ? { ...row, access_token: row.access_token === MIA_GMAIL } : null, wsRows }),
  )
  const miaMail = await hits(M, `${TAG} quarterly`, 'gmail')
  const maxMail = await hits(X, `${TAG} quarterly`, 'gmail')
  const miaSrc = await sources(M)
  chk(
    miaSrc.gmail?.heldBy === 'you' && miaMail.includes(`${TAG} quarterly offsite`) && maxMail.length === 0,
    'her mail is searched for her alone: she finds it, Max does not, and her source says it is her own',
    JSON.stringify({ heldBy: miaSrc.gmail?.heldBy, mia: miaMail, max: maxMail }),
  )

  // ══ 4. MIA'S OWN DRIVE OVER THE WORKSPACE'S ════════════════════════════════
  console.log('\n▶ Mia’s own Drive')
  const MIA_FILE = `${TAG} budget draft Mia keeps`
  await seedSearchAccount(STUB, { token: MIA_DRIVE, drive: [{ id: `${TAG}-f3`, name: MIA_FILE, visibility: 'limited' }] })
  await sql`insert into user_search_connections (workspace_id, user_id, provider, scopes, access_token) values (${WS}, ${mia.id}, 'google-drive', ${[DRIVE_SCOPE]}, ${MIA_DRIVE})`
  const miaDrive = await hits(M, `${TAG} budget`, 'drive')
  const maxAgain = await hits(X, `${TAG} budget`, 'drive')
  const miaAsked = (await searchesAsked(STUB, MIA_DRIVE)) ?? []
  chk(
    miaDrive.includes(MIA_FILE) && miaAsked.length > 0 && miaAsked.every((a) => !a.query.includes('visibility')) && !maxAgain.includes(MIA_FILE),
    'with her own Drive connected, Mia’s search reaches her private files — Drive asked for everything she may see — and Max’s still reaches only the workspace’s shared ones',
    JSON.stringify({ mia: miaDrive, asked: miaAsked.map((a) => a.query), max: maxAgain }),
  )

  // ══ 5. A GUEST ═════════════════════════════════════════════════════════════
  console.log('\n▶ the guest')
  const gusDrive = await hits(gus.api, `${TAG} budget`, 'drive')
  const gusStart = await gus.api(`/workspaces/${WS}/search/connect/google-drive`, { method: 'POST' })
  const gusSrc = await sources(gus.api)
  chk(
    gusDrive.length === 0 && gusStart.status === 403 && gusStart.message === GUEST_REFUSAL && gusSrc['google-drive']?.connected === false && gusSrc['google-drive']?.canConnect === false,
    'a guest uses no Connected Search: the workspace’s Drive finds them nothing, connecting their own is refused in words (403), and their sources say so',
    JSON.stringify({ found: gusDrive, start: said(gusStart), src: gusSrc['google-drive'] }),
  )

  // ══ 6. THE PALETTE, AS MAX AND AS MIA ══════════════════════════════════════
  console.log('\n▶ the search palette')
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const signIn = async (email) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return page
  }
  const noteOf = async (page, source) => {
    await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
    /*
     * ⌘K IS HEARD ONCE THE APP SHELL HAS MOUNTED; pressed at `domcontentloaded`
     * it can land before the listener and be lost, and the palette never opens
     * (break runs of 12 October: seven checks of the palette red under
     * patches that touch neither the palette nor the person). Pressed until
     * the palette's input shows, waiting long enough between presses that a
     * late open is not closed again.
     */
    const input = page.locator('[cmdk-input]').first()
    for (let i = 0; i < 12 && !(await input.isVisible().catch(() => false)); i += 1) {
      await page.keyboard.press('Control+k')
      await input.waitFor({ state: 'visible', timeout: 2500 }).catch(() => {})
    }
    await page.getByTestId(`palette-source-${source}`).click({ timeout: 15_000 }).catch(() => {})
    const note = page.locator('[data-testid="palette-source-held"], [data-testid="palette-source-disconnected"]').first()
    await note.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    return {
      heldBy: await note.getAttribute('data-held-by').catch(() => null),
      text: (await note.filter({ visible: true }).innerText({ timeout: 3000 }).catch(() => '')).trim(),
      connectOwn: await page.getByTestId('palette-source-connect-own').count(),
      disconnectOwn: await page.getByTestId('palette-source-disconnect-own').count(),
    }
  }
  const maxPage = await signIn(max.email)
  const maxDriveNote = await noteOf(maxPage, 'google-drive')
  const maxGmailNote = await noteOf(maxPage, 'gmail')
  chk(
    maxDriveNote.heldBy === 'workspace' && maxDriveNote.text.includes('only what is shared with everyone') && maxDriveNote.connectOwn === 1
      && maxGmailNote.heldBy === 'none' && maxGmailNote.connectOwn === 1,
    'the palette tells Max his Drive results are the workspace’s, shared things only, and offers to connect his own — and that his Gmail is not connected, with the same offer',
    JSON.stringify({ drive: maxDriveNote, gmail: maxGmailNote }),
  )
  const miaPage = await signIn(mia.email)
  const miaGmailNote = await noteOf(miaPage, 'gmail')
  await miaPage.getByTestId('palette-source-disconnect-own').click({ timeout: 8000 }).catch(() => {})
  let gone = null
  for (let i = 0; i < 30 && gone !== 0; i += 1) {
    ;[{ n: gone }] = await sql`select count(*)::int as n from user_search_connections where workspace_id = ${WS} and user_id = ${mia.id} and provider = 'gmail'`
    if (gone !== 0) await new Promise((r) => setTimeout(r, 300))
  }
  const afterMail = await hits(M, `${TAG} quarterly`, 'gmail')
  chk(
    miaGmailNote.heldBy === 'you' && miaGmailNote.disconnectOwn === 1 && gone === 0 && afterMail.length === 0,
    'Mia’s palette says her Gmail is her own and offers to disconnect it; disconnected, it is gone (read by SQL) and her mail is searched no more',
    JSON.stringify({ note: miaGmailNote, left: gone, after: afterMail }),
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
