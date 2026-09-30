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
import { makeChain } from './lib/chain.mjs'
import { storeBase } from './lib/store.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

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
 * WHERE THIS RUN'S OBJECT STORE WOULD BE, if the machine gives the API one.
 * The lanes start `s3-stub.mjs` beside every API on 91<k> (`lane-env.sh`), CI
 * on `E2E_STORE_PORT`; `lib/store.mjs` holds that formula for every suite, and
 * `--store` overrides it. Section 5b asks it whether it is there, because that
 * — and not an error from the product — is what may excuse the storage checks.
 */
const STORE = storeBase(API_PORT, argOf('--store', undefined))

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
let skipped = 0
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
 * A SKIPPED CHECK IS COUNTED, AND THAT IS WHAT LETS THIS SUITE COMPARE EXACTLY.
 *
 * This file used to be the one suite in `test/e2e` keeping a FLOOR (`<`) rather
 * than an exact count, and its own comment argued the exception at length: five
 * checks are conditional on the MACHINE rather than on the app — two speaker
 * checks that need a routable audio output, the recording checks that need a
 * configured bucket — so 53 here and 48 on a headless runner, and "an exact
 * comparison has to be wrong on one of them".
 *
 * There was a third option it did not consider. A check that cannot run is not
 * ABSENT, it is UNKNOWN, and an unknown outcome can be reported and counted
 * like any other. So a skip goes into the run total and prints as SKIP: the
 * total is the same number on every machine, `!==` catches a branch that
 * vanished silently, and a soundcard-less runner still exits 0 because a skip
 * is not a failure.
 *
 * ONLY FOR THE MACHINE, NEVER FOR THE PRODUCT. If the speaker picker is absent
 * from a browser that HAS outputs, that is a defect and it fails; if the
 * browser has no outputs, nothing can be asked. The distinction is the whole
 * value of the mechanism — a skip reachable by a product regression is a check
 * that cannot fail, which is what the floor was.
 */
const skip = (label, why) => {
  skipped++
  console.log(`  SKIP  ${label} — ${why}`)
}

const chain = makeChain(check, skip)

/*
 * How many checks a complete run performs — EXACTLY, compared with `!==`.
 *
 * "0 failed" is not the same as "it ran". A suite that bails out early — a
 * selector that silently matched nothing, a page that never loaded, an exit
 * taken before the interesting half — reports a clean sweep of whatever it
 * managed to reach, and that reads exactly like success.
 *
 * THIS USED TO BE THE ONE SUITE KEEPING A FLOOR, AND THE EXCEPTION WAS WRONG.
 * The argument was careful and it reached the wrong conclusion. Five checks are
 * conditional on the machine rather than on the app, so a full local run did 53
 * and a headless runner 48, and the comment concluded: "If you are tempted to
 * make this exact: the number is not one number. It is 48 on a headless runner
 * and 53 here, and an exact comparison has to be wrong on one of them."
 *
 * There was a third option. A check that cannot run is not ABSENT, it is
 * UNKNOWN — and an unknown outcome can be reported and COUNTED like any other.
 * `skip()` above does that, so the total is 59 on every machine and `!==`
 * works. A soundcard-less runner still exits 0, because a skip is not a
 * failure; a branch that vanished silently now fails, which is what the floor
 * could never do.
 *
 * AND THE EXCEPTION NAMED THE WRONG FIVE. It said "two speaker-picker checks
 * that need a routable audio output, and three recording checks that need the
 * AI Notes entitlement". Observed from a run on a machine with no object store,
 * the five that skipped were all ONE gate — the storage chain, because no
 * bucket was configured (`upload-url -> 400`). The speaker picker and the
 * recording entitlement both ran as real checks. The floor of 48 was 53 minus
 * five checks that were not the five it described, which is the stale reason
 * in a comment that exists to justify an exception. The lanes and CI start
 * `s3-stub.mjs` now (`lane-env.sh`; ci.yml's "Start the object store"), so
 * there the storage chain runs too.
 *
 * 59 = 54 checks that ran plus the 5 a deployment with no object store cannot
 * answer. Observed, not derived: it was `53 passed, 0 failed, 5 skipped` when
 * this was written,
 * and the 54th is "and it arrives without a reload", added when
 * `sl-3-call-card-not-broadcast` ran green against a pair of checks that both
 * tolerated one. Raise it when checks are
 * added, and add a `skip` for any new gate on the machine so it stays one
 * number.
 */
const EXPECTED_CHECKS = 59

const done = async (browser, stack) => {
  await browser?.close().catch(() => {})
  stack?.close()
  const ran = passed + failed + skipped
  console.log(`\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`)
  /*
   * EXACT, NOT A FLOOR, and a skipped check is what makes that possible — see
   * the comment on `skip` above. `ran` counts skips, so the total is the same
   * number on a machine with a soundcard and one without, and `!==` catches a
   * branch that vanished silently rather than reporting on whatever half it
   * reached. The `N passed, M failed` prefix is kept exactly as it was because
   * the harness parses it: `wt-break.sh` copies it into each break log, where
   * `classify-break-log.awk` and `check-break-reddened.mjs` read it, and
   * `verify.sh` and `local-sweep.mjs` read it off the run. (It used to say
   * `break-queue.sh`, deleted in `d840b55`.)
   */
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
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

/*
 * lib/fixture.mjs's one API client, not a copy (`suite-hygiene/apiAs-duplicated-62`),
 * under this suite's own `api(token, method, path, body)`. As the copy did, it
 * throws when nothing answers at all, and its `data` is the whole body when that
 * has no `data`: the recording's refusal below is read as `data.error`.
 */
const apiAs = apiAsAt(`${stack.apiBase}/api/v1`, { noAnswer: 'throw', dataOrBody: true })
const api = (token, method, p, body) => apiAs(token)(p, { method, body })

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
const startBtn = A.page.locator('[data-testid="call-start-button"]')
await startBtn.waitFor({ timeout: 15000 }).catch(() => {})
check(await startBtn.isVisible().catch(() => false), 'the channel header offers Start SyncUp', 'no start control in the channel header')
await startBtn.click({ timeout: 10_000 }).catch(() => {})

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
const speakerChain = chain(
  'and offers a speaker beside the mic and camera',
  'with the outputs this machine actually has',
)
if (routable === 0) {
  // THE MACHINE, not the product — counted as SKIP so the total is the same
  // number here and on a runner with no soundcard. See `skip` above.
  speakerChain.skipRest('no routable audio output in this browser, so nothing can be asked')
} else {
  const speaker = A.page.locator('[data-testid="call-prejoin-speaker-select"]')
  const hasSpeaker = await speaker.isVisible().catch(() => false)
  speakerChain.step(hasSpeaker, 'no output picker in the pre-join')
  if (!hasSpeaker) {
    // The product, not the machine: this browser HAS outputs and the app is
    // not offering them. That is a failure, not an unknown.
    speakerChain.rest('skipped: there was no output picker to read')
  } else {
    const options = await speaker.locator('option').count()
    speakerChain.step(options > 1, `only ${options} option in the speaker list`)
  }
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
const meterChain = chain(
  'and shows whether the microphone is hearing you',
  'with a level that moves with the input',
)
meterChain.step(hasMeter, 'no input-level meter in the pre-join')
if (!hasMeter) {
  meterChain.rest('skipped: there was no meter to watch')
} else {
  let peak = 0
  for (let i = 0; i < 20 && peak === 0; i += 1) {
    peak = Number(await micMeter.getAttribute('aria-valuenow')) || 0
    if (peak === 0) await A.page.waitForTimeout(150)
  }
  meterChain.step(peak > 0, 'the meter never left zero', `with a level that moves with the input (${peak}%)`)
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
/*
 * FOUR CHECKS, AND THE LAST OF THEM IS IN THE NEXT SECTION.
 *
 * "and the background chosen in the pre-join survives into the call" is the
 * half nothing else sees — a picker that works and a call that ignores it is a
 * feature that demos perfectly and does nothing. It was guarded by
 * `if (hasBgPicker && surfaced)`, so losing the picker took the check with it
 * rather than failing it, which is the shape that hides exactly this defect.
 */
const bgChain = chain(
  'the pre-join offers a background to choose',
  'with more than one to pick from',
  'and choosing one changes the preview',
  'and the background chosen in the pre-join survives into the call',
)
bgChain.step(hasBgPicker, 'no background picker in the pre-join')

const PREJOIN_TINT = 'rgb(12, 33, 93)' // #0c215d — BACKGROUND_TINT.navy
if (hasBgPicker) {
  const swatches = await bgPicker.locator('button').count()
  bgChain.step(swatches >= 3, `only ${swatches} background swatch(es)`, `with more than one to pick from (${swatches})`)

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
  bgChain.step(applied, `preview stayed ${before} — picking Navy painted nothing`)
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
  bgChain.step(carried, 'the call ignored the pre-join choice')
} else {
  bgChain.rest(
    hasBgPicker
      ? 'skipped: the call surface never rendered, so the tint could not be looked for'
      : 'skipped: there was no picker, so nothing was chosen to carry',
  )
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
/*
 * THREE FACTS, NOT TWO — and `neededReload` was computed and read by nobody,
 * which is the facade's mirror inside a test suite.
 *
 * The check above tolerates the reload on purpose, so it cannot tell a card
 * that was PUSHED from one that was merely stored and found on the next fetch.
 * `sl-3-call-card-not-broadcast` deletes the realtime emit — the card is
 * inserted, the notifications go out, and nothing reaches an open channel until
 * somebody reloads — and it ran GREEN against the pair above.
 *
 * A call invitation that arrives on the next reload is a log entry, so the
 * third fact gets its own sentence. It is the one check here that could flake:
 * the comment above is right that a socket still connecting when the call
 * starts would miss the event. Fifteen seconds is the window, and a socket that
 * has not connected inside a live call in fifteen seconds is itself the defect
 * this reports — the failure names the reload so the two readings are told
 * apart on sight rather than guessed at.
 */
check(
  sawCard && !neededReload,
  'and it arrives without a reload — a card you have to refresh for is a log entry',
  neededReload ? 'it only appeared after a reload, so nothing was pushed' : 'the card never arrived at all',
)
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
    if (!a.instrumented || !b.instrumented) return { instrumented: false, a, b }
    const ok = (s) => s.states.some((x) => x.connection === 'connected' || x.ice === 'connected' || x.ice === 'completed')
    if (ok(a) && ok(b)) return { instrumented: true, a, b, connected: true }
    await new Promise((r) => setTimeout(r, 500))
  }
  const [a, b] = await Promise.all([peerState(A.page), peerState(B.page)])
  return { instrumented: true, a, b, connected: false }
}

/*
 * THE WRAPPER IS THIS SUITE'S, SO ITS ABSENCE IS THIS RUN FAILING — NOT A SKIP.
 *
 * `window.__rundeskPeers` is set by the init script `signIn` adds to every
 * context, before any app code runs; nothing in the app sets it, and the
 * comment there says why no test-only hook was built. This read used to have
 * a branch for the wrapper being missing that printed "peer state is not
 * exposed for tests — falling back to the rendered tiles": an uncounted SKIP
 * (so the run would have ended one check short), describing a product hook
 * that does not exist and a fallback that was never written. It could not be
 * reached. Should the wrapper ever fail to install, the check it would have
 * answered fails and says so.
 */
const peers = await bothConnected()
check(
  peers.instrumented && peers.connected,
  'the two browsers reach a connected peer connection',
  peers.instrumented
    ? `A: ${JSON.stringify(peers.a.states)} B: ${JSON.stringify(peers.b.states)}`
    : "the suite's own RTCPeerConnection wrapper did not install (no window.__rundeskPeers on " +
        `${[!peers.a?.instrumented && 'A', !peers.b?.instrumented && 'B'].filter(Boolean).join(' or ')}), ` +
        'so there was no connection to read — the init script in signIn failed, not the call',
)
if (peers.instrumented && !peers.connected) {
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
    // The suite's own wrapper again (see section 4). Without it there is no
    // sender to read, and null FAILS the steps below, naming the wrapper — it
    // is never read as the product having nothing to send, and never skipped.
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
const shareChain = chain(
  'the call offers screen share',
  'A is sending their camera before sharing',
  'and sharing puts the screen on the wire, not just on the button',
  'with the control showing that it is on',
  'and B never loses the picture while the track is swapped',
  'and stopping the share gives the camera back',
)
shareChain.step(hasShare, 'no share control in the call footer')

if (!hasShare) {
  shareChain.rest('skipped: there was no share control to press')
} else {
  const camLabel = await outgoingVideoLabel(A.page)
  shareChain.step(
    camLabel !== null && !isScreen(camLabel),
    peers.instrumented
      ? 'no outgoing video sender to swap — the rest of this section would prove nothing'
      : "no sender could be read — the suite's own RTCPeerConnection wrapper did not install (section 4), " +
          'so the rest of this section would prove nothing',
    `A is sending their camera before sharing (${camLabel ?? 'no sender'})`,
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
  shareChain.step(
    isScreen(shareLabel),
    `the outgoing track is still ${shareLabel ?? 'missing'} — nothing was shared with anyone`,
    `and sharing puts the screen on the wire, not just on the button (${shareLabel ?? 'no sender'})`,
  )
  shareChain.step(
    (await shareBtn.getAttribute('aria-pressed')) === 'true',
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
  shareChain.step(stillPainting, 'B went black when A shared')

  await shareBtn.click()
  let backLabel = null
  for (let i = 0; i < 40; i += 1) {
    backLabel = await outgoingVideoLabel(A.page)
    if (backLabel !== null && !isScreen(backLabel)) break
    await A.page.waitForTimeout(250)
  }
  shareChain.step(
    backLabel !== null && !isScreen(backLabel),
    `still sending ${backLabel ?? 'nothing'} after stopping — the camera never came back`,
    `and stopping the share gives the camera back (${backLabel ?? 'no sender'})`,
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
const reactChain = chain(
  'the call offers reactions',
  'and opens a picker over the tiles',
  'with emoji in it to choose from',
  'A sees their own reaction',
  'and it reaches the other person in the call',
)
reactChain.step(hasReact, 'no reaction control in the call footer')

if (!hasReact) {
  reactChain.rest('skipped: there was no reaction control to press')
} else {
  await reactBtn.click()
  const picker = A.page.locator('[data-testid="call-reaction-picker"]')
  const pickerUp = await picker.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)
  reactChain.step(pickerUp, 'the reaction picker never appeared')

  if (!pickerUp) {
    reactChain.rest('skipped: the picker never opened')
  } else {
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
    reactChain.step(gridReady, 'the picker opened but its catalog never loaded')

    // The rendered character, which is what gets sent — `data-emoji` is the
    // base, and a skin tone is applied on the way out.
    const emoji = gridReady ? ((await firstEmoji.textContent().catch(() => ''))?.trim() ?? '') : '' // text-read: key — the character to look for on the tiles below
    if (gridReady) await firstEmoji.click().catch(() => {})

    const overlayHas = (p) =>
      p
        .waitForFunction(
          (want) => {
            const o = document.querySelector('[data-testid="call-reactions"]')
            // Floated where it is SEEN: a shown overlay's innerText leaves out anything hidden in it.
            if (!o || !o.checkVisibility()) return false
            return want ? o.innerText.includes(want) : o.innerText.trim().length > 0
          },
          emoji,
          { timeout: 10000 },
        )
        .then(() => true)
        .catch(() => false)

    reactChain.step(
      await overlayHas(A.page),
      'nothing floated over A’s tiles',
      `A sees their own reaction (${emoji || 'an emoji'})`,
    )
    reactChain.step(
      await overlayHas(B.page),
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
const minChain = chain(
  'the call can be minimised',
  'and it docks into the corner',
  'with the full-screen call out of the way',
  'and the docked tile is live rather than a black box',
  'and the call is still running while minimised',
  'and expanding brings the call back',
)
minChain.step(hasMin, 'no minimise control in the call header')

if (!hasMin) {
  minChain.rest('skipped: there was no minimise control to press')
} else {
  await minBtn.click()
  const docked = await A.page
    .locator('[data-testid="call-minimised"]')
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  minChain.step(docked, 'no minimised dock appeared')

  minChain.step(
    !(await A.page.locator('[data-testid="call-surface"]').isVisible().catch(() => false)),
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
  minChain.step(dockPainting, 'the minimised preview never painted a frame')

  const stillLive = await api(admin.accessToken, 'GET', `/workspaces/${WS}/calls/live?channelId=${CHANNEL}`)
  minChain.step(stillLive.data?.id === callId, `live -> ${JSON.stringify(stillLive.data)?.slice(0, 120)}`)

  await A.page.locator('[data-testid="call-expand"]').click().catch(() => {})
  const restored = await A.page
    .locator('[data-testid="call-surface"]')
    .waitFor({ timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  minChain.step(restored, 'the call could be minimised but not restored')
}

// ---------------------------------------------------------------------------
console.log('\n5. recording announces itself to everyone')
// ---------------------------------------------------------------------------
/*
 * Consent is the one thing here that is a legal problem rather than a UX one,
 * and the promise is that it is impossible to be recorded without being told.
 * The upload itself needs object storage, which a run may or may not have —
 * the lanes and CI start `s3-stub.mjs`, and an API started without the R2
 * variables has none — but the announcement is the part that must not be able
 * to fail, and it is pure signalling.
 */
const recordChain = chain(
  'the person recording sees the banner',
  'and so does everybody else in the call',
  'and the call row says it is recording',
)
/*
 * THE ENTITLEMENT IS READ FROM THE API, NOT INFERRED FROM THE SCREEN.
 *
 * This skipped whenever the Record button was not visible, calling that "the
 * AI Notes entitlement is off" — so a regression that hid the button read as
 * three SKIPs and exit 0, and because the call was then never recorded, the
 * storage chain below was refused ("This call was never recorded") and
 * skipped its five as well. The premise was wrong too: the button is offered
 * in every channel call (`canRecord` is "not a DM"), and with AI Notes off
 * pressing it opens the "Unlock AI Notetaker" gate instead of the consent.
 *
 * So the tenant's switch is asked of `/feature-flags/resolved` — the same
 * resolution `setRecording` refuses by — and only an explicit `false` there
 * skips. On, or unreadable, the button has to be there and recording has to
 * announce itself; anything else is the product and FAILS. An absent flag is
 * not the tenant's choice either: it is the product's default set.
 */
const notesFlags = await api(admin.accessToken, 'GET', `/feature-flags/resolved?workspaceId=${WS}`)
const notesOn = notesFlags.data?.flags?.['ai.meeting_notes']
const recordBtn = A.page.locator('[data-testid="call-record"], button[title*="Record" i]').first()
if (notesOn === false) {
  // THE TENANT, not the product: recording is switched off for this workspace,
  // so nothing about it can be asked. Counted as SKIP, so the run total is the
  // same number on a workspace that has the entitlement and one that does not.
  recordChain.skipRest('AI Notes is switched off for this workspace (feature-flags/resolved: ai.meeting_notes is false)')
} else if (!(await recordBtn.isVisible().catch(() => false))) {
  recordChain.rest(
    notesOn === true
      ? 'AI Notes is on for this workspace (feature-flags/resolved) and the call offers no Record control'
      : `the call offers no Record control, and the entitlement does not excuse it — it is not switched ` +
          `off (feature-flags/resolved -> ${notesFlags.status}, ai.meeting_notes ${JSON.stringify(notesOn)})`,
  )
} else {
  await recordBtn.click().catch(() => {})
  const consent = A.page.locator('[data-testid="call-consent-confirm"]')
  if (await consent.isVisible({ timeout: 4000 }).catch(() => false)) await consent.click().catch(() => {})
  const bannerA = await A.page.locator('[data-testid="call-recording-banner"]').waitFor({ timeout: 10000 }).then(() => true).catch(() => false)
  const bannerB = await B.page.locator('[data-testid="call-recording-banner"]').waitFor({ timeout: 10000 }).then(() => true).catch(() => false)
  recordChain.step(bannerA, 'the person recording was not told either')
  recordChain.step(bannerB, 'somebody was being recorded without being told')
  const flag = await api(admin.accessToken, 'GET', `/workspaces/${WS}/calls/live?channelId=${CHANNEL}`)
  recordChain.step(flag.data?.recording === true, `recording: ${flag.data?.recording}`)
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
 * SKIPPED ONLY WHERE THE MACHINE HAS NO STORE AND THE DEPLOYMENT SAYS SO — and
 * both halves are asked, neither is inferred from a failure. This used to skip
 * all five whenever upload-url answered anything at or above 400, under the
 * sentence "object storage is not configured here". Every lane and CI run
 * gives the API `s3-stub.mjs`, so there a refusal was never the storage: a 5xx
 * from the presign, or the 400 "This call was never recorded" that a recording
 * that never started produces — the exact historical bug the service's comment
 * on `recordingUploadUrl` describes — each read as SKIP and exited 0.
 *
 *   · THE MACHINE: the store this run would have (`STORE`, above) is asked
 *     whether it is there. `POST /__control/reset` is the stub's own rule for
 *     the start of a section — a refusal some earlier run armed and never
 *     fired stays armed, and would refuse this run's PUT — and answering it is
 *     the machine saying it gives the API a store.
 *   · THE DEPLOYMENT: the API's own configuration refusal, the 400 "Storage is
 *     not configured" `recordingUploadUrl` answers when R2 has no endpoint,
 *     keys or bucket. Any other refusal is the product.
 *
 * Only both together skip. Where a store answers, storage is configured for
 * this run, so even "Storage is not configured" is a FAILURE — of the API not
 * using the store it was started with. A failure after the presign (a PUT the
 * store refuses, a key the call will not keep, bytes that do not come back)
 * fails its own step; the stub's `POST /__control/fail-next-put` arranges that
 * case whenever it needs showing, rather than an unconfigured environment
 * supplying it.
 */
let storageChecked = false
const storageChain = chain(
  'a pre-signed upload URL is issued',
  'the browser can PUT the recording to storage',
  'and the call keeps the key it landed under',
  'the record offers the piece that was uploaded',
  'and it plays back the bytes that were stored',
)
{
  const storeHere = await fetch(`${STORE}/__control/reset`, { method: 'POST' })
    .then((r) => r.ok)
    .catch(() => false)
  const up = await api(admin.accessToken, 'POST', `/workspaces/${WS}/calls/${callId}/recording/upload-url`, {
    contentType: 'audio/webm',
  })
  // The envelope's message, where the API refused: `api()` keeps the whole
  // `{ data: null, error }` body as `data` when there is no `data` in it.
  const refusal = `upload-url -> ${up.status} ${JSON.stringify(up.data?.error?.message ?? null)}`
  const saysUnconfigured = up.status === 400 && up.data?.error?.message === 'Storage is not configured'
  if (saysUnconfigured && !storeHere) {
    // THE DEPLOYMENT, not the product: no store here, and the API says it has
    // none. Counted as SKIP rather than left absent, so the run total is the
    // same number here and where storage is set up.
    storageChain.skipRest(`object storage is not configured here — nothing answers on ${STORE}, and ${refusal}`)
  } else if (up.status >= 400) {
    // THE PRODUCT: a refusal that is not the deployment's, or the deployment's
    // on a machine that gave it a store.
    storageChain.rest(
      saysUnconfigured
        ? `${refusal}, although this run's store answers on ${STORE} — the API is not using the storage it was started with`
        : `${refusal} — not the deployment's "Storage is not configured", so this is the product failing, not an unknown`,
    )
  } else {
    storageChecked = true
    storageChain.step(Boolean(up.data?.uploadUrl && up.data?.storageKey), JSON.stringify(up.data)?.slice(0, 140))

    const SIZE = 2048
    const put = await A.page.evaluate(async ([url, size]) => {
      const bytes = new Uint8Array(size).fill(7)
      try {
        const r = await fetch(url, { method: 'PUT', body: bytes, headers: { 'content-type': 'audio/webm' } })
        return { ok: r.ok, status: r.status }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    }, [up.data?.uploadUrl, SIZE])
    storageChain.step(
      put.ok === true,
      `${put.error ?? `HTTP ${put.status}`} — this is what bucket CORS refusing the app's origin looks like; every server-side check still passes`,
      `the browser can PUT the recording to storage (${put.status ?? ''})`,
    )

    const attached = await api(admin.accessToken, 'POST', `/workspaces/${WS}/calls/${callId}/recording/attach`, {
      storageKey: up.data?.storageKey,
    })
    storageChain.step(attached.status < 400, `attach -> ${attached.status}`)
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

/*
 * PINNED BY THE CALL'S OWN RECORD ID — AND THE TIME WINDOW THAT WAS HERE WAS
 * NOT A PIN.
 *
 * It read the meetings list and took the first row whose start was at or after
 * this call's, under a comment claiming that was "pinned to THIS call rather
 * than the newest meeting". The list is ordered `startsAt DESC`, and a meeting
 * SCHEDULED IN THE FUTURE by any earlier suite sharing the lane database
 * outranks a call that ended a second ago. So the row this read was
 * `A39 Sprint sync with colleague`, dated tomorrow, with one attendee — and
 * `naming everyone who was there (1)` failed against a record this call never
 * wrote, while the call's own record sat below it with both people in it. The
 * tidy-up in §7 then DELETED the other suite's meeting.
 *
 * Every green run before this one was luck about what else the database held.
 *
 * `end` is idempotent by contract — "Ended AND the record is there: nothing
 * left to do" returns the id — so asking for it after the UI has already ended
 * the call changes nothing and answers with the identity the time window was
 * standing in for. `pending: true` is the named state where the id is still
 * coming, which is why this polls rather than reading once.
 *
 * It is not allowed to stand in for the UI. If a regression stopped the last
 * person out from ending the call, this POST would end it — so the check ABOVE
 * is the one that reads the product, and it has already run and already failed
 * by the time this asks for the id. What this buys is that the rest of the
 * section still measures the right record instead of reporting nothing.
 */
let record = null
let recordId = null
for (let i = 0; i < 30; i += 1) {
  const ended = await api(admin.accessToken, 'POST', `/workspaces/${WS}/calls/${callId}/end`, {})
  recordId = ended.data?.meetingId ?? null
  if (recordId) break
  await new Promise((r) => setTimeout(r, 500))
}
if (recordId) {
  record = (await api(admin.accessToken, 'GET', `/workspaces/${WS}/meetings/${recordId}`)).data ?? null
}
check(!!record, 'and it left a meeting record behind', `the call named no record of itself`)
check(
  (record?.attendees?.length ?? 0) >= 2,
  `naming everyone who was there (${record?.attendees?.length ?? 0})`,
  `attendees: ${JSON.stringify(record?.attendees)?.slice(0, 160)}`,
)
check(Array.isArray(record?.recordings), 'with a place for every piece of its recording', `recordings: ${JSON.stringify(record?.recordings)}`)

// And the bytes come back — read from the page, so playback is exercised
// across the same origin boundary the app plays them across.
if (!storageChecked) {
  // Already reported above, all five, with the reason: skipped where the
  // machine has no store and the deployment says it has none, failed otherwise.
} else {
  const url = (record?.recordings ?? [])[0]
  storageChain.step(typeof url === 'string' && url.length > 0, `recordings: ${JSON.stringify(record?.recordings)?.slice(0, 160)}`)
  if (!url) {
    // The product, not the deployment: the upload succeeded above and the
    // record does not name it, so this is a failure rather than an unknown.
    storageChain.rest('skipped: the record named no recording to fetch')
  } else {
    const got = await A.page.evaluate(async ([u]) => {
      try {
        const r = await fetch(u)
        const b = await r.arrayBuffer()
        return { ok: r.ok, len: b.byteLength }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    }, [url])
    storageChain.step(
      got.ok === true && got.len === globalThis.__expectBytes,
      `${got.error ?? `HTTP miss, ${got.len} bytes`} — stored but not retrievable is the same as lost`,
      `and it plays back the bytes that were stored (${got.len ?? got.error})`,
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
