/**
 * EVERY WRONG PASSWORD COUNTS TOWARD THE LOCKOUT, AN EMAIL IS THE SAME IN ANY
 * CASE, AND CHANGING ONE'S PASSWORD IS LIMITED PER PERSON, HELD TO THE
 * WORKSPACE'S POLICY AND SIGNS OUT EVERY OTHER SESSION
 * (`found-30-sep/lockout-counts-overlapping-attempts-once`,
 * `found-30-sep/sign-in-reads-the-email-as-typed`,
 * `found-30-sep/password-change-unthrottled`).
 *
 * Measured first on lane 3, three runs alike:
 *  - four, five or eight wrong passwords sent at once to a fresh account each
 *    left `failed_login_attempts` at 1, and none locked it; the count was read
 *    with the account and written back plus one, so overlapping attempts wrote
 *    the same number;
 *  - an account made in lower case was refused 401 with its email typed with a
 *    capital; a member could not be added by it ("No user with email"); and an
 *    account stored with capitals, as the retired register route wrote one,
 *    was refused in lower case, sent no reset link, and sign-up made a second
 *    account beside it;
 *  - eleven wrong current passwords in a row to `POST /users/me/change-password`
 *    were all answered 401; `password1` was accepted as a new password; and
 *    after a change every other session still refreshed.
 *
 * ClickUp (read through search results; its help centre is blocked here) holds
 * a changed password to the rule every password meets ("Passwords created for
 * ClickUp must be a minimum of 8 characters and include a minimum of one
 * uppercase character, a minimum of one lowercase character, and a minimum of
 * one number or special character"), and offers "Log out of all sessions".
 * OWASP: user names "should be case-insensitive", and "email addresses are
 * already case insensitive" (authentication cheat sheet); the application
 * should "terminate all other active sessions after a successful password
 * change" (ASVS 3.3.3).
 *
 * HOW IT IS MEASURED. Every sign-in, reset request, refresh and claim here
 * leaves from a loopback address of its own (127.0.21.x), so no per-address
 * budget refuses one and 127.0.0.1's, which every other suite on a lane shares,
 * is not spent. Accounts are made from 127.0.0.11–13 in turn. The lockout's
 * counts are read from the database (`DATABASE_URL`, the lane's): the API tells
 * nobody how many wrong passwords an account has had. The password change's
 * ten a minute is per person, so its burst starts where a minute has at least
 * fifteen seconds left, and says so if it crossed into the next.
 *
 * NOT MEASURED HERE: the breach list (`blockBreachedPasswords` asks
 * api.pwnedpasswords.com, which a lane cannot reach; `users.service.test.ts`
 * holds it), and SSO's, SCIM's, Google's and a form's lookups by email, which
 * `same-email.test.ts` and each service's own tests hold.
 *
 *   node test/e2e/sign-in-and-password.mjs --api 3011
 */
import http from 'node:http'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { openDb } from './lib/db.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 16

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`

/* The policy's numbers, stated here and in the check sentences, not read from the source. */
const LOCKOUT_THRESHOLD = 5
const PASSWORD_CHANGE_LIMIT = 10
const WINDOW_MS = 60_000
/** Where the accounts are made from, in turn: sign-up's ten a minute each. */
const MAKERS = ['127.0.0.11', '127.0.0.12', '127.0.0.13']
/** Where one person's password changes come from, and the same person from elsewhere. */
const CHANGER = '127.0.22.1'
const ELSEWHERE = '127.0.22.2'

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. lib/fixture.mjs's one client, for the calls from 127.0.0.1. */
const apiAs = apiAsAt(API)
/* A session is said as whose it is, not as its tokens. */
const said = (res) =>
  res.data?.accessToken
    ? `${res.status}, a session for ${res.data.user?.email ?? 'somebody'}`
    : `${res.status} ${JSON.stringify(res.error ?? res.data ?? null).slice(0, 160)}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const windowOf = (t) => Math.floor(t / WINDOW_MS)

/*
 * ONE REQUEST, from the loopback address `from` names, on a connection of its
 * own, as a Bearer client (`token`) or a browser (`cookie`, and the CSRF
 * header in `headers`). `node:http` rather than `fetch`, because `fetch`
 * cannot choose the address a request leaves from. NEVER THROWS — `{status,
 * data, error, cookies, retryAfter, sentAt, at}`, status 0 when nothing
 * answered, and every caller reads the status.
 */
const visit = (route, { from = null, method = 'GET', body, token = null, cookie = null, headers = {} } = {}) =>
  new Promise((resolve) => {
    const sentAt = Date.now()
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body))
    const answer = (fields) =>
      resolve({ status: 0, data: null, error: null, cookies: {}, retryAfter: null, sentAt, at: Date.now(), ...fields })
    const sent = { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}) }
    const req = http.request(`${API}${route}`, {
      method,
      agent: false,
      ...(from ? { localAddress: from } : {}),
      headers: payload ? { ...sent, 'content-type': 'application/json', 'content-length': payload.length } : sent,
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('error', (err) => answer({ error: { message: `the answer broke off: ${err.message}` } }))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = null
        try { json = JSON.parse(text) } catch { json = null }
        const cookies = Object.fromEntries((res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0].split(/=(.*)/s).slice(0, 2)))
        answer({
          status: res.statusCode ?? 0,
          data: json?.data ?? null,
          error: json ? (json.error ?? null) : { message: text.slice(0, 120) },
          cookies,
          retryAfter: res.headers['retry-after'] ?? null,
        })
      })
    })
    req.setTimeout(30_000, () => req.destroy(new Error('no answer in 30 s')))
    req.on('error', (err) => answer({ error: { message: `${err.code ?? ''} ${err.message}`.trim() } }))
    if (payload) req.write(payload)
    req.end()
  })

/** A loopback address no request here has left from, so no per-address counter is shared. */
let hosts = 0
const freshAddress = () => {
  hosts += 1
  if (hosts > 254) throw new Error('out of fresh loopback addresses in 127.0.21.0/24')
  return `127.0.21.${hosts}`
}
const signIn = (email, password) => visit('/auth/login', { from: freshAddress(), method: 'POST', body: { email, password } })
const refreshOf = (session) => visit('/auth/refresh', { from: freshAddress(), method: 'POST', body: { refreshToken: session?.refreshToken ?? null } })
/** A refusal as the rate limiter makes it: 429, with a Retry-After in whole seconds inside the minute, the same in the body. */
const refusedWell = (res) =>
  res.status === 429 && /^\d+$/.test(String(res.retryAfter ?? '')) &&
  Number(res.retryAfter) >= 1 && Number(res.retryAfter) <= 60 &&
  res.error?.details?.retryAfter === Number(res.retryAfter)

const TAG = `e2e-signin-${Date.now()}`
const PASSWORD = 'SignIn@12345!'
const WRONG = 'Wrong@12345!'
const mail = (who) => `${TAG}-${who}@rundesk.invalid`

/** Made here and taken back in `finally`: each a workspace and the session that may delete it. */
const workspacesMade = []
/** Invitations still pending, and who may revoke them: revoked in `finally`. */
const pendingInvitations = []
const leftBehind = []
let sql = null
let madeCount = 0

/*
 * SIGN-UP, FROM THE MAKERS IN TURN, with its ten a minute per address waited
 * out as the API says, as `signUpApi` does (a 429 is refused before the handler
 * runs, so a retry makes nothing twice). Answers what sign-up finally said.
 */
const signUpAs = async (body) => {
  let res = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    res = await visit('/auth/signup', { from: MAKERS[madeCount++ % MAKERS.length], method: 'POST', body })
    if (res.data?.workspaces?.[0]?.id) workspacesMade.push({ id: res.data.workspaces[0].id, as: apiAs(res.data.accessToken) })
    if (res.status !== 429) return res
    const waitMs = (Math.min(Number(res.error?.details?.retryAfter ?? 5) || 5, 60) + 1) * 1000
    console.log(`  (signing up ${body.email}: ten a minute from each maker, so waiting ${Math.round(waitMs / 1000)} s as the API says)`)
    await sleep(waitMs)
  }
  return res
}
/** An account of this suite's own: `{ email, id, token, refreshToken, workspaceId }`. */
const account = async (who) => {
  const res = await signUpAs({ email: mail(who), fullName: `Sign-in ${who}`, password: PASSWORD, organizationName: `Sign-in ${who} ${TAG}` })
  if (res.status !== 201 || !res.data?.accessToken) throw new Error(`could not sign up ${who}: ${said(res)}`)
  return { email: mail(who), id: res.data.user.id, token: res.data.accessToken, refreshToken: res.data.refreshToken, workspaceId: res.data.workspaces?.[0]?.id ?? null }
}

try {
  sql = await openDb()
  if (!sql) throw new Error('no database to read the lockout from: set DATABASE_URL to the lane’s, as CI does')
  /** What the lockout holds for an account: `{ failed_login_attempts, locked_until }`. */
  const lockoutOf = async (id) => (await sql`select failed_login_attempts, locked_until from users where id = ${id}`)[0] ?? null
  const resetsFor = async (id) => (await sql`select count(*)::int as n from password_resets where user_id = ${id}`)[0]?.n ?? 0
  const spellingsOf = async (email) => (await sql`select email from users where lower(email) = lower(${email}) order by created_at`).map((r) => r.email)
  const lockSays = (row) => `failed_login_attempts ${row?.failed_login_attempts ?? '?'}, ${row?.locked_until ? 'locked' : 'not locked'}`

  // -------------------------------------------------------------------------
  console.log('\n▶ every wrong password counts toward the lockout, however many arrive at once')

  /* Each sent at once from an address of its own, as an attacker with many addresses sends them. */
  const wrongAtOnce = (email, n) => Promise.all(Array.from({ length: n }, () => signIn(email, WRONG)))

  const four = await account('four')
  const fourAnswers = await wrongAtOnce(four.email, LOCKOUT_THRESHOLD - 1)
  const afterFour = await lockoutOf(four.id)
  chk(
    fourAnswers.every((r) => r.status === 401) && afterFour?.failed_login_attempts === 4 && !afterFour?.locked_until,
    'four wrong passwords sent at once to one account, each from an address of its own, are four toward its lockout: failed_login_attempts reads 4 and the account is not locked',
    `answered ${fourAnswers.map((r) => r.status).join(', ')}; then ${lockSays(afterFour)}`,
  )
  const fifth = await signIn(four.email, WRONG)
  const afterFifth = await lockoutOf(four.id)
  const fourRight = await signIn(four.email, PASSWORD)
  chk(
    fifth.status === 401 && !!afterFifth?.locked_until && fourRight.status === 401,
    'a fifth wrong password after them locks it at the policy’s five: it has a lock, and its right password is then refused 401',
    `the fifth answered ${fifth.status}, leaving ${lockSays(afterFifth)}; its right password then answered ${said(fourRight)}`,
  )

  const five = await account('five')
  const fiveAnswers = await wrongAtOnce(five.email, LOCKOUT_THRESHOLD)
  const afterFive = await lockoutOf(five.id)
  const fiveRight = await signIn(five.email, PASSWORD)
  chk(
    fiveAnswers.every((r) => r.status === 401) && !!afterFive?.locked_until && fiveRight.status === 401,
    'five wrong passwords sent at once lock it at once: it has a lock, and its right password is refused 401',
    `answered ${fiveAnswers.map((r) => r.status).join(', ')}, leaving ${lockSays(afterFive)}; its right password then answered ${said(fiveRight)}`,
  )

  const eight = await account('eight')
  const eightAnswers = await wrongAtOnce(eight.email, 8)
  const afterEight = await lockoutOf(eight.id)
  const eightRight = await signIn(eight.email, PASSWORD)
  chk(
    eightAnswers.every((r) => r.status === 401) && !!afterEight?.locked_until && afterEight?.failed_login_attempts === 0 && eightRight.status === 401,
    'eight sent at once lock it at the fifth and count none past it: it has a lock, failed_login_attempts reads 0, and its right password is refused 401',
    `answered ${eightAnswers.map((r) => r.status).join(', ')}, leaving ${lockSays(afterEight)}; its right password then answered ${said(eightRight)}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ an email is the same in any case')

  const lower = await account('case')
  const firstCapital = lower.email.replace(/^e/, 'E')
  const allCapitals = lower.email.toUpperCase()
  const asFirstCapital = await signIn(firstCapital, PASSWORD)
  const asAllCapitals = await signIn(allCapitals, PASSWORD)
  chk(
    asFirstCapital.status === 200 && asFirstCapital.data?.user?.id === lower.id && !!asFirstCapital.data?.accessToken &&
      asAllCapitals.status === 200 && asAllCapitals.data?.user?.id === lower.id,
    'an account made in lower case signs in with its email typed with a capital first letter, and all in capitals: 200 with its own session each',
    `as ${firstCapital}: ${said(asFirstCapital)}; as ${allCapitals}: ${said(asAllCapitals)}`,
  )

  const resetsBefore = await resetsFor(lower.id)
  const forgot = await visit('/auth/forgot-password', { from: freshAddress(), method: 'POST', body: { email: allCapitals } })
  const resetsAfter = await resetsFor(lower.id)
  chk(
    forgot.status === 200 && resetsAfter === resetsBefore + 1,
    'forgot-password with its email typed in capitals issues a reset for that account: one more reset link waits for it',
    `forgot-password answered ${said(forgot)}; the account’s reset links went ${resetsBefore} → ${resetsAfter}`,
  )

  const owner = await account('owner')
  if (!owner.workspaceId) throw new Error('sign-up made the owner no workspace')
  const O = apiAs(owner.token)
  const added = await O(`/workspaces/${owner.workspaceId}/members`, { method: 'POST', body: { email: firstCapital, role: 'member' } })
  const [membership] = await sql`select role from workspace_members where workspace_id = ${owner.workspaceId} and user_id = ${lower.id}`
  chk(
    added.status === 201 && membership?.role === 'member',
    'a member is added by their email typed with a capital: 201, and they are in the workspace as a member',
    `adding ${firstCapital} answered ${said(added)}; their membership: ${JSON.stringify(membership ?? null)}`,
  )

  /*
   * AN ACCOUNT STORED WITH CAPITALS, written straight into the table the way
   * the retired `POST /auth/register` wrote one (it kept the email as typed),
   * since no route makes one now and production may hold them.
   */
  const storedWithCapitals = async (who) => {
    const made = await account(who)
    const stored = made.email.replace(`${TAG}-`, `${TAG.replace('e2e-signin', 'E2E-SignIn')}-`).replace(`-${who}@`, `-${who[0].toUpperCase()}${who.slice(1)}@`)
    await sql`update users set email = ${stored} where id = ${made.id}`
    return { ...made, stored }
  }
  const legacy = await storedWithCapitals('legacy')
  const legacyIn = await signIn(legacy.email, PASSWORD)
  const legacyResetsBefore = await resetsFor(legacy.id)
  const legacyForgot = await visit('/auth/forgot-password', { from: freshAddress(), method: 'POST', body: { email: legacy.email } })
  const legacyResetsAfter = await resetsFor(legacy.id)
  chk(
    legacyIn.status === 200 && legacyIn.data?.user?.id === legacy.id && legacyForgot.status === 200 && legacyResetsAfter === legacyResetsBefore + 1,
    'an account stored with capitals, as the retired register route wrote it, signs in with its email typed in lower case, and forgot-password in lower case issues it a reset',
    `stored as ${legacy.stored}; signing in as ${legacy.email} answered ${said(legacyIn)}; forgot-password answered ${said(legacyForgot)}, and its reset links went ${legacyResetsBefore} → ${legacyResetsAfter}`,
  )

  const twin = await signUpAs({ email: legacy.email, fullName: 'Sign-in legacy twin', password: PASSWORD, organizationName: `Sign-in legacy twin ${TAG}` })
  const legacySpellings = await spellingsOf(legacy.email)
  chk(
    twin.status === 409 && legacySpellings.length === 1,
    'sign-up with that account’s email in lower case is refused 409: no second account is made beside it',
    `sign-up answered ${said(twin)}; accounts with that email in any case: ${legacySpellings.length} (${legacySpellings.join(', ')})`,
  )

  const invitedLegacy = await storedWithCapitals('invited')
  const invited = await O('/invitations', { method: 'POST', body: { email: invitedLegacy.email, workspaceId: owner.workspaceId, role: 'member' } })
  if (invited.data?.id) pendingInvitations.push({ id: invited.data.id, as: O })
  const link = invited.data?.id ? await O(`/invitations/${invited.data.id}/link`) : null
  const inviteToken = link?.data?.claimUrl ? new URL(link.data.claimUrl).searchParams.get('token') : null
  if (!inviteToken) throw new Error(`could not invite ${invitedLegacy.email}: ${said(invited)}${link ? `; its link answered ${said(link)}` : ''}`)
  const preview = await visit(`/invitations/preview?token=${encodeURIComponent(inviteToken)}`, { from: freshAddress() })
  const claimed = await visit('/invitations/claim', { from: freshAddress(), method: 'POST', body: { token: inviteToken, fullName: 'Sign-in invited twin', password: PASSWORD } })
  const invitedSpellings = await spellingsOf(invitedLegacy.email)
  chk(
    preview.status === 200 && preview.data?.requiresAccountCreation === false && claimed.status === 403 && invitedSpellings.length === 1,
    'an invitation to that account’s email in lower case finds the account: its link says no account needs making, and claiming it without signing in is refused 403, making none',
    `the link answered ${preview.status}${preview.status === 200 ? ` with requiresAccountCreation ${preview.data?.requiresAccountCreation}` : ` ${said(preview)}`}; claiming it answered ${said(claimed)}; accounts with that email in any case: ${invitedSpellings.length} (${invitedSpellings.join(', ')})`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ changing one’s password: ten a minute per person, the workspace’s policy, and every other session signed out')

  const changer = await account('changer')
  const policy = await account('policy')
  const change = (who, from, currentPassword, newPassword, extra = {}) =>
    visit('/users/me/change-password', { from, method: 'POST', token: who.token, body: { currentPassword, newPassword, ...extra } })

  /* The burst, in one minute: where the minute has less than fifteen seconds left, the next one. */
  const left = WINDOW_MS - (Date.now() % WINDOW_MS)
  if (left < 15_000) {
    console.log(`  … waiting ${Math.ceil(left / 1000)} s for a minute the burst fits in`)
    await sleep(left + 250)
  }
  const guesses = await Promise.all(
    Array.from({ length: PASSWORD_CHANGE_LIMIT + 1 }, (_, i) => change(changer, CHANGER, `Guess${i}@12345!`, 'Another@12345!')),
  )
  const sameElsewhere = await change(changer, ELSEWHERE, 'Guess@12345!', 'Another@12345!')
  const somebodyElse = await change(policy, CHANGER, 'Guess@12345!', 'Another@12345!')
  const wrongCurrent = (r) => r.status === 401 && /current password is incorrect/i.test(r.error?.message ?? '')
  const answeredByRoute = guesses.filter(wrongCurrent).length
  const refusedByLimit = guesses.filter(refusedWell).length
  const burstWindows = new Set([...guesses, sameElsewhere].flatMap((r) => [windowOf(r.sentAt), windowOf(r.at)]))
  const burstSays =
    `${answeredByRoute} answered 401 by the route, ${refusedByLimit} refused with 429 and a Retry-After` +
    `${guesses.length - answeredByRoute - refusedByLimit ? `, and others: ${guesses.filter((r) => !wrongCurrent(r) && !refusedWell(r)).map(said).slice(0, 3).join('; ')}` : ''}` +
    `${burstWindows.size > 1 ? `; it CROSSED a window boundary (${burstWindows.size} windows), so it measures nothing` : ''}`
  const heldToTen = answeredByRoute === PASSWORD_CHANGE_LIMIT && refusedByLimit === 1 && burstWindows.size === 1
  chk(
    heldToTen,
    'a burst of 11 password changes by one person in one minute, each with a wrong current password: 10 are answered 401 by the route, and the eleventh is refused with 429 and a Retry-After',
    burstSays,
  )
  chk(
    heldToTen && refusedWell(sameElsewhere) && wrongCurrent(somebodyElse),
    'the budget is the person’s, not the address’s: the same person asking from another address in that minute is refused 429, and another person at the first address is answered 401',
    heldToTen
      ? `the same person from ${ELSEWHERE} answered ${said(sameElsewhere)}; another person from ${CHANGER} answered ${said(somebodyElse)}`
      : `the first person was never held to ten (${burstSays}), so the others’ answers show nothing`,
  )

  const weak = await change(policy, freshAddress(), PASSWORD, 'password1')
  const oldStill = await signIn(policy.email, PASSWORD)
  const lacks = weak.error?.message ?? ''
  chk(
    weak.status === 400 && /at least 10 characters/.test(lacks) && /an uppercase letter/.test(lacks) && /a symbol/.test(lacks) && oldStill.status === 200,
    'a weak new password is refused 400 under the workspace’s default policy, saying what it lacks, and the old password still signs in',
    `password1 answered ${said(weak)}; the old password then answered ${oldStill.status}`,
  )
  const relaxed = await apiAs(policy.token)(`/workspaces/${policy.workspaceId}/security-settings`, { method: 'PATCH', body: { requireStrongPasswords: false } })
  // The password the account has now: `password1` where the weak one was taken.
  const current = weak.status === 201 ? 'password1' : PASSWORD
  const eightLetters = await change(policy, freshAddress(), current, 'password')
  const eightIn = await signIn(policy.email, 'password')
  chk(
    relaxed.status === 200 && eightLetters.status === 201 && eightIn.status === 200,
    'the policy is the workspace’s: with strong passwords not required there, an eight-character password is accepted and signs in',
    `switching the rule off answered ${relaxed.status}${relaxed.status === 200 ? ` (requireStrongPasswords now ${relaxed.data?.requireStrongPasswords})` : ` ${said(relaxed)}`}; "password" answered ${said(eightLetters)}; signing in with it ${eightIn.status}`,
  )

  /* AS A BROWSER CHANGES IT: its cookies and the CSRF header, no Bearer and no token in the body. */
  const browser = await account('browser')
  const browserSession = await signIn(browser.email, PASSWORD)
  const browserOther = await signIn(browser.email, PASSWORD)
  const jar = browserSession.cookies
  if (!jar.access_token || !jar.refresh_token || !jar.csrf_token) throw new Error(`signing in set no cookies: ${JSON.stringify(Object.keys(jar))}`)
  const asBrowser = await visit('/users/me/change-password', {
    from: freshAddress(),
    method: 'POST',
    cookie: `access_token=${jar.access_token}; refresh_token=${jar.refresh_token}; csrf_token=${jar.csrf_token}`,
    headers: { 'x-csrf-token': jar.csrf_token },
    body: { currentPassword: PASSWORD, newPassword: 'Browser@12345!' },
  })
  const browserOtherRefresh = await refreshOf(browserOther.data)
  const browserOwnRefresh = await refreshOf(browserSession.data)
  chk(
    asBrowser.status === 201 && browserOtherRefresh.status === 401 && browserOwnRefresh.status === 200,
    'a change made as a browser makes it (its cookies and the CSRF header) signs out the account’s other sessions and keeps the browser’s: the other session’s refresh is refused 401, the browser’s answered 200',
    `the change answered ${said(asBrowser)}; then the other session’s refresh ${said(browserOtherRefresh)}, the browser’s ${browserOwnRefresh.status}`,
  )

  /* AS A CLIENT WITH NO COOKIE CHANGES IT: Bearer, and its session named in the body. */
  const client = await account('client')
  const clientSession = await signIn(client.email, PASSWORD)
  const clientOther = await signIn(client.email, PASSWORD)
  const asClient = await change(
    { token: clientSession.data?.accessToken },
    freshAddress(),
    PASSWORD,
    'Client@12345!',
    { currentRefreshToken: clientSession.data?.refreshToken },
  )
  const clientOwnRefresh = await refreshOf(clientSession.data)
  const clientOtherRefresh = await refreshOf(clientOther.data)
  const clientSignUpRefresh = await refreshOf(client)
  chk(
    asClient.status === 201 && asClient.data?.revoked === 2 && clientOwnRefresh.status === 200 && clientOtherRefresh.status === 401 && clientSignUpRefresh.status === 401,
    'a change by a client naming its session in the body (currentRefreshToken) keeps it and signs out the other two: its refresh is answered 200, the other sign-in’s and the sign-up’s are refused 401, and the change says it revoked 2',
    `the change answered ${said(asClient)}; then its own refresh ${clientOwnRefresh.status}, the other sign-in’s ${clientOtherRefresh.status}, the sign-up’s ${clientSignUpRefresh.status}`,
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('sign-in-and-password.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  // Each taken back by its own route and read by its status: gone, or already gone (404).
  const takeBack = (what, res) => {
    if (![200, 204, 404].includes(res.status)) leftBehind.push(`${what} answered ${said(res)}`)
  }
  for (const { id, as } of pendingInvitations) takeBack(`DELETE invitation ${id}`, await as(`/invitations/${id}`, { method: 'DELETE' }))
  for (const { id, as } of workspacesMade.reverse()) takeBack(`DELETE workspace ${id}`, await as(`/workspaces/${id}`, { method: 'DELETE' }))
  if (sql) await sql.end({ timeout: 5 }).catch(() => {})
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
