/**
 * A SESSION IN THE BROWSER: KEPT ACROSS A RELOAD AFTER ACCEPTING AN INVITATION,
 * ENDED AT ONCE WHEN A PASSWORD CHANGE ELSEWHERE ENDS IT, ONE MISTYPED
 * CURRENT PASSWORD COUNTED ONCE, AND THE TAB'S SOCKET OPENED AGAIN WHEN ITS
 * PERSON SIGNS OUT AND BACK IN — IN THAT TAB, AND IN ANOTHER TAB OF THE SAME
 * BROWSER, EVEN ONE THAT HAS SIGNED ITSELF OUT MEANWHILE
 * (`found-30-sep/an-accepted-invitation-sets-no-cookies`,
 * `found-30-sep/revoked-sessions-keep-their-access-tokens`,
 * `found-30-sep/password-change-guesses-600-an-hour`,
 * `found-30-sep/an-open-socket-outlives-its-session`,
 * `found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`,
 * `found-7-oct/a-tab-that-saw-the-sign-out-misses-the-sign-in`).
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
const EXPECTED_CHECKS = 7

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

  // -------------------------------------------------------------------------
  console.log('\n▶ signing out and back in on one tab, without a reload')
  /*
   * THE TAB'S SOCKET FOLLOWS WHO IS SIGNED IN
   * (`found-30-sep/an-open-socket-outlives-its-session`). The server ends a
   * socket whose session has ended, and signing out ends it; socket.io does
   * not reconnect after the server closes a socket, and the tab keeps one
   * socket for its life. Measured in a browser on lane 2 once the server ended
   * such sockets: signed in through the form, the tab's socket heard a message
   * in the account's own private channel; signed out from the menu and in again
   * on the same tab, no socket opened in ten seconds and the next message went
   * unheard until a reload. What the tab hears is read off its sockets' frames;
   * the messages are posted by a session of the account's own made by sign-up.
   */
  const rejoin = await account('rejoin')
  const R = apiAs(rejoin.token)
  const ownChannel = await R(`/workspaces/${rejoin.workspaceId}/chat/channels`, { method: 'POST', body: { name: `own-${TAG}`, isPrivate: true } })
  if (!ownChannel.data?.id) throw new Error(`could not make the account a private channel: ${said(ownChannel)}`)
  const sayInOwn = (text) => R(`/chat/channels/${ownChannel.data.id}/messages`, { method: 'POST', body: { body: text } })
  const tab = await newPage()
  const sockets = []
  tab.on('websocket', (ws) => {
    if (!ws.url().includes('/socket.io/')) return
    const s = { closed: false, frames: [] }
    sockets.push(s)
    ws.on('framereceived', (f) => s.frames.push(String(f.payload)))
    ws.on('close', () => { s.closed = true })
  })
  const heardOn = (list, text) => list.some((s) => s.frames.some((f) => f.includes(text)))
  const within = async (ms, cond) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) if (cond()) return true
    return cond()
  }
  /*
   * A SOCKET IS LET IN AFTER ITS CONNECTION OPENS: the server reads its session
   * first, and only then joins it to the person's own room. A message said in
   * between reaches no room the socket holds — on lane 7 under load, 3 of 7 runs
   * said it there and heard nothing. So after a socket opens again the message is
   * said again every two seconds until one is heard, for twelve seconds: what is
   * measured is that the socket opened again comes to hear the channel at all.
   */
  const sayUntilHeard = async (say, base, listOf) => {
    let first = null
    for (let n = 1, end = Date.now() + 12_000; Date.now() < end; n += 1) {
      const text = `${base}-${n}`
      const answer = await say(text)
      first ??= answer
      if (answer.status !== 201) return { said: answer, heard: false }
      if (await within(2_000, () => heardOn(listOf(), text))) return { said: first, heard: true }
    }
    return { said: first ?? { status: 0 }, heard: false }
  }
  await signInForm(tab, rejoin.email)
  // Marked, so the second sign-in is known to be on this page and not a reload of it.
  await tab.evaluate(() => { window.__sameTab = 'the first sign-in' })
  const firstOpen = await within(15_000, () => sockets.some((s) => !s.closed))
  const beforeText = `${TAG}-heard-before`
  const saidBefore = await sayInOwn(beforeText)
  const heardBefore = await within(10_000, () => heardOn(sockets, beforeText))
  await tab.locator('[data-testid=user-menu]').click()
  await tab.getByRole('menuitem', { name: 'Sign out' }).click()
  await tab.waitForURL(/\/login/, { timeout: 30_000 })
  const firstCount = sockets.length
  // The sign-in page the menu left the tab on: no page.goto, which would load the page anew.
  await tab.fill('input[type=email]', rejoin.email)
  await tab.fill('input[type=password]', PASSWORD)
  await tab.click('button[type=submit]')
  await tab.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const sameTab = await tab.evaluate(() => window.__sameTab === 'the first sign-in')
  const reopened = () => sockets.slice(firstCount).filter((s) => !s.closed)
  const secondOpen = await within(15_000, () => reopened().length > 0)
  const { said: saidAfter, heard: heardAfter } = await sayUntilHeard(sayInOwn, `${TAG}-heard-after`, () => sockets.slice(firstCount))
  chk(
    firstOpen && saidBefore.status === 201 && heardBefore && sameTab && secondOpen && saidAfter.status === 201 && heardAfter,
    'signing out from the menu and back in on the same tab, without a reload, opens the tab’s realtime socket again on the new session: a message in the account’s own private channel is heard after it, as one was before',
    `before signing out, ${firstOpen ? 'a socket opened' : 'NO socket opened'} and the message (${saidBefore.status}) was ${heardBefore ? 'heard' : 'NOT heard'}; signed in again ${sameTab ? 'on the same page' : 'after the page was LOADED ANEW (this measured nothing)'}: ${reopened().length} socket(s) open since, and the message (${saidAfter.status}) was ${heardAfter ? 'heard' : 'NOT heard'}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ two tabs of one browser: one signs out and back in, the other listens')
  /*
   * ANOTHER TAB OF THE SAME BROWSER FOLLOWS THE SIGN-IN
   * (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`). The tabs of a
   * browser share one session, its cookies; signing out in one ends it, and the
   * server ends every tab's socket on it, as it must. Measured with two tabs on
   * lane 2 before, three runs alike: the person signed out from the first
   * tab's menu and back in through its form; the second tab, open on a list,
   * had its socket closed within the server's sweep and none opened again, and
   * neither a message in the person's own channel nor a task made in that list
   * reached it until it was reloaded — its requests carried the new session's
   * cookie, so no refusal led it to refresh, and its store still named the
   * person. Nothing was found on how ClickUp's other tabs follow a sign-in
   * (search excerpts; its help centre is blocked here).
   *
   * The listening tab is the one the person signed in from, so it holds the
   * session's token in memory, as such a tab does — and that token is the
   * ended session's once the other tab signs out; it reaches its list by the
   * app's own navigation, since a page load would drop the token. The other
   * tab signs back in only after the server has closed the listening tab's
   * socket, so what opens it again is the other tab's sign-in. What the
   * listening tab hears is read off its sockets' frames, and the task off the
   * list it draws.
   */
  const twin = await account('twin')
  const T = apiAs(twin.token)
  const twinSpace = await T('/spaces', { method: 'POST', body: { workspaceId: twin.workspaceId, name: `Twin ${TAG}` } })
  const twinProject = await T('/projects', { method: 'POST', body: { spaceId: twinSpace.data?.id, name: `Twin project ${TAG}` } })
  const twinList = await T('/lists', { method: 'POST', body: { projectId: twinProject.data?.id, name: `Twin list ${TAG}` } })
  const twinChannel = await T(`/workspaces/${twin.workspaceId}/chat/channels`, { method: 'POST', body: { name: `twin-${TAG}`, isPrivate: true } })
  if (!twinList.data?.id || !twinChannel.data?.id) {
    throw new Error(`could not make the two-tab check its list and channel: ${said(twinSpace)} / ${said(twinProject)} / ${said(twinList)} / ${said(twinChannel)}`)
  }
  const sayInTwin = (text) => T(`/chat/channels/${twinChannel.data.id}/messages`, { method: 'POST', body: { body: text } })
  const taskInTwin = (title) => T('/tasks', { method: 'POST', body: { listId: twinList.data.id, title } })
  /** A tab's sockets: when each opened, what it sent and heard, and when it closed. */
  const socketsOf = (page) => {
    const list = []
    page.on('websocket', (ws) => {
      if (!ws.url().includes('/socket.io/')) return
      const s = { at: Date.now(), closed: false, closedAt: null, frames: [], sent: [] }
      list.push(s)
      ws.on('framereceived', (f) => s.frames.push(String(f.payload)))
      ws.on('framesent', (f) => s.sent.push(String(f.payload)))
      ws.on('close', () => { s.closed = true; s.closedAt = Date.now() })
    })
    return list
  }
  /** Whether a socket asked to be let in with a token of the tab's own (its namespace's connect packet carries `auth`). */
  const openedOnAToken = (s) => s.sent.some((f) => f.startsWith('40/realtime,') && f.includes('"token":"ey'))
  const drawnIn = (page) => async (ms, title) => {
    const drawn = () => page.getByText(title).first().isVisible().catch(() => false)
    for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) if (await drawn()) return true
    return drawn()
  }
  const browserOfTwo = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
  const listeningTab = await browserOfTwo.newPage()
  const listening = socketsOf(listeningTab)
  await signInForm(listeningTab, twin.email)
  const twinListPath = `/app/${twin.workspaceId}/${twinSpace.data.id}/${twinProject.data.id}/${twinList.data.id}`
  await listeningTab.evaluate((to) => window.history.pushState({}, '', to), twinListPath)
  // Marked, so what it hears after is known to be this page and not a reload of it.
  await listeningTab.evaluate(() => { window.__sameTab = 'the listening tab as first loaded' })
  const inTheList = `list:${twinList.data.id}`
  const listened = await within(20_000, () => listening.some((s) => !s.closed && s.sent.some((f) => f.includes('subscribe') && f.includes(inTheList))))
  const onItsToken = listening.some((s) => !s.closed && openedOnAToken(s))
  const twinDrawn = drawnIn(listeningTab)
  const signingTab = await browserOfTwo.newPage()
  await signingTab.goto(`${stack.base}/app/${twin.workspaceId}`, { waitUntil: 'domcontentloaded' })
  await signingTab.locator('[data-testid=user-menu]').waitFor({ timeout: 30_000 })
  const twinBefore = { message: `${TAG}-twin-heard-before`, task: `${TAG}-twin-task-before` }
  const twinSaidBefore = await sayInTwin(twinBefore.message)
  const twinMadeBefore = await taskInTwin(twinBefore.task)
  const twinHeardBefore = await within(10_000, () => heardOn(listening, twinBefore.message))
  const twinDrawnBefore = await twinDrawn(10_000, twinBefore.task)
  // The other tab signs out from its menu; the server ends the listening tab's socket with the session.
  const signedOutAt = Date.now()
  await signingTab.locator('[data-testid=user-menu]').click()
  await signingTab.getByRole('menuitem', { name: 'Sign out' }).click()
  await signingTab.waitForURL(/\/login/, { timeout: 30_000 })
  const endedByServer = await within(15_000, () => listening.length > 0 && listening.filter((s) => s.at < signedOutAt).every((s) => s.closed))
  // Only then does the person sign back in, through the other tab's form.
  const signedInAt = Date.now()
  await signingTab.fill('input[type=email]', twin.email)
  await signingTab.fill('input[type=password]', PASSWORD)
  await signingTab.click('button[type=submit]')
  await signingTab.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const sinceSignIn = () => listening.filter((s) => s.at >= signedInAt)
  await within(15_000, () => sinceSignIn().some((s) => !s.closed))
  const openAgain = sinceSignIn().filter((s) => !s.closed).length
  const twinAfter = { message: `${TAG}-twin-heard-after`, task: `${TAG}-twin-task-after` }
  const { said: twinSaidAfter, heard: twinHeardAfter } = await sayUntilHeard(sayInTwin, twinAfter.message, sinceSignIn)
  const twinMadeAfter = await taskInTwin(twinAfter.task)
  const twinDrawnAfter = await twinDrawn(10_000, twinAfter.task)
  const sameListeningTab = await listeningTab.evaluate(() => window.__sameTab === 'the listening tab as first loaded')
  const stillHolds = await listeningTab.evaluate(() => {
    try { return !!JSON.parse(localStorage.getItem('rundesk.auth') ?? '{}')?.state?.user } catch { return false }
  })
  const stillOnTheList = new URL(listeningTab.url()).pathname.endsWith(`/${twinList.data.id}`)
  await browserOfTwo.close()
  chk(
    listened && onItsToken && twinSaidBefore.status === 201 && twinMadeBefore.status === 201 && twinHeardBefore && twinDrawnBefore &&
      endedByServer && sameListeningTab && stillOnTheList && stillHolds && openAgain > 0 &&
      twinSaidAfter.status === 201 && twinMadeAfter.status === 201 && twinHeardAfter && twinDrawnAfter,
    'when the person signs out and back in from one tab, another tab of the same browser opens its realtime socket again on the new session without a reload: a message in their own private channel is heard there, and the list it shows draws a task made after, as before',
    `before: the listening tab ${listened ? 'subscribed its list' : 'NEVER subscribed its list'} on ${onItsToken ? 'the token it signed in with' : 'NO token of its own (this measured nothing)'}, heard the message (${twinSaidBefore.status}) ${twinHeardBefore ? 'yes' : 'NO'}, drew the task (${twinMadeBefore.status}) ${twinDrawnBefore ? 'yes' : 'NO'}; the other tab signed out, and the server ${endedByServer ? 'closed' : 'did NOT close'} the listening tab's socket before the sign-in; the listening tab ${sameListeningTab ? 'was the same page' : 'was LOADED ANEW (this measured nothing)'}, ${stillOnTheList && stillHolds ? 'still on its list and signed in' : 'was SIGNED OUT or moved (this measured nothing)'}, with ${openAgain} socket(s) open since the sign-in; the message (${twinSaidAfter.status}) was ${twinHeardAfter ? 'heard' : 'NOT heard'} and the task (${twinMadeAfter.status}) ${twinDrawnAfter ? 'drawn' : 'NOT drawn'}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ two tabs of one browser: the listening tab signs itself out before the person signs back in')
  /*
   * A TAB THAT CLEARED ITSELF AFTER THE SIGN-OUT TAKES ITS PERSON BACK AT THE
   * NEXT SIGN-IN (`found-7-oct/a-tab-that-saw-the-sign-out-misses-the-sign-in`).
   * After the other tab's sign-out the listening tab still names the person,
   * until its own next request finds no session: its refresh fails and it
   * clears its store. A sign-in made in the other tab after that names the
   * person after nobody, but the tab names nobody, and nothing followed it. The
   * check above races it: on lane 6, 1 run in 6 lost, the tab clearing itself
   * 11.7 s after the sign-out and hearing the sign-in at 13.7 s, its socket
   * left closed on its list. Here the sign-in waits until the listening tab
   * has written nobody to the shared storage itself (a script the browser runs
   * before the page logs each tab's own writes; its top bar asks the server
   * every 15 s), so the race is lost every time.
   */
  const cleared = await account('cleared')
  const K = apiAs(cleared.token)
  const clearedSpace = await K('/spaces', { method: 'POST', body: { workspaceId: cleared.workspaceId, name: `Cleared ${TAG}` } })
  const clearedProject = await K('/projects', { method: 'POST', body: { spaceId: clearedSpace.data?.id, name: `Cleared project ${TAG}` } })
  const clearedList = await K('/lists', { method: 'POST', body: { projectId: clearedProject.data?.id, name: `Cleared list ${TAG}` } })
  const clearedChannel = await K(`/workspaces/${cleared.workspaceId}/chat/channels`, { method: 'POST', body: { name: `cleared-${TAG}`, isPrivate: true } })
  if (!clearedList.data?.id || !clearedChannel.data?.id) {
    throw new Error(`could not make the cleared-tab check its list and channel: ${said(clearedSpace)} / ${said(clearedProject)} / ${said(clearedList)} / ${said(clearedChannel)}`)
  }
  const sayInCleared = (text) => K(`/chat/channels/${clearedChannel.data.id}/messages`, { method: 'POST', body: { body: text } })
  const taskInCleared = (title) => K('/tasks', { method: 'POST', body: { listId: clearedList.data.id, title } })
  const browserOfCleared = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
  // Each write a tab makes itself to the shared storage's sign-in, and whom it names (what it hears is not a write of its own).
  await browserOfCleared.addInitScript(() => {
    const writes = []
    window.__authWrites = writes
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'rundesk.auth') {
        let who = null
        try { who = JSON.parse(value)?.state?.user?.id ?? null } catch { who = 'unreadable' }
        writes.push({ at: Date.now(), who })
      }
      return setItem.call(this, key, value)
    }
  })
  const clearingTab = await browserOfCleared.newPage()
  const clearing = socketsOf(clearingTab)
  await signInForm(clearingTab, cleared.email)
  const clearedListPath = `/app/${cleared.workspaceId}/${clearedSpace.data.id}/${clearedProject.data.id}/${clearedList.data.id}`
  await clearingTab.evaluate((to) => window.history.pushState({}, '', to), clearedListPath)
  await clearingTab.evaluate(() => { window.__sameTab = 'the clearing tab as first loaded' })
  const clearedRoom = `list:${clearedList.data.id}`
  const clearingListened = await within(20_000, () => clearing.some((s) => !s.closed && s.sent.some((f) => f.includes('subscribe') && f.includes(clearedRoom))))
  const clearingOnItsToken = clearing.some((s) => !s.closed && openedOnAToken(s))
  const clearedDrawn = drawnIn(clearingTab)
  const outTab = await browserOfCleared.newPage()
  await outTab.goto(`${stack.base}/app/${cleared.workspaceId}`, { waitUntil: 'domcontentloaded' })
  await outTab.locator('[data-testid=user-menu]').waitFor({ timeout: 30_000 })
  const clearedBefore = { message: `${TAG}-cleared-heard-before`, task: `${TAG}-cleared-task-before` }
  const clearedSaidBefore = await sayInCleared(clearedBefore.message)
  const clearedMadeBefore = await taskInCleared(clearedBefore.task)
  const clearedHeardBefore = await within(10_000, () => heardOn(clearing, clearedBefore.message))
  const clearedDrawnBefore = await clearedDrawn(10_000, clearedBefore.task)
  // The other tab signs out from its menu; the server ends the listening tab's socket with the session.
  const outAt = Date.now()
  await outTab.locator('[data-testid=user-menu]').click()
  await outTab.getByRole('menuitem', { name: 'Sign out' }).click()
  await outTab.waitForURL(/\/login/, { timeout: 30_000 })
  const clearedEndedByServer = await within(15_000, () => clearing.length > 0 && clearing.filter((s) => s.at < outAt).every((s) => s.closed))
  // Then the listening tab's own next request finds no session, and it writes nobody itself.
  let clearedItselfAt = null
  for (const end = Date.now() + 45_000; clearedItselfAt === null && Date.now() < end; await sleep(500)) {
    const writes = await clearingTab.evaluate(() => window.__authWrites ?? []).catch(() => [])
    clearedItselfAt = writes.find((w) => w.at >= outAt && w.who === null)?.at ?? null
  }
  // Only then does the person sign back in, through the other tab's form.
  const backAt = Date.now()
  await outTab.fill('input[type=email]', cleared.email)
  await outTab.fill('input[type=password]', PASSWORD)
  await outTab.click('button[type=submit]')
  await outTab.waitForURL(/\/app\//, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const sinceBack = () => clearing.filter((s) => s.at >= backAt)
  await within(15_000, () => sinceBack().some((s) => !s.closed))
  const clearedOpenAgain = sinceBack().filter((s) => !s.closed).length
  const clearedAfter = { message: `${TAG}-cleared-heard-after`, task: `${TAG}-cleared-task-after` }
  const { said: clearedSaidAfter, heard: clearedHeardAfter } = await sayUntilHeard(sayInCleared, clearedAfter.message, sinceBack)
  const clearedMadeAfter = await taskInCleared(clearedAfter.task)
  const clearedDrawnAfter = await clearedDrawn(10_000, clearedAfter.task)
  const sameClearingTab = await clearingTab.evaluate(() => window.__sameTab === 'the clearing tab as first loaded')
  const clearingOnTheList = new URL(clearingTab.url()).pathname.endsWith(`/${clearedList.data.id}`)
  await browserOfCleared.close()
  chk(
    clearingListened && clearingOnItsToken && clearedSaidBefore.status === 201 && clearedMadeBefore.status === 201 && clearedHeardBefore && clearedDrawnBefore &&
      clearedEndedByServer && clearedItselfAt !== null && sameClearingTab && clearingOnTheList && clearedOpenAgain > 0 &&
      clearedSaidAfter.status === 201 && clearedMadeAfter.status === 201 && clearedHeardAfter && clearedDrawnAfter,
    'when another tab of the same browser has signed itself out after the person signed out elsewhere, their next sign-in there gives it back its realtime socket without a reload: a message in their own private channel is heard there, and the list it shows draws a task made after, as before',
    `before: the listening tab ${clearingListened ? 'subscribed its list' : 'NEVER subscribed its list'} on ${clearingOnItsToken ? 'the token it signed in with' : 'NO token of its own (this measured nothing)'}, heard the message (${clearedSaidBefore.status}) ${clearedHeardBefore ? 'yes' : 'NO'}, drew the task (${clearedMadeBefore.status}) ${clearedDrawnBefore ? 'yes' : 'NO'}; the other tab signed out, the server ${clearedEndedByServer ? 'closed' : 'did NOT close'} the listening tab's socket, and the listening tab ${clearedItselfAt !== null ? `wrote nobody itself ${((clearedItselfAt - outAt) / 1000).toFixed(1)} s after the sign-out, before the sign-in` : 'NEVER wrote nobody itself in 45 s (this measured nothing)'}; it ${sameClearingTab ? 'was the same page' : 'was LOADED ANEW (this measured nothing)'}, ${clearingOnTheList ? 'still on its list' : 'MOVED off its list (this measured nothing)'}, with ${clearedOpenAgain} socket(s) open since the sign-in; the message (${clearedSaidAfter.status}) was ${clearedHeardAfter ? 'heard' : 'NOT heard'} and the task (${clearedMadeAfter.status}) ${clearedDrawnAfter ? 'drawn' : 'NOT drawn'}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ two tabs of one browser: one signs in again without signing out, under one session at a time')
  /*
   * A SIGN-IN THAT IS NOT AFTER A SIGN-OUT
   * (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`, review). The
   * person signs in again at /login in one tab without signing out (the page
   * does not send a signed-in person away), and the workspace allows one
   * session at a time, so the new session ends the one the other tab's socket
   * was on. The storage write names the same person before and after, or
   * nothing new, so no storage event says it. Measured with two tabs on lane 2
   * before: the listening tab's socket was closed 4.1 s after the re-sign-in,
   * none opened again, its own read of the list still answered 200 on the
   * browser's new cookie, and a task a colleague made in the list was not
   * drawn. Now a socket the server closes is opened again on the browser's
   * session when that session is still the tab's person (`followServerClose`).
   */
  const again = await account('again')
  const colleague = await account('again-colleague')
  const A = apiAs(again.token)
  const joined = await A(`/workspaces/${again.workspaceId}/members`, { method: 'POST', body: { email: colleague.email, role: 'member' } })
  const againSpace = await A('/spaces', { method: 'POST', body: { workspaceId: again.workspaceId, name: `Again ${TAG}` } })
  const againProject = await A('/projects', { method: 'POST', body: { spaceId: againSpace.data?.id, name: `Again project ${TAG}` } })
  const againList = await A('/lists', { method: 'POST', body: { projectId: againProject.data?.id, name: `Again list ${TAG}` } })
  // Last, since it ends this sign-up's session at the first sign-in through the form.
  const oneSession = await A(`/workspaces/${again.workspaceId}/security-settings`, { method: 'PATCH', body: { maxConcurrentSessions: 1 } })
  if (!joined.ok || !againList.data?.id || !oneSession.ok) {
    throw new Error(`could not make the sign-in-again check its colleague, list and policy: ${said(joined)} / ${said(againList)} / ${said(oneSession)}`)
  }
  const C = apiAs(colleague.token)
  const taskInAgain = (title) => C('/tasks', { method: 'POST', body: { listId: againList.data.id, title } })
  const browserOfOne = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
  const stayingTab = await browserOfOne.newPage()
  const staying = socketsOf(stayingTab)
  await signInForm(stayingTab, again.email)
  const againListPath = `/app/${again.workspaceId}/${againSpace.data.id}/${againProject.data.id}/${againList.data.id}`
  await stayingTab.evaluate((to) => window.history.pushState({}, '', to), againListPath)
  await stayingTab.evaluate(() => { window.__sameTab = 'the staying tab as first loaded' })
  const againRoom = `list:${againList.data.id}`
  const stayingListened = await within(20_000, () => staying.some((s) => !s.closed && s.sent.some((f) => f.includes('subscribe') && f.includes(againRoom))))
  const againDrawn = drawnIn(stayingTab)
  const madeBefore = await taskInAgain(`${TAG}-again-task-before`)
  const drawnBefore = await againDrawn(10_000, `${TAG}-again-task-before`)
  // The other tab signs in again as the same person, without signing out.
  const reSignedAt = Date.now()
  const otherTab = await browserOfOne.newPage()
  await signInForm(otherTab, again.email)
  const closedByServer = await within(15_000, () => staying.filter((s) => s.at < reSignedAt).every((s) => s.closed))
  const sinceReSignIn = () => staying.filter((s) => s.at >= reSignedAt)
  await within(15_000, () => sinceReSignIn().some((s) => !s.closed))
  const reopenedSince = sinceReSignIn().filter((s) => !s.closed).length
  const madeAfter = await taskInAgain(`${TAG}-again-task-after`)
  const drawnAfter = await againDrawn(12_000, `${TAG}-again-task-after`)
  const sameStayingTab = await stayingTab.evaluate(() => window.__sameTab === 'the staying tab as first loaded')
  const stayingRead = await stayingTab.evaluate(async (id) => (await fetch(`/api/v1/lists/${id}`, { credentials: 'include' })).status, againList.data.id)
  await browserOfOne.close()
  chk(
    stayingListened && madeBefore.status === 201 && drawnBefore && closedByServer && sameStayingTab && stayingRead === 200 &&
      reopenedSince > 0 && madeAfter.status === 201 && drawnAfter,
    'when the person signs in again from one tab without signing out, under a policy of one session at a time, another tab of the same browser opens its realtime socket again on the new session without a reload, and the list it shows draws a task a colleague makes after, as before',
    `before: the staying tab ${stayingListened ? 'subscribed its list' : 'NEVER subscribed its list'} and drew the colleague’s task (${madeBefore.status}) ${drawnBefore ? 'yes' : 'NO'}; after the other tab signed in again, its socket was ${closedByServer ? 'closed by the server' : 'NOT closed (the policy ended nothing; this measured nothing)'}, it ${sameStayingTab ? 'was the same page' : 'was LOADED ANEW (this measured nothing)'} and its own read of the list answered ${stayingRead}, with ${reopenedSince} socket(s) open since; the colleague’s task (${madeAfter.status}) was ${drawnAfter ? 'drawn' : 'NOT drawn'}`,
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
