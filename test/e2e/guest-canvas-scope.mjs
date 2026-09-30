/**
 * A GUEST HAS NO WHITEBOARD OR MIND MAP: NOTHING SHARES ONE WITH THEM.
 *
 * NOT A FRAME ROW: `found-24-sep/guests-list-every-whiteboard`. Canvases —
 * whiteboards and mind maps — were read and written by workspace membership
 * alone: a guest listed every one, opened, renamed and deleted them, made
 * their own, and joined their realtime rooms.
 *
 * ClickUp's rule (help.clickup.com "Use ClickUp as a guest or limited
 * member"; search snippets): a guest sees only what is shared with them.
 * Canvases have no sharing here (a share names a space, folder, project,
 * list, task, doc, channel, dashboard or view), so, as with goals, a guest
 * has none — and the page says so rather than offering "New board", which
 * the API refuses them.
 *
 * Canvases are planted by SQL; each refusal is read back beside a member.
 *
 *   node test/e2e/guest-canvas-scope.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const { io } = createRequire(path.resolve(import.meta.dirname, '../../apps/web/package.json'))('socket.io-client')

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 5

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

const stamp = Date.now()
const TAG = `gcv${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const API = `${stack.base}/api/v1`
/* NEVER THROWS — `{status, data}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const refused = (status) => status === 403 || status === 404

let sql = null
let WS = null
let A = null
let browser = null
const sockets = []

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — canvases are planted and read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const password = 'Drawer@12345!'
    const signed = await signUpApi(API, {
      fullName: `Drawer ${who}`, email, password,
      organizationName: `Drawer ${who} ${stamp}`, organizationSlug: `drawer-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${who}: ${added.status}`)
    return { id: signed.user?.id, email, password, token: signed.accessToken, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const M = member.as
  const G = guest.as
  const canvas = async (type, word) =>
    (await sql`insert into workspace_canvases (workspace_id, type, title, data, created_by_id) values (${WS}, ${type}, ${`${TAG} ${word}`}, ${'{}'}::jsonb, ${adminId}) returning id`)[0].id
  const BOARD = await canvas('whiteboard', 'theboard')
  const MAP = await canvas('mindmap', 'themap')
  const titleOf = async (id) => (await sql`select title from workspace_canvases where id = ${id}`)[0]?.title ?? null

  // ══ 1. LISTED ════════════════════════════════════════════════════════════
  console.log('\n▶ the workspace’s whiteboards and mind maps, listed')
  const names = (res, word) => res.status === 200 && JSON.stringify(res.data ?? null).includes(`${TAG} ${word}`)
  const gBoards = await G(`/workspaces/${WS}/canvases?type=whiteboard`)
  const gMaps = await G(`/workspaces/${WS}/canvases?type=mindmap`)
  const mBoards = await M(`/workspaces/${WS}/canvases?type=whiteboard`)
  chk(
    gBoards.status === 200 && !names(gBoards, 'theboard') && gMaps.status === 200 && !names(gMaps, 'themap') && names(mBoards, 'theboard'),
    'a guest is listed no whiteboard and no mind map — a member is listed the board',
    `the guest: boards ${gBoards.status} naming it ${names(gBoards, 'theboard')}, maps ${gMaps.status} naming it ${names(gMaps, 'themap')}; the member's boards name it ${names(mBoards, 'theboard')}`,
  )

  // ══ 2. OPENED, RENAMED, DELETED ══════════════════════════════════════════
  console.log('\n▶ the board, opened, renamed and deleted by the guest')
  const gOpen = await G(`/workspaces/${WS}/canvases/${BOARD}`)
  const gRename = await G(`/workspaces/${WS}/canvases/${BOARD}`, { method: 'PATCH', body: { title: `${TAG} renamedbyguest` } })
  const gDelete = await G(`/workspaces/${WS}/canvases/${MAP}`, { method: 'DELETE' })
  const [boardTitle, mapTitle] = [await titleOf(BOARD), await titleOf(MAP)]
  const mOpen = await M(`/workspaces/${WS}/canvases/${BOARD}`)
  chk(
    refused(gOpen.status) && refused(gRename.status) && refused(gDelete.status)
      && boardTitle === `${TAG} theboard` && mapTitle === `${TAG} themap` && mOpen.status === 200,
    'a guest may not open, rename or delete one (refused, both unchanged) — a member opens it',
    `the guest: open ${gOpen.status}, rename ${gRename.status}, delete ${gDelete.status}; the board is "${boardTitle}", the map "${mapTitle}"; the member opens ${mOpen.status}`,
  )

  // ══ 3. MADE ══════════════════════════════════════════════════════════════
  console.log('\n▶ a new board, made by the guest and by the member')
  const titled = async (word) => (await sql`select count(*)::int as n from workspace_canvases where workspace_id = ${WS} and title = ${`${TAG} ${word}`}`)[0].n
  const gMade = await G(`/workspaces/${WS}/canvases`, { method: 'POST', body: { type: 'whiteboard', title: `${TAG} byguest` } })
  const mMade = await M(`/workspaces/${WS}/canvases`, { method: 'POST', body: { type: 'whiteboard', title: `${TAG} bymember` } })
  const [gN, mN] = [await titled('byguest'), await titled('bymember')]
  chk(
    gMade.status === 403 && gN === 0 && mMade.ok && mN === 1,
    'a guest makes no whiteboard (403, none made) — a member does',
    `the guest ${gMade.status}, made ${gN}; the member ${mMade.status}, made ${mN}`,
  )

  // ══ 4. THE ROOM ══════════════════════════════════════════════════════════
  console.log('\n▶ the board’s realtime room')
  const join = async (token) => {
    const sock = io(`http://127.0.0.1:${API_PORT}/realtime`, { auth: { token }, transports: ['websocket'], reconnection: false })
    sockets.push(sock)
    const up = await new Promise((res) => {
      sock.on('connect', () => res(true))
      sock.on('connect_error', () => res(false))
      setTimeout(() => res(false), 10_000)
    })
    const ack = await new Promise((res) => {
      sock.timeout(10_000).emit('subscribe', { rooms: [`canvas:${BOARD}`] }, (err, a) => res(err ? null : a))
    })
    return { up, joined: ack?.joined ?? [] }
  }
  const gRoom = await join(guest.token)
  const mRoom = await join(member.token)
  chk(
    gRoom.up && !gRoom.joined.includes(`canvas:${BOARD}`) && mRoom.joined.includes(`canvas:${BOARD}`),
    'a guest may not join a whiteboard’s realtime room — a member joins it',
    `the guest joined ${JSON.stringify(gRoom.joined)}; the member ${JSON.stringify(mRoom.joined)}`,
  )

  // ══ 5. THE PAGE ══════════════════════════════════════════════════════════
  console.log('\n▶ the whiteboards page, as the guest sees it')
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', guest.email)
  await page.fill('input[type=password]', guest.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${stack.base}/app/${WS}/whiteboards`, { waitUntil: 'domcontentloaded' })
  const said = await page.getByTestId('whiteboards-none-shared').waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false)
  const offered = await page.getByRole('button', { name: /New board/i }).count()
  await page.goto(`${stack.base}/app/${WS}/mindmaps`, { waitUntil: 'domcontentloaded' })
  const saidMaps = await page.getByTestId('mindmaps-none-shared').waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false)
  const offeredMaps = await page.getByRole('button', { name: /New mind map/i }).count()
  chk(
    said && offered === 0 && saidMaps && offeredMaps === 0,
    'the guest’s whiteboards and mind maps pages say none is shared with them, and offer no New board or New mind map',
    `whiteboards: the empty state ${said}, New board buttons ${offered}; mind maps: the empty state ${saidMaps}, New mind map buttons ${offeredMaps}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  for (const s of sockets) s.close()
  await browser?.close().catch(() => {})
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
