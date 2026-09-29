/**
 * EVERY TASK PICKER FINDS A TASK BY ITS WORDS, WHEREVER IT IS IN THE WORKSPACE.
 *
 * `ledger-rows/defect-mention-picker-200-cap` and `commit-log/log-d85dcad-1`:
 * the @ Tasks tab, chat's two task pickers, merge, convert to subtask,
 * dependencies, a Tasks custom field and adding to a sprint each asked for the
 * NEWEST 200 tasks and filtered those in the browser. Task 201 answered "no
 * matches" however exactly it was typed; the custom field had no search at all,
 * and drew a chosen task outside the 200 as "unknown".
 *
 * Measured on a workspace of 236 tasks whose oldest — the one to find — is not
 * among the newest 200. The search is the server's (`q` on
 * `GET /tasks/workspace/:id`, before its limit), so it is checked there first —
 * including that `%` is a percent sign and not a wildcard — then in four pickers
 * on screen. All eight pickers share one hook (`lib/use-task-search.ts`).
 *
 *   node test/e2e/task-pickers-search.mjs --api 3011
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a branch that skipped is a failure. */
const EXPECTED_CHECKS = 8

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const FILLERS = 230

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `tps-${stamp}`
const NEEDLE = `${TAG} weathervane`
const chromium = await resolveChromium()
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
let api = null
let WS = null
let browser = null

try {
  const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
  // The fixture's apiClient NEVER THROWS — every call below is read off `status`.
  api = apiClient(`${B}/api/v1`, auth.accessToken)
  const made = await api('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const make = async (route, body, what) => {
    const res = await api(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${res.status}`)
    return res.data
  }
  const space = await make('/spaces', { workspaceId: WS, name: `${TAG} space`, defaultPermission: 'edit' }, 'the space')
  const project = await make('/projects', { spaceId: space.id, name: `${TAG} project` }, 'the project')
  const shelf = await make('/lists', { projectId: project.id, name: `${TAG} archive shelf` }, 'the shelf list')
  const desk = await make('/lists', { projectId: project.id, name: `${TAG} desk` }, 'the desk list')

  // The one to find FIRST, so every other task is newer than it.
  const needle = await make('/tasks', { listId: shelf.id, title: NEEDLE }, 'the needle')
  const parentOfSub = await make('/tasks', { listId: desk.id, title: `${TAG} a parent` }, 'a parent')
  const sub = await make('/tasks', { listId: desk.id, title: `${TAG} lighthouse subtask`, parentTaskId: parentOfSub.id }, 'a subtask')
  const percent = await make('/tasks', { listId: desk.id, title: `${TAG} 50% done` }, 'the percent task')
  const lookalike = await make('/tasks', { listId: desk.id, title: `${TAG} 5000 done` }, 'the lookalike')
  for (let i = 0; i < FILLERS; i += 10) {
    await Promise.all(
      Array.from({ length: Math.min(10, FILLERS - i) }, (_, j) =>
        make('/tasks', { listId: desk.id, title: `${TAG} filler ${String(i + j).padStart(3, '0')}` }, `filler ${i + j}`),
      ),
    )
  }
  const source = await make('/tasks', { listId: desk.id, title: `${TAG} the task being edited` }, 'the source task')
  const list = (query) => api(`/tasks/workspace/${WS}${query}`)

  // ══ 1. THE SERVER'S SEARCH ═══════════════════════════════════════════════
  console.log('\n▶ the listing searches before its limit')

  const newest200 = await list('?limit=200')
  const found = await list(`?q=${encodeURIComponent('weathervane')}&limit=50`)
  chk(
    newest200.status === 200 && (newest200.data ?? []).length === 200 && !(newest200.data ?? []).some((t) => t.id === needle.id) &&
      found.status === 200 && (found.data ?? []).length === 1 && found.data[0].id === needle.id,
    'the oldest task is not among the newest 200 — and its own word finds it, and only it',
    `newest 200: ${(newest200.data ?? []).length} rows, needle among them ${(newest200.data ?? []).some((t) => t.id === needle.id)}; the word found ${JSON.stringify((found.data ?? []).map((t) => t.title))}`,
  )
  const byPercent = await list(`?q=${encodeURIComponent('50% done')}`)
  chk(
    (byPercent.data ?? []).map((t) => t.id).join() === percent.id,
    'a % typed is a percent sign, not a wildcard',
    `"50% done" found ${JSON.stringify((byPercent.data ?? []).map((t) => t.title))} — "${lookalike.title}" is what a wildcard would add`,
  )
  const byList = await list(`?q=${encodeURIComponent('archive shelf')}`)
  chk(
    (byList.data ?? []).some((t) => t.id === needle.id) && !(byList.data ?? []).some((t) => t.id === source.id),
    'and a list’s name finds the tasks in it',
    `"archive shelf" found ${JSON.stringify((byList.data ?? []).map((t) => t.title).slice(0, 5))}`,
  )
  const subRow = ((await list(`?q=${encodeURIComponent('lighthouse')}`)).data ?? []).find((t) => t.id === sub.id)
  chk(
    subRow?.parentTaskId === parentOfSub.id,
    'a subtask says it is one, so the convert picker can leave it out',
    `the subtask's row: ${JSON.stringify(subRow ?? null)}`,
  )

  // ══ 2. ON SCREEN ═════════════════════════════════════════════════════════
  console.log('\n▶ four pickers find it by typing')

  const field = await api(`/workspaces/${WS}/projects/${project.id}/custom-fields`, { method: 'POST', body: { name: `${TAG} Related`, type: 'tasks' } })
  if (field.status >= 300 || !field.data?.id) throw new Error(`could not make the Tasks field: ${field.status}`)

  browser = await chromium.launch(launchOptions())
  const tab = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })).newPage()
  await tab.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await tab.fill('input[type=email]', EMAIL)
  await tab.fill('input[type=password]', PASSWORD)
  await tab.click('button[type=submit]')
  await tab.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await tab.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
  const openSource = async () => {
    await tab.goto(`${B}/app/${WS}/${space.id}/${project.id}/${desk.id}?task=${source.id}`, { waitUntil: 'domcontentloaded' })
    await waitUntil(() => tab.getByTestId('task-tab-overview').isVisible().catch(() => false), { timeoutMs: 30_000 })
  }
  const textsOf = (locator) => locator.filter({ visible: true }).allInnerTexts().catch(() => [])

  await openSource()
  // The composer is on the Comments tab.
  await tab.getByTestId('task-tab-comments').click({ timeout: 10_000 }).catch(() => {})
  const composer = tab.getByTestId('comment-input')
  await waitUntil(() => composer.isVisible().catch(() => false), { timeoutMs: 20_000 })
  // The search is HELD until the tab has been looked at while it is in
  // flight: "No matching tasks" there is a claim about the workspace made
  // before the workspace has answered.
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let held = false
  const SEARCH = (u) => u.pathname.endsWith(`/tasks/workspace/${WS}`) && u.searchParams.get('q') === 'weathervane'
  const hold = async (route) => {
    held = true
    await gate
    return route.continue().catch(() => {})
  }
  await tab.route(SEARCH, hold)
  await composer.fill('@@weathervane', { timeout: 10_000 }).catch(() => {})
  await waitUntil(async () => held && (await tab.getByTestId('mention-tasks-searching').count()) > 0, { timeoutMs: 15_000 })
  const searchingShown = await tab.getByTestId('mention-tasks-searching').count()
  const noneWhileSearching = await tab.getByTestId('mention-tasks-none').count()
  release()
  const mentionRows = tab.getByTestId('mention-task-row')
  await waitUntil(async () => (await textsOf(mentionRows)).some((x) => x.includes(NEEDLE)), { timeoutMs: 15_000 })
  await tab.unroute(SEARCH, hold).catch(() => {})
  const mentionTexts = await textsOf(mentionRows)
  chk(
    held && searchingShown > 0 && noneWhileSearching === 0 && mentionTexts.some((x) => x.includes(NEEDLE)),
    'typing @@ and its word in a comment shows the search in flight, not "no matching tasks" — and then offers the oldest task',
    `held ${held}; while searching: shapes ${searchingShown}, "no matching" ${noneWhileSearching}; then the Tasks tab offered ${JSON.stringify(mentionTexts.slice(0, 5))}`,
  )
  await composer.fill('', { timeout: 5000 }).catch(() => {})

  await tab.getByTestId('task-more-menu').click({ timeout: 15_000 }).catch(() => {})
  await tab.getByTestId('task-menu-merge').click({ timeout: 10_000 }).catch(() => {})
  await tab.getByTestId('task-merge-search').fill('weathervane', { timeout: 10_000 }).catch(() => {})
  const mergeRows = tab.getByTestId('task-merge-candidate')
  await waitUntil(async () => (await textsOf(mergeRows)).some((x) => x.includes(NEEDLE)), { timeoutMs: 15_000 })
  chk(
    (await textsOf(mergeRows)).some((x) => x.includes(NEEDLE)),
    'the merge dialog finds it',
    `it offered ${JSON.stringify((await textsOf(mergeRows)).slice(0, 5))}`,
  )
  await tab.keyboard.press('Escape')

  await openSource()
  await tab.getByTestId('task-more-menu').click({ timeout: 15_000 }).catch(() => {})
  await tab.getByTestId('task-menu-convert').click({ timeout: 10_000 }).catch(() => {})
  const convertSearch = tab.getByTestId('task-convert-search')
  const convertRows = tab.getByTestId('task-convert-candidate')
  await convertSearch.fill('lighthouse', { timeout: 10_000 }).catch(() => {})
  // The word matches only the subtask, so the search has ANSWERED when the
  // list is either empty or offers it — not before: the previous answer
  // stays on screen while the next one loads.
  const convertEmpty = tab.getByTestId('task-convert-empty')
  await waitUntil(
    async () => (await convertEmpty.count()) > 0 || (await textsOf(convertRows)).some((x) => x.includes('lighthouse subtask')),
    { timeoutMs: 15_000 },
  )
  const subAnswered = (await convertEmpty.count()) > 0
  const subOffered = (await textsOf(convertRows)).some((x) => x.includes('lighthouse subtask'))
  await convertSearch.fill('weathervane', { timeout: 10_000 }).catch(() => {})
  await waitUntil(async () => (await textsOf(convertRows)).some((x) => x.includes(NEEDLE)), { timeoutMs: 15_000 })
  chk(
    subAnswered && !subOffered && (await textsOf(convertRows)).some((x) => x.includes(NEEDLE)),
    'the convert dialog finds it — and never offers a subtask as a parent',
    `the subtask's word answered with an empty list ${subAnswered}, offered it ${subOffered}; for the needle's word it offered ${JSON.stringify((await textsOf(convertRows)).slice(0, 5))}`,
  )
  await tab.keyboard.press('Escape')

  await openSource()
  // Custom fields are on the Fields tab; the field is empty, and empty fields
  // may be collapsed behind a toggle.
  await tab.getByTestId('task-tab-fields').click({ timeout: 10_000 }).catch(() => {})
  const collapseToggle = tab.getByTestId('collapse-empty-fields').first()
  if ((await collapseToggle.getAttribute('aria-pressed', { timeout: 5000 }).catch(() => null)) === 'true') {
    await collapseToggle.click({ timeout: 10_000 }).catch(() => {})
  }
  const fieldRow = tab.getByTestId('custom-field-row').filter({ hasText: `${TAG} Related` })
  await fieldRow.getByTestId('cf-tasks-search').fill('weathervane', { timeout: 15_000 }).catch(() => {})
  const option = fieldRow.getByTestId(`cf-tasks-option-${needle.id}`)
  await option.click({ timeout: 15_000 }).catch(() => {})
  const chip = fieldRow.getByTestId(`cf-task-${needle.id}`)
  await waitUntil(async () => ((await chip.filter({ visible: true }).innerText({ timeout: 2000 }).catch(() => '')) ?? '').includes(NEEDLE), { timeoutMs: 15_000 })
  const chipText = ((await chip.filter({ visible: true }).innerText({ timeout: 5000 }).catch(() => '')) ?? '').trim()
  const stored = await api(`/workspaces/${WS}/tasks/${source.id}/custom-fields`)
  const storedValue = (stored.data ?? []).find((row) => row.definition?.id === field.data.id)?.value
  chk(
    chipText.includes(NEEDLE) && Array.isArray(storedValue) && storedValue.includes(needle.id),
    'a Tasks field finds it by search, relates it, and draws it by title',
    `chip ${JSON.stringify(chipText)}; stored ${JSON.stringify(storedValue)}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  if (api && WS) {
    const res = await api(`/workspaces/${WS}`, { method: 'DELETE' })
    if (res.status >= 300) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${res.status}`)
  }
  stack.close()
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
