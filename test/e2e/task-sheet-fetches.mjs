/**
 * ONE CHANGE TO A TASK REFRESHES ITS OPEN SHEET'S PANELS ONCE, NOT THREE OR FOUR TIMES.
 *
 * NOT A FRAME ROW: `product-siblings/task-sheet-refetch-storm`. The task
 * sheet's realtime handler invalidated the whole `['task', id]` prefix on
 * every event, which refetches everything the sheet has open. So did the list
 * page's own handler, beside it. One edit sends `task.updated` to the list's
 * room AND the task's (a page in both receives it twice) and `activity.created`
 * to the task's, and the editing sheet had already invalidated the prefix on
 * success. Measured on lane 1: one priority change fetched the task six times,
 * and its attachments six, in the sheet that made it.
 *
 * Two sheets are open on one task: the one that changes the priority, and one
 * that only watches. Each counts the requests its panels make, from the change
 * until things settle, and the watching sheet must still show the change.
 *
 *   node test/e2e/task-sheet-fetches.mjs --api 3021
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 2

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

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
const stamp = Date.now()
const TAG = `tsf-${stamp}`
let browser = null
let WS = null
let token = null

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  token = auth.accessToken
  const call = async (route, init = {}) => {
    const res = await fetch(`${API}${route}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: init.body ? JSON.stringify(init.body) : undefined })
    return { status: res.status, data: (await res.json().catch(() => null))?.data }
  }
  const make = async (route, body, what) => {
    const res = await call(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${res.status}`)
    return res.data.id
  }
  WS = await make('/workspaces', { name: TAG }, 'the workspace')
  const SPACE = await make('/spaces', { workspaceId: WS, name: `${TAG} space` }, 'the space')
  const PROJECT = await make('/projects', { spaceId: SPACE, name: `${TAG} project` }, 'the project')
  const LIST = await make('/lists', { projectId: PROJECT, name: `${TAG} list` }, 'the list')
  const TASK = await make('/tasks', { listId: LIST, title: `${TAG} the task`, priority: 'low' }, 'the task')
  // What the sheet has open when it opens: the task itself and its attachments
  // (comments, activity and time mount with their tabs).
  const PANELS = ['task', 'attachments']
  const panelOf = (url) => {
    const m = new URL(url).pathname.match(new RegExp(`/tasks/${TASK}(/attachments)?$`))
    return m ? (m[1] ? 'attachments' : 'task') : null
  }

  browser = await chromium.launch(launchOptions())
  const openSheet = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await ctx.newPage()
    const counts = Object.fromEntries(PANELS.map((p) => [p, 0]))
    let counting = false
    page.on('request', (req) => {
      if (!counting || req.method() !== 'GET') return
      const panel = panelOf(req.url())
      if (panel) counts[panel] += 1
    })
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', ADMIN.email)
    await page.fill('input[type=password]', ADMIN.password)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    await page.goto(`${B}/app/${WS}/${SPACE}/${PROJECT}/${LIST}?task=${TASK}`, { waitUntil: 'domcontentloaded' })
    const sheet = page.getByTestId('task-sheet')
    await sheet.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {})
    const priority = sheet.locator('select').filter({ has: page.locator('option[value="urgent"]') }).first()
    await priority.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    // Settled: whatever the sheet asks for on opening is not this change's.
    await page.waitForTimeout(3000)
    return { page, priority, counts, start: () => { counting = true } }
  }
  const editor = await openSheet()
  const watcher = await openSheet()

  console.log('\n▶ one priority change, low to urgent, in the first sheet')
  editor.start()
  watcher.start()
  await editor.priority.selectOption('urgent', { timeout: 10_000 }).catch(() => {})
  const shown = await waitUntil(async () => (await watcher.priority.inputValue().catch(() => '')) === 'urgent', { timeoutMs: 10_000 })
  // Long enough for every event the change sends, and every refetch they start.
  await editor.page.waitForTimeout(4000)
  console.log(`  the editing sheet fetched ${JSON.stringify(editor.counts)}; the watching sheet ${JSON.stringify(watcher.counts)}`)
  const most = (counts) => Math.max(...Object.values(counts))
  const least = (counts) => Math.min(...Object.values(counts))
  chk(
    least(editor.counts) >= 1 && most(editor.counts) <= 2,
    'in the sheet that made it, the change refetches the task and each open panel at most twice — its own save, and the events that follow it, once',
    `the editing sheet fetched ${JSON.stringify(editor.counts)}`,
  )
  chk(
    shown && least(watcher.counts) >= 1 && most(watcher.counts) <= 1,
    'in another sheet open on the task, it refetches the task and each open panel once, and that sheet shows the new priority',
    `the watching sheet fetched ${JSON.stringify(watcher.counts)}; it shows urgent: ${shown}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (WS && token) {
    const gone = await fetch(`${API}/workspaces/${WS}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).catch(() => null)
    if (![200, 204, 404].includes(gone?.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone?.status ?? 'nothing'}`)
  }
  // Only now: the DELETE above goes through this proxy, and a closed one refuses it.
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
