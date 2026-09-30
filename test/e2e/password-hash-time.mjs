/**
 * A REFUSED SIGN-IN TAKES ONE HASH'S TIME WHETHER OR NOT THE ACCOUNT EXISTS,
 * AND A PASSWORD HASH HOLDS UP NOBODY ELSE
 * (`found-30-sep/sign-in-time-tells-an-account`,
 * `found-30-sep/password-hash-holds-the-event-loop`).
 *
 * Sign-in answered an email with no account "Invalid credentials" before any
 * hashing, in 15–30 ms, and a real account's wrong password with the same
 * words after a bcrypt compare at cost 12, in 384–407 ms: its time said
 * whether an account exists. A locked account was answered before any hashing
 * too, and so was one with no password. OWASP's authentication cheat sheet (read
 * through search results; the site is blocked here): "The recommended code
 * will go through the same process no matter what the user or the password
 * is, allowing the application to return in approximately the same response
 * time." Each of those refusals now compares the password with a hash made at
 * the same cost from a secret nobody kept (`NO_ACCOUNT_HASH`).
 *
 * And every hash ran on the API's one thread (`hashSync`, `compareSync`):
 * while one ran, no other request was answered. Hashes run on worker threads
 * now (`common/security/password-hash.ts`). bcryptjs's own async form was not
 * enough: with several hashes in flight, each turn of the event loop runs a
 * 100 ms chunk of every one of them before it reads a socket again.
 *
 * HOW IT IS MEASURED. Every sign-in here leaves from a loopback address of its
 * own (127.0.9.x), so sign-in's ten a minute per address never refuses one, and
 * 127.0.0.1's budget, which every other suite on a lane shares, is not spent.
 * The accounts are made from 127.0.0.8. A time is the client's, from the
 * request to the last byte of the answer. The three kinds of refusal take
 * turns, nine rounds after one warm-up of each, and are compared by median,
 * within a fifth: a missing hash is nine tenths of a refusal, and a lane's
 * machine is shared, so a fixed few milliseconds would measure its load. The
 * plain read is `GET /health`, which touches nothing but the event loop, sent
 * every 20 ms while eight sign-ins hash, each without waiting for the last.
 *
 * NOT MEASURED HERE: an account with no password, which only SSO or Google can
 * make; `auth.service.test.ts` holds that it takes the same compare.
 *
 *   node test/e2e/password-hash-time.mjs --api 3011
 */
import http from 'node:http'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 4

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`

/** Refusals of each kind that are compared, after one warm-up of each. */
const ROUNDS = 9
/**
 * How far apart two kinds of refusal's medians may be: a fifth of the larger.
 * The work besides the hash differs by a query or two, a few milliseconds; a
 * missing hash is nine tenths of a refusal (about 290 of 320 ms at cost 12).
 * Not a fixed few milliseconds, because a lane shares its machine: under a
 * load average of 5 single refusals ranged 311–579 ms, and nine rounds taken
 * during a spike had medians 55 ms apart with every refusal hashing. The
 * spikes fall on all three kinds alike, so they are taken in turn.
 */
const CLOSE_SHARE = 0.2
/** Sign-ins hashing at once while the plain read is asked. */
const AT_ONCE = 8
/** Where the accounts are made from: a budget of its own. */
const MAKER = '127.0.0.8'
/** The account locks on its fifth wrong password (the default policy). */
const LOCKOUT_THRESHOLD = 5

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. lib/fixture.mjs's one client, for the calls from 127.0.0.1. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? res.data ?? null).slice(0, 160)}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length === 0 ? NaN : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const ms = (x) => `${Math.round(x)} ms`

/*
 * ONE REQUEST, TIMED, from the loopback address `from` names on a connection
 * of its own, or on `agent`'s. `node:http` rather than `fetch`, because
 * `fetch` cannot choose the address a request leaves from. NEVER THROWS —
 * `{status, data, error, ms}`, status 0 when nothing answered, and every
 * caller reads the status.
 */
const visit = (route, { from = null, agent = null, method = 'GET', body } = {}) =>
  new Promise((resolve) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body))
    const started = process.hrtime.bigint()
    const answer = (fields) =>
      resolve({ status: 0, data: null, error: null, ms: Number(process.hrtime.bigint() - started) / 1e6, ...fields })
    const req = http.request(`${API}${route}`, {
      method,
      agent: agent ?? false,
      ...(from && !agent ? { localAddress: from } : {}),
      headers: payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {},
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

/** A loopback address no request here has left from, so no sign-in counter is shared. */
let hosts = 0
const freshAddress = () => {
  hosts += 1
  if (hosts > 254) throw new Error('out of fresh loopback addresses in 127.0.9.0/24')
  return `127.0.9.${hosts}`
}
const signIn = (email, password) => visit('/auth/login', { from: freshAddress(), method: 'POST', body: { email, password } })

const TAG = `e2e-hashtime-${Date.now()}`
const PASSWORD = 'HashTime@12345!'
const WRONG = 'Wrong@12345!'
const mail = (who) => `${TAG}-${who}@rundesk.invalid`

/** Made here and taken back in `finally`: each a workspace and the session that may delete it. */
const workspacesMade = []
const leftBehind = []
/** The plain reads' connections, kept open, as many as are in flight: a read is never held for a socket. */
const readAgent = new http.Agent({ keepAlive: true })

try {
  /*
   * THE ACCOUNTS. Four take the wrong passwords of a real account, no more
   * than three each, so none locks; one is locked on purpose; one signs in
   * with its right password, eight times at once.
   */
  const REAL = ['real-1', 'real-2', 'real-3', 'real-4']
  for (const who of [...REAL, 'locked', 'burst']) {
    const body = { email: mail(who), fullName: `Hash time ${who}`, password: PASSWORD, organizationName: `Hash time ${who} ${TAG}` }
    let made = await visit('/auth/signup', { from: MAKER, method: 'POST', body })
    /*
     * SIGN-UP'S TEN A MINUTE, WAITED OUT AS THE API SAYS, as `signUpApi` does:
     * six accounts a run, so a second run within a minute (a rerun, a break
     * set) meets it. A 429 is refused before the handler runs, so the retry
     * makes no second account.
     */
    for (let attempt = 1; made.status === 429 && attempt <= 2; attempt += 1) {
      const waitMs = (Math.min(Number(made.error?.details?.retryAfter ?? 5) || 5, 60) + 1) * 1000
      console.log(`  (signing up ${who}: ten a minute from ${MAKER}, so waiting ${Math.round(waitMs / 1000)} s as the API says)`)
      await sleep(waitMs)
      made = await visit('/auth/signup', { from: MAKER, method: 'POST', body })
    }
    if (made.status !== 201 || !made.data?.accessToken) throw new Error(`could not sign up ${who}: ${said(made)}`)
    if (made.data.workspaces?.[0]?.id) workspacesMade.push({ id: made.data.workspaces[0].id, as: apiAs(made.data.accessToken) })
  }
  for (let i = 1; i <= LOCKOUT_THRESHOLD; i += 1) {
    const wrong = await signIn(mail('locked'), WRONG)
    if (wrong.status !== 401) throw new Error(`the locked account's wrong password ${i} was answered ${said(wrong)}, not 401`)
  }
  const locked = await signIn(mail('locked'), PASSWORD)
  if (locked.status !== 401) throw new Error(`the account did not lock after ${LOCKOUT_THRESHOLD} wrong passwords: its right one answered ${said(locked)}`)

  // -------------------------------------------------------------------------
  console.log('\n▶ a refused sign-in takes the same time whether or not the account exists')

  const KINDS = {
    none: { says: 'no account', ask: (i) => signIn(`${TAG}-nobody-${i}@rundesk.invalid`, WRONG) },
    real: { says: 'a real account, wrong password', ask: (i) => signIn(mail(REAL[Math.floor(i / 3)]), WRONG) },
    locked: { says: 'a locked account', ask: () => signIn(mail('locked'), WRONG) },
  }
  const names = Object.keys(KINDS)
  const times = { none: [], real: [], locked: [] }
  const notRefused = []
  for (const name of names) {
    const warm = await KINDS[name].ask(0)
    if (warm.status !== 401) notRefused.push(`${name} (warm-up) answered ${said(warm)}`)
  }
  for (let round = 1; round <= ROUNDS; round += 1) {
    // Each kind takes each place in the round in turn, so a drift in the lane's load falls on all three alike.
    const order = [...names.slice(round % names.length), ...names.slice(0, round % names.length)]
    for (const name of order) {
      const res = await KINDS[name].ask(round)
      if (res.status === 401) times[name].push(res.ms)
      else notRefused.push(`${name} answered ${said(res)}`)
    }
  }
  const medians = Object.fromEntries(names.map((n) => [n, median(times[n])]))
  for (const name of names) {
    console.log(`  ${KINDS[name].says}: ${times[name].map((t) => Math.round(t)).join(', ')} ms → median ${ms(medians[name])}`)
  }
  const complete = notRefused.length === 0 && names.every((n) => times[n].length === ROUNDS)
  const apart = (a, b) => Math.abs(medians[a] - medians[b])
  const close = (a, b) => apart(a, b) <= CLOSE_SHARE * Math.max(medians[a], medians[b])
  console.log(`  medians apart: no account ${ms(apart('none', 'real'))}, a locked account ${ms(apart('locked', 'real'))}, from a real account’s wrong password`)
  chk(
    complete && close('none', 'real'),
    'a sign-in with an email that has no account is refused in the time a real account’s wrong password takes: over nine of each, their medians are within a fifth of each other',
    complete
      ? `no account ${ms(medians.none)}, a real account’s wrong password ${ms(medians.real)}: ${ms(apart('none', 'real'))} apart`
      : `not every sign-in was refused 401: ${notRefused.slice(0, 4).join('; ')}`,
  )
  chk(
    complete && close('locked', 'real'),
    'a locked account’s sign-in is refused in that time too: over nine, its median is within a fifth of a real account’s wrong password',
    complete
      ? `a locked account ${ms(medians.locked)}, a real account’s wrong password ${ms(medians.real)}: ${ms(apart('locked', 'real'))} apart`
      : `not every sign-in was refused 401: ${notRefused.slice(0, 4).join('; ')}`,
  )

  // -------------------------------------------------------------------------
  console.log('\n▶ while sign-ins hash, a plain read is answered at once')

  const quiet = []
  for (let i = 0; i < 15; i += 1) {
    quiet.push((await visit('/health', { agent: readAgent })).ms)
    await sleep(20)
  }
  /*
   * EIGHT SIGN-INS AT ONCE, each from an address of its own, with the right
   * password, and a `GET /health` SENT EVERY 20 MS until the last is answered,
   * each without waiting for the one before. Sent one after another, a read
   * held behind a hash was one slow sample and the quick reads between hashes
   * were many: on the API that hashed on its thread, reads held 1,753, 782 and
   * 417 ms had a median of 6 ms. Sent on the clock, a read goes out at every
   * moment of the burst, held or not.
   */
  let hashing = true
  const signIns = Promise.all(Array.from({ length: AT_ONCE }, () => signIn(mail('burst'), PASSWORD)))
  signIns.then(() => { hashing = false })
  const burstFrom = Date.now()
  const sent = []
  while (hashing) {
    sent.push(visit('/health', { agent: readAgent }))
    await sleep(20)
  }
  const reads = await Promise.all(sent)
  const during = reads.filter((r) => r.status === 200).map((r) => r.ms)
  const readsNotAnswered = reads.filter((r) => r.status !== 200).map(said)
  const answers = await signIns
  const burstTook = Date.now() - burstFrom
  const oneSignIn = medians.real
  console.log(`  quiet: GET /health median ${ms(median(quiet))}; eight sign-ins took ${ms(burstTook)}, each ${answers.map((a) => Math.round(a.ms)).join(', ')} ms`)
  console.log(`  while they hashed: ${during.length} reads, ${during.map((t) => Math.round(t)).join(', ')} ms → median ${ms(median(during))}, slowest ${ms(Math.max(...during, 0))}`)
  const signedIn = answers.filter((a) => a.status === 200 && !!a.data?.accessToken).length
  chk(
    signedIn === AT_ONCE,
    'eight sign-ins at once, from eight addresses, are all answered, each with a session',
    `${signedIn} of ${AT_ONCE} signed in: ${answers.filter((a) => a.status !== 200).map(said).slice(0, 3).join('; ')}`,
  )
  chk(
    during.length >= 10 && readsNotAnswered.length === 0 && Number.isFinite(oneSignIn) && median(during) < oneSignIn / 4,
    'while eight sign-ins hash at once, a plain read is answered in a small part of one sign-in’s time: reads sent every 20 ms have a median under a quarter of a refused sign-in’s median',
    during.length < 10 || readsNotAnswered.length
      ? `${during.length} reads were answered while the sign-ins hashed, ${readsNotAnswered.length} were not (${readsNotAnswered.slice(0, 2).join('; ')})`
      : `the reads’ median was ${ms(median(during))}, the slowest ${ms(Math.max(...during))}, against a quarter of ${ms(oneSignIn)}; quiet, ${ms(median(quiet))}`,
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('password-hash-time.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  readAgent.destroy()
  // Each taken back by its own route and read by its status: gone, or already gone (404).
  for (const { id, as } of workspacesMade.reverse()) {
    const res = await as(`/workspaces/${id}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(res.status)) leftBehind.push(`DELETE workspace ${id} answered ${said(res)}`)
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
