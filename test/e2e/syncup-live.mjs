/**
 * §2.8 SyncUp — two real browsers, on a real call.
 *
 * Everything else that covers calls stops at the API. calls-http.mts drives the
 * real routes against real Postgres, which is the right way to ask whether a
 * call is recorded, who was told, and what record it leaves — and it cannot ask
 * the only question that matters to somebody on a call: does the other person
 * appear, and can you hear them.
 *
 * That path is peer-to-peer WebRTC over the Socket.io gateway, and until this
 * file it had never been executed by anything. It is also the part with the
 * most ways to be silently broken — an offer that arrives before the peer
 * exists, an ICE candidate buffered against a connection that no longer
 * exists, a track added after negotiation finished. None of those are visible
 * to a unit test or an HTTP check, and all of them look identical from the
 * outside: a call that says "connecting" forever.
 *
 * So: the built SPA, the real API, real Postgres, and two Chromium contexts
 * with fake capture devices. Chromium's fake device produces a real, decodable
 * stream, so "the remote video has painted a frame" is evidence that media
 * crossed the peer connection rather than that an element exists.
 *
 * Signing in goes through the real form on purpose. Auth is anchored on an
 * httpOnly cookie, so a seeded localStorage session is not a session — and a
 * test that fakes the login is testing a state the product never produces.
 *
 *   # a database, a seeded workspace, and the API running against it
 *   createdb rundesk_local
 *   cd packages/db && DATABASE_URL=... pnpm exec drizzle-kit push --force
 *   DATABASE_URL=... npx tsx src/seed.ts
 *   cd apps/api && DATABASE_URL=... JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... \
 *     PORT=3011 npx tsx dist/apps/api/src/main.js
 *
 *   node test/e2e/syncup-live.mjs --api 3011 --dist apps/web/dist
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const require_ = createRequire(path.join(REPO, 'noop.cjs'))

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/*
 * Two ways to run, and the difference is what is being asked.
 *
 * Without BASE this builds the whole stack itself — a static server over
 * apps/web/dist and a proxy to a local API — which is the right shape for CI
 * and for a laptop.
 *
 * With BASE it drives a DEPLOYED instance. That answers a different question:
 * not "does this code work" but "does it work THERE", over that nginx, that
 * TLS, that database. The peer connection is the reason to care — a mesh call
 * is the one part of this product whose failure modes are mostly environmental.
 *
 *   BASE=https://rundesk.theaura.agency node test/e2e/syncup-live.mjs
 */
const BASE = (process.env.BASE ?? argOf('--base', '')).replace(/\/$/, '')
const REMOTE = BASE.length > 0
const HOST = REMOTE ? new URL(BASE).hostname : ''
const IS_LOOPBACK = REMOTE && /^(127\.|localhost$|\[?::1)/.test(HOST)

/** The deployed .env, for the port the API container is published on. */
const fromEnvFile = (key) => {
  try {
    const txt = fs.readFileSync(path.join(REPO, '.env'), 'utf8')
    return new RegExp(`^${key}=(.*)$`, 'm').exec(txt)?.[1].trim().replace(/^["']|["']$/g, '') || null
  } catch {
    return null
  }
}

/*
 * Where this script's own fetches go — NOT where the browser goes.
 *
 * The browser talks to the origin, through nginx and TLS, because that is what
 * a person does. These calls go straight at the API container, which needs no
 * vhost and no certificate, exactly as verify-release.sh and verify-ui.mjs do.
 *
 * The default differs by mode and that matters: 3011 is a local dev port, 3010
 * is what deploy publishes. Defaulting a deployed run to the dev port is how
 * this first failed on a real box — ECONNREFUSED, reported as a bare `fetch
 * failed` stack with nothing pointing at the port.
 */
const API_PORT =
  Number(process.env.API_HOST_PORT) ||
  Number(argOf('--api', '')) ||
  (REMOTE ? Number(fromEnvFile('API_HOST_PORT')) || 3010 : 3011)
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))

/*
 * Playwright, wherever it lives.
 *
 * `npm i playwright` inside this pnpm workspace fails on the `link:` protocol
 * the internal packages use, so on a server it is installed OUTSIDE the repo —
 * and ESM ignores NODE_PATH, so a bare import cannot see it there. Same search
 * deploy/verify-ui.mjs does, for the same reason.
 */
const PW_DIRS = [
  process.env.PLAYWRIGHT_DIR,
  '/opt/rundesk-pw/node_modules',
  `${process.env.HOME ?? '/root'}/.rundesk-pw/node_modules`,
  '/usr/lib/node_modules',
].filter(Boolean)

let chromium
for (const id of ['playwright', '@playwright/test', 'playwright-core']) {
  try {
    ;({ chromium } = require_(id))
  } catch {
    /* next */
  }
  if (chromium) break
}
if (!chromium) {
  for (const dir of PW_DIRS) {
    for (const entry of ['playwright/index.mjs', 'playwright/index.js']) {
      const file = `${dir}/${entry}`
      if (!fs.existsSync(file)) continue
      try {
        ;({ chromium } = await import(pathToFileURL(file).href))
      } catch {
        /* try the next candidate */
      }
      if (chromium) break
    }
    if (chromium) break
  }
}
if (!chromium) {
  console.error(
    '\x1b[31m✗ playwright is not installed anywhere this script can see.\x1b[0m\n' +
      `  Searched: ${PW_DIRS.join(', ')}\n` +
      '  Set PLAYWRIGHT_DIR to the node_modules holding it.\n' +
      '  Exiting 2 rather than reporting a call nobody made.',
  )
  process.exit(2)
}

const CHROME = process.env.CHROME || process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const LAUNCH = {
  ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    // A real capture device without a camera. The stream is decodable, so a
    // painted frame is evidence about media, not about markup.
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    // Reach the instance on the box rather than going out to DNS and back.
    ...(REMOTE && !IS_LOOPBACK ? [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`] : []),
  ],
}

let passed = 0
let failed = 0
const check = (ok, label, detail = '') => {
  if (ok) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}
/*
 * How many checks a complete run performs.
 *
 * "0 failed" is not the same as "it ran". A suite that bails out early — a
 * selector that silently matched nothing, a page that never loaded, an exit
 * taken before the interesting half — reports a clean sweep of whatever it
 * managed to reach, and that reads exactly like success. This run took
 * thirteen seconds on a CI runner and forty here, which is a difference nobody
 * should have to squint at a stopwatch to interpret.
 *
 * Raise this when checks are added. Failing on the floor is the point: a suite
 * that quietly shrinks is the most expensive kind of green.
 *
 * A full local run performs 53. The floor is five lower because five of them
 * are conditional on the machine rather than on the app, and skipping those is
 * not the suite shrinking: two speaker-picker checks that need a routable audio
 * output, and three recording checks that need the AI Notes entitlement. Set
 * the floor at 53 and a perfectly healthy CI runner fails for having no
 * soundcard.
 */
const EXPECTED_CHECKS = 48

const done = async (browser, stack) => {
  await browser?.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran < EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}

/*
 * Two accounts, because one browser cannot call itself.
 *
 * Defaulted to the seeded pair and overridable, since a deployed instance may
 * have rotated either. Both must be real: a run that cannot sign in as two
 * different people has nothing to say about a call between two people, so it
 * stops rather than reporting on whatever half it managed.
 */
const ADMIN = {
  email: process.env.RUNDESK_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.RUNDESK_PASSWORD ?? 'Admin@123!',
}
const OTHER = {
  email: process.env.RUNDESK_EMAIL2 ?? 'org-admin@rundesk.internal',
  password: process.env.RUNDESK_PASSWORD2 ?? 'OrgAdmin@123!',
}

// Remote: drive the deployed origin, and talk to its API the way the box does.
// Local: build the stack here.
const stack = REMOTE
  ? { base: BASE, apiBase: IS_LOOPBACK ? BASE : `http://127.0.0.1:${API_PORT}`, close: () => {} }
  : await (async () => {
      const s = await startLocalStack({ dist: DIST, apiPort: API_PORT })
      return { ...s, apiBase: s.base }
    })()

console.log(`  driving ${stack.base}${REMOTE && !IS_LOOPBACK ? `  (${HOST} pinned to 127.0.0.1)` : ''}`)

const api = async (token, method, p, body) => {
  const res = await fetch(`${stack.apiBase}/api/v1${p}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const parsed = await res.json().catch(() => null)
  return { status: res.status, data: parsed?.data ?? parsed }
}

console.log('\n0. a workspace with two people and a channel')
/*
 * Reach the API before asking it anything.
 *
 * Without this a wrong port surfaces as an undici `TypeError: fetch failed`
 * with a stack through node internals and no mention of the port it tried —
 * which is a diagnosis nobody should have to make twice.
 */
const reachable = await fetch(`${stack.apiBase}/api/v1/health`)
  .then((r) => r.ok || r.status < 500)
  .catch(() => false)
if (!reachable) {
  console.error(
    `\n\x1b[31m✗ no API answering on ${stack.apiBase}\x1b[0m\n` +
      `  The browser drives ${stack.base}; these checks call the API directly.\n` +
      '  Point them at it with API_HOST_PORT=<port> (deploy publishes 3010).\n' +
      '  Exiting 2 rather than reporting on a call that was never made.',
  )
  process.exit(2)
}
/*
 * These two sign-ins are CHECKS — "the API is up and the seed account works",
 * with the guidance for fixing it attached — so a failure has to come back as a
 * status this can report, not as a thrown error that loses the message. The
 * rate-limit-aware sign-in is still underneath: see lib/signin.mjs for why the
 * login route needs one.
 */
const signInFor = (who) =>
  signInApi(`${stack.apiBase}/api/v1`, who.email, who.password).then(
    (data) => ({ ok: true, data, why: '' }),
    (err) => ({ ok: false, data: null, why: err.message }),
  )

const login = await signInFor(ADMIN)
check(login.ok, 'the API is up and the seed account works', login.why)
if (!login.ok) await done(null, stack)
const admin = login.data
const secondLogin = await signInFor(OTHER)
check(
  secondLogin.ok,
  `and so does the second account (${OTHER.email})`,
  `${secondLogin.why}. Set RUNDESK_EMAIL2 / RUNDESK_PASSWORD2 to a real second member of the same workspace — a call needs two people.`,
)
if (!secondLogin.ok) await done(null, stack)
const other = secondLogin.data
const WS = admin.workspaces?.[0]?.id
check(!!WS, 'both are in a workspace', `workspaces: ${JSON.stringify(admin.workspaces)?.slice(0, 120)}`)

const made = await api(admin.accessToken, 'POST', `/workspaces/${WS}/chat/channels`, {
  name: `syncup-live-${Date.now()}`,
  memberIds: [other.user.id],
})
const CHANNEL = made.data?.id
check(!!CHANNEL, 'and a channel exists with both of them in it', `create -> ${made.status} ${JSON.stringify(made.data)?.slice(0, 200)}`)
if (!CHANNEL) await done(null, stack)

// ---------------------------------------------------------------------------
console.log('\n1. two people, signed in through the real form')
// ---------------------------------------------------------------------------
const browser = await chromium.launch(LAUNCH)

const signIn = async (who, label) => {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 820 },
    permissions: ['microphone', 'camera'],
    serviceWorkers: 'block',
  })
  /*
   * Watch the real RTCPeerConnection, without touching the app.
   *
   * The alternative is a test-only hook in use-webrtc-call.ts, which means the
   * thing under test is not quite the thing that ships. Wrapping the
   * constructor before any app code runs observes exactly what the bundle
   * constructs, and a connection state read off here cannot be faked by the
   * UI looking right.
   */
  await ctx.addInitScript(() => {
    const Native = window.RTCPeerConnection
    const seen = []
    const log = []
    const t0 = performance.now()
    const note = (n, kind, extra) =>
      log.push({ ms: Math.round(performance.now() - t0), pc: n, kind, ...(extra ? { extra } : {}) })
    window.__rundeskPeers = seen
    window.__rtcLog = log
    // eslint-disable-next-line func-names
    window.RTCPeerConnection = function (...args) {
      const pc = new Native(...args)
      const n = seen.push(pc)
      note(n, 'constructed')
      pc.addEventListener('connectionstatechange', () => note(n, `connection:${pc.connectionState}`))
      pc.addEventListener('iceconnectionstatechange', () => note(n, `ice:${pc.iceConnectionState}`))
      pc.addEventListener('signalingstatechange', () => note(n, `signaling:${pc.signalingState}`))
      for (const m of ['createOffer', 'createAnswer', 'setLocalDescription', 'setRemoteDescription', 'close']) {
        const orig = pc[m].bind(pc)
        pc[m] = (...a) => {
          note(n, m, m.startsWith('set') ? a[0]?.type : undefined)
          return orig(...a)
        }
      }
      return pc
    }
    window.RTCPeerConnection.prototype = Native.prototype
    Object.setPrototypeOf(window.RTCPeerConnection, Native)
  })

  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${label}: ${m.text()}`)
  })
  await page.goto(`${stack.base}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', who.email)
  await page.fill('input[autocomplete="current-password"]', who.password)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: LOGIN_NAV_TIMEOUT_MS }).catch(() => {}),
    page.click('button[type="submit"]'),
  ])
  return { ctx, page, errors }
}

const A = await signIn(ADMIN, 'A')
const B = await signIn(OTHER, 'B')
check(!A.page.url().includes('/login'), 'A is signed in', A.page.url())
check(!B.page.url().includes('/login'), 'B is signed in', B.page.url())

// The cookie banner sits over the bottom-right of the viewport and will
// swallow a click meant for something behind it. Dismissed the way a person
// dismisses it rather than hidden with CSS, so the app is in the state it is
// actually used in.
const settleCookies = async (p) => {
  const accept = p.locator('button:has-text("Accept")').first()
  if (await accept.isVisible().catch(() => false)) await accept.click().catch(() => {})
}

const chatUrl = `${stack.base}/app/${WS}/chat?channel=${CHANNEL}`
for (const who of [A, B]) {
  await who.page.goto(chatUrl, { waitUntil: 'networkidle' })
  await settleCookies(who.page)
}

// ---------------------------------------------------------------------------
console.log('\n2. starting a SyncUp')
// ---------------------------------------------------------------------------
const startedAtMs = Date.now()
const startBtn = A.page.locator('[data-testid="call-start-button"]')
await startBtn.waitFor({ timeout: 15000 }).catch(() => {})
check(await startBtn.isVisible().catch(() => false), 'the channel header offers Start SyncUp', 'no start control in the channel header')
await startBtn.click()

// The pre-join screen takes the camera BEFORE anything is signalled — the one
// place a browser can refuse and leave somebody in a call with no media.
const sawPrejoin = await A.page
  .locator('[data-testid="call-prejoin"]')
  .waitFor({ timeout: 15000 })
  .then(() => true)
  .catch(() => false)
check(sawPrejoin, 'and asks about camera and microphone before joining', 'no pre-join screen appeared')

// A real capture device, requested by the app, painting real frames.
const previewLive = await A.page
  .waitForFunction(
    () => {
      const v = document.querySelector('[data-testid="call-prejoin-preview"] video, [data-testid="call-prejoin-preview"]')
      return v instanceof HTMLVideoElement ? v.videoWidth > 0 : false
    },
    { timeout: 15000 },
  )
  .then(() => true)
  .catch(() => false)
check(previewLive, 'with the camera actually running in the preview', 'the preview never produced a frame')

/*
 * §2.8 [19:46] — "aur yahan SPEAKER ka option hai."
 *
 * The re-audit found a pre-join offering a microphone and a camera and nothing
 * for output. Checked here rather than in a unit test because the picker is
 * deliberately conditional: it appears only where the browser can act on the
 * choice, so the question worth asking on a real release is "does the browser
 * running this have routable outputs, and if so is it being offered them" —
 * which needs the browser, not the source.
 */
const routable = await A.page.evaluate(async () => {
  const supported = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype
  if (!supported) return 0
  return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput').length
})
if (routable > 0) {
  const speaker = A.page.locator('[data-testid="call-prejoin-speaker-select"]')
  const hasSpeaker = await speaker.isVisible().catch(() => false)
  check(hasSpeaker, 'and offers a speaker beside the mic and camera', 'no output picker in the pre-join')
  if (hasSpeaker) {
    const options = await speaker.locator('option').count()
    check(options > 1, 'with the outputs this machine actually has', `only ${options} option in the speaker list`)
  }
} else {
  // Said out loud rather than skipped silently: a run that never checked is
  // not a run that passed, and a green line here would claim otherwise.
  console.log('  · no routable audio outputs in this browser — speaker picker not applicable')
}

/*
 * §2.8 [19:44] — the microphone level, in the browser that has the microphone.
 *
 * A source test can prove the analyser is wired; only a real run proves the
 * bar moves. Chromium's fake device emits a tone, so a meter that is genuinely
 * reading the input leaves zero — and one that is drawn but connected to
 * nothing does not.
 */
const micMeter = A.page.locator('[data-testid="call-prejoin-mic-level"]')
const hasMeter = await micMeter.isVisible().catch(() => false)
check(hasMeter, 'and shows whether the microphone is hearing you', 'no input-level meter in the pre-join')
if (hasMeter) {
  let peak = 0
  for (let i = 0; i < 20 && peak === 0; i += 1) {
    peak = Number(await micMeter.getAttribute('aria-valuenow')) || 0
    if (peak === 0) await A.page.waitForTimeout(150)
  }
  check(peak > 0, `with a level that moves with the input (${peak}%)`, 'the meter never left zero')
}

/*
 * §2.8 [19:40] — "BACKGROUND colours wagera select down kar sakte ho."
 *
 * The frame cross-check found this built and unexercised: the picker, the five
 * choices and the tint were all in the bundle, and nothing anywhere pressed
 * one. That is the shape of defect this engagement keeps finding — shipped,
 * plausible, and never once run — so it is checked the only way that settles
 * it, by choosing a background and reading what the browser actually painted.
 *
 * Computed colour, not the class name. `bg-[#0c215d]` is an arbitrary Tailwind
 * value, which exists in the stylesheet only if the compiler saw that exact
 * string; asserting the class is on the element proves the JSX, and a run where
 * the rule was never generated looks identical. Reading the computed
 * background asks the question that matters — is this person's background
 * actually navy — and can only be answered by CSS that shipped.
 */
const bgPicker = A.page.locator('[data-testid="call-prejoin-backgrounds"]')
const hasBgPicker = await bgPicker.isVisible().catch(() => false)
check(hasBgPicker, 'the pre-join offers a background to choose', 'no background picker in the pre-join')

const PREJOIN_TINT = 'rgb(12, 33, 93)' // #0c215d — BACKGROUND_TINT.navy
if (hasBgPicker) {
  const swatches = await bgPicker.locator('button').count()
  check(swatches >= 3, `with more than one to pick from (${swatches})`, `only ${swatches} background swatch(es)`)

  // The preview's own container is what carries the tint.
  const previewTint = () =>
    A.page.evaluate(() => {
      const v = document.querySelector('[data-testid="call-prejoin-preview"]')
      return v?.parentElement ? getComputedStyle(v.parentElement).backgroundColor : null
    })
  const before = await previewTint()

  await bgPicker.locator('button[aria-label="Navy"]').click().catch(() => {})
  const applied = await A.page
    .waitForFunction(
      (want) => {
        const v = document.querySelector('[data-testid="call-prejoin-preview"]')
        return !!v?.parentElement && getComputedStyle(v.parentElement).backgroundColor === want
      },
      PREJOIN_TINT,
      { timeout: 5000 },
    )
    .then(() => true)
    .catch(() => false)
  check(applied, 'and choosing one changes the preview', `preview stayed ${before} — picking Navy painted nothing`)
}

await A.page.locator('[data-testid="call-prejoin-join"]').click()

// Polled, not read once: pressing Join is the START of a request, and reading
// the answer in the same instant asks the question before the app has had a
// chance to do anything about it.
let live = null
for (let i = 0; i < 30; i += 1) {
  live = await api(admin.accessToken, 'GET', `/workspaces/${WS}/calls/live?channelId=${CHANNEL}`)
  if (live.data?.id) break
  await new Promise((r) => setTimeout(r, 400))
}
const callId = live?.data?.id
check(!!callId, 'a call is live in the channel', `live -> ${live?.status} ${JSON.stringify(live?.data)?.slice(0, 200)}`)

const surfaced = await A.page
  .locator('[data-testid="call-surface"]')
  .waitFor({ timeout: 15000 })
  .then(() => true)
  .catch(() => false)
check(surfaced, 'and A is on the call surface', 'the call surface never rendered for the person who started it')

/*
 * And the background chosen a moment ago is still the background.
 *
 * The pre-join picker and the call are separate components with separate
 * state, joined by one argument to `onJoin`. A picker that works perfectly and
 * a call that ignores what it returned is a whole feature that demos fine and
 * does nothing — you set your background, press Join, and it quietly reverts
 * with no error and nothing to notice unless you were looking for it. Checked
 * here rather than in the pre-join because this is the half nothing else sees.
 */
if (hasBgPicker && surfaced) {
  const carried = await A.page
    .waitForFunction(
      (want) =>
        [...document.querySelectorAll('[data-testid="call-tile"]')].some(
          (el) => getComputedStyle(el).backgroundColor === want,
        ),
      PREJOIN_TINT,
      { timeout: 10000 },
    )
    .then(() => true)
    .catch(() => false)
  check(carried, 'and the background chosen in the pre-join survives into the call', 'the call ignored the pre-join choice')
}

// ---------------------------------------------------------------------------
console.log('\n3. the other person is told, and joins')
// ---------------------------------------------------------------------------
/*
 * Two separate facts, because they fail for completely different reasons.
 *
 * WRITTEN is server-side: announce() runs detached from the request, so the
 * card lands a beat after the response and is polled for, not assumed.
 *
 * SEEN is the client: the card reaches an open channel through a realtime
 * event, so a socket that is still connecting when the call starts misses it.
 * Asking only "is it on B's screen" conflates the two — a card that was never
 * written and a card that was written but never announced look identical, and
 * the second is the one that cascades into every check below reporting a
 * broken call.
 */
const until = async (ready, ms) => {
  const deadline = Date.now() + ms
  for (;;) {
    if (await ready()) return true
    if (Date.now() > deadline) return false
    await new Promise((r) => setTimeout(r, 400))
  }
}

const cardWritten = await until(async () => {
  const msgs = await api(admin.accessToken, 'GET', `/chat/channels/${CHANNEL}/messages`)
  return (msgs.data?.items ?? msgs.data ?? []).some?.((m) => m?.callId) === true
}, 20000)
check(cardWritten, 'the call posts a card into the channel', 'announce() never wrote one')

const card = B.page.locator('[data-testid="call-card"]').first()
let sawCard = await card.waitFor({ timeout: 15000 }).then(() => true).catch(() => false)
let neededReload = false
if (!sawCard && cardWritten) {
  // A reload refetches unconditionally, so it separates "never announced" from
  // "never written" instead of leaving both as one silent timeout.
  neededReload = true
  await B.page.reload({ waitUntil: 'networkidle' }).catch(() => {})
  await settleCookies(B.page)
  sawCard = await card.waitFor({ timeout: 20000 }).then(() => true).catch(() => false)
}
check(sawCard, 'and the other person sees it in the channel', 'the card never reached the other person, reload or not')
if (neededReload && sawCard) {
  console.log('  NOTE  it only appeared after a reload — the realtime event did not reach B in time')
}

await B.page.locator('[data-testid="call-card-join"]').first().click().catch(() => {})
const bPrejoin = await B.page
  .locator('[data-testid="call-prejoin"]')
  .waitFor({ timeout: 15000 })
  .then(() => true)
  .catch(() => false)
if (bPrejoin) await B.page.locator('[data-testid="call-prejoin-join"]').click().catch(() => {})
const bOnCall = await B.page
  .locator('[data-testid="call-surface"]')
  .waitFor({ timeout: 20000 })
  .then(() => true)
  .catch(() => false)
check(bOnCall, 'and lands on the call surface', 'B pressed Join and never reached the call')

// ---------------------------------------------------------------------------
console.log('\n4. the part nothing has ever tested: media actually crosses')
// ---------------------------------------------------------------------------
/*
 * Read off the RTCPeerConnection, not off the DOM.
 *
 * A tile rendering proves the participant list arrived. It says nothing about
 * whether the offer/answer completed, whether ICE found a path, or whether a
 * single byte of media moved — which is exactly the failure this feature can
 * have while looking completely healthy.
 */
const peerState = async (p) =>
  p.evaluate(() => {
    const peers = window.__rundeskPeers
    if (!Array.isArray(peers)) return { instrumented: false }
    return {
      instrumented: true,
      states: peers.map((pc) => ({ connection: pc.connectionState, ice: pc.iceConnectionState })),
    }
  })

const bothConnected = async () => {
  for (let i = 0; i < 40; i += 1) {
    const [a, b] = await Promise.all([peerState(A.page), peerState(B.page)])
    if (!a.instrumented) return { instrumented: false }
    const ok = (s) => s.states.some((x) => x.connection === 'connected' || x.ice === 'connected' || x.ice === 'completed')
    if (ok(a) && ok(b)) return { instrumented: true, a, b, connected: true }
    await new Promise((r) => setTimeout(r, 500))
  }
  const [a, b] = await Promise.all([peerState(A.page), peerState(B.page)])
  return { instrumented: true, a, b, connected: false }
}

const peers = await bothConnected()
if (!peers.instrumented) {
  console.log('  SKIP  peer state is not exposed for tests — falling back to the rendered tiles')
} else {
  check(
    peers.connected,
    'the two browsers reach a connected peer connection',
    `A: ${JSON.stringify(peers.a.states)} B: ${JSON.stringify(peers.b.states)}`,
  )
  if (!peers.connected) {
    // The sequence, not the end state. Which side offered, when it was closed,
    // and whether anything was rebuilt afterwards is the whole diagnosis.
    const [la, lb] = await Promise.all([
      A.page.evaluate(() => window.__rtcLog ?? []),
      B.page.evaluate(() => window.__rtcLog ?? []),
    ])
    const fmt = (l) => l.map((e) => `${e.ms}ms pc${e.pc} ${e.kind}${e.extra ? `(${e.extra})` : ''}`).join('\n      ')
    console.log(`\n    A timeline:\n      ${fmt(la)}`)
    console.log(`\n    B timeline:\n      ${fmt(lb)}`)
  }
}

/*
 * And the picture is the OTHER person, not your own camera.
 *
 * Every tile is a <video>, and the local one is muted — that is the only thing
 * telling them apart in the markup. A check that accepted any painting tile
 * passed on a call that never connected at all, because your own preview is
 * always painting. Asking specifically for an unmuted tile with frames is
 * asking whether media arrived from somewhere else.
 */
const remoteFrame = async (p) =>
  p
    .waitForFunction(
      () => {
        const vids = [...document.querySelectorAll('[data-testid="call-tile"] video')]
        return vids.some((v) => !v.muted && v.videoWidth > 0 && !v.paused)
      },
      { timeout: 25000 },
    )
    .then(() => true)
    .catch(() => false)

const aSees = await remoteFrame(A.page)
const bSees = await remoteFrame(B.page)
check(aSees, "A is painting the OTHER person's video", 'no remote video on A — only their own camera')
check(bSees, "B is painting the OTHER person's video", 'no remote video on B — only their own camera')

const tiles = await A.page.locator('[data-testid="call-tile"]').count()
check(tiles >= 2, `A sees both people on the call (${tiles} tiles)`, `only ${tiles} tile(s)`)

await A.page.screenshot({ path: '/tmp/syncup-A-oncall.png' })
await B.page.screenshot({ path: '/tmp/syncup-B-oncall.png' })

// ---------------------------------------------------------------------------
console.log('\n4b. the three in-call controls the walkthrough shows')
// ---------------------------------------------------------------------------
/*
 * Screen share, reactions and minimise were all built and none of them had
 * ever been run. They are grouped here because they share the one expensive
 * precondition — two browsers in a connected call — and because each of them
 * fails in a way the DOM alone cannot see.
 */

/*
 * §2.8 [20:12] — "koi tab share karni hai, window share karni hai, ya poori
 * screen."
 *
 * Read off the sender, not the button. `sharing` is a useState, and a share
 * that lights the control while `replaceTrack` silently rejects is the exact
 * failure worth catching: your screen is not going anywhere and your own UI
 * says it is. So the question asked is the one the other person cares about —
 * what track is this peer connection actually sending — and the answer comes
 * from the live RTCPeerConnection the instrumentation already holds.
 *
 * Chromium's fake capture answers getDisplayMedia with a source labelled
 * `screen:…`, so a camera track and a screen track are told apart by name
 * rather than by hoping the dimensions differ.
 */
const outgoingVideoLabel = async (p) =>
  p.evaluate(() => {
    const peers = window.__rundeskPeers
    if (!Array.isArray(peers)) return null
    for (const pc of peers) {
      const s = pc.getSenders?.().find((x) => x.track?.kind === 'video')
      if (s?.track) return s.track.label
    }
    return null
  })

const isScreen = (label) => !!label && /screen|window|display|tab/i.test(label)

const shareBtn = A.page.locator('[data-testid="call-share"]')
const hasShare = await shareBtn.isVisible().catch(() => false)
check(hasShare, 'the call offers screen share', 'no share control in the call footer')

if (hasShare) {
  const camLabel = await outgoingVideoLabel(A.page)
  check(
    camLabel !== null && !isScreen(camLabel),
    `A is sending their camera before sharing (${camLabel ?? 'no sender'})`,
    'no outgoing video sender to swap — the rest of this section would prove nothing',
  )

  await shareBtn.click()
  // Polled: getDisplayMedia is a permission round trip and replaceTrack is
  // async, so reading immediately after the click asks before anything can
  // have happened.
  let shareLabel = null
  for (let i = 0; i < 40; i += 1) {
    shareLabel = await outgoingVideoLabel(A.page)
    if (isScreen(shareLabel)) break
    await A.page.waitForTimeout(250)
  }
  check(
    isScreen(shareLabel),
    `and sharing puts the screen on the wire, not just on the button (${shareLabel ?? 'no sender'})`,
    `the outgoing track is still ${shareLabel ?? 'missing'} — nothing was shared with anyone`,
  )
  check(
    (await shareBtn.getAttribute('aria-pressed')) === 'true',
    'with the control showing that it is on',
    'the share button does not report its own state',
  )

  // The swap must not cost the picture. `replaceTrack` on the existing sender
  // is what keeps this true; a renegotiation here would black out every tile.
  const stillPainting = await B.page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('[data-testid="call-tile"] video')].some(
          (v) => !v.muted && v.videoWidth > 0 && !v.paused,
        ),
      { timeout: 15000 },
    )
    .then(() => true)
    .catch(() => false)
  check(stillPainting, 'and B never loses the picture while the track is swapped', 'B went black when A shared')

  await shareBtn.click()
  let backLabel = null
  for (let i = 0; i < 40; i += 1) {
    backLabel = await outgoingVideoLabel(A.page)
    if (backLabel !== null && !isScreen(backLabel)) break
    await A.page.waitForTimeout(250)
  }
  check(
    backLabel !== null && !isScreen(backLabel),
    `and stopping the share gives the camera back (${backLabel ?? 'no sender'})`,
    `still sending ${backLabel ?? 'nothing'} after stopping — the camera never came back`,
  )
}

/*
 * §2.8 — the reactions overlay.
 *
 * Sent from A and looked for on B. A reaction that only ever appears for the
 * person who sent it is the failure this has: `sendReaction` paints locally
 * before the round trip precisely so the button feels responsive, which means
 * A's own screen proves nothing at all about whether anybody else saw it.
 */
const reactBtn = A.page.locator('[data-testid="call-react"]')
const hasReact = await reactBtn.isVisible().catch(() => false)
check(hasReact, 'the call offers reactions', 'no reaction control in the call footer')

if (hasReact) {
  await reactBtn.click()
  const picker = A.page.locator('[data-testid="call-reaction-picker"]')
  const pickerUp = await picker.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)
  check(pickerUp, 'and opens a picker over the tiles', 'the reaction picker never appeared')

  if (pickerUp) {
    /*
     * `button[data-emoji]`, not `button` — the first button in this picker is
     * the skin-tone control, and clicking it opens a submenu and sends nothing.
     * A check written against the loose selector would have passed the click
     * and then failed the overlay for a reason that has nothing to do with
     * reactions.
     *
     * Waited for rather than read: the catalog is fetched, so the grid is empty
     * for the first moment the picker is on screen.
     */
    const firstEmoji = picker.locator('button[data-emoji]').first()
    const gridReady = await firstEmoji.waitFor({ timeout: 15000 }).then(() => true).catch(() => false)
    check(gridReady, 'with emoji in it to choose from', 'the picker opened but its catalog never loaded')

    // The rendered character, which is what gets sent — `data-emoji` is the
    // base, and a skin tone is applied on the way out.
    const emoji = gridReady ? ((await firstEmoji.textContent().catch(() => ''))?.trim() ?? '') : ''
    if (gridReady) await firstEmoji.click().catch(() => {})

    const overlayHas = (p) =>
      p
        .waitForFunction(
          (want) => {
            const o = document.querySelector('[data-testid="call-reactions"]')
            if (!o) return false
            return want ? o.textContent?.includes(want) : (o.textContent?.trim().length ?? 0) > 0
          },
          emoji,
          { timeout: 10000 },
        )
        .then(() => true)
        .catch(() => false)

    check(await overlayHas(A.page), `A sees their own reaction (${emoji || 'an emoji'})`, 'nothing floated over A’s tiles')
    check(
      await overlayHas(B.page),
      'and it reaches the other person in the call',
      'the reaction never left the sender — everybody else saw nothing',
    )
  }
}

/*
 * §2.8 — minimising to the corner.
 *
 * The point of minimise is that the call KEEPS RUNNING while you go and look
 * at something else, so the check is not that a small box appears — it is that
 * the box is showing live video and the call row is still live behind it. A
 * minimise that tears the call down would look completely correct from the
 * markup.
 */
const minBtn = A.page.locator('[data-testid="call-minimise"]')
const hasMin = await minBtn.isVisible().catch(() => false)
check(hasMin, 'the call can be minimised', 'no minimise control in the call header')

if (hasMin) {
  await minBtn.click()
  const docked = await A.page
    .locator('[data-testid="call-minimised"]')
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  check(docked, 'and it docks into the corner', 'no minimised dock appeared')

  check(
    !(await A.page.locator('[data-testid="call-surface"]').isVisible().catch(() => false)),
    'with the full-screen call out of the way',
    'the full call surface is still covering the app',
  )

  const dockPainting = await A.page
    .waitForFunction(
      () => {
        const v = document.querySelector('[data-testid="call-minimised"] video')
        return v instanceof HTMLVideoElement && v.videoWidth > 0
      },
      { timeout: 10000 },
    )
    .then(() => true)
    .catch(() => false)
  check(dockPainting, 'and the docked tile is live rather than a black box', 'the minimised preview never painted a frame')

  const stillLive = await api(admin.accessToken, 'GET', `/workspaces/${WS}/calls/live?channelId=${CHANNEL}`)
  check(stillLive.data?.id === callId, 'and the call is still running while minimised', `live -> ${JSON.stringify(stillLive.data)?.slice(0, 120)}`)

  await A.page.locator('[data-testid="call-expand"]').click().catch(() => {})
  const restored = await A.page
    .locator('[data-testid="call-surface"]')
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  check(restored, 'and expanding brings the call back', 'the call could be minimised but not restored')
}

// ---------------------------------------------------------------------------
console.log('\n5. recording announces itself to everyone')
// ---------------------------------------------------------------------------
/*
 * Consent is the one thing here that is a legal problem rather than a UX one,
 * and the promise is that it is impossible to be recorded without being told.
 * The upload itself needs object storage, which is not configured locally —
 * but the announcement is the part that must not be able to fail, and it is
 * pure signalling.
 */
const recordBtn = A.page.locator('[data-testid="call-record"], button[title*="Record" i]').first()
if (await recordBtn.isVisible().catch(() => false)) {
  await recordBtn.click().catch(() => {})
  const consent = A.page.locator('[data-testid="call-consent-confirm"]')
  if (await consent.isVisible({ timeout: 4000 }).catch(() => false)) await consent.click().catch(() => {})
  const bannerA = await A.page.locator('[data-testid="call-recording-banner"]').waitFor({ timeout: 10000 }).then(() => true).catch(() => false)
  const bannerB = await B.page.locator('[data-testid="call-recording-banner"]').waitFor({ timeout: 10000 }).then(() => true).catch(() => false)
  check(bannerA, 'the person recording sees the banner')
  check(bannerB, 'and so does everybody else in the call', 'somebody was being recorded without being told')
  const flag = await api(admin.accessToken, 'GET', `/workspaces/${WS}/calls/live?channelId=${CHANNEL}`)
  check(flag.data?.recording === true, 'and the call row says it is recording', `recording: ${flag.data?.recording}`)
} else {
  console.log('  SKIP  recording control not offered (AI Notes entitlement is off for this workspace)')
}

// ---------------------------------------------------------------------------
console.log('\n5b. the recording reaches storage, from the browser')
// ---------------------------------------------------------------------------
/*
 * The half of recording that a presign check cannot reach.
 *
 * "A pre-signed upload URL is issued" proves the API can sign. It proves
 * nothing about the request the recorder actually makes, which is a
 * cross-origin PUT from the app's origin to the bucket — and that is refused
 * unless the bucket carries a CORS policy naming that origin. The failure is
 * entirely browser-side: every server-side check passes, the presign is
 * perfect, and uploads still never arrive.
 *
 * So the PUT is made from INSIDE the page, which is the only place the
 * question can be asked honestly. Same for playback afterwards.
 *
 * Skipped rather than failed where storage is unconfigured — locally and in
 * CI there is no bucket, and a check that cannot run must say so rather than
 * report a verdict it did not reach.
 */
let storageChecked = false
{
  const up = await api(admin.accessToken, 'POST', `/workspaces/${WS}/calls/${callId}/recording/upload-url`, {
    contentType: 'audio/webm',
  })
  if (up.status >= 400) {
    console.log(`  SKIP  object storage is not configured here (upload-url -> ${up.status}) — not checked, not passed`)
  } else {
    storageChecked = true
    check(Boolean(up.data?.uploadUrl && up.data?.storageKey), 'a pre-signed upload URL is issued', JSON.stringify(up.data)?.slice(0, 140))

    const SIZE = 2048
    const put = await A.page.evaluate(async ([url, size]) => {
      const bytes = new Uint8Array(size).fill(7)
      try {
        const r = await fetch(url, { method: 'PUT', body: bytes, headers: { 'content-type': 'audio/webm' } })
        return { ok: r.ok, status: r.status }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    }, [up.data.uploadUrl, SIZE])
    check(
      put.ok === true,
      `the browser can PUT the recording to storage (${put.status ?? ''})`,
      `${put.error ?? `HTTP ${put.status}`} — this is what bucket CORS refusing the app's origin looks like; every server-side check still passes`,
    )

    const attached = await api(admin.accessToken, 'POST', `/workspaces/${WS}/calls/${callId}/recording/attach`, {
      storageKey: up.data.storageKey,
    })
    check(attached.status < 400, 'and the call keeps the key it landed under', `attach -> ${attached.status}`)
    globalThis.__expectBytes = SIZE
  }
}

// ---------------------------------------------------------------------------
console.log('\n6. hanging up — and the record it leaves')
// ---------------------------------------------------------------------------
// The LAST person out is what ends a call, so one person leaving must not.
await A.page.locator('[data-testid="call-leave"], [data-testid="call-end"]').first().click().catch(() => {})
await A.page.waitForTimeout(2000)
const midway = await api(admin.accessToken, 'GET', `/workspaces/${WS}/calls/live?channelId=${CHANNEL}`)
check(!!midway.data?.id, 'one person leaving does NOT end it for the other', 'the call ended while somebody was still in it')

await B.page.locator('[data-testid="call-leave"], [data-testid="call-end"]').first().click().catch(() => {})
// The record is written after the claim — participants, transcript, notes —
// so this waits for it the way a client does rather than assuming.
let after = null
for (let i = 0; i < 30; i += 1) {
  after = await api(admin.accessToken, 'GET', `/workspaces/${WS}/calls/live?channelId=${CHANNEL}`)
  if (!after.data?.id) break
  await new Promise((r) => setTimeout(r, 500))
}
check(!after?.data?.id, 'the last person out ends the call', `still live: ${JSON.stringify(after?.data)?.slice(0, 120)}`)

// Pinned to THIS call rather than "the newest meeting": the database keeps
// every run, and picking the top row makes a failure here impossible to tell
// apart from having read somebody else's record.
let record = null
for (let i = 0; i < 30; i += 1) {
  const meetings = await api(admin.accessToken, 'GET', `/workspaces/${WS}/meetings`)
  record = (meetings.data ?? []).find((m) => new Date(m.startsAt ?? m.createdAt).getTime() >= startedAtMs - 5000)
  if (record?.attendees?.length) break
  await new Promise((r) => setTimeout(r, 500))
}
check(!!record, 'and it left a meeting record behind', `no meeting started after this call did`)
check(
  (record?.attendees?.length ?? 0) >= 2,
  `naming everyone who was there (${record?.attendees?.length ?? 0})`,
  `attendees: ${JSON.stringify(record?.attendees)?.slice(0, 160)}`,
)
check(Array.isArray(record?.recordings), 'with a place for every piece of its recording', `recordings: ${JSON.stringify(record?.recordings)}`)

// And the bytes come back — read from the page, so playback is exercised
// across the same origin boundary the app plays them across.
if (storageChecked) {
  const url = (record?.recordings ?? [])[0]
  check(typeof url === 'string' && url.length > 0, 'the record offers the piece that was uploaded', `recordings: ${JSON.stringify(record?.recordings)?.slice(0, 160)}`)
  if (url) {
    const got = await A.page.evaluate(async ([u]) => {
      try {
        const r = await fetch(u)
        const b = await r.arrayBuffer()
        return { ok: r.ok, len: b.byteLength }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    }, [url])
    check(
      got.ok === true && got.len === globalThis.__expectBytes,
      `and it plays back the bytes that were stored (${got.len ?? got.error})`,
      `${got.error ?? `HTTP miss, ${got.len} bytes`} — stored but not retrievable is the same as lost`,
    )
  }
}

const realErrors = [...A.errors, ...B.errors].filter(
  (e) => !/ERR_CONNECTION_RESET|favicon|manifest|socket\.io|Failed to load resource/i.test(e),
)
check(realErrors.length === 0, 'no script errors on either side', realErrors.slice(0, 3).join(' | '))

// ---------------------------------------------------------------------------
console.log('\n7. putting the workspace back')
// ---------------------------------------------------------------------------
/*
 * This runs against real workspaces, and a check that leaves litter behind is
 * a check people stop running. The call ends itself; the channel and the
 * meeting record it left do not, so they are taken back here.
 *
 * Chat has no delete — archiving is the strongest thing it offers, and it is
 * what takes the channel out of everybody's sidebar.
 */
let tidied = 0
if (record?.id) {
  const gone = await api(admin.accessToken, 'DELETE', `/workspaces/${WS}/meetings/${record.id}`)
  if (gone.status < 400) tidied += 1
}
const archived = await api(admin.accessToken, 'POST', `/chat/channels/${CHANNEL}/archive`)
if (archived.status < 400) tidied += 1
check(
  tidied === 2,
  'the channel and the meeting record it made are cleared away',
  `${tidied}/2 cleaned up — check the workspace for a stray syncup-live-* channel`,
)

await done(browser, stack)
