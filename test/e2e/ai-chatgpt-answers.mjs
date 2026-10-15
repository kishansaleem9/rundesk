/**
 * CHATGPT ANSWERS IN BRAIN'S PICKER (`commit-log/log-39863ff-1`).
 *
 * ClickUp's Brain lets a person pick the model that answers — OpenAI's GPT
 * models, Claude and Gemini, ChatGPT by default (its help centre, "Select an AI
 * model", through search excerpts). Here ChatGPT and Gemini were listed and
 * could not be picked: there was no client for either. Now each answers through
 * OpenAI's Chat Completions API where the server has its key
 * (`apps/api/src/modules/ai/chat-providers.ts`), on the same turn Claude's
 * answers take — the workspace's context, the tools, the meter.
 *
 * The lanes and CI give ChatGPT a key and an address on the media stub, which
 * answers in OpenAI's shapes and keeps what it was asked
 * (`scripts/e2e-lanes/media-stub.mjs`), and give Gemini none. So: ChatGPT picked
 * on the AI page answers there, whether or not Claude has a key; its turn is
 * metered under OpenAI's model; its tool calls make what they ask and are handed
 * their results; its refusal is said; it can be the preferred model; and a turn
 * asking for Gemini never reaches OpenAI's address.
 *
 *   node test/e2e/ai-chatgpt-answers.mjs --api 3011 --dist apps/web/dist
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { waitUntil } from './lib/wait.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { mediaBase } from './lib/media.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 7

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const MEDIA = mediaBase(API_PORT, argOf('--media', undefined))
/** The model the lanes' and CI's ChatGPT answers with: CHATGPT_MODEL is not set there. */
const GPT = 'gpt-5.4'

let passed = 0
let failed = 0
// THE SENTENCE, THEN THE REASON: a failing check names itself.
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`
const control = async (route, body) => {
  const res = await fetch(`${MEDIA}${route}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`the media stub answered ${res.status} to ${route}`)
  return res.json()
}
const asked = async () => (await control('/__control/chat/requests')).requests

const stamp = Date.now()
const TAG = `acg${stamp}`
const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
const apiAs = apiAsAt(API)
let sql = null
let browser = null
let A = null
const workspacesMade = []

/** One turn of `/ai/chat`, read to its end: its status, and each `data:` frame of the stream it answered with. */
const turn = async (token, body) => {
  const res = await fetch(`${API}/ai/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const raw = await res.text()
  const frames = raw
    .split('\n')
    .filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]')
    .map((l) => { try { return JSON.parse(l.slice(6)) } catch { return null } })
    .filter(Boolean)
  return { status: res.status, frames, text: frames.map((f) => f.delta ?? '').join(''), done: raw.includes('data: [DONE]') }
}

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the runs and the list are read by SQL')
  await control('/__control/chat/reset', {})
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: `ChatGPT ${TAG}` } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  const WS = made.data.id
  workspacesMade.push({ id: WS, as: A })
  const SPACE = `Launches ${TAG}`
  const [space] = await sql`insert into spaces (workspace_id, name) values (${WS}, ${SPACE}) returning id`
  const status = await A('/ai/status')
  const claudeSetUp = status.ok && status.data?.available === true

  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 3000 }).catch(() => {})

  // ══ 1. PICKED ON THE AI PAGE, CHATGPT ANSWERS THERE ════════════════════════
  console.log('\n▶ ChatGPT, picked on the AI page')
  await page.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
  const trigger = page.getByTestId('ai-model-tier')
  await waitUntil(async () => !!(await trigger.getAttribute('data-tier', { timeout: 2000 }).catch(() => '')), { timeoutMs: 25_000 })
  await trigger.click({ timeout: 8000 }).catch(() => {})
  await page.getByTestId('ai-model-show-more').click({ timeout: 8000 }).catch(() => {})
  await page.getByTestId('ai-model-option-chatgpt').click({ timeout: 8000 }).catch(() => {})
  const picked = await waitUntil(async () => (await trigger.getAttribute('data-tier', { timeout: 2000 }).catch(() => null)) === 'chatgpt', { timeoutMs: 8_000 })
  const composer = page.getByTestId('ai-composer-input')
  const open = await waitUntil(() => composer.isEnabled().catch(() => false), { timeoutMs: 8_000 })
  chk(
    picked && open,
    'ChatGPT can be picked, and with it picked the composer is open — whether or not Claude has a key here',
    JSON.stringify({ picked, open, claudeSetUp }),
  )

  const QUESTION = `What is due this week? ${TAG}`
  await composer.fill(QUESTION, { timeout: 5000 }).catch(() => {})
  await composer.press('Enter', { timeout: 5000 }).catch(() => {})
  const ANSWER = `ChatGPT (${GPT}) here. You asked: “${QUESTION}”`
  const answered = await waitUntil(async () => (await page.locator('body').innerText().catch(() => '')).includes(ANSWER), { timeoutMs: 25_000 })
  const firstAsk = (await asked()).find((r) => r.asked === QUESTION)
  chk(
    answered && firstAsk?.model === GPT && firstAsk?.stream === true && firstAsk?.system?.includes('Workspace context:') && firstAsk?.system?.includes(SPACE),
    'the answer on the page is ChatGPT’s, streamed from OpenAI’s chat API, asked with the workspace’s own context',
    JSON.stringify({ answered, asked: firstAsk ? { model: firstAsk.model, stream: firstAsk.stream, context: firstAsk.system?.includes(SPACE) } : null }),
  )

  // ══ 2. METERED UNDER OPENAI'S MODEL ════════════════════════════════════════
  const runs = await sql`select model, status, input_tokens, output_tokens from ai_usage where workspace_id = ${WS} and feature = 'chat' order by created_at`
  chk(
    runs.length === 1 && runs[0].model === GPT && runs[0].status === 'succeeded' && runs[0].input_tokens > 0 && runs[0].output_tokens > 0,
    'the turn is written down as one run of chat under OpenAI’s model, its tokens counted',
    JSON.stringify(runs),
  )

  // ══ 3. ITS TOOL CALLS MAKE WHAT THEY ASK ═══════════════════════════════════
  console.log('\n▶ ChatGPT’s tool calls, on the same turn Claude’s take')
  const LIST = `Launch plan ${TAG}`
  await control('/__control/chat/stage', {
    replies: [
      { tool_calls: [{ name: 'create_list', arguments: { name: LIST, spaceName: SPACE } }] },
      { content: `Made ${LIST}.` },
    ],
  })
  const before = (await asked()).length
  const made2 = await turn(auth.accessToken, { workspaceId: WS, tier: 'chatgpt', messages: [{ role: 'user', content: `Make a list called ${LIST} in ${SPACE}` }] })
  const [list] = await sql`select l.id from lists l join projects p on p.id = l.project_id where p.space_id = ${space.id} and l.name = ${LIST}`
  const both = (await asked()).slice(before)
  const toolResult = both[1]?.toolResults?.[0]
  const createdFrame = made2.frames.find((f) => f.created)?.created
  chk(
    !!list && createdFrame?.id === list.id && both.length === 2 && both[0].tools.includes('create_list') &&
      /"ok":true/.test(toolResult?.content ?? '') && made2.text === `Made ${LIST}.` && made2.done,
    'asked to make a list, ChatGPT’s tool call makes it in the Space it named, the page is told, and ChatGPT is handed the result to finish its answer',
    JSON.stringify({ status: made2.status, list: list?.id ?? null, created: createdFrame ?? null, asks: both.length, tools: both[0]?.tools, result: toolResult?.content?.slice(0, 80), text: made2.text }),
  )

  // ══ 4. A REFUSAL IS SAID ═══════════════════════════════════════════════════
  await control('/__control/chat/fail', { status: 429, count: 1 })
  const refused = await turn(auth.accessToken, { workspaceId: WS, tier: 'chatgpt', messages: [{ role: 'user', content: `Again ${TAG}` }] })
  const error = refused.frames.find((f) => f.error)?.error ?? ''
  const [failedRun] = await sql`select model, status, error_code from ai_usage where workspace_id = ${WS} and feature = 'chat' and status = 'failed' order by created_at desc limit 1`
  chk(
    /^ChatGPT answered 429: Rate limit reached/.test(error) && failedRun?.model === GPT && failedRun?.error_code === 'provider_error',
    'a refusal from ChatGPT ends the turn in its own words, and the run is written down as failed under its model',
    JSON.stringify({ error, failedRun }),
  )

  // ══ 5. THE PREFERRED MODEL ═════════════════════════════════════════════════
  console.log('\n▶ ChatGPT as the preferred model')
  const pref = await A(`/ai/preferences?workspaceId=${WS}`, { method: 'PUT', body: { preferredTier: 'chatgpt' } })
  const page2 = await ctx.newPage()
  await page2.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
  const opensOn = await waitUntil(async () => (await page2.getByTestId('ai-model-tier').getAttribute('data-tier', { timeout: 2000 }).catch(() => null)) === 'chatgpt', { timeoutMs: 20_000 })
  chk(
    pref.ok && pref.data?.preferredTier === 'chatgpt' && pref.data?.isSet === true && opensOn,
    'ChatGPT, with its key, can be the preferred model, and a page opened afresh is on it',
    JSON.stringify({ pref: pref.data ?? said(pref), opensOn }),
  )
  await page2.close().catch(() => {})

  // ══ 6. GEMINI, WITH NO KEY, IS NOT SENT TO OPENAI ══════════════════════════
  const asksBefore = (await asked()).length
  const gemini = await turn(auth.accessToken, { workspaceId: WS, tier: 'gemini', messages: [{ role: 'user', content: `Gemini please ${TAG}` }] })
  const asksAfter = (await asked()).length
  chk(
    asksAfter === asksBefore && (claudeSetUp ? gemini.status >= 200 && gemini.status < 300 && gemini.done : gemini.status === 503),
    'a turn asking for Gemini, which has no key here, never reaches OpenAI’s address: Claude answers it, or nobody where Claude has no key either',
    JSON.stringify({ status: gemini.status, claudeSetUp, toOpenAi: asksAfter - asksBefore }),
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  await browser?.close().catch(() => {})
  // The stub is the lane's, shared by every later run: a reset that did not answer is said, not swallowed.
  await control('/__control/chat/reset', {}).then(
    () => {},
    (e) => console.log(`  cleanup: the media stub did not reset — ${e.message}`),
  )
  const leftBehind = []
  for (const { id, as } of workspacesMade) {
    const gone = await as(`/workspaces/${id}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) leftBehind.push(`DELETE workspace ${id} answered ${gone.status}`)
  }
  if (leftBehind.length) console.log(`  cleanup left behind: ${leftBehind.join('; ')}`)
  stack.close()
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
