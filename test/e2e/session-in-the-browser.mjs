/**
 * A SESSION IN THE BROWSER: KEPT ACROSS A RELOAD AFTER ACCEPTING AN INVITATION,
 * ENDED AT ONCE WHEN A PASSWORD CHANGE ELSEWHERE ENDS IT, AND ONE MISTYPED
 * CURRENT PASSWORD COUNTED ONCE
 * (`found-30-sep/an-accepted-invitation-sets-no-cookies`,
 * `found-30-sep/revoked-sessions-keep-their-access-tokens`,
 * `found-30-sep/password-change-guesses-600-an-hour`).
 *
 * Measured first in a browser on lane 3, three runs alike (`9b5ced3`'s API
 * and web):
 *  - a newcomer who accepted an invitation held no cookie, and a reload signed
 *    them out: `GET /users/me` 401, the refresh 401, the store cleared, and
 *    `/app` sent them to the sign-in page. `POST /invitations/claim` answered
 *    the session in its body alone, and the web keeps no token across a reload
 *    (the store persists the user; the cookies are the session);
 *  - a browser whose session a password change made elsewhere had ended still
 *    read after a reload (`GET /users/me` 200), for as long as its access
 *    token had left;
 *  - one mistyped current password in Profile › Security sent the change, a
 *    refresh, and the change again: the route answered 401, which the web's
 *    client reads as an expired token. Harmless while a wrong current password
 *    counted for nothing; counted toward the lockout, each mistype would count
 *    twice.
 *
 * ClickUp: an invitee "will need to fill in the basic information to create
 * your account", and is then in the Workspace (search excerpts; its help
 * centre is blocked here); nothing says a reload signs them out. OWASP: "A web
 * application should make use of cookies for session ID exchange management"
 * (Session Management Cheat Sheet), and when a session is terminated "the
 * application disallows any further use of the session" (ASVS 5.0, 7.4.1).
 *
 * The API's side of each (the cookies on the claim's answer, a revoked
 * session refused on a read, a wrong current password answered 403 and
 * counted) is `sign-in-and-password.mjs`'s; this is what a person sees.
 *
 *   node test/e2e/session-in-the-browser.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { startLocalStack } from './lib/local-stack.mjs'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, madeAccount } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 3

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const TAG = `sib${Date.now()}`
const PASSWORD = 'Session@12345!x'
const mail = (who) => `${TAG}-${who}@rundesk.invalid`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const API = `${stack.base}/api/v1`
/* NEVER THROWS — `{status, data, error}`. lib/fixture.mjs's one client. */
const apiAs = apiAsAt(API)
let sql = null
let browser = null
/** Each workspace made here, and how to sign in to delete it: taken back in `finally`. */
const made = []

/** An account of this suite's own, made by sign-up: `{ email, password, id, token, refreshToken, workspaceId }`. */
const account = async (who) => {
  const s = await signUpApi(API, { email: mail(who), fullName: `Session ${who}`, password: PASSWORD, organizationName: `Session ${who} ${TAG}` })
  const a = { email: mail(who), password: PASSWORD, id: s.user.id, token: s.accessToken, refreshToken: s.refreshToken, workspaceId: s.workspaces?.[0]?.id ?? null }
  if (a.workspaceId) made.push(a)
  return a
}
const newPage = async () => (await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })).newPage()
const signInForm = async (page, email) => {
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
}

/*
 * A RELOAD, AND WHETHER THE PERSON IS STILL SIGNED IN AFTER IT: what
 * `GET /users/me` and a refresh answered on the way, whether the page still
 * holds a user (the store keeps it in localStorage, and clears it when a
 * refresh fails), and where a fresh visit to /app lands. Signed in = /users/me
 * answered 200, a user is held, and /app does not send them to /login.
 */
const reloadAndSee = async (page) => {
  const answers = []
  const onResponse = (r) => {
    const u = r.url()
    if (u.includes('/api/v1/users/me') || u.includes('/api/v1/auth/refresh')) answers.push(`${r.request().method()} ${new URL(u).pathname.replace('/api/v1', '')} ${r.status()}`)
  }
  page.on('response', onResponse)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await sleep(4_000)
  page.off('response', onResponse)
  const held = await page.evaluate(() => {
    try { return !!JSON.parse(localStorage.getItem('rundesk.auth') ?? '{}')?.state?.user } catch { return false }
  })
  await page.goto(`${stack.base}/app`, { waitUntil: 'domcontentloaded' })
  await sleep(3_000)
  const landed = new URL(page.url()).pathname
  const read = answers.includes('GET /users/me 200')
  return { signedIn: read && held && !/\/login/.test(landed), signedOut: !read && !held && /\/login/.test(landed), read, held, landed, answers }
}
const seenSays = (seen) =>
  `/users/me ${seen.read ? 'answered 200' : 'never answered 200'}; a user ${seen.held ? 'held' : 'not held'}; /app landed on ${seen.landed.replace(/[0-9a-f-]{36}/, '<workspace>')}; on the way: ${seen.answers.join(', ') || 'nothing asked'}`

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the lockout’s count is read from the database, which the API tells nobody')
  browser = await (await resolveChromium()).launch(launchOptions())

  // -------------------------------------------------------------------------
  console.log('\n▶ accepting an invitation, then a reload')
  const host = await account('host')
  const H = apiAs(host.token)
  const newcomer = mail('newcomer')
  const invited = await H('/invitations', { method: 'POST', body: { email: newcomer, workspaceId: host.workspaceId, role: 'member' } })
  const link = invited.data?.id ? await H(`/invitations/${invited.data.id}/link`) : null
  const token = link?.data?.claimUrl ? new URL(link.data.claimUrl).searchParams.get('token') : null
  if (!token) throw new Error(`could not invite ${newcomer}: ${said(invited)}`)
  // The page's Accept makes the newcomer's account, through no route this file
  // names: registered here, before it is made, so it goes when the run ends
  // (`lib/made.mjs`; one was left on lane 6 a run).
  madeAccount({ email: newcomer })
  const invitee = await newPage()
  await invitee.goto(`${stack.base}/accept-invite?token=${encodeURIComponent(token)}`, { waitUntil: 'domcontentloaded' })
  await invitee.locator('#name').fill('Session newcomer')
  await invitee.locator('#password').fill(PASSWORD)
  await invitee.getByRole('button', { name: 'Accept Invitation' }).click()
  await invitee.waitForURL(/\/app\//, { timeout: 60_000 })
  await sleep(1_500)
  const held = (await invitee.context().cookies()).map((c) => c.name).filter((n) => ['access_token', 'refresh_token', 'csrf_token'].includes(n)).sort()
  const afterAccept = await reloadAndSee(invitee)
  chk(
    held.length === 3 && afterAccept.signedIn,
    'a newcomer who accepts an invitation holds the session cookies, and a reload keeps them signed in: /users/me answers 200, a user is held, and /app does not send them to the sign-in page',
    `after accepting, the browser held ${held.join(', ') || 'no session cookie'}; after a reload: ${seenSays(afterAccept)}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ one mistyped current password in Profile › Security')
  const typist = await account('typist')
  const profile = await newPage()
  await signInForm(profile, typist.email)
  await profile.goto(`${stack.base}/app/profile?tab=security`, { waitUntil: 'domcontentloaded' })
  const fields = profile.locator('input[type=password]')
  await fields.nth(2).waitFor({ timeout: 30_000 })
  const asked = []
  profile.on('request', (r) => {
    const u = r.url()
    if (u.includes('/users/me/change-password') || u.includes('/auth/refresh')) asked.push(`${r.method()} ${new URL(u).pathname.replace('/api/v1', '')}`)
  })
  await fields.nth(0).fill('Mistyped@12345!x')
  await fields.nth(1).fill('Another@12345!xy')
  await fields.nth(2).fill('Another@12345!xy')
  await profile.getByRole('button', { name: 'Update password' }).click()
  const shown = await profile.getByText('Current password is incorrect').first().waitFor({ timeout: 15_000 }).then(() => true, () => false)
  await sleep(1_500)
  const [count] = await sql`select failed_login_attempts from users where id = ${typist.id}`
  chk(
    shown && asked.length === 1 && asked[0] === 'POST /users/me/change-password' && count?.failed_login_attempts === 1,
    'one mistyped current password sends one change and counts one wrong password: the page says "Current password is incorrect", with no refresh and no second change, and failed_login_attempts reads 1',
    `the page ${shown ? 'said' : 'did NOT say'} "Current password is incorrect"; one click sent ${asked.join(' → ') || 'nothing'}; failed_login_attempts ${count?.failed_login_attempts ?? '?'}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ a password change made elsewhere ends the browser’s session')
  const elsewhere = await account('elsewhere')
  const signedIn = await newPage()
  await signInForm(signedIn, elsewhere.email)
  const other = await signInApi(API, elsewhere.email, PASSWORD)
  const changed = await apiAs(other.accessToken)('/users/me/change-password', {
    method: 'POST',
    body: { currentPassword: PASSWORD, newPassword: 'Elsewhere@12345!x', currentRefreshToken: other.refreshToken },
  })
  if (changed.status === 201) elsewhere.password = 'Elsewhere@12345!x'
  const afterChange = await reloadAndSee(signedIn)
  chk(
    changed.status === 201 && afterChange.signedOut,
    'a browser whose session a password change made elsewhere has ended is signed out at its next reload: /users/me and the refresh are refused, no user is held, and /app sends it to the sign-in page',
    `the change answered ${said(changed)}; the browser, reloaded at once: ${seenSays(afterChange)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  for (const a of made.reverse()) {
    // A session this run ended is refused at once: signed in again as the account is now.
    let gone = await apiAs(a.token)(`/workspaces/${a.workspaceId}`, { method: 'DELETE' })
    if (gone.status === 401) {
      const again = await signInApi(API, a.email, a.password).catch(() => null)
      if (again?.accessToken) gone = await apiAs(again.accessToken)(`/workspaces/${a.workspaceId}`, { method: 'DELETE' })
    }
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${a.workspaceId} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETEs above go through this proxy, and a closed one refuses them.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
