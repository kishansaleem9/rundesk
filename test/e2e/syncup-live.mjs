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
import { createRequire } from 'node:module'
import { startLocalStack } from './lib/local-stack.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const require_ = createRequire(path.join(REPO, 'noop.cjs'))
const { chromium } = (() => {
  for (const id of ['playwright', '@playwright/test', 'playwright-core']) {
    try {
      return require_(id)
    } catch {
      /* next */
    }
  }
  throw new Error('playwright is not installed — run pnpm install at the repo root')
})()

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}
const API_PORT = Number(argOf('--api', 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))

const CHROME = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const LAUNCH = {
  ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
  args: [
    '--no-sandbox',
    // A real capture device without a camera. The stream is decodable, so a
    // painted frame is evidence about media, not about markup.
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
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
 */
const EXPECTED_CHECKS = 25

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

const ADMIN = { email: 'admin@rundesk.internal', password: 'Admin@123!' }
const OTHER = { email: 'org-admin@rundesk.internal', password: 'OrgAdmin@123!' }

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })

const api = async (token, method, p, body) => {
  const res = await fetch(`${stack.base}/api/v1${p}`, {
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
const login = await api(null, 'POST', '/auth/login', ADMIN)
check(login.status === 200 || login.status === 201, 'the API is up and the seed account works', `login -> ${login.status}`)
if (login.status >= 400) await done(null, stack)
const admin = login.data
const other = (await api(null, 'POST', '/auth/login', OTHER)).data
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
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {}),
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

// ---------------------------------------------------------------------------
console.log('\n3. the other person is told, and joins')
// ---------------------------------------------------------------------------
// The card is written by a fan-out that start() deliberately does not await, so
// this waits for it the way a client does rather than assuming it is instant.
const card = B.page.locator('[data-testid="call-card"]').first()
const sawCard = await card.waitFor({ timeout: 20000 }).then(() => true).catch(() => false)
check(sawCard, 'B sees the call card appear in the channel', 'no call card ever arrived for the other person')

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

const realErrors = [...A.errors, ...B.errors].filter(
  (e) => !/ERR_CONNECTION_RESET|favicon|manifest|socket\.io|Failed to load resource/i.test(e),
)
check(realErrors.length === 0, 'no script errors on either side', realErrors.slice(0, 3).join(' | '))

await done(browser, stack)
