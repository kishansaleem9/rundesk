/**
 * AT COMMENT, A PERSON TICKS THE CHECKLIST ITEMS ASSIGNED TO THEM — AND NOTHING
 * ELSE ON THE CHECKLIST.
 *
 * NOT A FRAME ROW: `found-25-sep/assigned-checklist-items-need-edit`, found
 * closing `task-rows-changed-by-id-anywhere`. ClickUp (search snippets):
 * "Comment" lets a person "complete or mark complete assigned checklist items".
 * Every checklist change asked the write rule at "edit", so a commenter could
 * not tick their own item, and the sheet's Checklists tab was one disabled
 * fieldset for them.
 *
 * A member in a comment-only space, and in a view-only one, with items of the
 * admin's task assigned to them. The items are read back by SQL.
 *
 *   node test/e2e/checklist-assignee-ticks.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

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

const stamp = Date.now()
const TAG = `cat${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the items are read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const password = 'ChecklistTicks@12345!'
  const signed = await signUpApi(API, { fullName: 'Checklist member', email, password, organizationName: `Checklist ${stamp}`, organizationSlug: `checklist-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${said(added)}`)
  const M = apiAs(signed.accessToken)
  const [me] = await sql`select id from users where email = ${email}`
  const [admin] = await sql`select id from users where email = ${ADMIN.email}`

  /** A space at `level`, the admin's task in it, and a checklist whose items are assigned as asked. */
  const place = async (name, level, items) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, defaultPermission: level } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    const task = await A('/tasks', { method: 'POST', body: { listId: list.data?.id, title: `${TAG} ${name} task` } })
    const checklist = await A(`/tasks/${task.data?.id}/checklists`, { method: 'POST', body: { title: `${TAG} ${name} checklist` } })
    if (checklist.status >= 300 || !checklist.data?.id) throw new Error(`could not make the ${name} checklist: ${said(task)} ${said(checklist)}`)
    const made = {}
    for (const [key, assigneeId] of Object.entries(items)) {
      const content = `${TAG} ${name} ${key}`
      const item = await A(`/tasks/${task.data.id}/checklists/${checklist.data.id}/items`, { method: 'POST', body: { content, assigneeId } })
      if (item.status >= 300 || !item.data?.id) throw new Error(`could not add "${content}": ${said(item)}`)
      made[key] = { id: item.data.id, content }
    }
    return { task: task.data.id, url: `/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}?task=${task.data.id}`, items: made }
  }
  const COMMENT = await place('comment', 'comment', { mine: me.id, theirs: admin.id, mineInTheSheet: me.id })
  const VIEW = await place('view', 'view', { mine: me.id })
  const itemRow = async (id) => (await sql`select is_done, content from task_checklist_items where id = ${id}`)[0] ?? null
  const patch = (p, key, body) => M(`/tasks/${p.task}/checklists/items/${p.items[key].id}`, { method: 'PATCH', body })

  // ══ 1. AT COMMENT, BY THE API ════════════════════════════════════════════
  console.log('\n▶ in a comment-only space: the member ticks their item, the admin’s, and renames their own')
  const tickMine = await patch(COMMENT, 'mine', { isDone: true })
  const tickTheirs = await patch(COMMENT, 'theirs', { isDone: true })
  const rename = await patch(COMMENT, 'mine', { content: `${TAG} renamed` })
  const mine = await itemRow(COMMENT.items.mine.id)
  const theirs = await itemRow(COMMENT.items.theirs.id)
  chk(
    tickMine.ok && mine?.is_done === true && tickTheirs.status === 403 && theirs?.is_done === false
      && rename.status === 403 && mine?.content === COMMENT.items.mine.content,
    'at Comment a member ticks the checklist item assigned to them — and nothing else: not the admin’s item, and not their own item’s words (403 each, unchanged)',
    `tick theirs-own ${said(tickMine)} (done ${mine?.is_done}); tick the admin's ${said(tickTheirs)} (done ${theirs?.is_done}); rename ${said(rename)} (${mine?.content})`,
  )

  // ══ 2. AT VIEW ═══════════════════════════════════════════════════════════
  console.log('\n▶ in a view-only space: the member ticks their item')
  const tickView = await patch(VIEW, 'mine', { isDone: true })
  const viewItem = await itemRow(VIEW.items.mine.id)
  chk(
    tickView.status === 403 && viewItem?.is_done === false,
    'at View a member ticks nothing, their own item included (403, unticked)',
    `${said(tickView)}; done ${viewItem?.is_done}`,
  )

  // ══ 3. THE SHEET ═════════════════════════════════════════════════════════
  console.log('\n▶ the task sheet’s Checklists tab, for the member at Comment')
  browser = await (await resolveChromium()).launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}${COMMENT.url}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('task-tab-checklists').click({ timeout: 20_000 }).catch(() => {})
  const row = (item) => page.getByTestId('task-sheet').locator('li', { hasText: item.content }).first()
  await row(COMMENT.items.mineInTheSheet).waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  const box = (item) => row(item).getByTestId('checklist-item-checkbox')
  const enabled = async (loc) => loc.isEnabled({ timeout: 5000 }).catch(() => null)
  const sheet = {
    mine: await enabled(box(COMMENT.items.mineInTheSheet)),
    theirs: await enabled(box(COMMENT.items.theirs)),
    deleteTheirs: await enabled(row(COMMENT.items.theirs).getByRole('button', { name: /^Delete$/ })),
    renameMine: await enabled(row(COMMENT.items.mineInTheSheet).getByRole('button', { name: /^Edit$/ })),
  }
  if (sheet.mine) await box(COMMENT.items.mineInTheSheet).click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(2000)
  const ticked = await itemRow(COMMENT.items.mineInTheSheet.id)
  chk(
    sheet.mine === true && sheet.theirs === false && sheet.deleteTheirs === false && sheet.renameMine === false && ticked?.is_done === true,
    'the sheet offers a commenter the tick on their own item, and it saves — and leaves the admin’s item, deleting and renaming as they were, not pressed',
    `${JSON.stringify(sheet)}; their item done ${ticked?.is_done}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
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
