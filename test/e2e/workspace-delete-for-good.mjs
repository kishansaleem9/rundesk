/**
 * A WORKSPACE IS DELETED FOR GOOD BY ITS ORGANIZATION'S OWNER, ONCE ARCHIVED,
 * WITH ITS NAME TYPED TO CONFIRM.
 *
 * NOT A FRAME ROW: `found-25-sep/workspace-permanent-delete-unbuilt`. Deleting
 * a workspace archived it and nothing removed it; the role editor had offered
 * `workspace.delete` for that until it left the catalog, because nothing asked it.
 *
 * ClickUp ("Delete a Workspace"): only the Workspace owner, from Settings, with
 * the name typed to confirm, and it cannot be recovered. Here the owners are
 * the owners of the workspace's organization (whoever creates a workspace in a
 * new organization is made one), and only an ARCHIVED workspace goes.
 *
 *   node test/e2e/workspace-delete-for-good.mjs --api 3027 --dist /tmp/claude-0/dist-7
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { openDb } from './lib/db.mjs'
import { storeBase, storeRequests } from './lib/store.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 5

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `wdg${stamp}`
const PASSWORD = 'DeleteForGood@12345!'
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const STORE = storeBase(API_PORT, argOf('--store', undefined))
let browser = null
let sql = null
let O = null
let LIVE = null

try {
  sql = await openDb()
  // The owner: signed up with an organization of their own, so they own it.
  const person = async (key) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const s = await signUpApi(API, { fullName: `Delete ${key}`, email, password: PASSWORD, organizationName: `WDG ${key} ${stamp}`, organizationSlug: `wdg-${key}-${stamp}` })
    return { email, id: s.user?.id, api: apiAs(s.accessToken) }
  }
  const owner = await person('owner')
  const admin = await person('admin')
  O = owner.api
  const made = await O('/workspaces', { method: 'POST', body: { name: `${TAG} doomed` } })
  if (!made.ok || !made.data?.id) throw new Error(`the owner could not make a workspace: ${said(made)}`)
  const WS = made.data.id
  const NAME = made.data.name
  const live = await O('/workspaces', { method: 'POST', body: { name: `${TAG} live` } })
  if (!live.ok || !live.data?.id) throw new Error(`the owner could not make the live workspace: ${said(live)}`)
  LIVE = live.data.id
  // A workspace admin of it who owns another organization, not this one.
  const added = await O(`/workspaces/${WS}/members`, { method: 'POST', body: { email: admin.email, role: 'workspace_admin' } })
  if (!added.ok) throw new Error(`could not add the admin: ${said(added)}`)
  // Something in it to be gone afterwards: a space, a project, a list, a task.
  const space = (await O('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })).data?.id
  const project = (await O('/projects', { method: 'POST', body: { spaceId: space, name: `${TAG} project` } })).data?.id
  const list = (await O('/lists', { method: 'POST', body: { projectId: project, name: `${TAG} list` } })).data?.id
  const task = await O('/tasks', { method: 'POST', body: { listId: list, title: `${TAG} task` } })
  if (!task.ok || !task.data?.id) throw new Error(`could not stage the workspace's contents: ${said(task)}`)
  // And files in the store: an attachment, which a row names, and a clip,
  // which only its prefix does (clips have no table).
  const body = Buffer.from(`${TAG} bytes`)
  const pre = await O(`/tasks/${task.data.id}/attachments/presign`, { method: 'POST', body: { fileName: `${TAG}.txt`, contentType: 'text/plain', sizeBytes: body.length } })
  const putFile = pre.data?.uploadUrl ? await fetch(pre.data.uploadUrl, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body }).then((r) => r.status, () => 0) : 0
  const recordedFile = pre.data?.storageKey
    ? await O(`/tasks/${task.data.id}/attachments`, { method: 'POST', body: { fileName: `${TAG}.txt`, storageKey: pre.data.storageKey, contentType: 'text/plain', sizeBytes: body.length } })
    : { status: 0 }
  const clipPre = await O(`/workspaces/${WS}/clips/presign`, { method: 'POST', body: { fileName: `${TAG}.webm`, contentType: 'video/webm', title: `${TAG} clip` } })
  const putClip = clipPre.data?.uploadUrl ? await fetch(clipPre.data.uploadUrl, { method: 'PUT', headers: { 'content-type': 'video/webm' }, body }).then((r) => r.status, () => 0) : 0
  if (putFile >= 300 || !putFile || !recordedFile.ok || !putClip || putClip >= 300) {
    throw new Error(`could not store the workspace's files: attachment presign ${pre.status}, PUT ${putFile}, record ${recordedFile.status}; clip presign ${clipPre.status}, PUT ${putClip} — a lane needs its store for this suite`)
  }
  const FILE_KEY = pre.data.storageKey
  const CLIP_KEY = clipPre.data.storageKey
  const archived = await O(`/workspaces/${WS}`, { method: 'DELETE' })
  if (!archived.ok) throw new Error(`could not archive the workspace: ${said(archived)}`)

  browser = await (await resolveChromium()).launch(launchOptions())
  const archivedTabAs = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', who.email)
    await page.fill('input[type=password]', PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await page.goto(`${B}/app/${LIVE}/settings?tab=archived`, { waitUntil: 'domcontentloaded' })
    await waitUntil(() => page.getByText(NAME, { exact: true }).first().isVisible().catch(() => false), { timeoutMs: 20_000 })
    return page
  }

  // ══ 1. WHO IS OFFERED IT ═════════════════════════════════════════════════
  console.log('\n▶ Settings › Archived, as the owner and as an admin of another organization')
  // The admin reads the archived list from the live workspace too: add them there.
  const addedLive = await O(`/workspaces/${LIVE}/members`, { method: 'POST', body: { email: admin.email, role: 'workspace_admin' } })
  if (!addedLive.ok) throw new Error(`could not add the admin to the live workspace: ${said(addedLive)}`)
  const op = await archivedTabAs(owner)
  const ownerOffered = await op.getByTestId(`archived-workspace-delete-${WS}`).count()
  const ap = await archivedTabAs(admin)
  const adminListed = await ap.getByText(NAME, { exact: true }).count()
  const adminOffered = await ap.getByTestId(`archived-workspace-delete-${WS}`).count()
  await ap.context().close().catch(() => {})
  chk(
    ownerOffered === 1 && adminListed > 0 && adminOffered === 0,
    'the owner of the workspace’s organization is offered Delete for good on the archived workspace, and an admin of it who owns no organization of it is not',
    `owner offered ${ownerOffered}; the admin sees it listed ${adminListed}, offered ${adminOffered}`,
  )

  // ══ 2. WHAT THE ROUTE REFUSES ════════════════════════════════════════════
  console.log('\n▶ the route: an admin, a live workspace, a name typed wrong')
  const byAdmin = await admin.api(`/workspaces/${WS}/permanent`, { method: 'DELETE', body: { confirmName: NAME } })
  const liveOne = await O(`/workspaces/${LIVE}/permanent`, { method: 'DELETE', body: { confirmName: live.data.name } })
  const wrong = await O(`/workspaces/${WS}/permanent`, { method: 'DELETE', body: { confirmName: `${NAME} ` } })
  const [{ n: stillThere }] = await sql`select count(*)::int as n from workspaces where id = ${WS}`
  chk(
    byAdmin.status === 403 && liveOne.status === 400 && wrong.status === 400 && stillThere === 1,
    'the route refuses an admin who does not own its organization, a workspace that is not archived, and a name typed wrong — and the workspace stays',
    `admin ${said(byAdmin)}; live ${said(liveOne)}; wrong name ${said(wrong)}; the workspace ${stillThere ? 'stays' : 'is gone'}`,
  )

  // ══ 3. THE DIALOG ASKS FOR THE NAME ══════════════════════════════════════
  console.log('\n▶ the owner opens Delete for good')
  await op.getByTestId(`archived-workspace-delete-${WS}`).click({ timeout: 10_000 }).catch(() => {})
  const confirm = op.getByTestId('delete-for-good-confirm')
  const opened = await waitUntil(() => confirm.isVisible().catch(() => false), { timeoutMs: 10_000 })
  const offBefore = opened ? await confirm.isDisabled().catch(() => false) : false
  await op.getByTestId('delete-for-good-name').fill(NAME.slice(0, -1), { timeout: 5000 }).catch(() => {})
  const offPartial = opened ? await confirm.isDisabled().catch(() => false) : false
  await op.getByTestId('delete-for-good-name').fill(NAME, { timeout: 5000 }).catch(() => {})
  const onExact = opened ? await confirm.isEnabled().catch(() => false) : false
  chk(
    opened && offBefore && offPartial && onExact,
    'Delete for good asks for the workspace’s name, and its button stays off until the name is typed exactly',
    `dialog ${opened}; off with nothing typed ${offBefore}; off with part of it ${offPartial}; on with all of it ${onExact}`,
  )

  // ══ 4. CONFIRMING DELETES IT, AND EVERYTHING IN IT ═══════════════════════
  console.log('\n▶ confirming')
  const answers = []
  op.on('response', (r) => { if (r.url().includes(`/workspaces/${WS}/permanent`)) answers.push(r.status()) })
  const storeBefore = await storeRequests(STORE)
  await confirm.click({ timeout: 5000 }).catch(() => {})
  /*
   * READ ONCE THE DELETION HAS ANSWERED, not once the row has gone. The row
   * goes first, then the store is emptied, then the deletion is recorded with
   * what the store gave back, so between the row going and the answer the
   * record is not there yet: read then, a loaded lane counted 0 records for a
   * deletion that recorded one (29 September, lane 6).
   */
  await waitUntil(() => answers.length > 0, { timeoutMs: 30_000 })
  const gone = await waitUntil(async () => (await sql`select count(*)::int as n from workspaces where id = ${WS}`)[0].n === 0, { timeoutMs: 15_000 })
  const [{ n: spacesLeft }] = await sql`select count(*)::int as n from spaces where workspace_id = ${WS}`
  const [{ n: tasksLeft }] = await sql`select count(*)::int as n from tasks where id = ${task.data.id}`
  const [{ n: recorded }] = await sql`select count(*)::int as n from audit_logs where action = 'workspace.deleted' and resource_id = ${WS}`
  const rowLeft = await waitUntil(async () => (await op.getByText(NAME, { exact: true }).count()) === 0, { timeoutMs: 10_000 })
  chk(
    answers.includes(200) && gone && spacesLeft === 0 && tasksLeft === 0 && recorded === 1 && rowLeft,
    'confirming deletes the workspace for good — its spaces and tasks with it — records who did it, and it leaves the archived list',
    `answered ${JSON.stringify(answers)}; workspace gone ${gone}; spaces left ${spacesLeft}; tasks left ${tasksLeft}; recorded ${recorded}; row gone ${rowLeft}`,
  )
  await op.context().close().catch(() => {})

  // ══ 5. AND WHAT THE STORE HELD FOR IT ════════════════════════════════════
  console.log('\n▶ the store')
  const storeAfter = await storeRequests(STORE)
  const deletedKeys = (storeAfter?.requests ?? [])
    .filter((r) => r.n > (storeBefore?.seq ?? Infinity) && r.method === 'DELETE')
    .map((r) => r.key)
  chk(
    storeBefore !== null && deletedKeys.includes(FILE_KEY) && deletedKeys.includes(CLIP_KEY),
    'and the files it held go from the store with it — a task’s attachment, which its row names, and a clip, which only its prefix does',
    storeBefore === null
      ? `the store at ${STORE} could not be read, so nothing here was measured`
      : `after the delete the store was asked to delete ${JSON.stringify(deletedKeys)}; the attachment ${FILE_KEY}, the clip ${CLIP_KEY}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (LIVE && O) {
    const archivedLive = await O(`/workspaces/${LIVE}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(archivedLive.status)) console.log(`  cleanup left behind: DELETE /workspaces/${LIVE} answered ${archivedLive.status || 'nothing'}`)
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
