/**
 * A CLIP'S LINK IS DRAWN AS THE CLIP WHERE IT IS SHARED
 * (`resume-defects/s4-clip-link`, `ledger-rows/row-1307`).
 *
 * A clip's link (`/clips/<token>`, `resume-defects/resume-7`) pasted into a chat
 * message, a comment or a task's description stayed a bare address: no title,
 * no player. ClickUp: "Clip links auto-embed in Chat for instant viewing", and
 * "Embed any Clip in the description of a task" (its Clips pages, through search
 * excerpts). Under the text each clip is drawn as a card — its title, a player
 * and its length — reading what the link itself opens (`GET
 * /public/clips/:token`), so it opens for exactly whom its link opens.
 *
 * Against the lane's store stub: the clips are uploaded as the app uploads one
 * (presign, then a PUT), in a workspace as every workspace starts and in one
 * that keeps its links to its members.
 *
 *   node test/e2e/clip-link-embeds.mjs --api 3027 --dist /tmp/claude-0/dist-7
 */
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 6

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
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

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
// lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). Never throws: `{status, data, error}`.
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `cle${stamp}`
const PASSWORD = 'ClipEmbeds@12345!'

let sql = null
let A = null
let browser = null
/** Each workspace made, with the session that may delete it. */
const workspacesMade = []
const clipsMade = []

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the task is made by SQL, as clip-links makes its own')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const makeWorkspace = async (name) => {
    const made = await A('/workspaces', { method: 'POST', body: { name } })
    if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace "${name}": ${said(made)}`)
    workspacesMade.push({ id: made.data.id, as: A })
    return made.data.id
  }
  const OPEN_WS = await makeWorkspace(`Clip embeds ${TAG}`)
  const BLOCKED_WS = await makeWorkspace(`Clip embeds blocked ${TAG}`)
  const blocked = await A(`/workspaces/${BLOCKED_WS}`, { method: 'PATCH', body: { blockPublicSharing: true } })
  if (!blocked.ok) throw new Error(`could not block public sharing: ${said(blocked)}`)

  // A member of the open workspace alone: the blocked workspace's clip is not theirs to watch.
  const memberEmail = `${TAG}-member@rundesk.invalid`
  const member = await signUpApi(API, { fullName: `Embed member ${TAG}`, email: memberEmail, password: PASSWORD, organizationName: `Embed member ${TAG}` })
  const joined = await A(`/workspaces/${OPEN_WS}/members`, { method: 'POST', body: { email: memberEmail, role: 'member' } })
  if (!joined.ok) throw new Error(`could not add the member: ${said(joined)}`)
  const M = apiAs(member.accessToken)
  if (member.workspaces?.[0]?.id) workspacesMade.push({ id: member.workspaces[0].id, as: M })

  const [space] = await sql`insert into spaces (workspace_id, name) values (${OPEN_WS}, ${`Space ${TAG}`}) returning id`
  const [project] = await sql`insert into projects (space_id, name) values (${space.id}, ${`Project ${TAG}`}) returning id`
  const [list] = await sql`insert into lists (project_id, name) values (${project.id}, ${`List ${TAG}`}) returning id`
  const [task] = await sql`insert into tasks (list_id, title) values (${list.id}, ${`Clip embed subject ${TAG}`}) returning id`
  const TASK_URL = `/app/${OPEN_WS}/${space.id}/${project.id}/${list.id}?task=${task.id}`

  /** Upload a clip as the app uploads one — presign, then a PUT — and answer with its link's token and path. */
  const clipIn = async (workspaceId, title) => {
    const presign = await A(`/workspaces/${workspaceId}/clips/presign`, {
      method: 'POST', body: { fileName: `${title}.webm`, contentType: 'video/webm', title, durationSeconds: 7 },
    })
    if (!presign.ok || !presign.data?.uploadUrl) throw new Error(`could not presign the clip: ${said(presign)}`)
    const put = await fetch(presign.data.uploadUrl, { method: 'PUT', body: randomBytes(4096), headers: { 'content-type': 'video/webm' } })
    if (put.status !== 200) throw new Error(`the store refused the clip: ${put.status}`)
    clipsMade.push({ workspaceId, storageKey: presign.data.storageKey })
    const link = await A(`/workspaces/${workspaceId}/clips/link`, { method: 'POST', body: { storageKey: presign.data.storageKey } })
    if (!link.ok || !link.data?.token) throw new Error(`could not link the clip: ${said(link)}`)
    return { storageKey: presign.data.storageKey, token: link.data.token, url: `${B}${link.data.path ?? `/clips/${link.data.token}`}` }
  }
  const OPEN_CLIP = await clipIn(OPEN_WS, `Walkthrough ${TAG}`)
  const BLOCKED_CLIP = await clipIn(BLOCKED_WS, `Members only ${TAG}`)
  const GONE_CLIP = await clipIn(OPEN_WS, `Soon gone ${TAG}`)

  browser = await chromium.launch(launchOptions())
  const signIn = async (email, password) => {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return page
  }
  const embed = (page, token) => page.locator(`[data-testid="clip-embed"][data-clip-token="${token}"]`)
  const refusedEmbed = (page, token) => page.locator(`[data-testid="clip-embed-unavailable"][data-clip-token="${token}"]`)
  /** What a drawn card shows: its title, its length, and whether its player's address plays. */
  const cardOf = async (page, token) => {
    const card = embed(page, token)
    const shown = await waitUntil(async () => (await card.count()) > 0, { timeoutMs: 20_000 })
    if (!shown) return { shown, title: '', duration: '', plays: false }
    const title = await card.getByTestId('clip-embed-title').filter({ visible: true }).first().innerText({ timeout: 5000 }).catch(() => '')
    const duration = await card.getByTestId('clip-embed-duration').filter({ visible: true }).first().innerText({ timeout: 5000 }).catch(() => '')
    const src = await card.getByTestId('clip-embed-player').first().getAttribute('src').catch(() => null)
    const plays = src ? (await fetch(src).then((r) => r.status, () => 0)) === 200 : false
    return { shown, title, duration, plays }
  }

  // ══ 1. IN CHAT ═════════════════════════════════════════════════════════════
  console.log('\n▶ the clip’s link posted in a chat channel')
  const channel = await A(`/workspaces/${OPEN_WS}/chat/channels`, { method: 'POST', body: { name: `${TAG}-clips` } })
  if (!channel.ok || !channel.data?.id) throw new Error(`could not make the channel: ${said(channel)}`)
  const posted = await A(`/chat/channels/${channel.data.id}/messages`, { method: 'POST', body: { body: `Have a look: ${OPEN_CLIP.url}` } })
  const page = await signIn(ADMIN.email, ADMIN.password)
  await page.goto(`${B}/app/${OPEN_WS}/chat?channel=${channel.data.id}`, { waitUntil: 'domcontentloaded' })
  const inChat = await cardOf(page, OPEN_CLIP.token)
  chk(
    posted.status === 201 && inChat.shown && inChat.title === `Walkthrough ${TAG}` && inChat.duration === '0:07' && inChat.plays,
    'a clip’s link posted in a chat channel is drawn as the clip under the message: its title, its length, and a player whose address plays from the store',
    `posted ${said(posted)}; drawn ${inChat.shown}, titled ${JSON.stringify(inChat.title)}, ${JSON.stringify(inChat.duration)} long, its address playing ${inChat.plays}`,
  )

  // ══ 2. IN A COMMENT ════════════════════════════════════════════════════════
  console.log('\n▶ the same link, and two that are not clips, in a task’s comment')
  const commented = await A(`/tasks/${task.id}/comments`, { method: 'POST', body: { body: `Recorded it: ${OPEN_CLIP.url}` } })
  const foreignToken = OPEN_CLIP.token
  const notClips = await A(`/tasks/${task.id}/comments`, {
    method: 'POST', body: { body: `Not ours: https://elsewhere.example/clips/${foreignToken} nor ${B}/clips/short` },
  })
  await page.goto(`${B}${TASK_URL}`, { waitUntil: 'domcontentloaded' })
  // A task's comments are on the sheet's Comments tab.
  await page.getByTestId('task-tab-comments').click({ timeout: 20_000 }).catch(() => {})
  const commentCard = page.locator(`[data-comment-id="${commented.data?.id ?? 'none'}"]`)
  const inComment = await waitUntil(async () => (await commentCard.locator(`[data-testid="clip-embed"][data-clip-token="${OPEN_CLIP.token}"]`).count()) > 0, { timeoutMs: 20_000 })
  const commentTitle = inComment
    ? await commentCard.getByTestId('clip-embed-title').filter({ visible: true }).first().innerText({ timeout: 5000 }).catch(() => '')
    : ''
  chk(
    commented.status === 201 && inComment && commentTitle === `Walkthrough ${TAG}`,
    'and the same link in a task’s comment is drawn as the clip under the comment',
    `commented ${said(commented)}; drawn under it ${inComment}, titled ${JSON.stringify(commentTitle)}`,
  )

  // ══ 3. NOT A CLIP ══════════════════════════════════════════════════════════
  const otherCard = page.locator(`[data-comment-id="${notClips.data?.id ?? 'none'}"]`)
  const otherShown = await otherCard.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false)
  const otherEmbeds = await otherCard.locator('[data-testid="clip-embed"], [data-testid="clip-embed-unavailable"], [data-testid="clip-embed-loading"]').count()
  const otherLinks = await otherCard.locator('a[href^="https://elsewhere.example/clips/"]').count()
  chk(
    notClips.status === 201 && otherShown && otherEmbeds === 0 && otherLinks === 1,
    'the same path on another site stays a link and is drawn as no clip, nor is an address of another shape',
    `commented ${said(notClips)}; shown ${otherShown}; ${otherEmbeds} clip card(s) under it; ${otherLinks} link(s) to the other site`,
  )

  // ══ 4. IN THE DESCRIPTION ══════════════════════════════════════════════════
  console.log('\n▶ the link in the task’s description')
  const described = await A(`/tasks/${task.id}`, { method: 'PATCH', body: { description: `The walkthrough:\n\n${OPEN_CLIP.url}` } })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const descriptionClips = page.getByTestId('description-clips')
  const inDescription = await waitUntil(async () => (await descriptionClips.locator(`[data-testid="clip-embed"][data-clip-token="${OPEN_CLIP.token}"]`).count()) > 0, { timeoutMs: 20_000 })
  await descriptionClips.getByTestId('clip-embed-player').first().click({ timeout: 8000 }).catch(() => {})
  // The description's own area, which opens the editor when pressed, is still drawn: the press went to the player.
  const editorOpened = (await page.getByTestId('description-open').count()) === 0
  chk(
    described.status >= 200 && described.status < 300 && inDescription && !editorOpened,
    'and in a task’s description, drawn under it — pressing its player plays it and opens no editor',
    `described ${said(described)}; drawn under it ${inDescription}; the editor opened ${editorOpened}`,
  )

  // ══ 5. WHOM IT OPENS FOR ═══════════════════════════════════════════════════
  console.log('\n▶ a members-only clip’s link, read by a member of another workspace')
  const toMember = await A(`/chat/channels/${channel.data.id}/messages`, { method: 'POST', body: { body: `Members only: ${BLOCKED_CLIP.url}` } })
  const memberPage = await signIn(memberEmail, PASSWORD)
  await memberPage.goto(`${B}/app/${OPEN_WS}/chat?channel=${channel.data.id}`, { waitUntil: 'domcontentloaded' })
  const refusedShown = await waitUntil(async () => (await refusedEmbed(memberPage, BLOCKED_CLIP.token).count()) > 0, { timeoutMs: 20_000 })
  const playersForIt = await embed(memberPage, BLOCKED_CLIP.token).count()
  const theirOwn = await cardOf(memberPage, OPEN_CLIP.token)
  chk(
    toMember.status === 201 && refusedShown && playersForIt === 0 && theirOwn.shown && theirOwn.plays,
    'a clip its link does not open for the reader — one its workspace keeps to its members, read by somebody who is not one — is said, not drawn as a player, while the open workspace’s clip plays for them',
    `posted ${said(toMember)}; said unavailable ${refusedShown}, ${playersForIt} player(s) for it; the open clip drawn ${theirOwn.shown} and playing ${theirOwn.plays}`,
  )

  // ══ 6. A DELETED CLIP ══════════════════════════════════════════════════════
  console.log('\n▶ a clip deleted after its link was posted')
  const goneMessage = await A(`/chat/channels/${channel.data.id}/messages`, { method: 'POST', body: { body: `Soon gone: ${GONE_CLIP.url}` } })
  const deleted = await A(`/workspaces/${OPEN_WS}/clips`, { method: 'DELETE', body: { storageKey: GONE_CLIP.storageKey } })
  await page.goto(`${B}/app/${OPEN_WS}/chat?channel=${channel.data.id}`, { waitUntil: 'domcontentloaded' })
  const goneSaid = await waitUntil(async () => (await refusedEmbed(page, GONE_CLIP.token).count()) > 0, { timeoutMs: 20_000 })
  const goneSaidText = goneSaid ? await refusedEmbed(page, GONE_CLIP.token).filter({ visible: true }).first().innerText({ timeout: 5000 }).catch(() => '') : ''
  chk(
    goneMessage.status === 201 && deleted.status >= 200 && deleted.status < 300 && goneSaid && goneSaidText.includes('not available'),
    'a deleted clip’s link is said to be unavailable, not drawn as a player that fails',
    `posted ${said(goneMessage)}; deleted ${said(deleted)}; said ${goneSaid} (${JSON.stringify(goneSaidText)})`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  const leftBehind = []
  if (A) {
    // The clips are the store's, not a table's: each goes by its own DELETE.
    for (const { workspaceId, storageKey } of clipsMade) {
      const gone = await A(`/workspaces/${workspaceId}/clips`, { method: 'DELETE', body: { storageKey } })
      if (![200, 204, 404].includes(gone.status)) leftBehind.push(`DELETE clip ${storageKey} answered ${gone.status}`)
    }
    for (const { id, as } of workspacesMade) {
      const gone = await as(`/workspaces/${id}`, { method: 'DELETE' })
      if (![200, 204, 404].includes(gone.status)) leftBehind.push(`DELETE workspace ${id} answered ${gone.status}`)
    }
  }
  if (leftBehind.length) console.log(`  cleanup left behind: ${leftBehind.join('; ')}`)
  // Only now: the calls above go through this proxy, and a closed one refuses them.
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
