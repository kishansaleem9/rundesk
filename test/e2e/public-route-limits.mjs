/**
 * THE ROUTES ANYBODY MAY CALL ARE THROTTLED PER ADDRESS (`found-30-sep/public-routes-unthrottled`).
 *
 * `GET /public/docs/:slug`, `/public/clips/:token`, `/portal/:token`,
 * `/public/images/:folder/:name`, `/public/workspace-by-domain` and `/status`
 * answer anybody, signed in or not, and nothing limited how often one address
 * could ask. A clip token is 192 random bits, so guessing one is not the risk;
 * a flood is: every open of a clip asks the store about the object and signs
 * it again, and every open of a portal reads its project's tasks and writes
 * when it was last viewed.
 *
 * ClickUp, from its developer docs (read through search results;
 * developer.clickup.com and help.clickup.com are blocked here): "The ClickUp
 * API applies rate limits per token", 100 requests a minute on Free Forever,
 * Unlimited and Business, 1,000 on Business Plus and 10,000 on Enterprise, and
 * "If you exceed the rate limit, the API returns a HTTP 429". Its help centre
 * says nothing of limits on public links. So a visitor with no account is
 * limited by the one key such a request has, its address, and far above what
 * one visitor sends: 120 a minute for a page (a doc, a clip, a portal, the
 * status page and a custom domain's branding, each asked once per page load)
 * and 1,200 for a picture, because one page draws dozens. The TLS proxy's
 * ask, the providers' webhooks and the calendar feed are machines, often many
 * callers behind one address, and are not throttled; this reads that they
 * still are not.
 *
 * THE WINDOW IS FIXED AND STARTS ON THE MINUTE (`RateLimitGuard`: one counter
 * per route, address and `floor(now / 60 s)`). A burst that crossed a
 * boundary would be split between two counters and never reach the limit, and
 * a burst in a minute somebody else had already asked in would meet a counter
 * already spent: the suite before this one in CI opens a clip's link, and this
 * suite's own last run ends by asking every route once. So the bursts start
 * together as a minute begins, the first to begin after this suite started,
 * and a check says so if one crossed a boundary anyway. The Retry-After of the
 * refusals is waited out once, for all the routes together.
 *
 * EVERY REQUEST ON A LANE COMES FROM 127.0.0.1, this suite's and every other
 * suite's, so a counter this suite spends would refuse the next suite on the
 * same lane. It ends only once the window its bursts spent has passed, and
 * says so, including when it stops early; what it asks after that is one ask
 * per route, one of a budget of 120. The second address it asks from,
 * 127.0.0.2, is the loopback's too: on Linux it needs no setup.
 *
 * NOT MEASURED HERE: an address read from X-Forwarded-For (`TRUST_PROXY`,
 * which the lanes and CI leave off), and the per-process limiter the guard
 * falls back to when its Postgres counter cannot be written. The guard's unit
 * tests hold the fallback.
 *
 *   node test/e2e/public-route-limits.mjs --api 3011
 */
import http from 'node:http'
import { signInApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 11

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

/*
 * THE BUDGETS THE PRODUCT PROMISES (`PUBLIC_ROUTE_LIMITS`, beside the guard).
 * Stated here and in the check sentences, not read from the source: a limit
 * raised past what a burst sends is exactly what this suite exists to notice.
 */
const PAGE_LIMIT = 120
const IMAGE_LIMIT = 1_200
const WINDOW_MS = 60_000
/** Where the loopback answers as somebody else. */
const OTHER_ADDRESS = '127.0.0.2'
/** How many requests are in flight at once in a burst. */
const WIDTH = 16

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
 * ONE REQUEST AS A VISITOR'S BROWSER MAKES IT: no session, redirects not
 * followed, from 127.0.0.1 unless `from` names another loopback address.
 * `node:http` rather than `fetch`, because `fetch` cannot choose the address a
 * request leaves from. NEVER THROWS — `{status, retryAfter, location, data,
 * error, sentAt, at}`, status 0 when nothing answered, and every caller reads
 * the status.
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
const visit = (route, { from = null, method = 'GET', body, headers = {} } = {}) =>
  new Promise((resolve) => {
    const sentAt = Date.now()
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body))
    const answer = (fields) =>
      resolve({ status: 0, retryAfter: null, location: null, data: null, error: null, sentAt, at: Date.now(), ...fields })
    const req = http.request(`${API}${route}`, {
      method,
      agent: agentFor(from),
      headers: payload ? { ...headers, 'content-type': 'application/json', 'content-length': payload.length } : headers,
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

/** `n` requests to one route from one address, WIDTH at a time: every answer, in the order they were sent. */
const burst = async (route, n, opts = {}) => {
  const answers = new Array(n)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(WIDTH, n) }, async () => {
    for (;;) {
      const i = next++
      if (i >= n) return
      answers[i] = await visit(route, opts)
    }
  }))
  return answers
}

/** A refusal as the guard makes it: 429, with a Retry-After in whole seconds inside the minute, the same in the body. */
const refusedWell = (res) =>
  res.status === 429 && /^\d+$/.test(String(res.retryAfter ?? '')) &&
  Number(res.retryAfter) >= 1 && Number(res.retryAfter) <= 60 &&
  res.error?.details?.retryAfter === Number(res.retryAfter)
/** What a route's answers came to: served, refused well, anything else, and the windows they fell in. */
const tally = (answers, served) => ({
  served: answers.filter(served).length,
  refused: answers.filter(refusedWell).length,
  other: answers.filter((a) => !served(a) && !refusedWell(a)).map((a) => said(a)),
  windows: [...new Set(answers.flatMap((a) => [windowOf(a.sentAt), windowOf(a.at)]))],
  retryAfter: answers.filter(refusedWell).map((a) => Number(a.retryAfter)),
})
/** Exactly the budget served, and the one past it refused, all in one window. */
const heldTo = (t, limit) => t.served === limit && t.refused === 1 && t.other.length === 0 && t.windows.length === 1
const tallySays = (t) =>
  `${t.served} served, ${t.refused} refused with 429 and a Retry-After${t.retryAfter.length ? ` of ${t.retryAfter.join(', ')} s` : ''}` +
  `${t.other.length ? `, and ${t.other.length} other answer(s): ${JSON.stringify([...new Set(t.other)].slice(0, 4))}` : ''}` +
  `${t.windows.length > 1 ? `; it CROSSED a window boundary (${t.windows.length} windows), so it measures nothing` : ''}`

const TAG = `e2e-limits-${Date.now()}`
const DOC_TITLE = `Rate limits ${TAG}`
const PROJECT_NAME = `Portal project ${TAG}`
const HOST = `limits-${Date.now()}.e2e.invalid`
/** A 1×1 PNG, the logo. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARgwMDAwMAA8IAWYAAAAASUVORK5CYII=',
  'base64',
)

let sql = null
let A = null
let WS = null
const made = { docId: null, clipKey: null, portalId: null, logoObject: null, space: false }
const leftBehind = []
/**
 * When this suite's last burst ended. A burst is what can spend a counter; a
 * single ask cannot, so the asks after the window do not move this.
 */
let spentAt = 0

try {
  const auth = await signInApi(API, ME.email, ME.password)
  A = apiAs(auth.accessToken)
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — this suite gives its workspace a verified custom domain, which no lane can verify by DNS')

  /* A WORKSPACE OF ITS OWN, holding one of everything the public routes serve. */
  const madeWs = await A('/workspaces', { method: 'POST', body: { name: `Public route limits ${TAG}` } })
  if (!madeWs.ok || !madeWs.data?.id) throw new Error(`could not make a workspace: ${said(madeWs)}`)
  WS = madeWs.data.id

  // A shared doc.
  const madeDoc = await A(`/workspaces/${WS}/docs`, { method: 'POST', body: { title: DOC_TITLE } })
  if (!madeDoc.ok || !madeDoc.data?.id) throw new Error(`could not make the doc: ${said(madeDoc)}`)
  made.docId = madeDoc.data.id
  const shared = await A(`/docs/${made.docId}/share`, { method: 'POST' })
  const SLUG = shared.data?.publicShareId
  if (!shared.ok || !SLUG) throw new Error(`could not share the doc: ${said(shared)}`)

  // A clip, uploaded as the app uploads one, and its link.
  const presign = await A(`/workspaces/${WS}/clips/presign`, {
    method: 'POST', body: { fileName: `${TAG}.webm`, contentType: 'video/webm', title: `Clip ${TAG}` },
  })
  if (!presign.ok || !presign.data?.uploadUrl) throw new Error(`could not presign the clip: ${said(presign)}`)
  const put = await fetch(presign.data.uploadUrl, { method: 'PUT', body: Buffer.from(`${TAG}: a clip`), headers: { 'content-type': 'video/webm' } })
    .then((r) => r.status, () => 0)
  if (put !== 200) throw new Error(`the store refused the clip's upload: ${put}`)
  made.clipKey = presign.data.storageKey
  const link = await A(`/workspaces/${WS}/clips/link`, { method: 'POST', body: { storageKey: made.clipKey } })
  const CLIP_TOKEN = link.data?.token
  if (!link.ok || !CLIP_TOKEN) throw new Error(`could not get the clip a link: ${said(link)}`)

  // A client portal, on a project of its own.
  const [space] = await sql`insert into spaces (workspace_id, name) values (${WS}, ${`Space ${TAG}`}) returning id`
  made.space = true
  const [project] = await sql`insert into projects (space_id, name) values (${space.id}, ${PROJECT_NAME}) returning id`
  const portal = await A(`/projects/${project.id}/portal`, { method: 'POST', body: { name: `Portal ${TAG}` } })
  const PORTAL_TOKEN = portal.data?.token
  if (!portal.ok || !PORTAL_TOKEN) throw new Error(`could not make the portal: ${said(portal)}`)
  made.portalId = portal.data.id

  // A logo, uploaded the product's own way: its saved address is a public image.
  const logo = await A(`/workspaces/${WS}/logo/presign`, { method: 'POST', body: { contentType: 'image/png', sizeBytes: TINY_PNG.length } })
  if (!logo.ok || !logo.data?.uploadUrl || !logo.data?.publicUrl) throw new Error(`could not presign the logo: ${said(logo)}`)
  const logoPut = await fetch(logo.data.uploadUrl, { method: 'PUT', body: TINY_PNG, headers: { 'content-type': 'image/png' } })
    .then((r) => r.status, () => 0)
  if (logoPut !== 200) throw new Error(`the store refused the logo's upload: ${logoPut}`)
  const stored = new URL(logo.data.uploadUrl)
  made.logoObject = `${stored.origin}${stored.pathname}`
  const IMAGE_ROUTE = logo.data.publicUrl.replace(/^\/api\/v1/, '')

  /*
   * A VERIFIED CUSTOM DOMAIN, by SQL: the product verifies one by a DNS TXT
   * record, which no lane or CI runner can publish.
   */
  await sql`update workspaces set custom_domain = ${HOST}, custom_domain_verified = true where id = ${WS}`

  /* Each throttled route, and what serving it means: the thing it holds, not a status. */
  const ROUTES = {
    doc: { route: `/public/docs/${SLUG}`, served: (r) => r.status === 200 && r.data?.title === DOC_TITLE },
    clip: { route: `/public/clips/${CLIP_TOKEN}`, served: (r) => r.status === 200 && /X-Amz-Signature=/.test(r.data?.url ?? '') },
    portal: { route: `/portal/${PORTAL_TOKEN}`, served: (r) => r.status === 200 && r.data?.project?.name === PROJECT_NAME },
    branding: { route: `/public/workspace-by-domain?host=${encodeURIComponent(HOST)}`, served: (r) => r.status === 200 && r.data?.id === WS },
    status: { route: '/status', served: (r) => r.status === 200 && typeof r.data?.overall === 'string' && Array.isArray(r.data?.components) },
    logo: { route: IMAGE_ROUTE, served: (r) => r.status === 302 && /X-Amz-Signature=/.test(r.location ?? '') },
  }
  const ask = (name, opts) => visit(ROUTES[name].route, opts)
  /* The asks before it, and `n` more from the same address: every answer the route gave it in the window. */
  const flood = async (name, earlier, n) => {
    const answers = [...earlier, ...(await burst(ROUTES[name].route, n))]
    spentAt = Date.now()
    return answers
  }

  // -------------------------------------------------------------------------
  console.log('\n▶ the machines’ routes answer every request')

  /*
   * FIRST, IN A WINDOW OF THEIR OWN: they spend no counter, and if a build
   * throttled them, the counter it spent has long passed by the time this
   * suite ends. Each is asked past every public budget, as a machine's
   * retries, or its many tenants behind one address, would ask.
   */
  const MACHINES = [
    { name: 'the TLS proxy’s ask', route: `/public/tls/authorize?domain=${encodeURIComponent(HOST)}` },
    { name: 'an inbound webhook', route: `/inbound/webhook/${TAG}-no-such-hook`, method: 'POST', body: { title: 'never made' } },
    { name: 'Stripe’s webhook', route: '/billing/webhook', method: 'POST', body: {}, headers: { 'stripe-signature': 't=1,v1=0' } },
    { name: 'the calendar feed', route: `/ical/${TAG}-no-such-feed.ics` },
  ]
  const machinesFrom = Date.now()
  const machineAnswers = []
  for (const m of MACHINES) {
    const answers = await burst(m.route, IMAGE_LIMIT + 1, { method: m.method, body: m.body, headers: m.headers })
    machineAnswers.push({
      name: m.name,
      statuses: [...new Set(answers.map((a) => a.status))],
      throttled: answers.filter((a) => a.status === 429).length,
      unanswered: answers.filter((a) => a.status === 0).length,
    })
    spentAt = Date.now()
  }
  dropSockets()
  console.log(`  (${MACHINES.length} bursts of ${(IMAGE_LIMIT + 1).toLocaleString('en-US')} in ${((Date.now() - machinesFrom) / 1000).toFixed(1)} s)`)
  chk(
    machineAnswers.every((m) => m.throttled === 0 && m.unanswered === 0 && m.statuses.length === 1),
    'the machines’ routes are not throttled: the TLS proxy’s ask, an inbound webhook, Stripe’s webhook and the calendar feed each answer a burst of 1,201 from one address as they answer one request, without one 429',
    machineAnswers.map((m) => `${m.name}: ${m.throttled} refused with 429, ${m.unanswered} unanswered, statuses ${JSON.stringify(m.statuses)}`).join('; '),
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ a visitor, then a flood, in one window')

  /*
   * EVERYTHING BELOW, TO THE LAST BURST, IN ONE FRESH WINDOW: the next minute
   * to begin. Nothing before this suite asked in it, so each counter starts
   * at nought, and the bursts take seconds of its sixty.
   */
  const fresh = windowEnd(Date.now()) + 250
  console.log(`  … waiting ${Math.ceil((fresh - Date.now()) / 1000)} s for a minute nobody has asked in yet`)
  await sleep(fresh - Date.now())
  const floodsFrom = Date.now()
  const W = windowOf(floodsFrom)
  console.log(`  (window ${clock(W * WINDOW_MS)}–${clock((W + 1) * WINDOW_MS)} UTC, starting at ${clock(floodsFrom)})`)

  /* An ordinary visitor: one ask of each, as a page load makes. Each is the first of its route's burst below. */
  const first = {}
  for (const name of Object.keys(ROUTES)) first[name] = await ask(name)
  const firstMissed = Object.entries(first).filter(([name, res]) => !ROUTES[name].served(res))
  chk(
    firstMissed.length === 0,
    'an ordinary visitor is served on every public route: the shared doc, the clip’s link, the client portal, the custom domain’s branding, the status page and the logo, each answered with what it holds',
    firstMissed.map(([name, res]) => `${name} answered ${said(res)}${res.location ? ` → ${res.location.slice(0, 60)}` : ''}`).join('; '),
  )

  /* THE DOC: 120 more opens from the same address, 121 in the window. */
  const docAnswers = await flood('doc', [first.doc], PAGE_LIMIT)
  const docTally = tally(docAnswers, ROUTES.doc.served)
  chk(
    heldTo(docTally, PAGE_LIMIT),
    'a burst of 121 opens of a shared doc from one address in one minute: 120 are served, and the one past them is refused with 429 and a Retry-After',
    tallySays(docTally),
  )

  /* Somebody else, in the same minute. */
  const elsewhere = await ask('doc', { from: OTHER_ADDRESS })
  chk(
    heldTo(docTally, PAGE_LIMIT) && ROUTES.doc.served(elsewhere),
    'the refusal is the address’s alone: another address opening the same doc in the same minute is served',
    heldTo(docTally, PAGE_LIMIT)
      ? `from ${OTHER_ADDRESS} the doc answered ${said(elsewhere)}${elsewhere.status === 0 ? ` (where the loopback holds only 127.0.0.1, give it ${OTHER_ADDRESS})` : ''}`
      : `the doc never refused the first address (${tallySays(docTally)}), so another address being served shows nothing`,
  )

  /* The same address, on another route: the doc still refuses it, a clip's link does not. */
  const docAgain = await ask('doc')
  const clipProbe = await ask('clip')
  chk(
    heldTo(docTally, PAGE_LIMIT) && refusedWell(docAgain) && ROUTES.clip.served(clipProbe),
    'and the route’s alone: the address the doc refuses is still served a clip’s link',
    `the doc answered it ${said(docAgain)} again; the clip's link answered ${said(clipProbe)}`,
  )

  /* THE CLIP: its first open, the probe above and 119 more, 121 in the window. */
  const clipAnswers = await flood('clip', [first.clip, clipProbe], PAGE_LIMIT - 1)
  const clipTally = tally(clipAnswers, ROUTES.clip.served)
  chk(
    heldTo(clipTally, PAGE_LIMIT),
    'a burst of 121 opens of a clip’s link from one address: 120 are served, and the one past them is refused with 429 and a Retry-After',
    tallySays(clipTally),
  )

  /* THE PORTAL, THE BRANDING, THE STATUS PAGE, THE LOGO: each its first ask and its budget more. */
  const portalAnswers = await flood('portal', [first.portal], PAGE_LIMIT)
  const portalTally = tally(portalAnswers, ROUTES.portal.served)
  chk(
    heldTo(portalTally, PAGE_LIMIT),
    'a burst of 121 opens of a client portal from one address: 120 are served, and the one past them is refused with 429 and a Retry-After',
    tallySays(portalTally),
  )

  const brandingAnswers = await flood('branding', [first.branding], PAGE_LIMIT)
  const brandingTally = tally(brandingAnswers, ROUTES.branding.served)
  chk(
    heldTo(brandingTally, PAGE_LIMIT),
    'a burst of 121 asks for a custom domain’s branding from one address: 120 are served, and the one past them is refused with 429 and a Retry-After',
    tallySays(brandingTally),
  )

  const statusAnswers = await flood('status', [first.status], PAGE_LIMIT)
  const statusTally = tally(statusAnswers, ROUTES.status.served)
  chk(
    heldTo(statusTally, PAGE_LIMIT),
    'a burst of 121 opens of the status page from one address: 120 are served, and the one past them is refused with 429 and a Retry-After',
    tallySays(statusTally),
  )

  const logoAnswers = await flood('logo', [first.logo], IMAGE_LIMIT)
  const logoTally = tally(logoAnswers, ROUTES.logo.served)
  chk(
    heldTo(logoTally, IMAGE_LIMIT),
    'a burst of 1,201 asks for a logo from one address: 1,200 are served, ten times a page’s budget for the dozens of pictures one page draws, and the one past them is refused with 429 and a Retry-After',
    tallySays(logoTally),
  )
  dropSockets()
  console.log(`  (the visitor and the floods took ${((Date.now() - floodsFrom) / 1000).toFixed(1)} s, to ${clock(Date.now())})`)

  // -------------------------------------------------------------------------
  console.log('\n▶ after the window')

  /*
   * WAITED OUT ONCE, FOR ALL THE ROUTES: the latest moment any refusal said to
   * come back, and a second more, because the boundary is the server's clock.
   * Never before the window's own end, so a route that refused nothing is
   * asked in a new window too.
   */
  const refusals = [...docAnswers, docAgain, ...clipAnswers, ...portalAnswers, ...brandingAnswers, ...statusAnswers, ...logoAnswers].filter(refusedWell)
  const backAt = Math.max(windowEnd(W * WINDOW_MS), ...refusals.map((a) => a.at + Number(a.retryAfter) * 1000)) + 1000
  console.log(`  … waiting ${Math.ceil((backAt - Date.now()) / 1000)} s, to ${clock(backAt)} UTC, for the window the refusals named to end`)
  await sleep(Math.max(0, backAt - Date.now()))
  const again = {}
  for (const name of Object.keys(ROUTES)) again[name] = await ask(name)
  const tallies = { doc: docTally, clip: clipTally, portal: portalTally, branding: brandingTally, status: statusTally, logo: logoTally }
  const stillRefused = Object.entries(again).filter(([name, res]) => !ROUTES[name].served(res))
  const neverRefused = Object.entries(tallies).filter(([, t]) => t.refused === 0).map(([name]) => name)
  chk(
    stillRefused.length === 0 && neverRefused.length === 0,
    'after the window the same visitor is served again, on every public route',
    stillRefused.length
      ? stillRefused.map(([name, res]) => `${name} answered ${said(res)}`).join('; ')
      : `every route served it, but ${neverRefused.join(', ')} had refused it nothing, so there was nothing to come back from`,
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('public-route-limits.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  dropSockets()
  // Each taken back by its own route and read by its status: gone, or already gone (404).
  const takeBack = (what, res) => {
    if (![200, 204, 404].includes(res.status)) leftBehind.push(`${what} answered ${said(res)}`)
  }
  if (A && WS) {
    if (made.clipKey) takeBack(`DELETE clip ${made.clipKey}`, await A(`/workspaces/${WS}/clips`, { method: 'DELETE', body: { storageKey: made.clipKey } }))
    if (made.portalId) takeBack(`DELETE portal ${made.portalId}`, await A(`/portals/${made.portalId}`, { method: 'DELETE' }))
    if (made.docId) takeBack(`DELETE doc ${made.docId}`, await A(`/docs/${made.docId}`, { method: 'DELETE' }))
    takeBack(`DELETE workspace ${WS}`, await A(`/workspaces/${WS}`, { method: 'DELETE' }))
  }
  if (made.logoObject) {
    // The store's own DELETE: no route takes a logo back, and the stub, like S3, answers 204 either way.
    const gone = await fetch(made.logoObject, { method: 'DELETE' }).then((r) => r.status, () => 0)
    if (![200, 204, 404].includes(gone)) leftBehind.push(`DELETE the logo in the store answered ${gone}`)
  }
  if (sql) {
    if (WS) {
      await sql`update workspaces set custom_domain = null, custom_domain_verified = false where id = ${WS}`
        .catch((e) => leftBehind.push(`the custom domain stayed on ${WS}: ${e.message}`))
    }
    if (made.space) {
      await sql`delete from projects where name like ${'%' + TAG}`.catch((e) => leftBehind.push(`projects: ${e.message}`))
      await sql`delete from spaces where name like ${'%' + TAG}`.catch((e) => leftBehind.push(`spaces: ${e.message}`))
    }
    await sql`delete from docs where title like ${'%' + TAG}`.catch((e) => leftBehind.push(`docs: ${e.message}`))
    await sql.end({ timeout: 5 }).catch(() => {})
  }
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
