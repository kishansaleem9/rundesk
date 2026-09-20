/**
 * §V2-S17 — ONE-CLICK NEXT STATUS AND MARK-COMPLETE, frames `15:20`, `16:00`,
 * `04:11`.
 *
 * The frame draws the Status field as a coloured pill with a **▶** welded to
 * its right edge and a separate **✓** beside it — three controls where Rundesk
 * had one `<select>`. At `15:20` the pill reads `COMPLETE ⊘ ▶ ✓`; at `04:11`
 * the same two buttons sit beside a `TO DO` pill, which is what settles that ▶
 * means "advance from wherever this task is" rather than "set one fixed value".
 *
 * WHY EVERY CHECK BELOW RUNS AGAINST A RENAMED PIPELINE.
 *
 * Statuses are PER LIST in this codebase. `GET /lists/:listId/statuses` returns
 * what this list was given, each row carrying a `category` (`open` /
 * `in_progress` / `closed`) and a `position`; the defaults in
 * `apps/api/src/modules/lists/list-statuses.defaults.ts` are only what a list
 * gets when nobody says otherwise. So a ▶ hard-wired to `in_progress`, or a ✓
 * hard-wired to `done`, demos perfectly on a fresh list and is a *facade* — it
 * can only ever say one thing. On a list whose statuses were replaced there is
 * no `done` to write, and the write either 400s or silently stores a key the
 * list does not have.
 *
 * This suite therefore builds a list with `Icebox → Cooking → Shipped`, no
 * default key surviving, and asks the two controls what they will do BEFORE
 * pressing them (`data-next-status` / `data-complete-status`) and what the
 * SERVER holds afterwards. A control that always writes the same key cannot
 * pass either half.
 *
 *   node test/e2e/task-header-status.mjs --api 3011 --dist apps/web/dist
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

/** "0 failed" is not "it ran". */
const EXPECTED_CHECKS = 15

const REPO = path.resolve(import.meta.dirname, '../..')
const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const DIST = path.resolve(REPO, argOf('--dist', 'apps/web/dist'))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ME = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${bad ?? good}`) }
}

/*
 * `apiClient` NEVER THROWS — it resolves `{status, data, error}`. A `.catch()`
 * on it is inert, so every call below is judged on `status`.
 */
const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, {
    ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}

const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: DIST, apiPort: API_PORT })
const browser = await chromium.launch(launchOptions())

const TAG = `e2e-hdrstatus-${Date.now()}`
/*
 * Three names whose slugs share not one character with the default pipeline
 * (`backlog`, `todo`, `in_progress`, `in_review`, `done`, `cancelled`). If any
 * check below can pass with a default key in it, the check is measuring the
 * default pipeline and not this list.
 */
const RENAMED = [
  { name: 'Icebox', key: 'icebox', category: 'open' },
  { name: 'Cooking', key: 'cooking', category: 'in_progress' },
  { name: 'Shipped', key: 'shipped', category: 'closed' },
  { name: 'Binned', key: 'binned', category: 'closed' },
]
const DEFAULT_KEYS = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled']

try {
  const auth = await signInApi(API, ME.email, ME.password)
  const A = apiAs(auth.accessToken)
  const workspaces = (await A('/workspaces')).data ?? []
  const workspaceId = workspaces[0]?.workspace?.id ?? workspaces[0]?.id
  if (!workspaceId) throw new Error('no workspace')

  // ── This suite's own containers. The database is shared; nothing here may
  //    depend on, or disturb, anybody else's statuses. ──────────────────────
  const space = (await A('/spaces', { method: 'POST', body: { workspaceId, name: `Space ${TAG}` } })).data
  if (!space?.id) throw new Error('could not make a space')
  const project = (await A('/projects', { method: 'POST', body: { spaceId: space.id, name: `Project ${TAG}` } })).data
  if (!project?.id) throw new Error('could not make a project')
  const list = (await A('/lists', { method: 'POST', body: { projectId: project.id, name: `List ${TAG}` } })).data
  if (!list?.id) throw new Error('could not make a list')
  const task = (await A('/tasks', { method: 'POST', body: { listId: list.id, title: `Subject ${TAG}` } })).data
  if (!task?.id) throw new Error('could not make a task')

  // ── Replace the pipeline. Create the four first, then delete every default,
  //    reassigning the task onto `Icebox` on the way. ───────────────────────
  const made = []
  for (const s of RENAMED) {
    const r = await A(`/lists/${list.id}/statuses`, {
      method: 'POST',
      body: { name: s.name, category: s.category },
    })
    if (r.status >= 400) throw new Error(`could not add status ${s.name}: ${r.status} ${r.error ?? ''}`)
    made.push(r.data)
  }
  const icebox = made.find((s) => s.key === 'icebox')
  if (!icebox) throw new Error(`the renamed pipeline did not come back: ${made.map((s) => s?.key).join(',')}`)
  const before = (await A(`/lists/${list.id}/statuses`)).data ?? []
  for (const s of before.filter((r) => DEFAULT_KEYS.includes(r.key))) {
    const r = await A(`/lists/${list.id}/statuses/${s.id}?reassignToStatusId=${icebox.id}`, { method: 'DELETE' })
    if (r.status >= 400) throw new Error(`could not drop default status ${s.key}: ${r.status}`)
  }

  const pipeline = (await A(`/lists/${list.id}/statuses`)).data ?? []
  const keys = pipeline.map((s) => s.key)

  console.log('\n▶ the fixture: a list whose statuses are its own')
  chk(
    keys.length === RENAMED.length && RENAMED.every((s) => keys.includes(s.key)),
    `the list's pipeline is ${keys.join(' → ')} — no default key left`,
    `the pipeline is ${keys.join(',')}, so the checks below would be measuring the defaults`,
  )
  chk(
    keys.every((k) => !DEFAULT_KEYS.includes(k)),
    'and none of `backlog/todo/in_progress/in_review/done/cancelled` survives it',
    `default keys are still on this list: ${keys.filter((k) => DEFAULT_KEYS.includes(k)).join(',')}`,
  )

  const seeded = (await A(`/tasks/${task.id}`)).data
  chk(
    seeded?.status === 'icebox',
    'and the task sits on the first of them',
    `the task reads "${seeded?.status}", so "next" would be computed from somewhere else`,
  )

  // ── The browser ──────────────────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${stack.base}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ME.email)
  await page.fill('input[type=password]', ME.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  const settleCookies = async () => {
    const accept = page.locator('button:has-text("Accept")').first()
    if (await accept.isVisible().catch(() => false)) await accept.click().catch(() => {})
  }
  await settleCookies()

  const openTask = async () => {
    await page.goto(
      `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${list.id}?task=${task.id}`,
      { waitUntil: 'domcontentloaded' },
    )
    await settleCookies()
    const ready = await waitUntil(
      () => page.getByTestId('task-tab-overview').isVisible().catch(() => false),
      { timeoutMs: 25_000 },
    )
    if (!ready) throw new Error('the task sheet never mounted')
    await settleCookies()
  }
  await openTask()

  const next = page.getByTestId('task-status-next')
  const complete = page.getByTestId('task-status-complete')
  // The statuses arrive over the wire; poll the attribute the check reads
  // rather than a container that is rendered either way.
  await waitUntil(async () => (await next.getAttribute('data-next-status')) === 'cooking', { timeoutMs: 20_000 })

  console.log('\n▶ frame `15:20` — the ▶ and the ✓ exist at all')
  chk(
    await next.isVisible().catch(() => false),
    'the status field carries a one-click advance button',
    'no advance button — the status is still a `<select>` and nothing else',
  )
  chk(
    await complete.isVisible().catch(() => false),
    'and a separate mark-complete button beside it',
    'no mark-complete button; the frame draws it apart from the pill for a reason',
  )

  console.log("\n▶ and both resolve against THIS LIST's pipeline")
  const nextKey = await next.getAttribute('data-next-status')
  chk(
    nextKey === 'cooking',
    'the advance button will write `cooking` — the list\'s own second status',
    `it will write "${nextKey}"; on a list of Icebox/Cooking/Shipped/Binned the only ` +
      'right answer from Icebox is `cooking`',
  )
  const completeKey = await complete.getAttribute('data-complete-status')
  chk(
    completeKey === 'shipped',
    'and the ✓ will write `shipped` — the FIRST status in the closed category',
    `it will write "${completeKey}"; `
      + (completeKey === 'done'
        ? 'that is the default pipeline\'s key and this list has not got it — the control is a facade'
        : 'the first closed status here is `shipped`'),
  )

  console.log('\n▶ pressing ▶ advances the task, on the server')
  await next.click()
  const advanced = await waitUntil(
    async () => ((await A(`/tasks/${task.id}`)).data?.status === 'cooking'),
    { timeoutMs: 15_000 },
  )
  chk(advanced, 'the task is `cooking` when read back from the API',
    `after pressing ▶ the server still holds "${(await A(`/tasks/${task.id}`)).data?.status}"`)

  const afterOne = (await A(`/tasks/${task.id}`)).data
  chk(
    afterOne?.statusCategory === 'in_progress',
    'and its category moved with it, so reports and Workload agree with the pill',
    `statusCategory is "${afterOne?.statusCategory}" while the status is "${afterOne?.status}" — ` +
      'the two disagree, which is the bug list-statuses.defaults.ts exists to prevent',
  )

  /*
   * PRESSED TWICE. A control that computes "next" once and remembers it would
   * pass the check above and write `cooking` again here. The second press has
   * to land on `shipped`, which is a different key from the first.
   */
  await waitUntil(async () => (await next.getAttribute('data-next-status')) === 'shipped', { timeoutMs: 15_000 })
  const secondKey = await next.getAttribute('data-next-status')
  chk(
    secondKey === 'shipped',
    'from `cooking` the same button now offers `shipped` — it reads the current status, not a constant',
    `the button still offers "${secondKey}" after the task moved; it is not recomputing`,
  )
  await next.click()
  const advancedTwice = await waitUntil(
    async () => ((await A(`/tasks/${task.id}`)).data?.status === 'shipped'),
    { timeoutMs: 15_000 },
  )
  chk(advancedTwice, 'and pressing it again really writes `shipped`',
    `the second press left the server on "${(await A(`/tasks/${task.id}`)).data?.status}"`)

  console.log('\n▶ the ✓ is off once the task is already closed, and the ▶ stops at the end')
  await waitUntil(async () => (await complete.getAttribute('data-already-complete')) === 'true', { timeoutMs: 15_000 })
  chk(
    (await complete.getAttribute('data-already-complete')) === 'true'
      && (await complete.isDisabled().catch(() => false)),
    'a task on a closed status cannot be "marked complete" again',
    'the ✓ is still live on a closed task, so pressing it writes the status it already has',
  )

  // Walk it to the LAST status, where there is no next.
  const binned = pipeline.find((s) => s.key === 'binned')
  const moved = await A(`/tasks/${task.id}`, { method: 'PATCH', body: { status: binned.key } })
  chk(moved.status < 400, 'the list accepts its own last status over the API',
    `PATCH to "${binned.key}" answered ${moved.status} ${moved.error ?? ''}`)
  await openTask()
  const atEnd = await waitUntil(
    async () => (await page.getByTestId('task-status-next').getAttribute('data-next-status')) === '',
    { timeoutMs: 20_000 },
  )
  chk(
    atEnd && (await page.getByTestId('task-status-next').isDisabled().catch(() => false)),
    'on the last status the ▶ resolves to nothing and is disabled — it does not wrap round to the start',
    'the ▶ still offers a status on the last rung; wrapping would send a finished task back to the top',
  )

  console.log('\n▶ and the ✓ on a list with no closed status at all')
  const openOnly = (await A('/lists', { method: 'POST', body: { projectId: project.id, name: `Open-only ${TAG}` } })).data
  const openTaskRow = (await A('/tasks', { method: 'POST', body: { listId: openOnly.id, title: `Open-only subject ${TAG}` } })).data
  const openStatus = (await A(`/lists/${openOnly.id}/statuses`, { method: 'POST', body: { name: 'Thinking', category: 'open' } })).data
  if (!openStatus?.id) throw new Error('could not add the open-only status')
  const openDefaults = (await A(`/lists/${openOnly.id}/statuses`)).data ?? []
  for (const s of openDefaults.filter((r) => DEFAULT_KEYS.includes(r.key))) {
    await A(`/lists/${openOnly.id}/statuses/${s.id}?reassignToStatusId=${openStatus.id}`, { method: 'DELETE' })
  }
  await page.goto(
    `${stack.base}/app/${workspaceId}/${space.id}/${project.id}/${openOnly.id}?task=${openTaskRow.id}`,
    { waitUntil: 'domcontentloaded' },
  )
  await settleCookies()
  await waitUntil(() => page.getByTestId('task-tab-overview').isVisible().catch(() => false), { timeoutMs: 25_000 })
  const noClosed = await waitUntil(
    async () => (await page.getByTestId('task-status-complete').getAttribute('data-complete-status')) === '',
    { timeoutMs: 20_000 },
  )
  chk(
    noClosed && (await page.getByTestId('task-status-complete').isDisabled().catch(() => false)),
    'a list with no closed status disables the ✓ rather than inventing `done`',
    'the ✓ resolved to a key on a list that has no closed status — it is writing a constant',
  )
} catch (err) {
  failed += 1
  const frame = String(err?.stack ?? '').split('\n').find((l) => l.includes('task-header-status.mjs'))
  console.error('\n\x1b[31mSUITE ERROR\x1b[0m', err?.message ?? err, frame ? `\n  at ${frame.trim()}` : '')
} finally {
  await browser.close().catch(() => {})
  stack?.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(
      `\n✗ only ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, ` +
        'so "0 failed" describes the part it reached and nothing else.',
    )
    process.exit(1)
  }
  process.exit(failed === 0 ? 0 : 1)
}
