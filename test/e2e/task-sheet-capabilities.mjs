/**
 * THE TASK SHEET OFFERS WHAT THIS PERSON MAY DO, AND NOTHING THE API WOULD
 * REFUSE THEM.
 *
 * NOT A FRAME ROW: `found-25-sep/task-sheet-offers-refused-edits`. The sheet
 * drew every control for anybody who could open the task — the title, the
 * status, the dates, the assignees, Archive and Delete — and a reader whose
 * space is view-only or comment-only was refused each one (403) after pressing
 * it. The project page had the same defect and asks the API now
 * (`found-24-sep/project-page-offers-guests-its-managers-buttons`).
 *
 * ClickUp (help centre, search snippets): "View" is read-only; "Comment" adds
 * comments, and on a task assigned to the person a change of its status;
 * "Edit" changes every task in the location.
 *
 * `GET /tasks/:id/capabilities` answers what the write routes would, and the
 * sheet draws by it. A member reads four tasks of the admin's: in a view-only
 * space, a comment-only one (and one assigned to them there), and one they
 * may edit. What they change is read back by SQL.
 *
 *   node test/e2e/task-sheet-capabilities.mjs --api 3021 --dist /tmp/claude-0/dist-1
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
const TAG = `tsc${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  const body = init.body ?? (['POST', 'PATCH', 'PUT'].includes(init.method) ? {} : undefined)
  if (body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null }
  return { status: res.status, data: (await res.json().catch(() => null))?.data }
}

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what is changed is read back by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const email = `${TAG}-member@rundesk.invalid`
  const password = 'Sheets@12345!'
  const signed = await signUpApi(API, { fullName: 'Sheet reader', email, password, organizationName: `Sheet ${stamp}`, organizationSlug: `sheet-${stamp}` })
  const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
  if (added.status >= 300) throw new Error(`could not add the member: ${added.status}`)
  const M = apiAs(signed.accessToken)
  const [me] = await sql`select id from users where email = ${email}`

  /** A space at `level`, its project and list, and the admin's tasks in it. */
  const place = async (name, level) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}`, ...(level ? { defaultPermission: level } : {}) } })
    if (space.status >= 300 || !space.data?.id) throw new Error(`could not make the ${name} space: ${space.status}`)
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name} list` } })
    if (list.status >= 300 || !list.data?.id) throw new Error(`could not make the ${name} list: ${list.status}`)
    const task = async (title, assignees = []) => {
      const t = await A('/tasks', { method: 'POST', body: { listId: list.data.id, title: `${TAG} ${title}`, ...(assignees.length ? { assigneeIds: assignees } : {}) } })
      if (t.status >= 300 || !t.data?.id) throw new Error(`could not make "${title}": ${t.status}`)
      return { id: t.data.id, url: `/app/${WS}/${space.data.id}/${project.data.id}/${list.data.id}?task=${t.data.id}`, title: `${TAG} ${title}` }
    }
    return { task }
  }
  const VIEW = await place('view', 'view')
  const COMMENT = await place('comment', 'comment')
  const EDIT = await place('edit')
  const tV = await VIEW.task('viewed')
  const tC = await COMMENT.task('commented')
  const tCA = await COMMENT.task('assigned', [me.id])
  const tE = await EDIT.task('edited')
  const row = async (id) => (await sql`select title, status from tasks where id = ${id}`)[0] ?? null

  browser = await (await resolveChromium()).launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  /** What the sheet offers on this task, once it and its statuses have loaded. */
  const offered = async (task) => {
    await page.goto(`${B}${task.url}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('task-more-menu').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="task-status-next"]')?.getAttribute('data-status-count') ?? 0) > 0, null, { timeout: 15_000 }).catch(() => {})
    // Whatever the sheet is still deciding, it has decided by now.
    await page.waitForTimeout(2000)
    const status = await page.getByTestId('task-status-next').isEnabled().catch(() => null)
    const due = await page.getByTestId('task-due-date').isEnabled().catch(() => null)
    // The title: pressing it opens an input when it may be edited.
    // In the sheet: the list behind it carries the same title.
    await page.getByTestId('task-sheet').getByText(task.title, { exact: true }).first().click({ timeout: 5000 }).catch(() => {})
    const titleInput = await page.locator(`input[value="${task.title}"]`).count().catch(() => 0)
    await page.keyboard.press('Escape').catch(() => {})
    await page.getByTestId('task-more-menu').click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(500)
    const archive = await page.getByTestId('task-menu-archive').isVisible().catch(() => false)
    const remove = await page.getByTestId('task-menu-delete').isVisible().catch(() => false)
    await page.keyboard.press('Escape').catch(() => {})
    await page.getByTestId('task-tab-comments').click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(1200)
    const comment = await page.getByTestId('comment-input').isVisible().catch(() => false)
    return { status, due, title: titleInput > 0, archive, remove, comment }
  }

  // ══ 1. A VIEW-ONLY SPACE ═════════════════════════════════════════════════
  console.log('\n▶ a task in a view-only space')
  const v = await offered(tV)
  chk(
    v.status === false && v.due === false && !v.title && !v.archive && !v.remove && !v.comment,
    'in a view-only space the sheet offers the member no change: no title to edit, the status and dates disabled, no Archive or Delete, and no comment box',
    JSON.stringify(v),
  )

  // ══ 2. A COMMENT-ONLY SPACE ══════════════════════════════════════════════
  console.log('\n▶ a task in a comment-only space')
  const c = await offered(tC)
  chk(
    c.comment && c.status === false && !c.title && !c.archive,
    'in a comment-only space it offers the comment box, and no change to the task',
    JSON.stringify(c),
  )

  // ══ 3. THEIR TASK IN A COMMENT-ONLY SPACE ════════════════════════════════
  console.log('\n▶ a task assigned to the member, in a comment-only space')
  const ca = await offered(tCA)
  await page.goto(`${B}${tCA.url}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="task-status-next"]')?.getAttribute('data-status-count') ?? 0) > 0, null, { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const before = (await row(tCA.id))?.status
  await page.getByTestId('task-status-next').click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(2000)
  const after = (await row(tCA.id))?.status
  chk(
    ca.status === true && ca.comment && !ca.title && !ca.archive && after !== before,
    'on a task assigned to them there it offers the status too — and moving it on saves — and still no other change',
    `${JSON.stringify(ca)}; the status ${before} → ${after}`,
  )

  // ══ 4. A SPACE THEY MAY EDIT ═════════════════════════════════════════════
  console.log('\n▶ a task in a space the member may edit')
  const e = await offered(tE)
  await page.goto(`${B}${tE.url}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('task-more-menu').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await page.getByTestId('task-sheet').getByText(tE.title, { exact: true }).first().click({ timeout: 5000 }).catch(() => {})
  // The title's own input, focused as it opens: matched by its value it would
  // stop matching at the first key.
  const input = page.locator('input:focus')
  await input.fill(`${TAG} retitled in the sheet`, { timeout: 5000 }).catch(() => {})
  await input.press('Enter').catch(() => {})
  await page.waitForTimeout(2000)
  chk(
    e.status === true && e.due === true && e.title && e.archive && e.remove && e.comment && (await row(tE.id))?.title === `${TAG} retitled in the sheet`,
    'where they may edit, it offers everything — and a new title saves',
    `${JSON.stringify(e)}; the title "${(await row(tE.id))?.title}"`,
  )

  // ══ 5. WHAT THE API ANSWERS ══════════════════════════════════════════════
  console.log('\n▶ what the API answers the member, task by task')
  const caps = {}
  for (const [k, task] of Object.entries({ view: tV, comment: tC, assigned: tCA, edit: tE })) {
    const r = await M(`/tasks/${task.id}/capabilities`)
    caps[k] = r.status === 200 ? r.data : r.status
  }
  const is = (x, edit, progress, comment) => x && x.edit === edit && x.progress === progress && x.comment === comment
  chk(
    is(caps.view, false, false, false) && is(caps.comment, false, false, true) && is(caps.assigned, false, true, true) && is(caps.edit, true, true, true),
    'the API says what each route would: nothing in the view-only space, comments in the comment-only one, the status too on their own task there, and everything where they may edit',
    JSON.stringify(caps),
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
