/**
 * A PAGE SHOWS WHAT WAS SAID WHILE THE SERVER WAS LETTING ITS SOCKET INTO ITS ROOM.
 *
 * NOT A FRAME ROW: `found-7-oct/a-room-asked-on-an-open-socket-misses-what-was-said`,
 * found by the CI rehearsal of `518f96a`. A page reads its data as it mounts
 * and asks for its rooms then; the server lets the socket into a room only once
 * it has read who may hear it, and whatever is said to the room in between
 * reaches nothing. Only a socket's opening read anything afresh, so a page that
 * asked on a socket already open went on showing what it read: syncup-live's
 * second person never saw the call card until a reload. Measured on lane 4,
 * 3 runs of 3 for each of the first two sections below, before.
 *
 * Each section holds the page's ask — its subscribe frame, or the whole socket
 * — while something is said to the room through the API, then lets it go. The
 * page must show what was said without a reload.
 *
 *   ▶ the chat page, opened from the sidebar on a socket already open, its
 *     subscribe held while a message is posted to the channel it shows;
 *   ▶ the chat page, opened while the socket is down (dropped, and its next
 *     connection held), a message posted before the socket opens again;
 *   ▶ a list, opened from the sidebar on a socket already open, its subscribe
 *     held while a task is made in it.
 *
 *   node test/e2e/room-catch-up.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt, must } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 3

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* lib/fixture.mjs's one API client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const TAG = `rcu${Date.now()}`
/** A socket.io frame from the server that lets the socket into its namespace. */
const JOINED = /^40\/realtime,/
/** How long what was said waits unheard before the ask is let go: an event is sent at once. */
const UNHEARD_MS = 1500
/** How long the page is given, once let go, to show it. */
const SHOWN_WITHIN_MS = 8000
let browser = null

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const WS = must(await A('/workspaces', { method: 'POST', body: { name: TAG } }), 'make the workspace').id
  const CHANNEL = must(await A(`/workspaces/${WS}/chat/channels`, { method: 'POST', body: { name: `${TAG}-room` } }), 'make a public channel').id
  const FIRST = must(await A(`/chat/channels/${CHANNEL}/messages`, { method: 'POST', body: { body: `${TAG} the first message` } }), 'post the first message').id
  const SPACE = must(await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } }), 'make the space').id
  const PROJECT = must(await A('/projects', { method: 'POST', body: { spaceId: SPACE, name: `${TAG} project` } }), 'make the project').id
  const LIST_A = must(await A('/lists', { method: 'POST', body: { projectId: PROJECT, name: `${TAG} list A` } }), 'make list A').id
  const LIST_B = must(await A('/lists', { method: 'POST', body: { projectId: PROJECT, name: `${TAG} list B` } }), 'make list B').id
  const TASK_A = must(await A('/tasks', { method: 'POST', body: { listId: LIST_A, title: `${TAG} in A` } }), 'make a task in A').id
  const TASK_B = must(await A('/tasks', { method: 'POST', body: { listId: LIST_B, title: `${TAG} in B` } }), 'make a task in B').id

  browser = await chromium.launch(launchOptions())

  /**
   * A tab signed in as the admin, its socket routed through here: what either
   * side says goes through unless held. `holdAsk(room)` holds the page's
   * subscribe for that room until `letGo()`; `dropAndHold()` closes the socket
   * and holds the connection it opens next until `letGo()`.
   */
  const openTab = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const tab = { page, ctx, joined: 0, routes: [], heldAsks: [], heldConnections: [], holdRoom: null, holdConnections: false, said: [] }
    await page.routeWebSocket(/\/socket\.io\//, (ws) => {
      const route = { ws, server: null, pending: [] }
      tab.routes.push(route)
      const connect = () => {
        route.server = ws.connectToServer()
        route.server.onMessage((m) => {
          if (JOINED.test(String(m))) tab.joined += 1
          ws.send(m)
        })
        for (const m of route.pending.splice(0)) route.server.send(m)
      }
      ws.onMessage((m) => {
        const frame = String(m)
        if (tab.holdRoom && frame.includes('"subscribe"') && frame.includes(`"${tab.holdRoom}"`)) {
          tab.heldAsks.push({ route, m })
          return
        }
        if (route.server) route.server.send(m)
        else route.pending.push(m)
      })
      if (tab.holdConnections) tab.heldConnections.push(connect)
      else connect()
    })
    tab.holdAsk = (room) => { tab.holdRoom = room }
    tab.dropAndHold = async () => {
      tab.holdConnections = true
      const before = tab.routes.length
      for (const r of tab.routes) { r.server?.close(); r.ws.close() }
      // socket.io tries again on its own; that connection is the one held.
      return waitUntil(async () => tab.routes.length > before, { timeoutMs: 15_000 })
    }
    tab.letGo = () => {
      tab.holdRoom = null
      tab.holdConnections = false
      for (const { route, m } of tab.heldAsks.splice(0)) (route.server ? route.server.send(m) : route.pending.push(m))
      for (const connect of tab.heldConnections.splice(0)) connect()
    }
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', ADMIN.email)
    await page.fill('input[type=password]', ADMIN.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return tab
  }
  /** The tab on `url`, drawn, its socket open and let into its namespace. */
  const landOn = async (tab, url, drawn) => {
    await tab.page.goto(url, { waitUntil: 'domcontentloaded' })
    const shown = await tab.page.locator(drawn).first().waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false)
    const open = await waitUntil(async () => tab.joined >= 1, { timeoutMs: 20_000 })
    // Whatever the page asked for as it was drawn has been answered.
    await sleep(1000)
    return shown && open
  }
  const chatRow = `[data-testid="sidebar-channel-${CHANNEL}"]`
  const message = (id) => `[data-testid="message-row-${id}"]`
  const post = async (body) => must(await A(`/chat/channels/${CHANNEL}/messages`, { method: 'POST', body: { body } }), 'post a message').id

  console.log('\n▶ the chat page, opened on a socket already open, its subscribe held while a message is posted')
  {
    const tab = await openTab()
    const ready = await landOn(tab, `${B}/app/${WS}`, chatRow)
    tab.holdAsk(`workspace:${WS}`)
    await tab.page.locator(chatRow).click()
    const drawn = await tab.page.locator(message(FIRST)).waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false)
    const held = await waitUntil(async () => tab.heldAsks.length > 0, { timeoutMs: 10_000 })
    const said = await post(`${TAG} said while the chat page was being let in`)
    await sleep(UNHEARD_MS)
    tab.letGo()
    const shown = await tab.page.locator(message(said)).waitFor({ state: 'visible', timeout: SHOWN_WITHIN_MS }).then(() => true).catch(() => false)
    chk(
      ready && drawn && held && shown,
      'a page that asks for its room on a socket already open shows what was said while the server let it in, without a reload',
      `home drawn with its socket open: ${ready}; the channel drawn: ${drawn}; its subscribe held: ${held}; the message shown ${SHOWN_WITHIN_MS / 1000} s after the subscribe was let go: ${shown}`,
    )
    await tab.ctx.close()
  }

  console.log('\n▶ the chat page, opened while the socket is down, a message posted before it opens again')
  {
    const tab = await openTab()
    const ready = await landOn(tab, `${B}/app/${WS}`, chatRow)
    const dropped = await tab.dropAndHold()
    await tab.page.locator(chatRow).click()
    const drawn = await tab.page.locator(message(FIRST)).waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false)
    const said = await post(`${TAG} said while the socket was down`)
    await sleep(UNHEARD_MS)
    tab.letGo()
    const shown = await tab.page.locator(message(said)).waitFor({ state: 'visible', timeout: SHOWN_WITHIN_MS }).then(() => true).catch(() => false)
    chk(
      ready && dropped && drawn && shown,
      'a page opened while the socket is down shows what was said before it opened again, without a reload',
      `home drawn with its socket open: ${ready}; the socket dropped and trying again: ${dropped}; the channel drawn: ${drawn}; the message shown ${SHOWN_WITHIN_MS / 1000} s after the socket was let through: ${shown}`,
    )
    await tab.ctx.close()
  }

  console.log('\n▶ a list, opened on a socket already open, its subscribe held while a task is made in it')
  {
    const tab = await openTab()
    const row = (id) => `[data-testid="list-task-row"][data-task-id="${id}"]`
    const ready = await landOn(tab, `${B}/app/${WS}/${SPACE}/${PROJECT}/${LIST_A}`, row(TASK_A))
    const link = tab.page.locator(`[data-testid="tree-list-${LIST_B}"] a`).first()
    // The tree opens on the list shown, or opens its project when asked.
    if (!(await link.isVisible().catch(() => false))) {
      if (!(await tab.page.getByTestId(`tree-project-${PROJECT}`).isVisible().catch(() => false))) {
        await tab.page.getByTestId(`space-toggle-${SPACE}`).click({ timeout: 10_000 }).catch(() => {})
      }
      await tab.page.getByTestId(`project-toggle-${PROJECT}`).click({ timeout: 10_000 }).catch(() => {})
    }
    tab.holdAsk(`list:${LIST_B}`)
    await link.click({ timeout: 15_000 }).catch(() => {})
    const drawn = await tab.page.locator(row(TASK_B)).waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false)
    const held = await waitUntil(async () => tab.heldAsks.length > 0, { timeoutMs: 10_000 })
    const made = must(await A('/tasks', { method: 'POST', body: { listId: LIST_B, title: `${TAG} made while the list was being let in` } }), 'make a task in B').id
    await sleep(UNHEARD_MS)
    tab.letGo()
    const shown = await tab.page.locator(row(made)).waitFor({ state: 'visible', timeout: SHOWN_WITHIN_MS }).then(() => true).catch(() => false)
    chk(
      ready && drawn && held && shown,
      'a list that asks for its room on a socket already open draws a task made while the server let it in, without a reload',
      `list A drawn with its socket open: ${ready}; list B drawn: ${drawn}; its subscribe held: ${held}; the task drawn ${SHOWN_WITHIN_MS / 1000} s after the subscribe was let go: ${shown}`,
    )
    await tab.ctx.close()
  }
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
