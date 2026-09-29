/**
 * THE ASSIGNEE PICKER'S "⚡ ASSIGN WITH AI" SUGGESTS WHO SHOULD TAKE THE TASK,
 * SAYS WHY IN THEIR NUMBERS, AND ASSIGNS ONLY WHEN CONFIRMED.
 *
 * FRAME `15:45`: the assignee picker's footer, "⚡ Assign with AI".
 * `product-siblings/assign-with-ai-picker-unbuilt`: the ledger marked it built,
 * closed by `ai-assign.mjs` — through the API alone — while the picker said it
 * was not built because the AI "cannot CHOOSE the person". It can:
 * `GET /ai/assignee-suggestion` ranks everyone who may take the task by their
 * open load and answers with the pick, the runner-up and each one's reason,
 * with no model needed. No page asked it.
 *
 *   node test/e2e/assign-with-ai-picker.mjs --api 3027 --dist /tmp/claude-0/dist-7
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = { authorization: `Bearer ${token}` }
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(text) } catch { /* no body */ }
  return { status: res.status, data: json?.data, error: json?.error }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `awa${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
let WS = null
let A = null
let browser = null

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (key) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `${TAG} ${key}`, email, password: 'AssignWithAi@12345!', organizationName: `AWA ${key} ${stamp}`, organizationSlug: `awa-${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    return { id: signed.user?.id, name: `${TAG} ${key}` }
  }
  const busy = await person('busy')
  const idle = await person('idle')
  const space = (await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })).data?.id
  const project = (await A('/projects', { method: 'POST', body: { spaceId: space, name: `${TAG} project` } })).data?.id
  const list = (await A('/lists', { method: 'POST', body: { projectId: project, name: `${TAG} list` } })).data?.id
  const elsewhere = (await A('/lists', { method: 'POST', body: { projectId: project, name: `${TAG} elsewhere` } })).data?.id
  if (!list || !elsewhere) throw new Error('could not stage the lists')
  // Open work: three for the busy member and two for the admin, none for the
  // idle one — in ANOTHER list. Work in the task's own list counts for whoever
  // carries it (they hold the thread), so there it would make the busy one the
  // pick; elsewhere only the load differs, as `ai-assign.mjs` stages it too.
  for (const [who, n] of [[busy.id, 3], [adminId, 2]]) {
    for (let i = 0; i < n; i++) {
      const t = await A('/tasks', { method: 'POST', body: { listId: elsewhere, title: `${TAG} load ${i}`, assigneeIds: [who] } })
      if (t.status >= 300) throw new Error(`could not stage the load: ${said(t)}`)
    }
  }
  const task = await A('/tasks', { method: 'POST', body: { listId: list, title: `${TAG} the task to give` } })
  if (task.status >= 300 || !task.data?.id) throw new Error(`could not make the task: ${said(task)}`)
  const TASK = task.data.id
  const answer = await A(`/ai/assignee-suggestion?taskId=${TASK}`)
  if (answer.data?.ok !== true) throw new Error(`the suggestion route did not suggest: ${said(answer)} ${JSON.stringify(answer.data ?? null)}`)

  browser = await (await resolveChromium()).launch(launchOptions())
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 }, serviceWorkers: 'block' })).newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  await page.goto(`${B}/app/${WS}/${space}/${project}/${list}?task=${TASK}`, { waitUntil: 'domcontentloaded' })
  await waitUntil(() => page.getByText(`${TAG} the task to give`, { exact: true }).first().isVisible().catch(() => false), { timeoutMs: 20_000 })

  // ══ 1. THE PICKER'S FOOTER SUGGESTS, AND SAYS WHY ════════════════════════
  console.log('\n▶ the assignee picker: ⚡ Assign with AI')
  await page.getByTestId('assignee-picker-open').first().click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('assign-with-ai-ask').click({ timeout: 10_000 }).catch(() => {})
  const pick = page.getByTestId('assign-with-ai-pick')
  const drawn = await waitUntil(() => pick.isVisible().catch(() => false), { timeoutMs: 15_000 })
  const pickedId = drawn ? await pick.getAttribute('data-user-id') : null
  const pickText = drawn ? (await pick.innerText()).trim() : ''
  chk(
    drawn && pickedId === idle.id && pickedId === answer.data.pick.userId && pickText.includes(idle.name) && pickText.includes(answer.data.pick.reason),
    'the picker’s ⚡ Assign with AI suggests the member with no open work, by name, with the reason in their own numbers — the suggestion route’s pick',
    `drawn ${drawn}; picked ${pickedId} (the idle member ${idle.id}); shown ${JSON.stringify(pickText)}`,
  )

  // ══ 2. CONFIRMING ASSIGNS THEM, AND ONLY THEN ════════════════════════════
  const before = ((await A(`/tasks/${TASK}`)).data?.assignees ?? []).map((a) => a.userId ?? a.id)
  await page.getByTestId('assign-with-ai-confirm').click({ timeout: 10_000 }).catch(() => {})
  const assigned = await waitUntil(async () => ((await A(`/tasks/${TASK}`)).data?.assignees ?? []).some((a) => (a.userId ?? a.id) === idle.id), { timeoutMs: 10_000 })
  chk(
    before.length === 0 && assigned,
    'nothing is assigned until the suggestion is confirmed, and confirming assigns the suggested member',
    `assignees before ${JSON.stringify(before)}; after the confirm, the idle member assigned ${assigned}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  stack.close()
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
