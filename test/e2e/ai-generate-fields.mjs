/**
 * The AI page's Generate task offers the chosen list's fields, and no other
 * (`found-30-sep/ai-page-fields-checked-only-by-a-unit`).
 *
 * The Generate tab asks the model for a task and offers a box for each custom
 * field the task will have. A field scoped to another list is one the task
 * made here will not have, and its route refuses a value for it
 * (`found-30-sep/field-route-takes-another-projects-field`); `fieldsOfList`
 * keeps it out, and until this suite only `field-scope.test.ts` said so —
 * the boxes appear after a model has answered, and no suite drove the page
 * that far.
 *
 * A project of this run's own: a field for the whole project, one scoped to
 * the list chosen and one scoped to the other list. Where a model answers
 * (the lane's stub, `model-stub.mjs`), the stub is staged to suggest a value
 * for all three, and the page is read for what it offers, what it asked the
 * model about and what saving writes. Where none answers (CI), the page says
 * so, offers nothing and saves nothing. Three checks either way, so the run's
 * length says nothing about which configuration it met.
 *
 *   node test/e2e/ai-generate-fields.mjs --api 3025 --dist /tmp/claude-0/dist-5
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { apiClient, login, pickWorkspace } from './lib/fixture.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { waitUntil } from './lib/wait.mjs'
import { openDb } from './lib/db.mjs'

const chromium = await resolveChromium()
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". Exact, so a skipped branch is a failure. */
const EXPECTED_CHECKS = 4

const EMAIL = process.env.E2E_EMAIL ?? 'admin@rundesk.internal'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin@123!'
const REPO = path.resolve(import.meta.dirname, '../..')
const TAG = `e2e-aigf-${Date.now()}`

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
/* The lane's model stub (92k beside the API on 302k), asked only where `/ai/status` says a model answers. */
const MODEL = `http://127.0.0.1:${argOf('--model', process.env.E2E_MODEL_PORT ?? String(9200 + (API_PORT - 3020)))}`

let stack = null
let B = (process.env.BASE ?? '').replace(/\/$/, '')
if (!B) {
  stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
  B = stack.base
}

const results = []
const ok = (m) => { results.push(1); console.log(`  \x1b[32mPASS\x1b[0m ${m}`) }
const bad = (m) => { results.push(0); console.log(`  \x1b[31mFAIL\x1b[0m ${m}`) }
const chk = (c, good, badMsg) => (c ? ok(good) : bad(badMsg && badMsg !== good ? `${good} — ${badMsg}` : good))

const auth = await login(`${B}/api/v1`, EMAIL, PASSWORD)
const api = apiClient(`${B}/api/v1`, auth.accessToken)
const WS = process.env.E2E_WS ?? (await pickWorkspace(api)).id

/** The stub's control routes; false where it does not answer, which the checks then say. */
const stub = (route, body) =>
  fetch(`${MODEL}/__control/${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)

let sql = null
let browser = null
let ctx = null

try {
  sql = await openDb()
  console.log('\n▶ a project with a field for all of it, one for the list chosen and one for the other list')
  const space = (await api('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} space` } })).data?.id
  const project = space ? (await api('/projects', { method: 'POST', body: { spaceId: space, name: `${TAG} folder` } })).data?.id : null
  const chosen = project ? (await api('/lists', { method: 'POST', body: { projectId: project, name: `${TAG} chosen` } })).data?.id : null
  const other = project ? (await api('/lists', { method: 'POST', body: { projectId: project, name: `${TAG} other` } })).data?.id : null
  const field = async (name, listId) =>
    project
      ? (await api(`/workspaces/${WS}/projects/${project}/custom-fields`, { method: 'POST', body: { name, type: 'text', ...(listId ? { listId } : {}) } })).data?.id ?? null
      : null
  const NAMES = { whole: `Whole ${TAG}`, here: `Here ${TAG}`, there: `There ${TAG}` }
  const whole = await field(NAMES.whole, null)
  const here = await field(NAMES.here, chosen)
  const there = await field(NAMES.there, other)
  chk(
    !!(space && project && chosen && other && whole && here && there),
    'the fixture is made: a project of two lists, a field for all of it and one scoped to each list',
    `space ${space}, project ${project}, lists ${chosen}/${other}, fields ${whole}/${here}/${there}`,
  )

  const aiStatus = await api('/ai/status')
  const modelConfigured = aiStatus.status === 200 && aiStatus.data?.available === true
  console.log(`  · /ai/status says a model is ${modelConfigured ? `configured (stub ${MODEL})` : 'not configured'}`)
  const TITLE = `Generated ${TAG}`
  if (modelConfigured) {
    await stub('reset', {})
    await stub('next', {
      text: JSON.stringify({
        title: TITLE,
        description: 'A task the stub was staged to suggest.',
        subtasks: [],
        priority: 'normal',
        estimatedHours: null,
        customFieldValues: [
          { fieldName: NAMES.whole, value: 'whole value' },
          { fieldName: NAMES.here, value: 'here value' },
          { fieldName: NAMES.there, value: 'there value' },
        ],
      }),
    })
  }

  browser = await chromium.launch(launchOptions())
  ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click().catch(() => {})
  await page.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('ai-tab-generate').click({ timeout: 20_000 }).catch(() => {})
  const listPicker = page.getByTestId('ai-generate-list')
  await waitUntil(async () => (await listPicker.locator(`option[value="${chosen}"]`).count().catch(() => 0)) === 1, { timeoutMs: 30_000 })
  await listPicker.selectOption(chosen, { timeout: 10_000 }).catch(() => {})
  await page.getByTestId('ai-generate-prompt').fill(`a task about ${TAG}`, { timeout: 10_000 }).catch(() => {})
  await page.getByTestId('ai-generate-submit').click({ timeout: 10_000 }).catch(() => {})
  const boxOf = (id) => page.getByTestId(`ai-generate-field-${id}`).filter({ visible: true })

  if (modelConfigured) {
    console.log('\n▶ where a model answers: what Generate offers, asks and saves')
    const answered = await waitUntil(() => page.getByTestId('ai-generate-result').isVisible().catch(() => false), { timeoutMs: 30_000 })
    const offered = {
      whole: await boxOf(whole).count().catch(() => -1),
      here: await boxOf(here).count().catch(() => -1),
      there: await page.getByTestId(`ai-generate-field-${there}`).count().catch(() => -1),
    }
    const prefilled = {
      whole: await boxOf(whole).locator('input').inputValue({ timeout: 3000 }).catch(() => null),
      here: await boxOf(here).locator('input').inputValue({ timeout: 3000 }).catch(() => null),
    }
    chk(
      answered && offered.whole === 1 && offered.here === 1 && offered.there === 0 && prefilled.whole === 'whole value' && prefilled.here === 'here value',
      'Generate offers a box for the project’s field and the chosen list’s, each filled with the model’s suggestion, and none for the field scoped to the other list',
      `the answer ${answered ? 'came' : 'never came'}; boxes offered ${JSON.stringify(offered)}, filled ${JSON.stringify(prefilled)}`,
    )
    const seen = await stub('seen')
    const asked = (seen?.calls ?? []).map((c) => (typeof c.system === 'string' ? c.system : JSON.stringify(c.system))).find((s) => s.includes(TAG.split('-').pop())) ?? ''
    chk(
      asked.includes(NAMES.whole) && asked.includes(NAMES.here) && !asked.includes(NAMES.there),
      'and the model is asked about those two fields only: the other list’s field is not in its prompt',
      asked ? `the prompt named ${JSON.stringify([NAMES.whole, NAMES.here, NAMES.there].filter((n) => asked.includes(n)))}` : `the stub at ${MODEL} saw no prompt naming this run’s fields`,
    )
    await page.getByTestId('ai-generate-save').click({ timeout: 10_000 }).catch(() => {})
    // The task row is written first and its values after it, one request each: wait for the values.
    let made = []
    let values = {}
    await waitUntil(async () => {
      made = await sql`select id from tasks where list_id = ${chosen} and title = ${TITLE}`
      if (made.length !== 1) return false
      values = Object.fromEntries((await sql`select field_id, value from custom_field_values where task_id = ${made[0].id}`).map((r) => [r.field_id, r.value?.v ?? r.value]))
      return whole in values && here in values
    }, { timeoutMs: 20_000 })
    const refused = await page.getByTestId('ai-generate-save-error').filter({ visible: true }).count().catch(() => 0)
    chk(
      made.length === 1 && values[whole] === 'whole value' && values[here] === 'here value' && !(there in values) && refused === 0,
      'and saving makes the task in the chosen list holding those two values, none for the other list’s field, and refused nothing (read by SQL)',
      `${made.length} task(s) so titled in the chosen list; its values ${JSON.stringify(values)}; ${refused} refusal(s) shown`,
    )
    await stub('reset', {})
  } else {
    console.log('\n▶ where no model answers: Generate says so, and offers and saves nothing')
    let said = ''
    await waitUntil(
      async () => (said = (await page.locator('[data-sonner-toast]').filter({ visible: true }).allInnerTexts().catch(() => [])).join(' | ')).length > 0,
      { timeoutMs: 20_000 },
    )
    const result = await page.getByTestId('ai-generate-result').count().catch(() => -1)
    chk(
      /not configured/i.test(said) && result === 0,
      'Generate says AI is not configured, and draws no answer to fill',
      `the page said ${JSON.stringify(said)}; ${result} answer card(s)`,
    )
    const direct = await api('/ai/task/generate', { method: 'POST', body: { prompt: `a task about ${TAG}`, workspaceId: WS } })
    chk(
      direct.status === 503,
      'and the route refuses the ask, 503, so no field is offered from an answer nobody gave',
      `the route answered ${direct.status}`,
    )
    const made = await sql`select id from tasks where list_id = ${chosen}`
    chk(
      made.length === 0 && (await page.locator('[data-testid^="ai-generate-field-"]').count().catch(() => -1)) === 0,
      'and nothing is saved into the chosen list, and no field box is drawn (read by SQL)',
      `${made.length} task(s) in the chosen list`,
    )
  }
} catch (e) {
  bad(`threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  // The space was made through the API and is registered, so its project, lists, fields and tasks go with it at exit.
  await sql?.end({ timeout: 5 }).catch(() => {})
  await ctx?.close().catch(() => {})
  await browser?.close().catch(() => {})
}

const failed = () => results.filter((x) => !x).length
if (results.length !== EXPECTED_CHECKS) {
  console.log(`  \x1b[31mFAIL\x1b[0m ran ${results.length} checks, expected ${EXPECTED_CHECKS}`)
  results.push(0)
}
console.log(`\n${results.length - failed()} passed, ${failed()} failed`)
await stack?.close?.()
// An exit code, not `process.exit()`: a pipe keeps what is written (`check-suite-process-exit.mjs`).
process.exitCode = failed() ? 1 : 0
