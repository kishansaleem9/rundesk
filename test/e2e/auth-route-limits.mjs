/**
 * MAKING AN ACCOUNT, ANSWERING AN INVITATION AND SIGNING IN THROUGH SSO ARE
 * LIMITED PER ADDRESS; BEHIND A PROXY THE ADDRESS IS THE ONE THE PROXY SAW; AND
 * THE TEST EMAIL IS A SUPER ADMIN'S (`found-30-sep/register-unthrottled`,
 * `found-30-sep/client-address-behind-nginx`, `found-30-sep/test-email-route-open`).
 * ONE ROUTE MAKES AN ACCOUNT, AND SIGNING IN WITH GOOGLE OR MICROSOFT AND
 * CONNECTING AN INTEGRATION ARE LIMITED TOO
 * (`found-30-sep/register-counted-apart-from-signup`, `found-30-sep/oauth-routes-unthrottled`).
 *
 * `POST /auth/register` then had sign-up's ten a minute on a counter of its
 * own, so an address made ten accounts a minute through each. It is retired:
 * it answers 410 and makes nothing, and sign-up's burst below is the one
 * account-making budget there is. Google's and Microsoft's sign-in start and
 * callback, and an integration's OAuth callback, had no limit beside SSO's
 * thirty; they have SSO's thirty now, and the providers list the login page
 * and CI's readiness poll ask stays unlimited.
 *
 * `POST /auth/register` made an account and a workspace per request with no
 * limit, beside sign-up's ten a minute; the invitee's routes (`claim`,
 * `decline`, `preview`) and SSO's (`lookup`, the start and both callbacks) had
 * none either. `POST /email/test` sent any subject and HTML to any address for
 * anybody outside production. And production runs the API behind nginx with
 * `TRUST_PROXY` unset, so every visitor was nginx's one address, or, set to
 * `true`, whatever address the visitor wrote in X-Forwarded-For.
 *
 * ClickUp, read through search results (help.clickup.com and
 * developer.clickup.com are blocked here): "The ClickUp API applies rate limits
 * per token", 100 requests a minute on Free Forever, Unlimited and Business,
 * and "If you exceed the rate limit, the API returns a HTTP 429 status code".
 * Of invitations it says "Invitations to join your Workspace never expire, but
 * the link in the email is only valid for a short time", and nothing of
 * limits; nothing on signing up or signing in either. So the safe rule, per
 * address (the one key a request with no session has): sign-up's ten a minute
 * for every route that makes an account or answers an invitation, a page's 120
 * for an invitation's link, 60 SSO lookups (asked while an email is typed) and
 * 30 of SSO's redirects; 429 with a Retry-After past each.
 *
 * THE PROXY IS THIS SUITE'S OWN, standing in front of the lane's API as nginx
 * stands in front of production's: it forwards from an address of its own
 * (127.0.0.5) and APPENDS the address it saw to X-Forwarded-For
 * (`$proxy_add_x_forwarded_for`), setting X-Real-IP to it, as
 * `deploy/nginx/rundesk.theaura.agency.conf` does. The lane's API runs with
 * `TRUST_PROXY=1` (`lane_proxy_env`; CI's API step sets the same), the value
 * `deploy/docker-compose.prod.yml` sets. A request with no X-Forwarded-For —
 * every other one here — is read from its socket as before.
 *
 * THE WINDOW IS FIXED AND STARTS ON THE MINUTE (`RateLimitGuard`: one counter
 * per route, address and `floor(now / 60 s)`). The bursts start together as a
 * minute begins, the first after this suite's setup, so no counter starts
 * spent and none is split across two minutes; a check says so if one was.
 *
 * EVERY REQUEST ON A LANE COMES FROM 127.0.0.1, so a counter spent here would
 * refuse the next suite on the lane. The suite ends only once the window its
 * bursts spent has passed, including when it stops early; what it asks after
 * that is one ask per route. 127.0.0.2 to 127.0.0.6 are the loopback's too: on
 * Linux they need no setup.
 *
 * NOT MEASURED HERE: production's nginx itself, and a request that reaches the
 * API's port directly while it trusts a hop (deploy/README.md: only nginx may
 * reach it). `trust-proxy.test.ts` holds the parsing, and a CDN's second hop.
 *
 *   node test/e2e/auth-route-limits.mjs --api 3011
 */
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { signInApi, signUpApi } from './lib/signin.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 22

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

/*
 * THE BUDGETS THE PRODUCT PROMISES (`AUTH_ROUTE_LIMITS`, beside the guard, and
 * sign-in's own ten). Stated here and in the check sentences, not read from the
 * source: a limit raised past what a burst sends is what this suite exists to
 * notice.
 */
const SIGN_UP_LIMIT = 10
const INVITATION_LINK_LIMIT = 120
const SSO_LOOKUP_LIMIT = 60
const SSO_REDIRECT_LIMIT = 30
const OAUTH_REDIRECT_LIMIT = 30
const SIGN_IN_LIMIT = 10
/**
 * How many asks for the sign-in providers are all answered: past a page's
 * budget (120), since CI's readiness poll asks once a second for a minute and
 * every login page load asks once. The route is left unlimited on purpose.
 */
const PROVIDERS_BURST = 121
const WINDOW_MS = 60_000
/** Where the loopback answers as somebody else. */
const OTHER_ADDRESS = '127.0.0.2'
/** Two clients behind the proxy, and a third whose address the API is asked to read back. */
const CLIENT_A = '127.0.0.3'
const CLIENT_B = '127.0.0.4'
const CLIENT_C = '127.0.0.6'
/** The proxy's own address toward the API, as nginx's is toward production's. */
const PROXY_ADDRESS = '127.0.0.5'
/** How many requests are in flight at once in a burst. */
const WIDTH = 8

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client (`suite-hygiene/apiAs-duplicated-62`); it
 * answers status 0 when nothing answers. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? res.data ?? null).slice(0, 160)}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const windowOf = (t) => Math.floor(t / WINDOW_MS)
const windowEnd = (t) => (windowOf(t) + 1) * WINDOW_MS
const clock = (t) => new Date(t).toISOString().slice(11, 23)

/*
 * ONE REQUEST, AS A BROWSER WITH NO SESSION MAKES IT UNLESS `token` SAYS
 * OTHERWISE: redirects not followed, from 127.0.0.1 unless `from` names another
 * loopback address, to the API unless `base` is the proxy's. `node:http`
 * rather than `fetch`, because `fetch` cannot choose the address a request
 * leaves from. NEVER THROWS — `{status, retryAfter, location, data, error,
 * sentAt, at}`, status 0 when nothing answered, and every caller reads the
 * status.
 */
const agents = new Map()
const agentFor = (from) => {
  const key = from ?? 'default'
  if (!agents.has(key)) agents.set(key, new http.Agent({ keepAlive: true, maxSockets: WIDTH, ...(from ? { localAddress: from } : {}) }))
  return agents.get(key)
}
/* Idle sockets are closed between phases: one kept across a minute's wait can be one the API has closed. */
const dropSockets = () => {
  for (const agent of agents.values()) agent.destroy()
  agents.clear()
}
const visit = (route, { base = API, from = null, method = 'GET', body, headers = {}, token = null } = {}) =>
  new Promise((resolve) => {
    const sentAt = Date.now()
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body))
    const answer = (fields) =>
      resolve({ status: 0, retryAfter: null, location: null, data: null, error: null, sentAt, at: Date.now(), ...fields })
    const sent = { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }
    const req = http.request(`${base}${route}`, {
      method,
      agent: agentFor(from),
      headers: payload ? { ...sent, 'content-type': 'application/json', 'content-length': payload.length } : sent,
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('error', (err) => answer({ error: { message: `the answer broke off: ${err.message}` } }))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = null
        try { json = JSON.parse(text) } catch { json = null }
        answer({
          status: res.statusCode ?? 0,
          retryAfter: res.headers['retry-after'] ?? null,
          location: res.headers.location ?? null,
          data: json?.data ?? null,
          error: json ? (json.error ?? null) : { message: text.slice(0, 120) },
        })
      })
    })
    req.setTimeout(30_000, () => req.destroy(new Error('no answer in 30 s')))
    req.on('error', (err) => answer({ error: { message: `${err.code ?? ''} ${err.message}`.trim() } }))
    if (payload) req.write(payload)
    req.end()
  })

/** `n` requests made by `make(i)` (a `visit`), WIDTH at a time: every answer, in the order they were sent. */
const burst = async (n, make) => {
  const answers = new Array(n)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(WIDTH, n) }, async () => {
    for (;;) {
      const i = next++
      if (i >= n) return
      answers[i] = await make(i)
    }
  }))
  return answers
}

/** A refusal as the guard makes it: 429, with a Retry-After in whole seconds inside the minute, the same in the body. */
const refusedWell = (res) =>
  res.status === 429 && /^\d+$/.test(String(res.retryAfter ?? '')) &&
  Number(res.retryAfter) >= 1 && Number(res.retryAfter) <= 60 &&
  res.error?.details?.retryAfter === Number(res.retryAfter)
/** What a route's answers came to: answered by it, refused well, anything else, and the windows they fell in. */
const tally = (answers, answered) => ({
  answered: answers.filter(answered).length,
  refused: answers.filter(refusedWell).length,
  other: answers.filter((a) => !answered(a) && !refusedWell(a)).map((a) => said(a)),
  windows: [...new Set(answers.flatMap((a) => [windowOf(a.sentAt), windowOf(a.at)]))],
  retryAfter: answers.filter(refusedWell).map((a) => Number(a.retryAfter)),
})
/** Exactly the budget answered by the route, and the one past it refused, all in one window. */
const heldTo = (t, limit) => t.answered === limit && t.refused === 1 && t.other.length === 0 && t.windows.length === 1
const tallySays = (t) =>
  `${t.answered} answered by the route, ${t.refused} refused with 429 and a Retry-After${t.retryAfter.length ? ` of ${t.retryAfter.join(', ')} s` : ''}` +
  `${t.other.length ? `, and ${t.other.length} other answer(s): ${JSON.stringify([...new Set(t.other)].slice(0, 4))}` : ''}` +
  `${t.windows.length > 1 ? `; it CROSSED a window boundary (${t.windows.length} windows), so it measures nothing` : ''}`

/*
 * A PROXY AS NGINX IS ONE (`deploy/nginx/rundesk.theaura.agency.conf`): each
 * request goes on to the lane's API from the proxy's own address, with the
 * address the proxy saw APPENDED to whatever X-Forwarded-For the client sent,
 * and X-Real-IP set to it. The answer comes back as it was given.
 */
const startProxy = () =>
  new Promise((resolve, reject) => {
    const upstream = new http.Agent({ keepAlive: true, maxSockets: WIDTH * 2, localAddress: PROXY_ADDRESS })
    const server = http.createServer((req, res) => {
      const seen = req.socket.remoteAddress ?? ''
      const prior = req.headers['x-forwarded-for']
      const headers = { ...req.headers, 'x-forwarded-for': prior ? `${prior}, ${seen}` : seen, 'x-real-ip': seen }
      const onward = http.request({ host: '127.0.0.1', port: API_PORT, path: req.url, method: req.method, headers, agent: upstream }, (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers)
        answer.pipe(res)
      })
      onward.on('error', (err) => {
        res.writeHead(502, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ data: null, error: { message: `the proxy could not reach the API: ${err.message}` } }))
      })
      req.pipe(onward)
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () =>
      resolve({
        base: `http://127.0.0.1:${server.address().port}/api/v1`,
        close: () => new Promise((done) => {
          upstream.destroy()
          server.close(() => done())
          server.closeAllConnections()
        }),
      }),
    )
  })

const TAG = `e2e-authlim-${Date.now()}`
const PASSWORD = 'Limits@12345!'
const mail = (who) => `${TAG}-${who}@rundesk.invalid`
/** An email whose domain nobody signs in to through SSO. */
const NOBODYS_DOMAIN = `someone@${TAG}.invalid`

let A = null
let WS = null
let proxy = null
/** Made here and taken back in `finally`: each a workspace and the session that may delete it. */
const workspacesMade = []
/** Invitations still pending, by whom they were for: revoked in `finally`, so no pending list keeps them. */
const pendingInvitations = new Map()
const leftBehind = []
/**
 * When this suite's last burst ended. A burst is what can spend a counter; a
 * single ask cannot, so the asks after the window do not move this.
 */
let spentAt = 0
/** Every answer a burst was given: the refusals among them say when to come back. */
const burstAnswers = []

try {
  const auth = await signInApi(API, ME.email, ME.password)
  A = apiAs(auth.accessToken)

  /* A WORKSPACE OF ITS OWN, for the invitations and as a workspace with no SSO. */
  const madeWs = await A('/workspaces', { method: 'POST', body: { name: `Auth route limits ${TAG}` } })
  if (!madeWs.ok || !madeWs.data?.id) throw new Error(`could not make a workspace: ${said(madeWs)}`)
  WS = madeWs.data.id
  workspacesMade.push({ id: WS, as: A })

  /* An ordinary member: an account of their own, made the way the suites make people. */
  const member = await signUpApi(API, { email: mail('member'), fullName: `Member ${TAG}`, password: PASSWORD, organizationName: `Member ${TAG}` })
  if (member.workspaces?.[0]?.id) workspacesMade.push({ id: member.workspaces[0].id, as: apiAs(member.accessToken) })

  /* Three invitations into it, each read by its link as its invitee would: one opened, one accepted, one declined. */
  const invite = async (who) => {
    const made = await A('/invitations', { method: 'POST', body: { email: mail(who), workspaceId: WS, role: 'member' } })
    if (!made.ok || !made.data?.id) throw new Error(`could not invite ${who}: ${said(made)}`)
    pendingInvitations.set(who, made.data.id)
    const link = await A(`/invitations/${made.data.id}/link`)
    const token = link.data?.claimUrl ? new URL(link.data.claimUrl).searchParams.get('token') : null
    if (!link.ok || !token) throw new Error(`could not read ${who}’s invitation link: ${said(link)}`)
    return token
  }
  const OPENED = await invite('opener')
  const ACCEPTED = await invite('accepter')
  const DECLINED = await invite('decliner')

  // -------------------------------------------------------------------------
  console.log('\n▶ the test email is a super admin’s')

  const anonymousMail = await apiAs(null)('/email/test', { method: 'POST', body: { to: mail('anonymous-probe'), subject: `Anonymous ${TAG}` } })
  chk(
    anonymousMail.status === 401,
    'the test email route refuses a caller with no session: 401',
    `it answered ${said(anonymousMail)}`,
  )
  const memberMail = await apiAs(member.accessToken)('/email/test', { method: 'POST', body: { to: mail('member-probe'), subject: `Member ${TAG}` } })
  chk(
    memberMail.status === 403,
    'the test email route refuses an ordinary member: 403, super admins only',
    `it answered ${said(memberMail)}`,
  )
  const adminMail = await A('/email/test', { method: 'POST', body: { to: mail('admin-probe'), subject: `Super admin ${TAG}` } })
  chk(
    adminMail.ok && adminMail.data?.ok === true,
    'a super admin may still send a test email outside production, to an address that goes nowhere',
    `it answered ${said(adminMail)}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ one route makes an account: the old register route is retired')

  /*
   * THE OLD ROUTE, AS AN OLD CLIENT WOULD ASK IT: its own body, a new email.
   * Then sign-up with the same email, which is 201 only if the email is still
   * free, so nothing was made. Both before the burst window, from 127.0.0.1:
   * one sign-up in this minute, of the ten.
   */
  const registerEmail = mail('old-register')
  const oldRoute = await visit('/auth/register', { method: 'POST', body: { email: registerEmail, displayName: `Old register ${TAG}`, password: PASSWORD } })
  const stillFree = await visit('/auth/signup', { method: 'POST', body: { email: registerEmail, fullName: `Old register ${TAG}`, password: PASSWORD, organizationName: `Old register ${TAG}` } })
  if (stillFree.data?.workspaces?.[0]?.id) workspacesMade.push({ id: stillFree.data.workspaces[0].id, as: apiAs(stillFree.data.accessToken) })
  if (oldRoute.data?.workspaces?.[0]?.id) workspacesMade.push({ id: oldRoute.data.workspaces[0].id, as: apiAs(oldRoute.data.accessToken) })
  chk(
    oldRoute.status === 410 && /POST \/auth\/signup/.test(oldRoute.error?.message ?? '') && stillFree.status === 201 && !!stillFree.data?.accessToken,
    'the old register route is retired: it answers 410 naming sign-up, and makes nothing — sign-up with the same email then makes the account',
    `register answered ${said(oldRoute)}; sign-up with the same email answered ${said(stillFree)}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ behind a proxy that appends the address it saw, as nginx does')

  proxy = await startProxy()
  /* THE ADDRESS ITSELF, as the IP allowlist reads it: the security settings say which address asked. */
  const FORGED = '198.51.100.23'
  const readBack = await visit(`/workspaces/${WS}/security-settings`, { base: proxy.base, from: CLIENT_C, token: auth.accessToken, headers: { 'x-forwarded-for': FORGED } })
  chk(
    readBack.status === 200 && readBack.data?.currentIp === CLIENT_C,
    'through a proxy that appends the address it saw, as nginx does, the API reads the client’s address as the proxy saw it, not the one the client wrote in X-Forwarded-For',
    `the API read ${JSON.stringify(readBack.data?.currentIp ?? null)} (answered ${readBack.status}): the proxy saw ${CLIENT_C} and forwarded from ${PROXY_ADDRESS}, the client wrote ${FORGED}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ a visitor, then a burst on each route, in one window')

  /* Each route, and what its own answer is: the thing it does, or its own refusal, never the limiter's. */
  const ROUTES = {
    signup: {
      ask: () => visit('/auth/signup', { method: 'POST', body: { email: mail('burst'), fullName: `Burst ${TAG}`, password: PASSWORD, organizationName: `Burst ${TAG}` } }),
      first: (r) => r.status === 201 && !!r.data?.accessToken,
      answered: (r) => (r.status === 201 && !!r.data?.accessToken) || r.status === 409,
    },
    preview: {
      ask: () => visit(`/invitations/preview?token=${encodeURIComponent(OPENED)}`),
      first: (r) => r.status === 200 && r.data?.email === mail('opener'),
      answered: (r) => r.status === 200 && r.data?.email === mail('opener'),
    },
    claim: {
      /* The first accepts ACCEPTED; the rest name no invitation, which the route answers 404. */
      ask: (i = 0) => visit('/invitations/claim', {
        method: 'POST',
        body: i === 0 ? { token: ACCEPTED, fullName: `Accepter ${TAG}`, password: PASSWORD } : { token: randomBytes(32).toString('base64url') },
      }),
      first: (r) => r.status === 201 && !!r.data?.accessToken,
      answered: (r) => (r.status === 201 && !!r.data?.accessToken) || r.status === 404,
    },
    decline: {
      ask: () => visit('/invitations/decline', { method: 'POST', body: { token: DECLINED } }),
      first: (r) => r.status === 200 && r.data?.status === 'declined',
      answered: (r) => r.status === 200 && r.data?.status === 'declined',
    },
    lookup: {
      ask: () => visit(`/auth/sso/lookup?email=${encodeURIComponent(NOBODYS_DOMAIN)}`),
      first: (r) => r.status === 200 && r.data?.connection === null,
      answered: (r) => r.status === 200 && r.data?.connection === null,
    },
    start: {
      ask: () => visit(`/auth/sso/oidc/start?workspaceId=${WS}`),
      first: (r) => r.status === 404 && /not configured/i.test(r.error?.message ?? ''),
      answered: (r) => r.status === 404 && /not configured/i.test(r.error?.message ?? ''),
    },
    oidcCallback: {
      ask: () => visit(`/auth/sso/oidc/callback?state=${TAG}-no-such-state&code=nothing`),
      first: (r) => r.status === 302 && /\/login\?ssoError=/.test(r.location ?? ''),
      answered: (r) => r.status === 302 && /\/login\?ssoError=/.test(r.location ?? ''),
    },
    samlCallback: {
      ask: () => visit('/auth/sso/saml/callback', { method: 'POST', body: { SAMLResponse: Buffer.from(`not a SAML answer ${TAG}`).toString('base64') } }),
      first: (r) => r.status === 302 && /\/login\?ssoError=/.test(r.location ?? ''),
      answered: (r) => r.status === 302 && /\/login\?ssoError=/.test(r.location ?? ''),
    },
    /* Signing in with Google: sent to Google, or back to sign-in where the lane holds no sign-in keys. */
    oauthStart: {
      ask: () => visit('/auth/oauth/google'),
      first: (r) => r.status === 302 && /\/login\?error=oauth_|^https:\/\/accounts\.google\.com\//.test(r.location ?? ''),
      answered: (r) => r.status === 302 && /\/login\?error=oauth_|^https:\/\/accounts\.google\.com\//.test(r.location ?? ''),
    },
    /* Google's answer coming back with a state nobody issued: sent back to sign-in, saying why. */
    oauthCallback: {
      ask: () => visit(`/auth/oauth/google/callback?state=${TAG}-no-such-state&code=nothing`),
      first: (r) => r.status === 302 && /\/login\?ssoError=/.test(r.location ?? ''),
      answered: (r) => r.status === 302 && /\/login\?ssoError=/.test(r.location ?? ''),
    },
    /* A connection's answer coming back with a state nobody issued: sent to the app, saying it failed. */
    integrationCallback: {
      ask: () => visit(`/integrations/oauth/gcal/callback?state=${TAG}-no-such-state&code=nothing`),
      first: (r) => r.status === 302 && /\/app\?oauth=error/.test(r.location ?? ''),
      answered: (r) => r.status === 302 && /\/app\?oauth=error/.test(r.location ?? ''),
    },
  }
  /* The asks before it, and `n` more from the same address: every answer the route gave it in the window. */
  const flood = async (name, earlier, n) => {
    const answers = [...earlier, ...(await burst(n, (i) => ROUTES[name].ask(i + 1)))]
    spentAt = Date.now()
    burstAnswers.push(...answers)
    return answers
  }
  /* A sign-in through the proxy, with a password that is nobody's: the route answers 401. */
  const signInThroughProxy = (from, forged) =>
    visit('/auth/login', {
      base: proxy.base,
      from,
      method: 'POST',
      body: { email: mail('nobody'), password: 'Wrong@12345!' },
      headers: forged ? { 'x-forwarded-for': forged } : {},
    })

  /*
   * EVERYTHING BELOW, TO THE LAST BURST, IN ONE FRESH WINDOW: the next minute
   * to begin. Nothing in this suite asked a throttled route in it before, so
   * each counter starts at nought, and the bursts take seconds of its sixty.
   */
  const fresh = windowEnd(Date.now()) + 250
  console.log(`  … waiting ${Math.ceil((fresh - Date.now()) / 1000)} s for a minute nobody has asked in yet`)
  await sleep(fresh - Date.now())
  const burstsFrom = Date.now()
  const W = windowOf(burstsFrom)
  console.log(`  (window ${clock(W * WINDOW_MS)}–${clock((W + 1) * WINDOW_MS)} UTC, starting at ${clock(burstsFrom)})`)

  /* An ordinary visitor: one ask of each, as a person makes. Each is the first of its route's burst below. */
  const first = {}
  for (const name of Object.keys(ROUTES)) first[name] = await ROUTES[name].ask(0)
  if (first.signup.data?.workspaces?.[0]?.id) workspacesMade.push({ id: first.signup.data.workspaces[0].id, as: apiAs(first.signup.data.accessToken) })
  if (ROUTES.claim.first(first.claim)) pendingInvitations.delete('accepter')
  if (ROUTES.decline.first(first.decline)) pendingInvitations.delete('decliner')
  const firstMissed = Object.entries(first).filter(([name, res]) => !ROUTES[name].first(res))
  chk(
    firstMissed.length === 0,
    'an ordinary visitor is answered by every route: signs up (201, a session), opens an invitation’s link (200, whose it is), accepts it (201, a session), declines another (200), asks whether an email signs in through SSO (200), and SSO’s, Google’s and a connection’s redirects answer as they do (404 with no SSO set up, 302 on to the provider or back to the app)',
    firstMissed.map(([name, res]) => `${name} answered ${said(res)}${res.location ? ` → ${res.location.slice(0, 80)}` : ''}`).join('; '),
  )

  /* SIGN-UP: the same email ten more times from the same address, 11 in the window. */
  const signUpTally = tally(await flood('signup', [first.signup], SIGN_UP_LIMIT), ROUTES.signup.answered)
  chk(
    heldTo(signUpTally, SIGN_UP_LIMIT),
    'a burst of 11 sign-ups from one address in one minute: 10 are answered by the route (the first makes an account, nine more find the email taken), and the eleventh is refused with 429 and a Retry-After',
    tallySays(signUpTally),
  )

  /* Somebody else, in the same minute. */
  const elsewhere = await visit('/auth/signup', { from: OTHER_ADDRESS, method: 'POST', body: { email: mail('elsewhere'), fullName: `Elsewhere ${TAG}`, password: PASSWORD, organizationName: `Elsewhere ${TAG}` } })
  if (elsewhere.data?.workspaces?.[0]?.id) workspacesMade.push({ id: elsewhere.data.workspaces[0].id, as: apiAs(elsewhere.data.accessToken) })
  chk(
    heldTo(signUpTally, SIGN_UP_LIMIT) && elsewhere.status === 201 && !!elsewhere.data?.accessToken,
    'the refusal is the address’s alone: another address signing up in the same minute makes its account',
    heldTo(signUpTally, SIGN_UP_LIMIT)
      ? `from ${OTHER_ADDRESS} signing up answered ${said(elsewhere)}${elsewhere.status === 0 ? ` (where the loopback holds only 127.0.0.1, give it ${OTHER_ADDRESS})` : ''}`
      : `signing up never refused the first address (${tallySays(signUpTally)}), so another address being served shows nothing`,
  )

  /* THE INVITEE'S THREE ROUTES. */
  const previewTally = tally(await flood('preview', [first.preview], INVITATION_LINK_LIMIT), ROUTES.preview.answered)
  chk(
    heldTo(previewTally, INVITATION_LINK_LIMIT),
    'a burst of 121 opens of an invitation’s link from one address: 120 are answered with the invitation, and the one past them is refused with 429 and a Retry-After',
    tallySays(previewTally),
  )
  const claimTally = tally(await flood('claim', [first.claim], SIGN_UP_LIMIT), ROUTES.claim.answered)
  chk(
    heldTo(claimTally, SIGN_UP_LIMIT),
    'a burst of 11 invitation claims from one address: 10 are answered by the route (the first accepts, the rest name no invitation), and the eleventh is refused with 429 and a Retry-After',
    tallySays(claimTally),
  )
  const declineTally = tally(await flood('decline', [first.decline], SIGN_UP_LIMIT), ROUTES.decline.answered)
  chk(
    heldTo(declineTally, SIGN_UP_LIMIT),
    'a burst of 11 declines of an invitation from one address: 10 are answered, and the eleventh is refused with 429 and a Retry-After',
    tallySays(declineTally),
  )

  /* SSO'S FOUR. */
  const lookupTally = tally(await flood('lookup', [first.lookup], SSO_LOOKUP_LIMIT), ROUTES.lookup.answered)
  chk(
    heldTo(lookupTally, SSO_LOOKUP_LIMIT),
    'a burst of 61 SSO lookups from one address: 60 are answered, and the one past them is refused with 429 and a Retry-After',
    tallySays(lookupTally),
  )
  const startTally = tally(await flood('start', [first.start], SSO_REDIRECT_LIMIT), ROUTES.start.answered)
  chk(
    heldTo(startTally, SSO_REDIRECT_LIMIT),
    'a burst of 31 SSO sign-in starts from one address: 30 are answered by the route, and the one past them is refused with 429 and a Retry-After',
    tallySays(startTally),
  )
  const oidcTally = tally(await flood('oidcCallback', [first.oidcCallback], SSO_REDIRECT_LIMIT), ROUTES.oidcCallback.answered)
  chk(
    heldTo(oidcTally, SSO_REDIRECT_LIMIT),
    'a burst of 31 OIDC callbacks from one address: 30 are sent back to sign-in, and the one past them is refused with 429 and a Retry-After',
    tallySays(oidcTally),
  )
  const samlTally = tally(await flood('samlCallback', [first.samlCallback], SSO_REDIRECT_LIMIT), ROUTES.samlCallback.answered)
  chk(
    heldTo(samlTally, SSO_REDIRECT_LIMIT),
    'a burst of 31 SAML callbacks from one address: 30 are sent back to sign-in, and the one past them is refused with 429 and a Retry-After',
    tallySays(samlTally),
  )

  /* GOOGLE'S AND MICROSOFT'S SIGN-IN, AND A CONNECTION'S ANSWER: SSO's thirty each. */
  const oauthStartTally = tally(await flood('oauthStart', [first.oauthStart], OAUTH_REDIRECT_LIMIT), ROUTES.oauthStart.answered)
  chk(
    heldTo(oauthStartTally, OAUTH_REDIRECT_LIMIT),
    'a burst of 31 starts of signing in with Google from one address: 30 are sent on, and the one past them is refused with 429 and a Retry-After',
    tallySays(oauthStartTally),
  )
  const oauthCallbackTally = tally(await flood('oauthCallback', [first.oauthCallback], OAUTH_REDIRECT_LIMIT), ROUTES.oauthCallback.answered)
  chk(
    heldTo(oauthCallbackTally, OAUTH_REDIRECT_LIMIT),
    'a burst of 31 Google sign-in callbacks from one address: 30 are sent back to sign-in, and the one past them is refused with 429 and a Retry-After',
    tallySays(oauthCallbackTally),
  )
  const integrationCallbackTally = tally(await flood('integrationCallback', [first.integrationCallback], OAUTH_REDIRECT_LIMIT), ROUTES.integrationCallback.answered)
  chk(
    heldTo(integrationCallbackTally, OAUTH_REDIRECT_LIMIT),
    'a burst of 31 integration OAuth callbacks from one address: 30 are sent back to the app, and the one past them is refused with 429 and a Retry-After',
    tallySays(integrationCallbackTally),
  )

  /*
   * THE PROVIDERS LIST, LEFT ALONE: the login page asks it once per load, and
   * CI's "Start the API" step polls it once a second for up to a minute, from
   * 127.0.0.1 like everything else there. Past a page's budget, all answered.
   */
  const providersAnswers = await burst(PROVIDERS_BURST, () => visit('/auth/oauth/providers'))
  const providersTally = tally(providersAnswers, (r) => r.status === 200 && typeof r.data?.google === 'boolean')
  chk(
    providersTally.answered === PROVIDERS_BURST && providersTally.refused === 0 && providersTally.other.length === 0,
    'the sign-in providers are answered to every ask, 121 from one address in one minute: the login page asks once per load and CI’s readiness poll once a second',
    tallySays(providersTally),
  )

  /*
   * BEHIND THE PROXY: client A names a different address on every sign-in, as
   * a client escaping a per-address limit would; client B names none.
   */
  const signedIn = (r) => r.status === 401
  const proxiedAnswers = await burst(SIGN_IN_LIMIT + 1, (i) => signInThroughProxy(CLIENT_A, `198.51.100.${i + 1}`))
  spentAt = Date.now()
  burstAnswers.push(...proxiedAnswers)
  const proxiedTally = tally(proxiedAnswers, signedIn)
  chk(
    heldTo(proxiedTally, SIGN_IN_LIMIT),
    'behind the proxy, a client naming a different address in X-Forwarded-For on every sign-in is still counted as the address the proxy saw: of 11 wrong passwords in one minute, 10 are answered 401 and the eleventh is refused with 429',
    tallySays(proxiedTally),
  )
  const clientB = await signInThroughProxy(CLIENT_B, null)
  chk(
    heldTo(proxiedTally, SIGN_IN_LIMIT) && clientB.status === 401,
    'another client behind the same proxy, in the same minute, has a budget of its own: its sign-in is answered 401, not 429',
    heldTo(proxiedTally, SIGN_IN_LIMIT)
      ? `${CLIENT_B}’s sign-in through the proxy answered ${said(clientB)}`
      : `the first client was never held to sign-in’s ten (${tallySays(proxiedTally)}), so another being answered shows nothing`,
  )
  dropSockets()
  console.log(`  (the visitor and the bursts took ${((Date.now() - burstsFrom) / 1000).toFixed(1)} s, to ${clock(Date.now())})`)

  // -------------------------------------------------------------------------
  console.log('\n▶ after the window')

  /*
   * WAITED OUT ONCE, FOR ALL THE ROUTES: the latest moment any refusal said to
   * come back, and a second more, because the boundary is the server's clock.
   * Never before the window's own end, so a route that refused nothing is
   * asked in a new window too.
   */
  const tallies = {
    signup: signUpTally, preview: previewTally, claim: claimTally, decline: declineTally,
    lookup: lookupTally, start: startTally, oidcCallback: oidcTally, samlCallback: samlTally,
    oauthStart: oauthStartTally, oauthCallback: oauthCallbackTally, integrationCallback: integrationCallbackTally,
    'sign-in through the proxy': proxiedTally,
  }
  const refusals = burstAnswers.filter(refusedWell)
  const backAt = Math.max(windowEnd(W * WINDOW_MS), ...refusals.map((a) => a.at + Number(a.retryAfter) * 1000)) + 1000
  console.log(`  … waiting ${Math.ceil((backAt - Date.now()) / 1000)} s, to ${clock(backAt)} UTC, for the window the refusals named to end`)
  await sleep(Math.max(0, backAt - Date.now()))
  const again = {}
  for (const name of Object.keys(ROUTES)) again[name] = await ROUTES[name].ask(1)
  again['sign-in through the proxy'] = await signInThroughProxy(CLIENT_A, '198.51.100.99')
  const answeredAgain = { ...Object.fromEntries(Object.keys(ROUTES).map((n) => [n, ROUTES[n].answered])), 'sign-in through the proxy': signedIn }
  const stillRefused = Object.entries(again).filter(([name, res]) => !answeredAgain[name](res))
  const neverRefused = Object.entries(tallies).filter(([, t]) => t.refused === 0).map(([name]) => name)
  chk(
    stillRefused.length === 0 && neverRefused.length === 0,
    'after the window the same address is answered again by every route that refused it, and so is the client behind the proxy',
    stillRefused.length
      ? stillRefused.map(([name, res]) => `${name} answered ${said(res)}`).join('; ')
      : `every route answered it, but ${neverRefused.join(', ')} had refused it nothing, so there was nothing to come back from`,
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('auth-route-limits.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  dropSockets()
  if (proxy) await proxy.close()
  // Each taken back by its own route and read by its status: gone, or already gone (404).
  const takeBack = (what, res) => {
    if (![200, 204, 404].includes(res.status)) leftBehind.push(`${what} answered ${said(res)}`)
  }
  if (A) {
    // An invitation still pending is revoked, so no list of pending invitations keeps it.
    for (const [who, id] of pendingInvitations) takeBack(`DELETE ${who}’s invitation ${id}`, await A(`/invitations/${id}`, { method: 'DELETE' }))
  }
  for (const { id, as } of workspacesMade.reverse()) takeBack(`DELETE workspace ${id}`, await as(`/workspaces/${id}`, { method: 'DELETE' }))
  /*
   * NOT BEFORE THE WINDOW HAS PASSED. Every suite on this lane asks from
   * 127.0.0.1, so a counter this suite spent would refuse the next one. On a
   * run that got to the end it has passed already; on one that stopped early
   * it is waited for here.
   */
  if (spentAt) {
    const until = windowEnd(spentAt) + 1000
    if (until > Date.now()) {
      console.log(`  … waiting ${Math.ceil((until - Date.now()) / 1000)} s for the window this suite spent to end, so the next suite on this lane starts fresh`)
      await sleep(until - Date.now())
    }
    console.log(`  the window this suite's bursts spent ended at ${clock(windowEnd(spentAt))} UTC: the next suite on this lane meets no spent counter`)
  }
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
