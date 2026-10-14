/**
 * A CHANNEL IS DELETED FOR GOOD BY WHOEVER MAY ARCHIVE IT, AND A SPACE'S CHANNEL HAS ITS VIEWS TAB.
 *
 * Two gaps the chat prototype of pull request #2 showed beside ClickUp's Chat:
 *
 *   · `found-14-oct/chat-channel-cannot-be-deleted` — a channel could be archived and never deleted.
 *     ClickUp's creator deletes a Chat ("Delete Chat"), and its API deletes any channel. Here its
 *     creator or a workspace admin deletes it from the channel's menu, asked first; its messages go
 *     with it, a member who may not is refused, a direct message is not deleted, and the channel
 *     leaves the other members' lists.
 *   · `found-14-oct/space-channel-views-unbuilt` — ClickUp's channel of a Space "contains a Views tab
 *     with all the views you have access to in the Channel's related Space". Here a Space's channel
 *     has Chat and Views tabs; Views lists the Space's Folders and Lists the reader may open with
 *     each List's saved views, and a view opens its List on it. A channel of no Space has no tabs.
 *
 *   node test/e2e/chat-channel-delete-and-views.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, madeWorkspace } from './lib/fixture.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 7

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = { email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal', password: process.env.E2E_PASSWORD ?? 'Admin@123!' }

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `ccdv${stamp}`
const PASSWORD = 'ChannelDelete@12345!'

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
const apiAs = apiAsAt(API, { emptyBodyOn: ['POST', 'DELETE'] })
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`

let sql = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what a deleted channel leaves is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const must = (res, what) => {
    if (!res.ok || !res.data) throw new Error(`could not ${what}: ${said(res)}`)
    return res.data
  }
  const WS = must(await A('/workspaces', { method: 'POST', body: { name: `Channels ${TAG}` } }), 'make the workspace').id
  madeWorkspace(WS)
  const space = must(await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `Product ${TAG}` } }), 'make the space')
  const folder = must(await A('/projects', { method: 'POST', body: { spaceId: space.id, name: `Roadmap ${TAG}` } }), 'make the folder')
  const list = must(await A('/lists', { method: 'POST', body: { projectId: folder.id, name: `Q4 ${TAG}` } }), 'make the list')
  const view = must(await A(`/lists/${list.id}/views`, { method: 'POST', body: { name: `Sprint board ${TAG}`, type: 'board' } }), 'make the view')

  // Ana is a member, not an admin, and made neither channel.
  const anaEmail = `${TAG}-ana@rundesk.invalid`
  await signUpApi(API, { fullName: `Ana ${stamp}`, email: anaEmail, password: PASSWORD, organizationName: `CCDV ana ${stamp}`, organizationSlug: `ccdv-ana-${stamp}` })
  must(await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email: anaEmail, role: 'member' } }), 'add Ana')
  const [ana] = await sql`select id from users where email = ${anaEmail}`
  const anaAuth = await signInApi(API, anaEmail, PASSWORD)
  const Ana = apiAs(anaAuth.accessToken)

  const spaceChannel = must(await A(`/workspaces/${WS}/chat/channels`, { method: 'POST', body: { name: `product-${TAG}`, spaceId: space.id } }), 'make the Space’s channel')
  const plain = must(await A(`/workspaces/${WS}/chat/channels`, { method: 'POST', body: { name: `general-${TAG}` } }), 'make a channel of no Space')
  const doomed = must(await A(`/workspaces/${WS}/chat/channels`, { method: 'POST', body: { name: `doomed-${TAG}` } }), 'make the channel to delete')
  must(await Ana(`/chat/channels/${doomed.id}/join`, { method: 'POST' }), 'have Ana join the channel to delete')
  for (const n of [1, 2, 3]) must(await A(`/chat/channels/${doomed.id}/messages`, { method: 'POST', body: { body: `Doomed note ${n} ${TAG}` } }), `post note ${n}`)
  const dm = must(await A(`/workspaces/${WS}/chat/dms`, { method: 'POST', body: { peerUserId: ana.id } }), 'open a direct message with Ana')

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(15_000)
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })

  // ══ 1. A SPACE'S CHANNEL HAS ITS VIEWS TAB ═══════════════════════════════
  console.log('\n▶ A Space’s channel: Chat and Views')
  await page.goto(`${B}/app/${WS}/chat?channel=${spaceChannel.id}`, { waitUntil: 'domcontentloaded' })
  const viewsTab = page.getByTestId('chat-channel-tab-views')
  await viewsTab.waitFor({ timeout: 20_000 }).catch(() => {})
  await viewsTab.click().catch(() => {})
  const panel = page.getByTestId('chat-space-views')
  const listed = await waitUntil(async () => (await panel.locator(`[data-testid="chat-space-view-list"][data-list-id="${list.id}"]`).count()) === 1, { timeoutMs: 15_000 })
  const viewChip = panel.locator(`[data-testid="chat-space-view"][data-view-id="${view.id}"]`)
  const chipText = await viewChip.innerText().catch(() => '')
  const folderText = await panel.locator(`[data-testid="chat-space-view-folder"][data-folder-id="${folder.id}"]`).innerText().catch(() => '')
  const streamHidden = !(await page.locator('[data-testid="chat-composer"]').isVisible().catch(() => false))
  chk(
    // The Folder's heading is drawn in capitals (`uppercase`), so its words are read without their case.
    listed && chipText.includes(`Sprint board ${TAG}`) && folderText.toLowerCase().includes(`roadmap ${TAG}`.toLowerCase()) && folderText.includes(`Q4 ${TAG}`) && streamHidden,
    'a channel of a Space has Chat and Views tabs; Views lists the Space’s Folder, its List and the List’s saved view, in place of the conversation',
    JSON.stringify({ listed, chipText, folderText: folderText.slice(0, 80), streamHidden }),
  )
  await viewChip.click().catch(() => {})
  const opened = await waitUntil(() => {
    const url = new URL(page.url())
    return url.pathname.endsWith(`/${list.id}`) && url.searchParams.get('view') === view.id
  }, { timeoutMs: 15_000 })
  chk(opened, 'and a view opens its List on that view', `it went to ${page.url()}`)

  await page.goto(`${B}/app/${WS}/chat?channel=${plain.id}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('chat-composer').waitFor({ timeout: 20_000 }).catch(() => {})
  const plainTabs = await page.getByTestId('chat-channel-tabs').count()
  chk(plainTabs === 0, 'a channel of no Space has no tabs: it is its conversation', `tabs drawn: ${plainTabs}`)

  // ══ 2. WHO MAY DELETE ════════════════════════════════════════════════════
  console.log('\n▶ Deleting a channel')
  const anaTries = await Ana(`/chat/channels/${doomed.id}`, { method: 'DELETE' })
  const stillThere = (await sql`select count(*)::int as n from chat_channels where id = ${doomed.id}`)[0]?.n
  const dmTried = await A(`/chat/channels/${dm.id}`, { method: 'DELETE' })
  const dmThere = (await sql`select count(*)::int as n from chat_channels where id = ${dm.id}`)[0]?.n
  chk(
    anaTries.status === 403 && stillThere === 1 && dmTried.status === 400 && dmThere === 1,
    'a member who neither made the channel nor administers the workspace may not delete it, and a direct message is not deleted',
    JSON.stringify({ ana: said(anaTries), stillThere, dm: said(dmTried), dmThere }),
  )

  // ══ 3. DELETED FROM ITS MENU, ASKED FIRST ═══════════════════════════════
  await page.goto(`${B}/app/${WS}/chat?channel=${doomed.id}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('chat-composer').waitFor({ timeout: 20_000 }).catch(() => {})
  let asked = ''
  page.once('dialog', async (d) => {
    asked = d.message()
    await d.accept()
  })
  await page.getByTestId('chat-channel-menu').click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('chat-delete-channel').click({ timeout: 10_000 }).catch(() => {})
  const gone = await waitUntil(async () => (await sql`select count(*)::int as n from chat_channels where id = ${doomed.id}`)[0]?.n === 0, { timeoutMs: 15_000 })
  const messagesLeft = (await sql`select count(*)::int as n from chat_messages where channel_id = ${doomed.id}`)[0]?.n
  const leftOpen = new URL(page.url()).searchParams.get('channel')
  chk(
    gone && messagesLeft === 0 && asked.includes(`doomed-${TAG}`) && leftOpen !== doomed.id,
    'its creator deletes it from its menu, asked first by name: the channel and its messages are gone, and the page leaves it',
    JSON.stringify({ gone, messagesLeft, asked, leftOpen }),
  )

  // ══ 4. IT LEAVES THE OTHERS' LISTS ═══════════════════════════════════════
  const anaChannels = await Ana(`/workspaces/${WS}/chat/channels`)
  const anaSees = (anaChannels.data ?? []).some((c) => c.id === doomed.id)
  // The page's lists refetch once the delete is answered: read them when they have.
  const leftLists = await waitUntil(async () => !(await page.locator('body').innerText().catch(() => '')).includes(`doomed-${TAG}`), { timeoutMs: 15_000 })
  const sidebarText = await page.locator('body').innerText().catch(() => '')
  chk(
    anaChannels.ok && !anaSees && leftLists && !sidebarText.includes(`doomed-${TAG}`),
    'and it is in nobody’s list of channels any longer, the deleter’s sidebar included',
    JSON.stringify({ status: anaChannels.status, anaSees, inSidebar: sidebarText.includes(`doomed-${TAG}`) }),
  )

  // ══ 5. AN ADMIN DELETES ANY CHANNEL ══════════════════════════════════════
  const anasOwn = must(await Ana(`/workspaces/${WS}/chat/channels`, { method: 'POST', body: { name: `anas-${TAG}` } }), 'have Ana make a channel')
  const byAdmin = await A(`/chat/channels/${anasOwn.id}`, { method: 'DELETE' })
  const anasGone = (await sql`select count(*)::int as n from chat_channels where id = ${anasOwn.id}`)[0]?.n === 0
  chk(byAdmin.ok && anasGone, 'a workspace admin deletes a channel somebody else made', JSON.stringify({ admin: said(byAdmin), anasGone }))
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m the run stopped: ${e?.stack ?? e}`)
} finally {
  await browser?.close().catch(() => {})
  stack.close()
  await sql?.end?.({ timeout: 2 }).catch?.(() => {})
}

console.log(`\n${passed} passed, ${failed} failed`)
// Said only when it is so, as every suite says it: the break runner reads this line as a short run.
if (passed + failed !== EXPECTED_CHECKS) {
  console.log(`\n✗ ${passed + failed} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
}
if (failed > 0 || passed + failed !== EXPECTED_CHECKS) process.exitCode = 1
