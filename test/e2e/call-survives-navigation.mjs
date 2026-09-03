/**
 * §G14-8 [20:12] — minimise a SyncUp and go on working.
 *
 * The dock rendered, looked exactly right, and hung up the moment you used it.
 * `ChannelCall` owned both the header button and the live call, and the CHAT
 * PAGE mounted it — so clicking through to a task unmounted the component, its
 * cleanup stopped every track and told the server you had left. Minimise exists
 * so you can browse while you talk, and browsing was what ended the call.
 *
 * That failure mode is worse than a missing feature: the control is on screen,
 * it responds, and it teaches you it works. So this suite does the one thing
 * the old arrangement could not survive — it NAVIGATES, and then asks both the
 * screen and the server whether the call is still there.
 *
 * One browser, not two. The peer mesh is `syncup-live`'s job; this is about
 * whether a call outlives a route change, which one participant can answer.
 *
 *   node test/e2e/call-survives-navigation.mjs --api 3011 --dist apps/web/dist
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveChromium, CHROME } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi } from './lib/signin.mjs'

const REPO = path.resolve(import.meta.dirname, '../..')
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran": a selector matching nothing sweeps clean. */
const EXPECTED_CHECKS = 10

const chromium = await resolveChromium()
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
}

const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch({
  ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    // A real capture device without a camera: the stream is decodable, so the
    // call is exercised rather than mocked.
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
})

try {
  const login = await signInApi(API, ME.email, ME.password)
  const A = apiAs(login.accessToken)
  const myId = login.user?.id ?? login.id
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  const stamp = Date.now()

  // Its own channel, so a call left running by an earlier run cannot be
  // mistaken for the one this run started.
  const channel = await A(`/workspaces/${workspaceId}/chat/channels`, {
    method: 'POST',
    body: { name: `callnav-${stamp}`, isPrivate: false },
  })
  const channelId = channel.data?.id
  if (!channelId) throw new Error(`could not make a channel: ${channel.status}`)

  /*
   * The camera and microphone are GRANTED explicitly, not just faked.
   *
   * `--use-fake-ui-for-media-stream` auto-accepts Chromium's own prompt, and
   * that was enough on this machine — but Playwright keeps its own permission
   * state per context and denies by default, which overrides the flag. This
   * suite passed locally and failed in CI for exactly that reason: `getUserMedia`
   * was refused, the pre-join never opened, and the join click sat there until
   * it timed out. `syncup-live` has granted them since it was written.
   */
  const page = await (
    await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      permissions: ['microphone', 'camera'],
    })
  ).newPage()

  /*
   * Every live-call request this session makes, recorded for the check at the
   * end.
   *
   * `useLiveCall` is disabled without a channel, but the socket handlers call
   * `refetch()`, which is imperative and ignores `enabled` — so on each call.*
   * event with no call in progress the query function ran anyway and put the
   * missing id straight into the URL as `?channelId=null`. Postgres refused
   * `channel_id = 'null'`, and the only trace was a line in its log: the suite
   * passed, because a failed background refetch changes nothing on screen.
   *
   * Which is why this watches the WIRE rather than the page. Nothing visible
   * distinguishes the two builds.
   */
  const liveCalls = []
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes('/calls/live')) liveCalls.push(url)
  })

  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: 30000 })
  await page.goto(`${stack.base}/app/${workspaceId}/chat?channel=${channelId}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(5000)

  console.log('\n▶ §G14-8 — a call you minimise is a call you keep')

  const start = page.getByTestId('call-start-button')
  chk(await start.isVisible().catch(() => false), 'a channel offers to start a SyncUp',
    'no start button in the channel header')
  await start.click()
  await page.waitForTimeout(2500)
  /*
   * Reported rather than left to time out. A refused camera makes the pre-join
   * never appear, and a bare 30-second click timeout says only "locator failed"
   * — which is the least useful version of a very specific problem.
   */
  /*
   * Checked on the JOIN BUTTON, not on the dialog.
   *
   * The dialog opens whether or not the camera does — `disabled={joining ||
   * !ready}` is what the media actually gates. The first version of this check
   * asked whether the pre-join appeared, passed cleanly with the camera
   * refused, and left the click to time out after thirty seconds saying only
   * "locator failed". Confirmed by denying permission on purpose: same
   * behaviour, same runtime as the CI failure this suite was written to survive.
   */
  const join = page.getByTestId('call-prejoin-join')
  const canJoin = await join.isEnabled().catch(() => false)
  chk(
    canJoin,
    'the pre-join gets a camera and offers to join',
    'Join stayed disabled — the browser refused the camera, so no call can start',
  )
  if (canJoin) {
    await join.click()
    await page.waitForTimeout(6000)
  }

  chk(
    await page.getByTestId('call-surface').isVisible().catch(() => false),
    'and joining puts you in it',
    'the call surface never appeared',
  )

  // Minimise, exactly as somebody who wants to keep working would.
  await page.getByTestId('call-minimise').click()
  await page.waitForTimeout(1200)
  chk(
    await page.getByTestId('call-minimised').isVisible().catch(() => false),
    'minimising leaves the dock on screen',
    'the dock did not appear after minimising',
  )

  /*
   * The navigation, and it has to be a CLICK.
   *
   * `page.goto` was the first attempt and it is the wrong test: it is a full
   * document load, which tears down the whole app and cannot carry a
   * MediaStream across — no web application survives that, so the check would
   * have failed forever and told us nothing about the defect. What broke here
   * was in-app routing: clicking a link unmounted the chat page and the call
   * went with it. So this clicks a link, the way a person does.
   */
  await page.locator(`a[href$="/app/${workspaceId}/inbox"]`).first().click()
  await page.waitForURL(/\/inbox/, { timeout: 20000 })
  await page.waitForTimeout(4000)

  chk(
    /\/inbox/.test(page.url()),
    'clicking through to another page actually goes there',
    `still on ${page.url()} — the navigation under test never happened`,
  )
  chk(
    await page.getByTestId('call-minimised').isVisible().catch(() => false),
    'and the call is still there after navigating away from chat',
    'navigating away hung the call up — the dock is gone',
  )

  /*
   * The screen is half the answer. A dock that renders while the server has
   * already dropped you is the same defect wearing the fix as a hat: everyone
   * else sees a frozen tile of somebody who has left.
   */
  const live = await A(`/workspaces/${workspaceId}/calls/live?channelId=${channelId}`)
  const present = (live.data?.participants ?? []).filter((p) => !p.leftAt)
  chk(
    !!live.data?.id,
    'the server still has the call running',
    `live call after navigating: ${JSON.stringify(live.data)}`,
  )
  chk(
    present.some((p) => p.userId === myId),
    'and still lists you as in it',
    `present: ${JSON.stringify(present.map((p) => p.userId))}`,
  )

  /*
   * And hanging up works from where you ended up — straight off the dock,
   * without going back to chat. That is the path this whole change creates:
   * before it, you could only leave from the full surface, because navigating
   * away had already left for you.
   */
  await page.getByTestId('call-dock-leave').click()
  await page.waitForTimeout(3500)
  const after = await A(`/workspaces/${workspaceId}/calls/live?channelId=${channelId}`)
  const stillIn = (after.data?.participants ?? []).filter((p) => !p.leftAt && p.userId === myId)
  chk(
    stillIn.length === 0,
    'and hanging up from another page actually leaves',
    `still listed as present after leaving: ${JSON.stringify(stillIn)}`,
  )

  /*
   * Asked of the whole session, not of one moment: the bad request fires on a
   * call.* event, so it lands at start, at join and at leave, and sampling
   * anywhere would miss two of the three.
   *
   * Shape, not value — a channel id this suite never created is still a bug
   * worth failing on, and "null" is only the spelling it happened to have.
   */
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const asked = liveCalls.map((u) => new URL(u).searchParams.get('channelId'))
  const nonsense = asked.filter((c) => c !== null && !UUID.test(c))
  chk(
    liveCalls.length > 0 && nonsense.length === 0,
    'and never asked the API about a channel that is not one',
    liveCalls.length === 0
      ? 'no live-call request was made at all — this check saw nothing to judge'
      : `asked about ${JSON.stringify([...new Set(nonsense)])} across ${liveCalls.length} requests`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${e.message.split('\n')[0]}`)
} finally {
  await browser.close().catch(() => {})
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
