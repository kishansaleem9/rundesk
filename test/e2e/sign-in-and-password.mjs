/**
 * EVERY WRONG PASSWORD COUNTS TOWARD THE LOCKOUT, AN EMAIL IS THE SAME IN ANY
 * CASE, AND CHANGING ONE'S PASSWORD IS LIMITED PER PERSON, HELD TO THE
 * WORKSPACE'S POLICY AND SIGNS OUT EVERY OTHER SESSION
 * (`found-30-sep/lockout-counts-overlapping-attempts-once`,
 * `found-30-sep/sign-in-reads-the-email-as-typed`,
 * `found-30-sep/password-change-unthrottled`); A WRONG CURRENT PASSWORD COUNTS
 * TOWARD THE LOCKOUT TOO, A SESSION ENDED IS REFUSED AT ONCE, AND ACCEPTING AN
 * INVITATION SIGNS THE PERSON IN AS SIGN-UP DOES
 * (`found-30-sep/password-change-guesses-600-an-hour`,
 * `found-30-sep/revoked-sessions-keep-their-access-tokens`,
 * `found-30-sep/an-accepted-invitation-sets-no-cookies`).
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
 * And then (lane 3, three runs alike, `9b5ced3`'s API):
 *  - six wrong current passwords in a row were each answered 401 and counted
 *    nothing toward the lockout; ten a minute were compared, minute after
 *    minute: 600 an hour on one account;
 *  - after a password change, a reset, "Sign out other sessions", revoking one
 *    session, signing out and the session cap, every revoked session's access
 *    token still read `GET /users/me` (200), opened a realtime socket, and
 *    claimed an invitation for its account; its token named no session;
 *  - `POST /invitations/claim` set no cookie, and a person signed in by their
 *    cookies alone could not accept an invitation to their account (403
 *    "Account already exists. Please log in first.").
 *
 * ClickUp (read through search results; its help centre is blocked here) holds
 * a changed password to the rule every password meets ("Passwords created for
 * ClickUp must be a minimum of 8 characters and include a minimum of one
 * uppercase character, a minimum of one lowercase character, and a minimum of
 * one number or special character"), and offers "Log out of all sessions".
 * OWASP: user names "should be case-insensitive", and "email addresses are
 * already case insensitive" (authentication cheat sheet); the application
 * should "terminate all other active sessions after a successful password
 * change" (ASVS 3.3.3); "no more than 100 failed attempts per hour is possible
 * on a single account" (ASVS 4.0.3, 2.2.1); and when a session is terminated,
 * "the application disallows any further use of the session" (ASVS 5.0, 7.4.1).
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
 * `same-email.test.ts` and each service's own tests hold. A token that names
 * no session (one made before sessions were named) needs the lane's signing
 * secret to make, so `jwt.strategy.test.ts` holds it. What a browser does
 * with all this, a reload after accepting an invitation among it, is
 * `session-in-the-browser.mjs`'s.
 *
 *   node test/e2e/sign-in-and-password.mjs --api 3011
 */
import http from 'node:http'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { apiAs as apiAsAt, madeAccount } from './lib/fixture.mjs'
import { openDb } from './lib/db.mjs'

const { io } = createRequire(path.resolve(import.meta.dirname, '../../apps/web/package.json'))('socket.io-client')

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 29

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

/**
 * Made here and taken back in `finally`: each a workspace, the session that
 * may delete it, and its account's email, to sign in again with the password
 * it has then (`passwordOf`) where this run has ended that session.
 */
const workspacesMade = []
const passwordOf = new Map()
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
    // Registered before each ask (it is idempotent), so the account is removed when the run ends (`lib/made.mjs`).
    if (body?.email) madeAccount({ email: body.email })
    res = await visit('/auth/signup', { from: MAKERS[madeCount++ % MAKERS.length], method: 'POST', body })
    if (res.data?.workspaces?.[0]?.id) {
      workspacesMade.push({ id: res.data.workspaces[0].id, as: apiAs(res.data.accessToken), email: body.email })
      passwordOf.set(body.email, body.password)
    }
    if (res.status !== 429) return res
    const waitMs = (Math.min(Number(res.error?.details?.retryAfter ?? 5) || 5, 60) + 1) * 1000
    console.log(`  (signing up ${body.email}: ten a minute from each maker, so waiting ${Math.round(waitMs / 1000)} s as the API says)`)
    await sleep(waitMs)
  }
  return res
}
/** An account of this suite's own: `{ email, id, token, refreshToken, workspaceId, cookies }`, the cookies sign-up set. */
const account = async (who) => {
  const res = await signUpAs({ email: mail(who), fullName: `Sign-in ${who}`, password: PASSWORD, organizationName: `Sign-in ${who} ${TAG}` })
  if (res.status !== 201 || !res.data?.accessToken) throw new Error(`could not sign up ${who}: ${said(res)}`)
  return { email: mail(who), id: res.data.user.id, token: res.data.accessToken, refreshToken: res.data.refreshToken, workspaceId: res.data.workspaces?.[0]?.id ?? null, cookies: res.cookies }
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
  // Claiming makes an account for an invitee without one; this one has one, and is registered either way.
  madeAccount({ email: invitedLegacy.email })
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
  /*
   * THE BUDGET ALONE, where the workspace's lockout is off: with it on, a wrong
   * current password counts toward the lockout (the section after this one),
   * which locks the account at the fifth, before the minute's ten are spent.
   */
  const unlocked = await apiAs(changer.token)(`/workspaces/${changer.workspaceId}/security-settings`, { method: 'PATCH', body: { lockoutEnabled: false } })
  if (unlocked.status !== 200 || unlocked.data?.lockoutEnabled !== false) throw new Error(`could not switch the changer’s lockout off: ${said(unlocked)}`)

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
  const wrongCurrent = (r) => r.status === 403 && /current password is incorrect/i.test(r.error?.message ?? '')
  const answeredByRoute = guesses.filter(wrongCurrent).length
  const refusedByLimit = guesses.filter(refusedWell).length
  const burstWindows = new Set([...guesses, sameElsewhere].flatMap((r) => [windowOf(r.sentAt), windowOf(r.at)]))
  const burstSays =
    `${answeredByRoute} answered 403 by the route, ${refusedByLimit} refused with 429 and a Retry-After` +
    `${guesses.length - answeredByRoute - refusedByLimit ? `, and others: ${guesses.filter((r) => !wrongCurrent(r) && !refusedWell(r)).map(said).slice(0, 3).join('; ')}` : ''}` +
    `${burstWindows.size > 1 ? `; it CROSSED a window boundary (${burstWindows.size} windows), so it measures nothing` : ''}`
  const heldToTen = answeredByRoute === PASSWORD_CHANGE_LIMIT && refusedByLimit === 1 && burstWindows.size === 1
  chk(
    heldToTen,
    'a burst of 11 password changes by one person in one minute, each with a wrong current password and the workspace’s lockout off: 10 are answered 403 by the route, and the eleventh is refused with 429 and a Retry-After',
    burstSays,
  )
  chk(
    heldToTen && refusedWell(sameElsewhere) && wrongCurrent(somebodyElse),
    'the budget is the person’s, not the address’s: the same person asking from another address in that minute is refused 429, and another person at the first address is answered 403',
    heldToTen
      ? `the same person from ${ELSEWHERE} answered ${said(sameElsewhere)}; another person from ${CHANGER} answered ${said(somebodyElse)}`
      : `the first person was never held to ten (${burstSays}), so the others’ answers show nothing`,
  )

  /*
   * These two name their own session, as a browser's cookie does: a change that
   * names none ends every session, the caller's too, and the check after this
   * one asks the workspace's settings with that session.
   */
  const weak = await change(policy, freshAddress(), PASSWORD, 'password1', { currentRefreshToken: policy.refreshToken })
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
  const eightLetters = await change(policy, freshAddress(), current, 'password', { currentRefreshToken: policy.refreshToken })
  if (eightLetters.status === 201) passwordOf.set(policy.email, 'password')
  else if (weak.status === 201) passwordOf.set(policy.email, 'password1')
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
  if (asBrowser.status === 201) passwordOf.set(browser.email, 'Browser@12345!')
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
  if (asClient.status === 201) passwordOf.set(client.email, 'Client@12345!')
  const clientOwnRefresh = await refreshOf(clientSession.data)
  const clientOtherRefresh = await refreshOf(clientOther.data)
  const clientSignUpRefresh = await refreshOf(client)
  chk(
    asClient.status === 201 && asClient.data?.revoked === 2 && clientOwnRefresh.status === 200 && clientOtherRefresh.status === 401 && clientSignUpRefresh.status === 401,
    'a change by a client naming its session in the body (currentRefreshToken) keeps it and signs out the other two: its refresh is answered 200, the other sign-in’s and the sign-up’s are refused 401, and the change says it revoked 2',
    `the change answered ${said(asClient)}; then its own refresh ${clientOwnRefresh.status}, the other sign-in’s ${clientOtherRefresh.status}, the sign-up’s ${clientSignUpRefresh.status}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ a wrong current password counts toward the account’s lockout, as a wrong sign-in does')

  /* Refused as the lockout refuses a signed-in caller: 423, saying so, and when it lifts. */
  const locks = (r) => r.status === 423 && /locked/i.test(r.error?.message ?? '') && Number(r.error?.details?.retryAfter) > 0
  const guesser = await account('guesser')
  const guessFrom = freshAddress()
  const guessed = []
  for (let i = 1; i <= LOCKOUT_THRESHOLD; i += 1) {
    const res = await change(guesser, guessFrom, `${WRONG}${i}`, 'Another@12345!')
    guessed.push({ res, after: await lockoutOf(guesser.id) })
  }
  const fifthGuess = guessed[LOCKOUT_THRESHOLD - 1]
  chk(
    guessed.slice(0, LOCKOUT_THRESHOLD - 1).every(({ res, after }, i) => wrongCurrent(res) && after?.failed_login_attempts === i + 1 && !after?.locked_until) &&
      locks(fifthGuess.res) && !!fifthGuess.after?.locked_until,
    'five wrong current passwords in a row count toward the account’s lockout as five wrong sign-ins would: the first four are refused 403 and counted 1 to 4, and the fifth locks the account and is refused 423 saying so',
    guessed.map(({ res, after }, i) => `#${i + 1} ${res.status}${res.status === 423 ? ` "${res.error?.message}"` : ''} → ${lockSays(after)}`).join('; '),
  )
  const hashOf = async (id) => (await sql`select password_hash from users where id = ${id}`)[0]?.password_hash ?? null
  const hashBefore = await hashOf(guesser.id)
  const sixth = await change(guesser, guessFrom, PASSWORD, 'Another@12345!')
  if (sixth.status === 201) passwordOf.set(guesser.email, 'Another@12345!')
  const hashAfter = await hashOf(guesser.id)
  const guesserIn = await signIn(guesser.email, PASSWORD)
  chk(
    locks(sixth) && hashAfter === hashBefore && guesserIn.status === 401,
    'the sixth, even with the right current password, is refused 423 saying the account is locked and for how long, the password is not changed, and signing in with it is refused 401 while the lock lasts',
    `the sixth answered ${said(sixth)}${sixth.error?.details?.retryAfter ? ` (retryAfter ${sixth.error.details.retryAfter} s)` : ''}; the password ${hashAfter === hashBefore ? 'unchanged' : 'CHANGED'}; signing in with it then ${said(guesserIn)}`,
  )

  const sharer = await account('sharer')
  const wrongSignIns = []
  for (let i = 0; i < 3; i += 1) wrongSignIns.push(await signIn(sharer.email, WRONG))
  const afterSignIns = await lockoutOf(sharer.id)
  const shareFrom = freshAddress()
  const wrongChanges = []
  for (let i = 0; i < 2; i += 1) wrongChanges.push(await change(sharer, shareFrom, WRONG, 'Another@12345!'))
  const afterChanges = await lockoutOf(sharer.id)
  const sharerIn = await signIn(sharer.email, PASSWORD)
  chk(
    wrongSignIns.every((r) => r.status === 401) && afterSignIns?.failed_login_attempts === 3 &&
      wrongCurrent(wrongChanges[0]) && locks(wrongChanges[1]) && !!afterChanges?.locked_until && sharerIn.status === 401,
    'wrong passwords at sign-in and at the change share one count: three wrong sign-ins and then two wrong current passwords lock the account at the policy’s five, and its right password is refused 401 at sign-in',
    `three wrong sign-ins answered ${wrongSignIns.map((r) => r.status).join(', ')}, leaving ${lockSays(afterSignIns)}; two wrong current passwords then answered ${wrongChanges.map((r) => r.status).join(', ')}, leaving ${lockSays(afterChanges)}; its right password at sign-in then ${said(sharerIn)}`,
  )

  const clearer = await account('clearer')
  const clearFrom = freshAddress()
  for (let i = 0; i < 2; i += 1) await change(clearer, clearFrom, WRONG, 'Another@12345!')
  const beforeRight = await lockoutOf(clearer.id)
  const rightChange = await change(clearer, clearFrom, PASSWORD, 'Cleared@12345!', { currentRefreshToken: clearer.refreshToken })
  if (rightChange.status === 201) passwordOf.set(clearer.email, 'Cleared@12345!')
  const afterRight = await lockoutOf(clearer.id)
  chk(
    beforeRight?.failed_login_attempts === 2 && rightChange.status === 201 && afterRight?.failed_login_attempts === 0 && !afterRight?.locked_until,
    'a right current password clears the count, as a right password at sign-in does: after two wrong ones the change is made (201) and failed_login_attempts reads 0',
    `two wrong ones left ${lockSays(beforeRight)}; the right one answered ${said(rightChange)}, leaving ${lockSays(afterRight)}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ a session that has ended is refused at once, on a read as on a refresh')

  /* A read as the session's holder makes one: its access token, from 127.0.0.1 (the route has no limit). */
  const reads = (session) => visit('/users/me', { token: session?.accessToken ?? session?.token ?? null })

  const revoked = await account('revoked')
  const revA = (await signIn(revoked.email, PASSWORD)).data
  const revB = (await signIn(revoked.email, PASSWORD)).data
  if (!revA?.accessToken || !revB?.accessToken) throw new Error('could not sign the revoked account in twice')
  const revBBefore = await reads(revB)
  const byChange = await change({ token: revA.accessToken }, freshAddress(), PASSWORD, 'Revoked@12345!', { currentRefreshToken: revA.refreshToken })
  if (byChange.status === 201) passwordOf.set(revoked.email, 'Revoked@12345!')
  const revBRead = await reads(revB)
  const signUpRead = await reads(revoked)
  const revBRefresh = await refreshOf(revB)
  const revARead = await reads(revA)
  const revARefresh = await refreshOf(revA)
  chk(
    revBBefore.status === 200 && byChange.status === 201 && revBRead.status === 401 && signUpRead.status === 401 && revBRefresh.status === 401 &&
      revARead.status === 200 && revARefresh.status === 200,
    'a session a password change signs out is refused at once: its access token’s read (GET /users/me) is refused 401, as is the sign-up session’s, and its refresh is refused 401, while the session that made the change reads and refreshes on',
    `before the change the other session read ${revBBefore.status}; the change answered ${said(byChange)}; then the other session’s read ${revBRead.status}, the sign-up session’s ${signUpRead.status}, the other’s refresh ${revBRefresh.status}; the changer’s read ${revARead.status}, its refresh ${revARefresh.status}`,
  )

  const ended = await account('ended')
  const endedIn = []
  for (let i = 0; i < 4; i += 1) endedIn.push((await signIn(ended.email, PASSWORD)).data)
  if (endedIn.some((s) => !s?.accessToken)) throw new Error('could not sign the ended account in four times')
  const [endA, endB, endC, endD] = endedIn
  // Revoked by id: A revokes B, found by B's refresh token among the sessions.
  const listed = await visit(`/auth/sessions?currentRefreshToken=${encodeURIComponent(endB.refreshToken)}`, { token: endB.accessToken })
  const endBId = (listed.data ?? []).find((s) => s.isCurrent)?.id
  if (!endBId) throw new Error(`could not find the session to revoke by id: ${said(listed)}`)
  const byId = await visit(`/auth/sessions/${endBId}`, { method: 'DELETE', token: endA.accessToken })
  const readById = await reads(endB)
  // Signed out: C, by its refresh token.
  const signedOut = await visit('/auth/logout', { method: 'POST', body: { refreshToken: endC.refreshToken } })
  const readSignedOut = await reads(endC)
  // "Sign out other sessions": A, naming itself.
  const byOthers = await visit('/auth/sessions/revoke-others', { method: 'POST', token: endA.accessToken, body: { currentRefreshToken: endA.refreshToken } })
  const readByOthers = await reads(endD)
  const readEndedSignUp = await reads(ended)
  const readEndCaller = await reads(endA)
  // A reset: every session, A's among them.
  const endForgot = await visit('/auth/forgot-password', { from: freshAddress(), method: 'POST', body: { email: ended.email } })
  const [endReset] = await sql`select token from password_resets where user_id = ${ended.id} and used_at is null order by created_at desc limit 1`
  const byReset = await visit('/auth/reset-password', { from: freshAddress(), method: 'POST', body: { token: endReset?.token ?? '', password: 'Ended@12345!xy' } })
  if (byReset.status === 200) passwordOf.set(ended.email, 'Ended@12345!xy')
  const readByReset = await reads(endA)
  // The session cap: two at most, so the third sign-in after it ends the oldest.
  const capped = await account('capped')
  const capSet = await apiAs(capped.token)(`/workspaces/${capped.workspaceId}/security-settings`, { method: 'PATCH', body: { maxConcurrentSessions: 2 } })
  const cap1 = (await signIn(capped.email, PASSWORD)).data
  await signIn(capped.email, PASSWORD)
  const cap3 = (await signIn(capped.email, PASSWORD)).data
  const readCapOldest = await reads(cap1)
  const readCapNewest = await reads(cap3)
  chk(
    byId.status === 200 && readById.status === 401 && signedOut.status === 204 && readSignedOut.status === 401 &&
      byOthers.status === 201 && readByOthers.status === 401 && readEndedSignUp.status === 401 && readEndCaller.status === 200 &&
      endForgot.status === 200 && byReset.status === 200 && readByReset.status === 401 &&
      capSet.status === 200 && readCapOldest.status === 401 && readCapNewest.status === 200,
    'so is a session ended any other way: revoked by id, signed out, by "Sign out other sessions", by a reset or by the session cap, its access token’s read is refused 401 at once, while the session that ended the others reads on',
    `revoked by id (${byId.status}): its read ${readById.status}; signed out (${signedOut.status}): ${readSignedOut.status}; "Sign out other sessions" (${byOthers.status}): the other’s read ${readByOthers.status}, the sign-up session’s ${readEndedSignUp.status}, the caller’s ${readEndCaller.status}; a reset (${endForgot.status}, ${byReset.status}): the caller’s read ${readByReset.status}; a cap of two (${capSet.status}): the oldest sign-in’s read ${readCapOldest.status}, the newest’s ${readCapNewest.status}`,
  )

  /*
   * THE CAP'S CHOICE, read from the database: which of two sessions a sign-in
   * past the cap ends. A refresh used to make a new row, so ending the oldest
   * row ended the session used least recently; a refresh keeps its row now, so
   * the cap orders by the window each refresh extends.
   */
  const refreshHash = (token) => createHash('sha256').update(String(token)).digest('hex')
  const sessionRow = async (refreshToken) => (await sql`select is_revoked from sessions where refresh_token = ${refreshHash(refreshToken)}`)[0] ?? null
  const busy = await account('busy')
  const busyCap = await apiAs(busy.token)(`/workspaces/${busy.workspaceId}/security-settings`, { method: 'PATCH', body: { maxConcurrentSessions: 2 } })
  const active = (await signIn(busy.email, PASSWORD)).data
  const idle = (await signIn(busy.email, PASSWORD)).data
  const keptActive = await refreshOf(active)
  const late = await signIn(busy.email, PASSWORD)
  const activeRow = await sessionRow(keptActive.data?.refreshToken)
  const idleRow = await sessionRow(idle?.refreshToken)
  const rowSays = (row) => (row ? (row.is_revoked ? 'revoked' : 'live') : 'not found')
  chk(
    busyCap.status === 200 && keptActive.status === 200 && late.status === 200 && activeRow?.is_revoked === false && idleRow?.is_revoked === true,
    'the session cap ends the session used least recently: one refreshed after another’s sign-in outlives it when a new sign-in passes the cap',
    `a cap of two (${busyCap.status}); the earlier sign-in refreshed (${keptActive.status}) after the later one signed in; a third sign-in (${late.status}) then left the refreshed session ${rowSays(activeRow)} and the idle one ${rowSays(idleRow)}`,
  )

  const refresher = await account('refresher')
  const firstIn = (await signIn(refresher.email, PASSWORD)).data
  const refreshed = await refreshOf(firstIn)
  const readOld = await reads(firstIn)
  const readNew = await reads(refreshed.data)
  const reused = await refreshOf(firstIn)
  chk(
    refreshed.status === 200 && readOld.status === 200 && readNew.status === 200 && reused.status === 401,
    'a refresh keeps its session: the access token from before it still reads, as does the new one, and the refresh token it replaced is refused 401',
    `the refresh answered ${said(refreshed)}; the access token from before it then read ${readOld.status}, the new one ${readNew.status}; the replaced refresh token again ${said(reused)}`,
  )

  /* A socket as the web opens one, and whether it is still up a moment later. */
  const socketOf = (token) => new Promise((resolve) => {
    const sock = io(`http://127.0.0.1:${API_PORT}/realtime`, { auth: { token }, transports: ['websocket'], reconnection: false })
    const heard = []
    sock.on('error', (e) => heard.push(e?.message ?? String(e)))
    sock.on('connect_error', (e) => heard.push(`connect_error ${e?.message ?? ''}`.trim()))
    setTimeout(() => { const up = sock.connected; sock.close(); resolve({ up, heard }) }, 2_500)
  })
  const endedSocket = await socketOf(revB.accessToken)
  // The live one is a sign-in of its own, made after the change, so this check stands on the handshake alone.
  const liveAfter = (await signIn(revoked.email, passwordOf.get(revoked.email) ?? PASSWORD)).data
  const liveSocket = await socketOf(liveAfter?.accessToken)
  chk(
    !endedSocket.up && endedSocket.heard.includes('Session ended') && liveSocket.up,
    'a session that has ended opens no realtime socket: its access token’s handshake is ended with "Session ended", while the live session’s socket stays up',
    `the ended session’s socket ${endedSocket.up ? 'STAYED UP' : 'was closed'}${endedSocket.heard.length ? ` (${endedSocket.heard.join('; ')})` : ''}; the live session’s ${liveSocket.up ? 'stayed up' : 'was closed'}${liveSocket.heard.length ? ` (${liveSocket.heard.join('; ')})` : ''}`,
  )

  const toRevoked = await O('/invitations', { method: 'POST', body: { email: revoked.email, workspaceId: owner.workspaceId, role: 'member' } })
  const toRevokedLink = toRevoked.data?.id ? await O(`/invitations/${toRevoked.data.id}/link`) : null
  const toRevokedToken = toRevokedLink?.data?.claimUrl ? new URL(toRevokedLink.data.claimUrl).searchParams.get('token') : null
  if (!toRevokedToken) throw new Error(`could not invite ${revoked.email}: ${said(toRevoked)}`)
  // A claim can make an account; this one names the run's own, registered again so the site says whose.
  madeAccount({ email: revoked.email })
  const claimedByEnded = await visit('/invitations/claim', { from: freshAddress(), method: 'POST', token: revB.accessToken, body: { token: toRevokedToken } })
  if (claimedByEnded.status !== 201) pendingInvitations.push({ id: toRevoked.data.id, as: O })
  const [endedJoined] = await sql`select role from workspace_members where workspace_id = ${owner.workspaceId} and user_id = ${revoked.id}`
  chk(
    claimedByEnded.status === 403 && /already exists/i.test(claimedByEnded.error?.message ?? '') && !endedJoined,
    'a session that has ended claims no invitation for its account: the claim reads its token as nobody’s and is refused 403 "Account already exists", and the account joins nothing',
    `the claim with the ended session’s token answered ${said(claimedByEnded)}; the account’s membership after: ${JSON.stringify(endedJoined ?? null)}`,
  )

  /* AS A BROWSER SIGNS OUT THE OTHERS after a reload: its cookies and the CSRF header, nothing in the body. */
  const cookied = await account('cookied')
  const cookiedIn = await signIn(cookied.email, PASSWORD)
  const cookiedOther = (await signIn(cookied.email, PASSWORD)).data
  const jarC = cookiedIn.cookies
  if (!jarC.access_token || !jarC.refresh_token || !jarC.csrf_token) throw new Error(`signing in set no cookies: ${JSON.stringify(Object.keys(jarC))}`)
  const cookiedJar = `access_token=${jarC.access_token}; refresh_token=${jarC.refresh_token}; csrf_token=${jarC.csrf_token}`
  const othersAsBrowser = await visit('/auth/sessions/revoke-others', { from: freshAddress(), method: 'POST', cookie: cookiedJar, headers: { 'x-csrf-token': jarC.csrf_token }, body: {} })
  const cookiedReads = await visit('/users/me', { cookie: cookiedJar })
  const cookiedRefreshes = await visit('/auth/refresh', { from: freshAddress(), method: 'POST', cookie: cookiedJar, headers: { 'x-csrf-token': jarC.csrf_token }, body: {} })
  const cookiedOtherReads = await reads(cookiedOther)
  chk(
    othersAsBrowser.status === 201 && cookiedReads.status === 200 && cookiedRefreshes.status === 200 && cookiedOtherReads.status === 401,
    '"Sign out other sessions" made as a browser (its cookies and the CSRF header, nothing in the body) keeps the browser’s session: it reads and refreshes on, and the other session’s read is refused 401',
    `it answered ${said(othersAsBrowser)} ${JSON.stringify(othersAsBrowser.data)}; the browser then read ${cookiedReads.status} and refreshed ${cookiedRefreshes.status}; the other session read ${cookiedOtherReads.status}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ accepting an invitation signs the person in as sign-up does')

  const newcomerEmail = mail('newcomer')
  const toNewcomer = await O('/invitations', { method: 'POST', body: { email: newcomerEmail, workspaceId: owner.workspaceId, role: 'member' } })
  const newcomerLink = toNewcomer.data?.id ? await O(`/invitations/${toNewcomer.data.id}/link`) : null
  const newcomerToken = newcomerLink?.data?.claimUrl ? new URL(newcomerLink.data.claimUrl).searchParams.get('token') : null
  if (!newcomerToken) throw new Error(`could not invite ${newcomerEmail}: ${said(toNewcomer)}`)
  // Accepting makes the newcomer's account: registered, so it is removed when the run ends (`lib/made.mjs`).
  madeAccount({ email: newcomerEmail })
  const accepted = await visit('/invitations/claim', { from: freshAddress(), method: 'POST', body: { token: newcomerToken, fullName: 'Sign-in newcomer', password: PASSWORD } })
  if (accepted.status !== 201) pendingInvitations.push({ id: toNewcomer.data.id, as: O })
  const jarN = accepted.cookies
  const newcomerJar = jarN.access_token ? `access_token=${jarN.access_token}; refresh_token=${jarN.refresh_token}; csrf_token=${jarN.csrf_token}` : null
  const newcomerReads = newcomerJar ? await visit('/users/me', { cookie: newcomerJar }) : null
  const newcomerRefreshes = newcomerJar ? await visit('/auth/refresh', { from: freshAddress(), method: 'POST', cookie: newcomerJar, headers: { 'x-csrf-token': jarN.csrf_token }, body: {} }) : null
  chk(
    accepted.status === 201 && !!jarN.access_token && !!jarN.refresh_token && !!jarN.csrf_token &&
      newcomerReads?.status === 200 && newcomerReads.data?.email === newcomerEmail && newcomerRefreshes?.status === 200,
    'accepting an invitation sets the cookies sign-up sets (access_token, refresh_token, csrf_token), and they alone read /users/me as the newcomer and refresh',
    `the claim answered ${said(accepted)} with cookies ${Object.keys(jarN).join(', ') || 'none'}${newcomerJar ? `; by them alone /users/me answered ${said(newcomerReads)}${newcomerReads?.data?.email ? ` as ${newcomerReads.data.email}` : ''} and the refresh ${said(newcomerRefreshes)}` : ''}`,
  )

  /* A PERSON SIGNED IN BY THEIR COOKIES ALONE, as a page is after a reload: no Bearer header. */
  const existing = await account('existing')
  const toExisting = await O('/invitations', { method: 'POST', body: { email: existing.email, workspaceId: owner.workspaceId, role: 'member' } })
  const existingLink = toExisting.data?.id ? await O(`/invitations/${toExisting.data.id}/link`) : null
  const existingToken = existingLink?.data?.claimUrl ? new URL(existingLink.data.claimUrl).searchParams.get('token') : null
  if (!existingToken) throw new Error(`could not invite ${existing.email}: ${said(toExisting)}`)
  const jarE = existing.cookies ?? {}
  if (!jarE.access_token || !jarE.csrf_token) throw new Error(`sign-up set no cookies for ${existing.email}: ${JSON.stringify(Object.keys(jarE))}`)
  // The run's own account again (a claim can make one): registered at the site, as every claim is.
  madeAccount({ email: existing.email })
  const byCookies = await visit('/invitations/claim', {
    from: freshAddress(),
    method: 'POST',
    cookie: `access_token=${jarE.access_token}; refresh_token=${jarE.refresh_token}; csrf_token=${jarE.csrf_token}`,
    headers: { 'x-csrf-token': jarE.csrf_token },
    body: { token: existingToken },
  })
  if (byCookies.status !== 201) pendingInvitations.push({ id: toExisting.data.id, as: O })
  const [existingJoined] = await sql`select role from workspace_members where workspace_id = ${owner.workspaceId} and user_id = ${existing.id}`
  chk(
    byCookies.status === 201 && byCookies.data?.user?.id === existing.id && existingJoined?.role === 'member',
    'a person signed in by their cookies alone (no Bearer header, as a reloaded page is) accepts an invitation to their account: 201, and they are in the workspace as a member',
    `the claim by cookies answered ${said(byCookies)}; their membership after: ${JSON.stringify(existingJoined ?? null)}`,
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
  for (const { id, as, email } of workspacesMade.reverse()) {
    let res = await as(`/workspaces/${id}`, { method: 'DELETE' })
    // A session this run ended (a change, a reset, the cap, "sign out other
    // sessions") is refused at once: signed in again with the password the account has now.
    if (res.status === 401 && email) {
      const again = await signIn(email, passwordOf.get(email) ?? PASSWORD)
      if (again.data?.accessToken) res = await apiAs(again.data.accessToken)(`/workspaces/${id}`, { method: 'DELETE' })
    }
    takeBack(`DELETE workspace ${id}`, res)
  }
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
