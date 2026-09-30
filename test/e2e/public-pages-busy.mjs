/**
 * A PUBLIC PAGE REFUSED FOR TOO MANY REQUESTS SAYS SO (`found-30-sep/public-pages-read-429-as-gone`).
 *
 * The public routes are limited per address (`found-30-sep/public-routes-unthrottled`),
 * and a refusal is a 429 with a `Retry-After`. The pages it refused read it as
 * a link that no longer opens: the clip page said "This clip is not
 * available", the client portal "Portal unavailable", and a portal already on
 * screen was replaced by that sentence when one of its 45-second refreshes was
 * refused, or failed for any reason. The public doc page called it a failure.
 *
 * So each page says that it was asked for too often, when it will try again,
 * and then does; "Try again now" does it at once; and the portal keeps what it
 * has drawn when a later ask fails, and tells a failure from a link that is
 * gone.
 *
 * THE REFUSALS ARE ANSWERED IN THE BROWSER, on purpose: a real 429 would spend
 * the lane's budget for a minute and refuse every suite after this one. Every
 * page, and what it draws once the refusal lifts, is the real API's.
 *
 *   node test/e2e/public-pages-busy.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil, readText } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 10

const REPO = path.resolve(import.meta.dirname, '../..')
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
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client; it answers status 0 when nothing answers. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? res.data ?? null).slice(0, 160)}`

const TAG = `e2e-busy-${Date.now()}`
const DOC_TITLE = `Busy doc ${TAG}`
const CLIP_TITLE = `Busy clip ${TAG}`
const PORTAL_NAME = `Busy portal ${TAG}`

/** The rate limiter's refusal, as it answers one: a 429, its wait in the header and in the envelope. */
const refusal = (seconds) => ({
  status: 429,
  headers: { 'retry-after': String(seconds), 'content-type': 'application/json' },
  body: JSON.stringify({
    data: null,
    error: { status: 429, message: 'Too many requests. Please slow down and try again later.', details: { error: 'rate_limited', retryAfter: seconds } },
  }),
})
const failure = {
  status: 500,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ data: null, error: { status: 500, message: 'Internal server error' } }),
}

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())
let sql = null
let A = null
const workspacesMade = []
const leftBehind = []

try {
  const auth = await signInApi(API, ME.email, ME.password)
  A = apiAs(auth.accessToken)
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite makes the portal’s project in the database')

  const madeWs = await A('/workspaces', { method: 'POST', body: { name: `Busy pages ${TAG}` } })
  if (madeWs.status >= 300 || !madeWs.data?.id) throw new Error(`could not make a workspace: ${said(madeWs)}`)
  const WS = madeWs.data.id
  workspacesMade.push(WS)

  /* A shared doc. */
  const madeDoc = await A(`/workspaces/${WS}/docs`, { method: 'POST', body: { title: DOC_TITLE } })
  const shared = madeDoc.data?.id ? await A(`/docs/${madeDoc.data.id}/share`, { method: 'POST' }) : madeDoc
  const SLUG = shared.data?.publicShareId
  if (!SLUG) throw new Error(`could not share a doc: ${said(shared)}`)

  /* A clip with its link, uploaded through the lane's store. */
  const presign = await A(`/workspaces/${WS}/clips/presign`, {
    method: 'POST', body: { fileName: `${CLIP_TITLE}.webm`, contentType: 'video/webm', title: CLIP_TITLE },
  })
  if (presign.status >= 300 || !presign.data?.uploadUrl) throw new Error(`could not presign a clip: ${said(presign)}`)
  const put = await fetch(presign.data.uploadUrl, { method: 'PUT', body: Buffer.alloc(4096), headers: { 'content-type': 'video/webm' } })
    .then((r) => r.status, () => 0)
  if (put !== 200) throw new Error(`the store answered the clip's upload ${put}`)
  const link = await A(`/workspaces/${WS}/clips/link`, { method: 'POST', body: { storageKey: presign.data.storageKey } })
  const CLIP_TOKEN = link.data?.token
  if (!CLIP_TOKEN) throw new Error(`could not make the clip's link: ${said(link)}`)

  /* A client portal, on a project of the workspace's own. */
  const [space] = await sql`insert into spaces (workspace_id, name) values (${WS}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const portal = await A(`/projects/${project.id}/portal`, { method: 'POST', body: { name: PORTAL_NAME } })
  const PORTAL_TOKEN = portal.data?.token
  if (!PORTAL_TOKEN) throw new Error(`could not make a portal: ${said(portal)}`)

  /* SIGNED IN NOWHERE, as a link pasted to a client opens. */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  const busyHeading = page.getByRole('heading', { name: 'Too many requests' }).filter({ visible: true })
  const busyWait = (testId) => page.getByTestId(`${testId}-wait`).filter({ visible: true })
  const refuse = async (glob, answer) => {
    let asked = 0
    await page.route(glob, (route) => { asked += 1; return route.fulfill(answer) })
    return { asked: () => asked, lift: () => page.unroute(glob).catch(() => {}) }
  }
  const drawn = (locator) => waitUntil(async () => (await locator.count()) > 0, { timeoutMs: 15000 })

  // ---------------------------------------------------------------------------
  console.log('\n— a shared doc')
  const docTitle = page.getByTestId('public-doc-title').filter({ visible: true })
  let refused = await refuse('**/api/v1/public/docs/**', refusal(3))
  await page.goto(`${stack.base}/d/${SLUG}`, { waitUntil: 'domcontentloaded' })
  const docBusy = await drawn(busyHeading)
  const docWait = await readText(busyWait('public-doc-busy'), { timeoutMs: 2000 })
  const docSaysGone = await page.getByRole('heading', { name: 'Doc not found' }).count()
  chk(
    docBusy && /\b[1-3] seconds\b/.test(docWait) && docSaysGone === 0,
    'a shared doc refused for too many requests says so, and in how many seconds it will try again, not that its link is gone',
    `“Too many requests” ${docBusy ? 'is' : 'is not'} shown; the wait reads ${JSON.stringify(docWait)}; “Doc not found” is shown ${docSaysGone} time(s)`,
  )
  await refused.lift()
  const docBack = await waitUntil(async () => (await readText(docTitle, { timeoutMs: 500 })) === DOC_TITLE, { timeoutMs: 15000 })
  chk(docBack, 'and once the wait is over it asks again by itself, and the doc is drawn', `the title reads ${JSON.stringify(await readText(docTitle, { timeoutMs: 500 }))}`)

  refused = await refuse('**/api/v1/public/docs/**', refusal(60))
  await page.goto(`${stack.base}/d/${SLUG}`, { waitUntil: 'domcontentloaded' })
  await drawn(busyHeading)
  await refused.lift()
  await page.getByTestId('public-doc-busy-retry').click({ timeout: 5000 }).catch(() => {})
  const retriedNow = await waitUntil(async () => (await readText(docTitle, { timeoutMs: 500 })) === DOC_TITLE, { timeoutMs: 10000 })
  chk(retriedNow, 'and “Try again now” asks at once, without waiting a minute out', `after the press the title reads ${JSON.stringify(await readText(docTitle, { timeoutMs: 500 }))}`)

  // ---------------------------------------------------------------------------
  console.log('\n— a clip’s link')
  const clipTitle = page.getByTestId('clip-link-title').filter({ visible: true })
  refused = await refuse('**/api/v1/public/clips/**', refusal(3))
  await page.goto(`${stack.base}/clips/${CLIP_TOKEN}`, { waitUntil: 'domcontentloaded' })
  const clipBusy = await drawn(busyHeading)
  const clipWait = await readText(busyWait('clip-link-busy'), { timeoutMs: 2000 })
  const clipSaysGone = await page.getByRole('heading', { name: 'This clip is not available' }).count()
  chk(
    clipBusy && /\b[1-3] seconds\b/.test(clipWait) && clipSaysGone === 0,
    'a clip’s link refused for too many requests says so, and when it will try again, not that the clip is not available',
    `“Too many requests” ${clipBusy ? 'is' : 'is not'} shown; the wait reads ${JSON.stringify(clipWait)}; “This clip is not available” is shown ${clipSaysGone} time(s)`,
  )
  await refused.lift()
  const clipBack = await waitUntil(async () => (await readText(clipTitle, { timeoutMs: 500 })) === CLIP_TITLE, { timeoutMs: 15000 })
  chk(clipBack, 'and it asks again by itself, and the clip is drawn', `the title reads ${JSON.stringify(await readText(clipTitle, { timeoutMs: 500 }))}`)

  // ---------------------------------------------------------------------------
  console.log('\n— a client portal')
  const portalHeading = page.getByRole('heading', { name: PORTAL_NAME }).filter({ visible: true })
  const portalGone = page.getByRole('heading', { name: 'Portal unavailable' })
  refused = await refuse('**/api/v1/portal/**', refusal(3))
  await page.goto(`${stack.base}/portal/${PORTAL_TOKEN}`, { waitUntil: 'domcontentloaded' })
  const portalBusy = await drawn(busyHeading)
  const portalWait = await readText(busyWait('client-portal-busy'), { timeoutMs: 2000 })
  const portalSaysGone = await portalGone.count()
  chk(
    portalBusy && /\b[1-3] seconds\b/.test(portalWait) && portalSaysGone === 0,
    'a portal refused for too many requests says so, and when it will try again, not that the portal is unavailable',
    `“Too many requests” ${portalBusy ? 'is' : 'is not'} shown; the wait reads ${JSON.stringify(portalWait)}; “Portal unavailable” is shown ${portalSaysGone} time(s)`,
  )
  await refused.lift()
  const portalBack = await drawn(portalHeading)
  chk(portalBack, 'and it asks again by itself, and the portal is drawn', `the portal's name ${portalBack ? 'is' : 'is not'} drawn`)

  /*
   * DRAWN, THEN ITS NEXT REFRESH REFUSED. The portal asks again every 45
   * seconds (and on focus, once its data is 30 seconds old), so the refusal is
   * met by a page already showing the portal. The page's clock is installed
   * and jumped 46 seconds, which fires that refresh, rather than waited out.
   */
  const clockCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })
  const cp = await clockCtx.newPage()
  await cp.clock.install()
  await cp.goto(`${stack.base}/portal/${PORTAL_TOKEN}`, { waitUntil: 'domcontentloaded' })
  const cpHeading = cp.getByRole('heading', { name: PORTAL_NAME }).filter({ visible: true })
  const cpErrors = cp.getByRole('heading', { name: /Portal unavailable|Too many requests|could not be loaded/ })
  const drawnFirst = await waitUntil(async () => (await cpHeading.count()) > 0, { timeoutMs: 15000 })
  let cpAsked = 0
  await cp.route('**/api/v1/portal/**', (route) => { cpAsked += 1; return route.fulfill(refusal(30)) })
  await cp.clock.fastForward(46_000)
  const askedAgain = await waitUntil(async () => cpAsked > 0, { timeoutMs: 10000 })
  const brokeOut = await waitUntil(async () => (await cpErrors.count()) > 0, { timeoutMs: 3000 })
  const stillDrawn = await cpHeading.count()
  await clockCtx.close().catch(() => {})
  chk(
    drawnFirst && askedAgain && !brokeOut && stillDrawn > 0,
    'a portal already drawn stays drawn when a later ask is refused',
    `the portal ${drawnFirst ? 'was drawn' : 'was never drawn'} and ${askedAgain ? 'asked again' : 'never asked again'}; ${brokeOut ? 'an error page replaced it' : 'no error page appeared'}; its name is drawn ${stillDrawn} time(s)`,
  )

  refused = await refuse('**/api/v1/portal/**', failure)
  await page.goto(`${stack.base}/portal/${PORTAL_TOKEN}`, { waitUntil: 'domcontentloaded' })
  const failedHeading = page.getByRole('heading', { name: 'The portal could not be loaded' }).filter({ visible: true })
  const saysFailed = await drawn(failedHeading)
  const failedSaysGone = await portalGone.count()
  await refused.lift()
  chk(
    saysFailed && failedSaysGone === 0,
    'a portal that failed to load for another reason says it could not be loaded, not that it is unavailable',
    `“The portal could not be loaded” ${saysFailed ? 'is' : 'is not'} shown; “Portal unavailable” is shown ${failedSaysGone} time(s)`,
  )

  await page.goto(`${stack.base}/portal/nosuchportaltoken0000000000`, { waitUntil: 'domcontentloaded' })
  const unknownSaysGone = await drawn(portalGone.filter({ visible: true }))
  chk(unknownSaysGone, 'and a portal link that was never made says the portal is unavailable', `“Portal unavailable” ${unknownSaysGone ? 'is' : 'is not'} shown`)

  await ctx.close().catch(() => {})
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('public-pages-busy.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  if (A) {
    for (const id of workspacesMade) {
      const gone = await A(`/workspaces/${id}`, { method: 'DELETE' })
      if (![200, 204, 404].includes(gone.status)) leftBehind.push(`DELETE workspace ${id} answered ${gone.status}`)
    }
  }
  if (sql) {
    await sql`delete from docs where title like ${'%' + TAG}`.catch(() => {})
    await sql`delete from projects where name like ${'%' + TAG}`.catch(() => {})
    await sql`delete from spaces where name like ${'%' + TAG}`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  await browser.close().catch(() => {})
  stack?.close()
  for (const line of leftBehind) console.log(`  cleanup left behind: ${line}`)
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
