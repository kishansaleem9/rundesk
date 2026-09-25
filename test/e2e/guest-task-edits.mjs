/**
 * A GUEST CHANGES A TASK SHARED WITH THEM, AT THE LEVEL IT WAS SHARED AT.
 *
 * NOT A FRAME ROW: `found-25-sep/guests-edit-no-shared-task`. The task write
 * rule refused every guest ("Guests cannot edit tasks") before any share was
 * read, so a task, or a list, shared with a guest to edit was read-only to
 * them, while the create gate and the comment gate read the same shares
 * (`guest-space-level`).
 *
 * ClickUp (help centre, search snippets): a guest is given View, Comment, Edit
 * or Full edit on what is shared with them. "Edit" updates a task's details
 * and changes its status and assignees; "Comment" comments, and completes a
 * task assigned to them; "View" changes nothing. The ladder is a member's
 * (`task-edit-levels`), read from the guest's shares.
 *
 * In an open space the guest holds nothing by default. Five tasks of the
 * admin's are shared with them one by one, at view, at comment, at comment and
 * assigned to them, at edit, and one not at all; and a list at edit. What
 * they change is read back by SQL, and the sheet is asked what it offers.
 *
 *   node test/e2e/guest-task-edits.mjs --api 3021 --dist /tmp/claude-0/dist-1
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'

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
const TAG = `gte${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — tasks and shares are planted, and what is changed read back, by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const email = `${TAG}-guest@rundesk.invalid`
  const password = 'Guests@12345!'
  const signed = await signUpApi(API, { fullName: 'Shared guest', email, password, organizationName: `Guest ${stamp}`, organizationSlug: `guest-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'guest' } })
  if (added.status >= 300) throw new Error(`could not add the guest: ${said(added)}`)
  const G = apiAs(signed.accessToken)
  const [guest] = await sql`select id from users where email = ${email}`

  // An open space on the default "edit" — a member's level, not a guest's.
  const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} open` } })
  if (space.status >= 300 || !space.data?.id) throw new Error(`could not make the space: ${said(space)}`)
  const project = await A('/projects', { method: 'POST', body: { spaceId: space.data.id, name: `${TAG} project` } })
  if (project.status >= 300 || !project.data?.id) throw new Error(`could not make the project: ${said(project)}`)
  const list = async (name) => {
    const res = await A('/lists', { method: 'POST', body: { projectId: project.data.id, name: `${TAG} ${name}` } })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make the ${name} list: ${said(res)}`)
    return res.data.id
  }
  const L = await list('tasks shared one by one')
  const LE = await list('a list shared to edit')
  const task = async (listId, name) => {
    const title = `${TAG} ${name}`
    const [t] = await sql`insert into tasks (list_id, title, created_by_id) values (${listId}, ${title}, ${adminId}) returning id`
    return { id: t.id, title, url: `/app/${WS}/${space.data.id}/${project.data.id}/${listId}?task=${t.id}` }
  }
  const tView = await task(L, 'shared to view')
  const tComment = await task(L, 'shared to comment')
  const tAssigned = await task(L, 'shared to comment and assigned')
  const tEdit = await task(L, 'shared to edit')
  const tBeside = await task(L, 'shared with nobody')
  const tInList = await task(LE, 'in the list shared to edit')
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values
    (${WS}, 'task', ${tView.id}, ${guest.id}, 'view'),
    (${WS}, 'task', ${tComment.id}, ${guest.id}, 'comment'),
    (${WS}, 'task', ${tAssigned.id}, ${guest.id}, 'comment'),
    (${WS}, 'task', ${tEdit.id}, ${guest.id}, 'edit'),
    (${WS}, 'list', ${LE}, ${guest.id}, 'edit')`
  await sql`insert into task_assignees (task_id, user_id) values (${tAssigned.id}, ${guest.id})`
  const row = async (id) => (await sql`select title, status from tasks where id = ${id}`)[0] ?? null
  const rename = (t, title) => G(`/tasks/${t.id}`, { method: 'PATCH', body: { title } })
  const move = (t) => G(`/tasks/${t.id}`, { method: 'PATCH', body: { status: 'in_progress' } })

  // ══ 1. SHARED TO EDIT ════════════════════════════════════════════════════
  console.log('\n▶ a task shared with the guest to edit, and a task in a list shared with them to edit')
  const r1 = await rename(tEdit, `${TAG} renamed by the guest`)
  const r2 = await rename(tInList, `${TAG} renamed in the shared list`)
  const [e1, e2] = [await row(tEdit.id), await row(tInList.id)]
  chk(
    r1.status === 200 && e1?.title === `${TAG} renamed by the guest` && r2.status === 200 && e2?.title === `${TAG} renamed in the shared list`,
    'a guest renames a task shared with them to edit, and a task in a list shared with them to edit — read back',
    `the task shared to edit ${said(r1)}, now "${e1?.title}"; the task in the shared list ${said(r2)}, now "${e2?.title}"`,
  )

  // ══ 2. SHARED TO VIEW, OR TO COMMENT ═════════════════════════════════════
  console.log('\n▶ a task shared to view and one shared to comment: their titles and statuses')
  const v1 = await rename(tView, `${TAG} the viewed task renamed`)
  const v2 = await move(tView)
  const c1 = await rename(tComment, `${TAG} the commented task renamed`)
  const c2 = await move(tComment)
  const [rv, rc] = [await row(tView.id), await row(tComment.id)]
  const names = (res, level) => res.error?.message?.includes(`What is shared with you here is "${level}"`)
  chk(
    [v1, v2, c1, c2].every((r) => r.status === 403) && rv?.title === tView.title && rv?.status !== 'in_progress'
      && rc?.title === tComment.title && rc?.status !== 'in_progress' && names(v1, 'View only') && names(c1, 'Comment'),
    'a task shared with a guest to view or to comment is not theirs to change — its title and status stay (403) — and the refusal says what was shared with them',
    `view: rename ${said(v1)}, status ${said(v2)}, now ${JSON.stringify(rv)}; comment: rename ${said(c1)}, status ${said(c2)}, now ${JSON.stringify(rc)}`,
  )

  // ══ 3. SHARED TO COMMENT, AND ASSIGNED TO THEM ═══════════════════════════
  console.log('\n▶ a task shared to comment and assigned to the guest')
  const a1 = await move(tAssigned)
  const a2 = await rename(tAssigned, `${TAG} the assigned task renamed`)
  const ra = await row(tAssigned.id)
  chk(
    a1.status === 200 && ra?.status === 'in_progress' && a2.status === 403 && ra?.title === tAssigned.title,
    'on a task shared to comment and assigned to them a guest moves the status — read back — and does not rename it (403)',
    `status ${said(a1)}, rename ${said(a2)}, now ${JSON.stringify(ra)}`,
  )

  // ══ 4. NOT SHARED; AND WHAT THE API ANSWERS ══════════════════════════════
  console.log('\n▶ the task shared with nobody, and what the API answers the guest, task by task')
  const b1 = await rename(tBeside, `${TAG} the unshared task renamed`)
  const rb = await row(tBeside.id)
  const caps = {}
  for (const [k, t] of Object.entries({ view: tView, comment: tComment, assigned: tAssigned, edit: tEdit, inList: tInList, beside: tBeside })) {
    const r = await G(`/tasks/${t.id}/capabilities`)
    caps[k] = r.status === 200 ? r.data : r.status
  }
  const is = (x, edit, progress, comment) => x && x.edit === edit && x.progress === progress && x.comment === comment
  chk(
    b1.status === 404 && rb?.title === tBeside.title
      && is(caps.view, false, false, false) && is(caps.comment, false, false, true) && is(caps.assigned, false, true, true)
      && is(caps.edit, true, true, true) && is(caps.inList, true, true, true) && caps.edit.full === false && (caps.beside === 403 || caps.beside === 404),
    'the task beside them, shared with nobody, is not theirs (not found, unchanged; its capabilities refused); and the API answers each shared task by its share: nothing, comments, the status on theirs, every change — and at Edit no delete, which takes Full edit',
    `the unshared task ${said(b1)}, now "${rb?.title}"; ${JSON.stringify(caps)}`,
  )

  // ══ 5. THE SHEET ═════════════════════════════════════════════════════════
  console.log('\n▶ the sheet, as the guest: the task shared to edit, and the one shared to view')
  browser = await (await resolveChromium()).launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  /** Open the sheet on this task, once it and its statuses have loaded. */
  const open = async (t) => {
    await page.goto(`${B}${t.url}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('task-more-menu').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="task-status-next"]')?.getAttribute('data-status-count') ?? 0) > 0, null, { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(2000)
  }
  const viewedTitle = (await row(tView.id))?.title
  await open(tView)
  const vStatus = await page.getByTestId('task-status-next').isEnabled().catch(() => null)
  await page.getByTestId('task-sheet').getByText(viewedTitle, { exact: true }).first().click({ timeout: 5000 }).catch(() => {})
  const vTitle = await page.locator(`input[value="${viewedTitle}"]`).count().catch(() => 0)
  await page.keyboard.press('Escape').catch(() => {})
  await page.getByTestId('task-tab-comments').click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(1200)
  const vComment = await page.getByTestId('comment-input').isVisible().catch(() => false)
  const editedTitle = (await row(tEdit.id))?.title
  await open(tEdit)
  const eStatus = await page.getByTestId('task-status-next').isEnabled().catch(() => null)
  await page.getByTestId('task-sheet').getByText(editedTitle, { exact: true }).first().click({ timeout: 5000 }).catch(() => {})
  // The title's own input, focused as it opens: matched by its value it would
  // stop matching at the first key.
  const input = page.locator('input:focus')
  await input.fill(`${TAG} retitled by the guest in the sheet`, { timeout: 5000 }).catch(() => {})
  await input.press('Enter').catch(() => {})
  await page.waitForTimeout(2000)
  const re = await row(tEdit.id)
  chk(
    vStatus === false && vTitle === 0 && !vComment && eStatus === true && re?.title === `${TAG} retitled by the guest in the sheet`,
    'the sheet offers the guest what their share allows: on the task shared to view no title, status or comment box; on the one shared to edit the status, and a new title that saves',
    `view: status ${vStatus}, title input ${vTitle}, comment box ${vComment}; edit: status ${eStatus}, the title now "${re?.title}"`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  stack.close()
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
