/**
 * THE TEN FIELD TYPES THE LEDGER LEFT AS DECISIONS, AS CLICKUP WORKS THEM
 * (`commit-log/log-c980bee-1`, `ledger-rows/row-719`, `harness/ai-rows-blocked-on-empty-key`).
 *
 * ClickUp (help centre: "AI Fields", "Use Button Custom Fields", "Create
 * Relationship Custom Fields", "Custom Relationships"; read 12 October):
 *
 *   · AI fields live within Short Text, Long Text and Dropdown — Summary,
 *     Progress Updates, Action Items and Translation are Long Text, Sentiment
 *     Short Text, Categorize a Dropdown, and Custom Text and Custom Dropdown
 *     follow an instruction their maker writes. They fill on asking, fill new
 *     tasks when set to, and update when a task changes, every twenty minutes.
 *     They use AI credits.
 *   · A Button field, clicked on a task, runs the automation it triggers.
 *   · A Relationship is to "any task in your Workspace" or to "tasks from a
 *     specific List", chosen when it is made and kept; rollups show the
 *     related tasks' fields beside them.
 *
 * Measured before it was built (main's lanes, the tree before it): every AI
 * kind's settings were dropped (a `long_text` with `config.ai` saved as a plain
 * one), `button` was "Unknown custom field type", there was no generate and no
 * press route (404), and a Relationship took any task in the workspace.
 *
 * Where a model answers (a lane's stub, `model-stub.mjs`) the AI fields are
 * read for what was asked and what was kept; where none answers (CI) for the
 * refusal, said in words and recorded, and for nothing kept. The same number
 * of checks either way.
 *
 * A workspace of this run's own: Olga owns it; Mia and Vic are members.
 *
 *   node test/e2e/ai-button-relationship-fields.mjs --api 3030 --dist /tmp/claude-0/dist-10
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 17

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
/* The lane's model stub (92k beside the API on 302k), asked only where `/ai/status` says a model answers. */
const MODEL = `http://127.0.0.1:${argOf('--model', process.env.E2E_MODEL_PORT ?? String(9200 + (API_PORT - 3020)))}`

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

// The API's own words.
const SAID = {
  notConfigured: 'AI features are not configured',
  notAi: 'This field is not an AI field — only an AI field is generated',
  buttonHoldsNothing: 'A Button is pressed, not set — it holds no value',
  notAButton: 'This field is not a Button — only a Button is pressed',
  buttonTrigger: 'A “button is pressed” trigger names the Button field it waits for',
  listKept: 'A Relationship’s list is chosen when the field is made, and cannot be changed',
  rollupsNeedList: 'Rollups come from the fields of the list a Relationship is limited to — choose its list first',
  notInList: 'Those tasks are not in the list this Relationship is limited to',
}

const stamp = Date.now()
const TAG = `abr${stamp}`
const PASSWORD = 'FieldTypes@12345!'

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
/* NEVER THROWS — `{status, data, error, message}`. Every call site reads `status`. */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`

/** The stub's control routes; null where it does not answer. */
const stub = (route, body) =>
  fetch(`${MODEL}/__control/${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
const seenCalls = async () => (await stub('seen'))?.calls ?? []
const systemOf = (call) => (typeof call.system === 'string' ? call.system : JSON.stringify(call.system ?? ''))
const userOf = (call) => JSON.stringify(call.messages ?? [])

let sql = null
let WS = null
let A = null
let browser = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the values, runs and usage are read back by SQL')
  const owner = await signUpApi(API, { fullName: `olga ${stamp}`, email: `${TAG}-olga@rundesk.invalid`, password: PASSWORD, organizationName: `Fields olga ${stamp}`, organizationSlug: `fields-olga-${stamp}` })
  A = apiAs(owner.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: `Fields ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `${who} ${stamp}`, email, password: PASSWORD, organizationName: `Fields ${who} ${stamp}`, organizationSlug: `fields-${who}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add ${who}: ${said(added)}`)
    return { email, id: signed.user.id, api: apiAs(signed.accessToken) }
  }
  const mia = await person('mia', 'member')
  const M = mia.api
  const must = (res, what) => { if (!res.ok || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`); return res.data }

  const space = must(await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} team`, defaultPermission: 'admin' } }), 'the team space')
  const work = must(await A('/projects', { method: 'POST', body: { spaceId: space.id, name: `${TAG} work` } }), 'the work folder')
  const launch = must(await A('/lists', { method: 'POST', body: { projectId: work.id, name: `${TAG} launch` } }), 'the launch list')
  const crm = must(await A('/projects', { method: 'POST', body: { spaceId: space.id, name: `${TAG} crm` } }), 'the crm folder')
  const clients = must(await A('/lists', { method: 'POST', body: { projectId: crm.id, name: `${TAG} Clients` } }), 'the Clients list')
  const viewSpace = must(await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} view only`, defaultPermission: 'view' } }), 'the view-only space')
  const viewProject = must(await A('/projects', { method: 'POST', body: { spaceId: viewSpace.id, name: `${TAG} read` } }), 'the view-only folder')
  const viewList = must(await A('/lists', { method: 'POST', body: { projectId: viewProject.id, name: `${TAG} read only` } }), 'the view-only list')

  const TITLE = `Plan the launch ${TAG}`
  const DESCRIPTION = `Draft the plan and book the venue for ${TAG}.`
  const T = must(await M('/tasks', { method: 'POST', body: { listId: launch.id, title: TITLE, description: DESCRIPTION } }), 'Mia’s task').id
  const COMMENT = `Venue booked for ${TAG}`
  const commented = await M(`/tasks/${T}/comments`, { method: 'POST', body: { body: COMMENT } })
  if (!commented.ok) throw new Error(`could not comment: ${said(commented)}`)
  const R = must(await A('/tasks', { method: 'POST', body: { listId: viewList.id, title: `Read me ${TAG}` } }), 'the view-only task').id
  const clientA = must(await A('/tasks', { method: 'POST', body: { listId: clients.id, title: `Acme ${TAG}` } }), 'the first client').id
  const clientB = must(await A('/tasks', { method: 'POST', body: { listId: clients.id, title: `Globex ${TAG}` } }), 'the second client').id
  const privateClient = await A(`/tasks/${clientB}`, { method: 'PATCH', body: { visibility: 'private' } })
  if (!privateClient.ok) throw new Error(`could not make the second client private: ${said(privateClient)}`)
  const outside = must(await A('/tasks', { method: 'POST', body: { listId: launch.id, title: `Outside ${TAG}` } }), 'a task outside Clients').id

  const fieldOn = (projectId, body) => A(`/workspaces/${WS}/projects/${projectId}/custom-fields`, { method: 'POST', body })
  const valueRow = async (taskId, fieldId) =>
    (await sql`select value from custom_field_values where task_id = ${taskId} and field_id = ${fieldId}`)[0]?.value?.v ?? null
  const usage = async (feature, userId) =>
    sql`select status, error_code from ai_usage where workspace_id = ${WS} and feature = ${feature} and user_id = ${userId} order by created_at`
  const generate = (api, taskId, fieldId) => api(`/workspaces/${WS}/tasks/${taskId}/custom-fields/${fieldId}/generate`, { method: 'POST' })

  const aiStatus = await A('/ai/status')
  const MODEL_ON = aiStatus.status === 200 && aiStatus.data?.available === true
  console.log(`  · /ai/status says a model is ${MODEL_ON ? `configured (stub ${MODEL})` : 'not configured'}`)
  if (MODEL_ON) await stub('reset', {})

  // ══ 1. THE EIGHT AI FIELDS, EACH IN THE TYPE CLICKUP PUTS IT IN ═══════════════
  console.log('\n▶ the AI fields are made within Short Text, Long Text and Dropdown')
  const OPTIONS = [{ label: 'Bug', value: 'bug' }, { label: 'Feature', value: 'feature' }, { label: 'Question', value: 'question' }]
  const AI = {}
  const aiField = async (key, type, ai, extra = {}) => {
    const res = await fieldOn(work.id, { name: `${key} ${TAG}`, type, config: { ai }, ...extra })
    AI[key] = res.data?.id ?? null
    return res
  }
  const madeAi = [
    await aiField('Summary', 'long_text', { kind: 'summary', autofill: true }),
    await aiField('Progress', 'long_text', { kind: 'progress_updates' }),
    await aiField('Actions', 'long_text', { kind: 'action_items' }),
    await aiField('French', 'long_text', { kind: 'translation', language: 'French' }),
    await aiField('Mood', 'text', { kind: 'sentiment', autoUpdate: true }),
    await aiField('Kind', 'dropdown', { kind: 'categorize' }, { options: OPTIONS }),
    await aiField('Pitch', 'text', { kind: 'custom_text', prompt: 'Write a one-line pitch for the launch' }),
    await aiField('Risk', 'dropdown', { kind: 'custom_dropdown', prompt: 'How risky is this task?' }, { options: [{ label: 'Low', value: 'low' }, { label: 'High', value: 'high' }] }),
  ]
  const kinds = await sql`select name, type, config->'ai'->>'kind' as kind from custom_field_definitions where project_id = ${work.id} and config ? 'ai' order by name`
  const wrongBase = await fieldOn(work.id, { name: `Wrong ${TAG}`, type: 'long_text', config: { ai: { kind: 'categorize' } } })
  const noPrompt = await fieldOn(work.id, { name: `No prompt ${TAG}`, type: 'text', config: { ai: { kind: 'custom_text' } } })
  const noLanguage = await fieldOn(work.id, { name: `No language ${TAG}`, type: 'long_text', config: { ai: { kind: 'translation' } } })
  const kindOf = Object.fromEntries(kinds.map((k) => [k.name.replace(` ${TAG}`, ''), `${k.type}:${k.kind}`]))
  chk(
    madeAi.every((r) => r.status === 201) && kinds.length === 8
      && kindOf.Summary === 'long_text:summary' && kindOf.Progress === 'long_text:progress_updates' && kindOf.Actions === 'long_text:action_items'
      && kindOf.French === 'long_text:translation' && kindOf.Mood === 'text:sentiment' && kindOf.Kind === 'dropdown:categorize'
      && kindOf.Pitch === 'text:custom_text' && kindOf.Risk === 'dropdown:custom_dropdown'
      && wrongBase.status === 400 && /is a dropdown field, not long text/.test(wrongBase.message ?? '')
      && noPrompt.status === 400 && /instruction/.test(noPrompt.message ?? '')
      && noLanguage.status === 400 && /language/.test(noLanguage.message ?? ''),
    'the eight AI fields are made, each within the type ClickUp puts it in (read by SQL) — and a kind in the wrong type, a custom field without its instruction and a translation without its language are refused in words',
    JSON.stringify({ made: madeAi.map((r) => r.status), kinds: kindOf, wrongBase: said(wrongBase), noPrompt: said(noPrompt), noLanguage: said(noLanguage) }),
  )

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const signIn = async (email) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type=email]', email)
    await page.fill('input[type=password]', PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
    await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})
    return page
  }
  const openFields = async (page, taskId, list = launch, project = work) => {
    await page.goto(`${B}/app/${WS}/${space.id}/${project.id}/${list.id}?task=${taskId}`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('task-tab-fields').click({ timeout: 20_000 }).catch(() => {})
    await page.getByTestId('task-field-create-open').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  }

  // ══ 2. THE SHEET MAKES ONE ═══════════════════════════════════════════════════
  console.log('\n▶ an AI field is made from the task sheet')
  const miaPage = await signIn(mia.email)
  await openFields(miaPage, T)
  await miaPage.getByTestId('task-field-create-open').click({ timeout: 10_000 }).catch(() => {})
  const offeredAi = await miaPage.locator('[data-testid="task-field-create-type"] option[value^="ai:"]').count().catch(() => 0)
  await miaPage.getByTestId('task-field-create-name').fill(`Sheet summary ${TAG}`).catch(() => {})
  await miaPage.getByTestId('task-field-create-type').selectOption('ai:custom_text').catch(() => {})
  const promptBox = await miaPage.getByTestId('task-field-create-ai-prompt').isVisible().catch(() => false)
  await miaPage.getByTestId('task-field-create-ai-prompt').fill('Say what is left to do').catch(() => {})
  await miaPage.getByTestId('task-field-create-ai-autoupdate').check().catch(() => {})
  await miaPage.getByTestId('task-field-create-submit').click({ timeout: 8000 }).catch(() => {})
  let sheetMade = []
  await waitUntil(async () => {
    sheetMade = await sql`select type, config from custom_field_definitions where project_id = ${work.id} and name = ${`Sheet summary ${TAG}`}`
    return sheetMade.length === 1
  }, { timeoutMs: 15_000 }).catch(() => {})
  const sm = sheetMade[0]
  chk(
    offeredAi === 8 && promptBox && sm?.type === 'long_text' && sm?.config?.ai?.kind === 'custom_text'
      && sm?.config?.ai?.prompt === 'Say what is left to do' && sm?.config?.ai?.autoUpdate === true && sm?.config?.ai?.autofill === false,
    'the sheet’s field picker offers the eight AI fields, asks a custom one for its instruction, and makes it as a Long Text with its settings (read by SQL)',
    JSON.stringify({ offeredAi, promptBox, made: sm ?? null }),
  )

  // ══ 3. GENERATE: SUMMARY ═════════════════════════════════════════════════════
  console.log('\n▶ Generate fills the Summary from the task')
  if (MODEL_ON) {
    await stub('reset', {})
    await stub('next', { text: 'The launch plan is drafted and the venue is booked.' })
  }
  const sum = await generate(M, T, AI.Summary)
  const sumValue = await valueRow(T, AI.Summary)
  const sumUsage = await usage('custom_field.summary', mia.id)
  if (MODEL_ON) {
    const call = (await seenCalls()).find((c) => /Summary field/.test(systemOf(c)))
    chk(
      [200, 201].includes(sum.status) && sum.data?.value === 'The launch plan is drafted and the venue is booked.'
        && sumValue === 'The launch plan is drafted and the venue is booked.'
        && !!call && userOf(call).includes(TITLE) && userOf(call).includes(DESCRIPTION) && userOf(call).includes(COMMENT)
        && sumUsage.length === 1 && sumUsage[0].status === 'succeeded',
      'Generate fills the Summary: the model was asked with the task’s title, description and comments, its answer is the field’s value (read by SQL), and the use is metered to the asker',
      JSON.stringify({ res: said(sum), value: sumValue, asked: !!call, usage: sumUsage }),
    )
  } else {
    chk(
      sum.status === 503 && sum.message === SAID.notConfigured && sumValue === null
        && sumUsage.length === 1 && sumUsage[0].status === 'failed' && sumUsage[0].error_code === 'not_configured',
      'Generate fills the Summary: the model was asked with the task’s title, description and comments, its answer is the field’s value (read by SQL), and the use is metered to the asker',
      `no model here: ${JSON.stringify({ res: said(sum), value: sumValue, usage: sumUsage })}`,
    )
  }

  // ══ 4. CATEGORIZE TAKES ONE OF ITS OPTIONS, AND NO OTHER ANSWER ══════════════
  console.log('\n▶ Categorize keeps one of its own options')
  if (MODEL_ON) await stub('next', { text: 'Feature' })
  const cat1 = await generate(M, T, AI.Kind)
  const cat1Value = await valueRow(T, AI.Kind)
  if (MODEL_ON) await stub('next', { text: 'Purple' })
  const cat2 = await generate(M, T, AI.Kind)
  const cat2Value = await valueRow(T, AI.Kind)
  if (MODEL_ON) {
    const asked = (await seenCalls()).filter((c) => /Categorize field/.test(systemOf(c)))
    chk(
      [200, 201].includes(cat1.status) && cat1Value === 'feature'
        && cat2.status === 502 && /not one of this field’s options/.test(cat2.message ?? '') && cat2Value === 'feature'
        && asked.length === 2 && asked.every((c) => systemOf(c).includes('Bug | Feature | Question')),
      'Categorize is asked to choose among its own options and keeps the one named (read by SQL); an answer that is none of them is refused in words (502) and the value stays',
      JSON.stringify({ first: said(cat1), v1: cat1Value, second: said(cat2), v2: cat2Value, asked: asked.length }),
    )
  } else {
    chk(
      cat1.status === 503 && cat2.status === 503 && cat1Value === null && cat2Value === null,
      'Categorize is asked to choose among its own options and keeps the one named (read by SQL); an answer that is none of them is refused in words (502) and the value stays',
      `no model here: ${JSON.stringify({ first: said(cat1), second: said(cat2), v: cat2Value })}`,
    )
  }

  // ══ 5. THE OTHER SIX KINDS ═══════════════════════════════════════════════════
  console.log('\n▶ Progress Updates, Action Items, Translation, Sentiment, Custom Text and Custom Dropdown')
  if (MODEL_ON) await stub('reset', {})
  const six = {}
  for (const key of ['Progress', 'Actions', 'French', 'Mood', 'Pitch', 'Risk']) {
    const res = await generate(M, T, AI[key])
    six[key] = { status: res.status, value: await valueRow(T, AI[key]), message: res.message }
  }
  if (MODEL_ON) {
    const calls = await seenCalls()
    const one = (re) => calls.find((c) => re.test(systemOf(c)))
    const progress = one(/Progress Updates field/)
    const translation = one(/Translation field/)
    const pitch = one(/custom AI field of a task/)
    const risk = one(/custom AI dropdown field/)
    chk(
      Object.values(six).every((r) => [200, 201].includes(r.status))
        && six.Progress.value === 'Stubbed progress: the latest comment was read.' && six.Actions.value === '- Stubbed first step\n- Stubbed second step'
        && six.French.value === 'Traduction factice de la tâche.' && six.Mood.value === 'Positive' && six.Pitch.value === 'Stubbed custom text.'
        && six.Risk.value === 'low'
        && !!progress && userOf(progress).includes(COMMENT) && !!translation && systemOf(translation).includes('French')
        && !!pitch && userOf(pitch).includes('Write a one-line pitch for the launch') && !!risk && userOf(risk).includes('How risky is this task?'),
      'the other six fill too, each asked in its own words — Progress Updates with the comments, Translation into its language, the custom ones with their instruction — and each keeps its answer in its own type (read by SQL)',
      JSON.stringify({ six, progress: !!progress, translation: !!translation, pitch: !!pitch, risk: !!risk }),
    )
  } else {
    chk(
      Object.values(six).every((r) => r.status === 503 && r.message === SAID.notConfigured && r.value === null),
      'the other six fill too, each asked in its own words — Progress Updates with the comments, Translation into its language, the custom ones with their instruction — and each keeps its answer in its own type (read by SQL)',
      `no model here: ${JSON.stringify(six)}`,
    )
  }

  // ══ 6. WHO MAY GENERATE, AND WHAT ═════════════════════════════════════════════
  console.log('\n▶ a reader is refused, as are a field that is not an AI field and one the task has not got')
  const readSummary = must(await fieldOn(viewProject.id, { name: `Read summary ${TAG}`, type: 'long_text', config: { ai: { kind: 'summary' } } }), 'the view-only AI field').id
  const plain = must(await fieldOn(work.id, { name: `Plain ${TAG}`, type: 'text' }), 'a plain text field').id
  const before = (await sql`select count(*)::int as n from ai_usage where workspace_id = ${WS} and user_id = ${mia.id}`)[0].n
  const reader = await generate(M, R, readSummary)
  const notAi = await generate(M, T, plain)
  const notHere = await generate(M, T, readSummary)
  const after = (await sql`select count(*)::int as n from ai_usage where workspace_id = ${WS} and user_id = ${mia.id}`)[0].n
  chk(
    reader.status === 403 && (await valueRow(R, readSummary)) === null
      && notAi.status === 400 && notAi.message === SAID.notAi && notHere.status === 404 && after === before,
    'a reader of the task is refused before any model is asked (403, nothing kept, no use recorded), as are a field that is not an AI field (400, in words) and an AI field the task has not got (404)',
    JSON.stringify({ reader: said(reader), notAi: said(notAi), notHere: said(notHere), usage: { before, after } }),
  )

  // ══ 7. AUTOFILL: A NEW TASK GETS ITS SUMMARY ═════════════════════════════════
  console.log('\n▶ a task made where an autofill field is gets its value')
  if (MODEL_ON) await stub('reset', {})
  const N = must(await M('/tasks', { method: 'POST', body: { listId: launch.id, title: `A new one ${TAG}`, description: `Made to be filled ${TAG}` } }), 'the new task').id
  let filled = null
  await waitUntil(async () => (filled = await valueRow(N, AI.Summary)) !== null, { timeoutMs: MODEL_ON ? 20_000 : 5_000 }).catch(() => {})
  const otherKinds = await sql`select count(*)::int as n from custom_field_values where task_id = ${N} and field_id = any(${[AI.Progress, AI.Actions, AI.French, AI.Kind, AI.Pitch, AI.Risk]})`
  if (MODEL_ON) {
    const asked = (await seenCalls()).filter((c) => /Summary field/.test(systemOf(c)) && userOf(c).includes(`A new one ${TAG}`))
    chk(
      filled === 'Stubbed summary: the task is under way.' && asked.length === 1 && otherKinds[0].n === 0,
      'a task made where a field set to fill new tasks is gets its value without anybody asking — that field’s, and no field not set to (read by SQL)',
      JSON.stringify({ filled, asked: asked.length, others: otherKinds[0].n }),
    )
  } else {
    chk(
      filled === null && otherKinds[0].n === 0,
      'a task made where a field set to fill new tasks is gets its value without anybody asking — that field’s, and no field not set to (read by SQL)',
      `no model here: nothing is filled, nothing asked — ${JSON.stringify({ filled })}`,
    )
  }

  // ══ 8. AUTO-UPDATE: A CHANGED TASK'S VALUE IS ASKED AGAIN, ONCE PER WAIT ══════
  console.log('\n▶ a task that changes gets its auto-updating field asked again, once for a burst of edits')
  if (MODEL_ON) await stub('reset', {})
  const moodBefore = await valueRow(T, AI.Mood)
  const NEW_DESCRIPTION = `The client is thrilled with the venue ${TAG}.`
  await M(`/tasks/${T}`, { method: 'PATCH', body: { description: NEW_DESCRIPTION } })
  await M(`/tasks/${T}`, { method: 'PATCH', body: { priority: 'high' } })
  if (MODEL_ON) await stub('next', { text: 'Negative' })
  let moodAfter = moodBefore
  await waitUntil(async () => (moodAfter = await valueRow(T, AI.Mood)) !== moodBefore, { timeoutMs: MODEL_ON ? 20_000 : 6_000 }).catch(() => {})
  if (MODEL_ON) {
    await new Promise((r) => setTimeout(r, 4000))
    const asked = (await seenCalls()).filter((c) => /Sentiment field/.test(systemOf(c)))
    chk(
      moodBefore === 'Positive' && moodAfter === 'Negative' && asked.length === 1 && userOf(asked[0]).includes(NEW_DESCRIPTION),
      'a field set to update when the task changes is asked again after an edit — with the edited description — and once for two edits in a row, not once each (read by SQL)',
      JSON.stringify({ moodBefore, moodAfter, asked: asked.length }),
    )
  } else {
    chk(
      moodBefore === null && moodAfter === null,
      'a field set to update when the task changes is asked again after an edit — with the edited description — and once for two edits in a row, not once each (read by SQL)',
      `no model here: nothing is asked again — ${JSON.stringify({ moodBefore, moodAfter })}`,
    )
  }

  // ══ 9. THE SHEET'S GENERATE ══════════════════════════════════════════════════
  console.log('\n▶ the sheet’s ✦ Generate')
  if (MODEL_ON) await stub('next', { text: 'From the sheet: drafted and booked.' })
  await openFields(miaPage, T)
  const genButton = miaPage.getByTestId(`cf-ai-generate-${AI.Summary}`)
  const offered = await genButton.isVisible().catch(() => false)
  await genButton.click({ timeout: 8000 }).catch(() => {})
  if (MODEL_ON) {
    let shown = ''
    await waitUntil(async () => {
      const row = miaPage.locator(`[data-field-id="${AI.Summary}"]`)
      shown = await row.locator('textarea, input').first().inputValue({ timeout: 2000 }).catch(() => '')
      return shown === 'From the sheet: drafted and booked.'
    }, { timeoutMs: 15_000 }).catch(() => {})
    chk(
      offered && shown === 'From the sheet: drafted and booked.' && (await valueRow(T, AI.Summary)) === 'From the sheet: drafted and booked.',
      'the sheet offers ✦ Generate on an AI field, and what the model wrote is drawn in the field and kept (read by SQL)',
      JSON.stringify({ offered, shown }),
    )
  } else {
    const error = (await miaPage.getByTestId(`cf-ai-error-${AI.Summary}`).filter({ visible: true }).innerText({ timeout: 10_000 }).catch(() => '')).trim()
    chk(
      offered && error === SAID.notConfigured && (await valueRow(T, AI.Summary)) === null,
      'the sheet offers ✦ Generate on an AI field, and what the model wrote is drawn in the field and kept (read by SQL)',
      `no model here: the sheet says why, in the server’s words — ${JSON.stringify({ offered, error })}`,
    )
  }

  // ══ 10. A BUTTON RUNS ITS AUTOMATION ═════════════════════════════════════════
  console.log('\n▶ pressing a Button runs the automation it triggers, and no other')
  const ship = must(await fieldOn(work.id, { name: `Ship ${TAG}`, type: 'button', config: { label: 'Ship it' } }), 'the Ship button')
  const other = must(await fieldOn(work.id, { name: `Other ${TAG}`, type: 'button' }), 'another button')
  const shipRule = await A(`/workspaces/${WS}/automations`, { method: 'POST', body: { name: `Ship ${TAG}`, trigger: { type: 'button.clicked', filters: { fieldId: ship.id } }, actions: [{ type: 'change_status', params: { status: 'in_progress' } }] } })
  const otherRule = await A(`/workspaces/${WS}/automations`, { method: 'POST', body: { name: `Other ${TAG}`, trigger: { type: 'button.clicked', filters: { fieldId: other.id } }, actions: [{ type: 'set_priority', params: { priority: 'urgent' } }] } })
  await sql`update tasks set status = 'todo', priority = 'normal' where id = ${T}`
  const pressed = await M(`/workspaces/${WS}/tasks/${T}/custom-fields/${ship.id}/press`, { method: 'POST' })
  const [afterPress] = await sql`select status, priority from tasks where id = ${T}`
  const runs = await sql`select context, outcome from automation_runs where automation_id = ${shipRule.data?.id ?? null}`
  const otherRuns = await sql`select count(*)::int as n from automation_runs where automation_id = ${otherRule.data?.id ?? null}`
  const setButton = await M(`/workspaces/${WS}/tasks/${T}/custom-fields/${ship.id}`, { method: 'PUT', body: { value: 'pressed' } })
  chk(
    shipRule.status === 201 && otherRule.status === 201 && ship.config?.label === 'Ship it'
      && [200, 201].includes(pressed.status) && pressed.data?.ran === 1
      && afterPress?.status === 'in_progress' && afterPress?.priority === 'normal'
      && runs.length === 1 && runs[0].outcome === 'success' && runs[0].context?.taskId === T && runs[0].context?.userId === mia.id
      && otherRuns[0].n === 0
      && setButton.status === 400 && setButton.message === SAID.buttonHoldsNothing,
    'pressing a Button on a task runs the automation it triggers for that task, as the presser (read by SQL) — not another Button’s — and a Button holds no value to set',
    JSON.stringify({ rules: [shipRule.status, otherRule.status], press: pressed.data ?? said(pressed), task: afterPress, runs, other: otherRuns[0].n, set: said(setButton) }),
  )

  // ══ 11. WHAT A BUTTON'S TRIGGER AND PRESS REFUSE ══════════════════════════════
  console.log('\n▶ a button rule names its Button; a reader cannot press; a field that is not a Button is not pressed')
  const noField = await A(`/workspaces/${WS}/automations`, { method: 'POST', body: { name: `Any ${TAG}`, trigger: { type: 'button.clicked', filters: {} }, actions: [] } })
  const notButtonRule = await A(`/workspaces/${WS}/automations`, { method: 'POST', body: { name: `Plain ${TAG}`, trigger: { type: 'button.clicked', filters: { fieldId: plain } }, actions: [] } })
  const readButton = must(await fieldOn(viewProject.id, { name: `Read button ${TAG}`, type: 'button' }), 'the view-only button').id
  const readRule = await A(`/workspaces/${WS}/automations`, { method: 'POST', body: { name: `Read ${TAG}`, trigger: { type: 'button.clicked', filters: { fieldId: readButton } }, actions: [{ type: 'set_priority', params: { priority: 'urgent' } }] } })
  const readerPress = await M(`/workspaces/${WS}/tasks/${R}/custom-fields/${readButton}/press`, { method: 'POST' })
  const readRuns = await sql`select count(*)::int as n from automation_runs where automation_id = ${readRule.data?.id ?? null}`
  const pressPlain = await M(`/workspaces/${WS}/tasks/${T}/custom-fields/${plain}/press`, { method: 'POST' })
  chk(
    noField.status === 400 && noField.message === SAID.buttonTrigger && notButtonRule.status === 400 && notButtonRule.message === SAID.buttonTrigger
      && readRule.status === 201 && readerPress.status === 403 && readRuns[0].n === 0
      && pressPlain.status === 400 && pressPlain.message === SAID.notAButton,
    'a “button is pressed” rule must name a Button (400, in words, for none or a field that is not one); a reader of the task is refused the press and nothing runs; a field that is not a Button is not pressed',
    JSON.stringify({ noField: said(noField), notButton: said(notButtonRule), readerPress: said(readerPress), readRuns: readRuns[0].n, plain: said(pressPlain) }),
  )

  // ══ 12. THE SHEET'S BUTTON ════════════════════════════════════════════════════
  console.log('\n▶ the sheet draws the Button with its words, says what pressing it ran, and makes one')
  await sql`update tasks set status = 'todo' where id = ${T}`
  await openFields(miaPage, T)
  const shipBtn = miaPage.getByTestId(`cf-button-${ship.id}`).filter({ visible: true })
  const shipWords = (await shipBtn.innerText({ timeout: 10_000 }).catch(() => '')).trim()
  await shipBtn.click({ timeout: 8000 }).catch(() => {})
  const shipSaid = miaPage.getByTestId(`cf-button-result-${ship.id}`).filter({ visible: true })
  const shipText = (await shipSaid.innerText({ timeout: 10_000 }).catch(() => '')).trim()
  const shipOk = await shipSaid.getAttribute('data-ok').catch(() => null)
  const [statusAfterSheet] = await sql`select status from tasks where id = ${T}`
  await miaPage.getByTestId('task-field-create-open').click({ timeout: 10_000 }).catch(() => {})
  await miaPage.getByTestId('task-field-create-name').fill(`Nothing set ${TAG}`).catch(() => {})
  await miaPage.getByTestId('task-field-create-type').selectOption('button').catch(() => {})
  await miaPage.getByTestId('task-field-create-button-label').fill('Try me').catch(() => {})
  await miaPage.getByTestId('task-field-create-submit').click({ timeout: 8000 }).catch(() => {})
  let lonely = []
  await waitUntil(async () => (lonely = await sql`select id, config from custom_field_definitions where project_id = ${work.id} and name = ${`Nothing set ${TAG}`} and type = 'button'`).length === 1, { timeoutMs: 15_000 }).catch(() => {})
  const lonelyId = lonely[0]?.id
  const lonelyBtn = miaPage.getByTestId(`cf-button-${lonelyId}`)
  await lonelyBtn.click({ timeout: 10_000 }).catch(() => {})
  const lonelyText = (await miaPage.getByTestId(`cf-button-result-${lonelyId}`).filter({ visible: true }).innerText({ timeout: 10_000 }).catch(() => '')).trim()
  chk(
    shipWords === 'Ship it' && /1 automation/.test(shipText) && shipOk === 'true' && statusAfterSheet?.status === 'in_progress'
      && lonely[0]?.config?.label === 'Try me' && /no automation runs when this button is pressed/.test(lonelyText),
    'the sheet draws a Button with its words; pressing it says one automation ran and the task changed (read by SQL); a Button made from the sheet with nothing set to run says so when pressed',
    JSON.stringify({ shipWords, shipText, shipOk, status: statusAfterSheet?.status, lonely: lonely[0]?.config ?? null, lonelyText }),
  )

  // ══ 13. THE AUTOMATION BUILDER OFFERS "A BUTTON IS PRESSED" ══════════════════
  console.log('\n▶ the automation builder waits for a chosen Button')
  const olgaPage = await signIn(`${TAG}-olga@rundesk.invalid`)
  await olgaPage.goto(`${B}/app/${WS}/automations`, { waitUntil: 'domcontentloaded' })
  await olgaPage.getByTestId('automations-new').click({ timeout: 20_000 }).catch(() => {})
  await olgaPage.getByTestId('automation-trigger-type').selectOption('button.clicked').catch(() => {})
  const picker = olgaPage.getByTestId('automation-trigger-button-field')
  await picker.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await waitUntil(async () => (await picker.locator(`option[value="${ship.id}"]`).count().catch(() => 0)) === 1, { timeoutMs: 15_000 }).catch(() => {})
  const offersShip = await picker.locator(`option[value="${ship.id}"]`).count().catch(() => 0)
  const offersOther = await picker.locator(`option[value="${other.id}"]`).count().catch(() => 0)
  const offersPlain = await picker.locator(`option[value="${plain}"]`).count().catch(() => 0)
  const submitBlocked = await olgaPage.getByTestId('automation-create-submit').isDisabled().catch(() => false)
  chk(
    offersShip === 1 && offersOther === 1 && offersPlain === 0 && submitBlocked,
    'the automation builder offers “A button is pressed” with the workspace’s Buttons to wait for — not other fields — and will not save one waiting for no Button',
    JSON.stringify({ offersShip, offersOther, offersPlain, submitBlocked }),
  )

  // ══ 14. A RELATIONSHIP LIMITED TO A LIST ═════════════════════════════════════
  console.log('\n▶ a Relationship limited to one list takes that list’s tasks, and keeps its list')
  const contract = must(await fieldOn(crm.id, { name: `Contract value ${TAG}`, type: 'number' }), 'the clients’ contract field').id
  const workNumber = must(await fieldOn(work.id, { name: `Work number ${TAG}`, type: 'number' }), 'a number field of another folder').id
  const rel = await fieldOn(work.id, { name: `Client ${TAG}`, type: 'tasks', config: { listId: clients.id, rollups: [contract] } })
  const REL = rel.data?.id
  const strayRollup = await fieldOn(work.id, { name: `Stray ${TAG}`, type: 'tasks', config: { listId: clients.id, rollups: [workNumber] } })
  const listless = await fieldOn(work.id, { name: `Listless ${TAG}`, type: 'tasks', config: { rollups: [contract] } })
  const setIn = await M(`/workspaces/${WS}/tasks/${T}/custom-fields/${REL}`, { method: 'PUT', body: { value: [clientA] } })
  const setOut = await M(`/workspaces/${WS}/tasks/${T}/custom-fields/${REL}`, { method: 'PUT', body: { value: [clientA, outside] } })
  const moveList = await A(`/workspaces/${WS}/custom-fields/${REL}`, { method: 'PATCH', body: { config: { listId: launch.id, rollups: [contract] } } })
  const keepList = await A(`/workspaces/${WS}/custom-fields/${REL}`, { method: 'PATCH', body: { config: { listId: clients.id, rollups: [contract] } } })
  const [relRow] = await sql`select config from custom_field_definitions where id = ${REL ?? null}`
  chk(
    rel.status === 201 && relRow?.config?.listId === clients.id && relRow?.config?.rollups?.[0] === contract
      && [200, 201].includes(setIn.status) && JSON.stringify(await valueRow(T, REL)) === JSON.stringify([clientA])
      && setOut.status === 400 && setOut.message === SAID.notInList
      && moveList.status === 400 && moveList.message === SAID.listKept && [200, 201].includes(keepList.status)
      && strayRollup.status === 400 && listless.status === 400 && listless.message === SAID.rollupsNeedList,
    'a Relationship limited to a list takes that list’s tasks and refuses any other in words; its list is kept once made; its rollups are fields that list’s tasks have, and need the list (read by SQL)',
    JSON.stringify({ made: said(rel), config: relRow?.config, setIn: said(setIn), setOut: said(setOut), move: said(moveList), keep: said(keepList), stray: said(strayRollup), listless: said(listless) }),
  )

  // ══ 15. ROLLUPS, READ AS THE READER MAY SEE ══════════════════════════════════
  console.log('\n▶ the related tasks’ rolled-up values, for each reader')
  await A(`/workspaces/${WS}/tasks/${clientA}/custom-fields/${contract}`, { method: 'PUT', body: { value: 12000 } })
  await A(`/workspaces/${WS}/tasks/${clientB}/custom-fields/${contract}`, { method: 'PUT', body: { value: 99000 } })
  const setBoth = await A(`/workspaces/${WS}/tasks/${T}/custom-fields/${REL}`, { method: 'PUT', body: { value: [clientA, clientB] } })
  const rollupOf = async (api) => (await api(`/workspaces/${WS}/tasks/${T}/custom-fields`)).data?.find((r) => r.definition?.id === REL)?.rollups ?? null
  const olgaRoll = await rollupOf(A)
  const miaRoll = await rollupOf(M)
  const valuesOf = (roll) => Object.fromEntries((roll?.[0]?.values ?? []).map((v) => [v.taskId, v.value]))
  chk(
    [200, 201].includes(setBoth.status) && olgaRoll?.[0]?.fieldId === contract
      && valuesOf(olgaRoll)[clientA] === 12000 && valuesOf(olgaRoll)[clientB] === 99000
      && valuesOf(miaRoll)[clientA] === 12000 && !(clientB in valuesOf(miaRoll)),
    'a Relationship’s rollups give each related task’s value of the rolled-up field — the owner sees both clients’, and Mia, who may not open the private one, sees only the one she may',
    JSON.stringify({ olga: valuesOf(olgaRoll), mia: valuesOf(miaRoll) }),
  )

  // ══ 16. THE SHEET'S RELATIONSHIP ═════════════════════════════════════════════
  console.log('\n▶ the sheet offers the list’s tasks alone, and draws the rollups')
  await openFields(miaPage, T)
  const rollupLine = (await miaPage.getByTestId(`cf-task-rollup-${clientA}-${contract}`).filter({ visible: true }).innerText({ timeout: 15_000 }).catch(() => '')).trim()
  const relRowEl = miaPage.locator(`[data-field-id="${REL}"]`)
  await relRowEl.getByTestId('cf-tasks-search').fill(TAG).catch(() => {})
  const options = relRowEl.getByTestId('cf-tasks-options')
  await options.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  await waitUntil(async () => (await options.locator('[data-testid^="cf-tasks-option-"]').count().catch(() => 0)) > 0
    || /No task/.test(await options.filter({ visible: true }).innerText().catch(() => '')), { timeoutMs: 10_000 }).catch(() => {})
  const offeredIds = await options.locator('[data-testid^="cf-tasks-option-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('cf-tasks-option-', ''))).catch(() => [])
  chk(
    /Contract value/.test(rollupLine) && /12000/.test(rollupLine) && !offeredIds.includes(outside) && !offeredIds.includes(T)
      && offeredIds.every((id) => id === clientA || id === clientB),
    'the sheet draws each related task’s rolled-up value beside it, and its picker offers the Clients list’s tasks and no task outside it',
    JSON.stringify({ rollupLine, offeredIds, outside }),
  )

  // ══ 17. THE SHEET MAKES ONE LIMITED TO A LIST, WITH A ROLLUP ═════════════════
  console.log('\n▶ a Relationship limited to a list is made from the sheet')
  await miaPage.getByTestId('task-field-create-open').click({ timeout: 10_000 }).catch(() => {})
  await miaPage.getByTestId('task-field-create-name').fill(`Account ${TAG}`).catch(() => {})
  await miaPage.getByTestId('task-field-create-type').selectOption('tasks').catch(() => {})
  const listPicker = miaPage.getByTestId('task-field-create-relationship-list')
  await waitUntil(async () => (await listPicker.locator(`option[value="${clients.id}"]`).count().catch(() => 0)) === 1, { timeoutMs: 15_000 }).catch(() => {})
  await listPicker.selectOption(clients.id).catch(() => {})
  await miaPage.getByTestId(`task-field-create-rollup-${contract}`).check({ timeout: 10_000 }).catch(() => {})
  const strayOffered = await miaPage.getByTestId(`task-field-create-rollup-${workNumber}`).count().catch(() => 0)
  await miaPage.getByTestId('task-field-create-submit').click({ timeout: 8000 }).catch(() => {})
  let account = []
  await waitUntil(async () => (account = await sql`select type, config from custom_field_definitions where project_id = ${work.id} and name = ${`Account ${TAG}`}`).length === 1, { timeoutMs: 15_000 }).catch(() => {})
  chk(
    account[0]?.type === 'tasks' && account[0]?.config?.listId === clients.id && JSON.stringify(account[0]?.config?.rollups) === JSON.stringify([contract])
      && strayOffered === 0,
    'the sheet makes a Relationship limited to the list chosen, offering as rollups only the fields that list’s tasks have (read by SQL)',
    JSON.stringify({ made: account[0] ?? null, strayOffered }),
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
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
