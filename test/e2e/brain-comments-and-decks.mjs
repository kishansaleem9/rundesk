/**
 * BRAIN IN A COMMENT'S THREAD, THE COMPOSER'S "+", AND THE DECKS BRAIN MAKES,
 * AS CLICKUP HAS THEM (`ledger-rows/row-745`'s Brain half, `ledger-rows/row-853`,
 * `commit-log/log-214dac0-1`).
 *
 * · @Brain in a task's comment is answered right away, in that comment's
 *   thread, by Brain — from the task, the thread, and what is public in the
 *   workspace, unless the comment links a private item its asker may read or
 *   it was asked inside one. Its answer is a comment everybody on the task
 *   reads, so something private it drew on would be told to people it refuses.
 * · The AI composer's "+" points Brain at a task, a Doc or a location, and
 *   gives it files — images, PDFs, sheets, Word documents, text.
 * · Asked for slides, Brain makes a deck it keeps as the asker's own Artifact:
 *   a card under the answer (frame `16:50`), opened and paged through (`16:55`),
 *   changed by asking again, taken back to an earlier version, published to a
 *   link anybody may open, and deleted.
 *
 * WHERE NO MODEL ANSWERS, AS IN CI: every check keeps its sentence and reads
 * the refusal — Brain posts nothing and the composer says why, a question is
 * refused with "AI features are not configured", and nothing is made. A deck
 * the viewer checks open is then written by SQL, as Brain would have kept it.
 *
 *   node test/e2e/brain-comments-and-decks.mjs --api 3029 --dist /tmp/claude-0/dist-9
 */
import path from 'node:path'
import { resolveChromium, launchOptions } from './lib/playwright.mjs'
import { startLocalStack } from './lib/local-stack.mjs'
import { signInApi, signUpApi, LOGIN_NAV_TIMEOUT_MS } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt, madeWorkspace } from './lib/fixture.mjs'
import { madeAccount } from './lib/made.mjs'
import { waitUntil } from './lib/wait.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

const EXPECTED_CHECKS = 29

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const MODEL = `http://127.0.0.1:${argOf('--model', process.env.E2E_MODEL_PORT ?? String(9200 + (API_PORT - 3020)))}`
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = { email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal', password: process.env.E2E_PASSWORD ?? 'Admin@123!' }
const BRAIN_EMAIL = 'brain@rundesk.system'

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const started = new Date()
const stamp = Date.now()
const TAG = `bc${stamp}`
const PASSWORD = 'BrainDecks@12345!'

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
const apiAs = apiAsAt(API, { emptyBodyOn: ['POST', 'DELETE'] })
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`
const must = (res, what) => {
  if (!res.ok || !res.data) throw new Error(`could not ${what}: ${said(res)}`)
  return res.data
}
const stub = (route, body) =>
  fetch(`${MODEL}/__control/${route}`, {
    method: body === undefined && route === 'seen' ? 'GET' : 'POST',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
    .then(async (r) => (r.ok ? (route === 'seen' ? r.json() : true) : false))
    .catch(() => false)
/**
 * The stub's record of the call that asked `marker` — its system prompt and its
 * last question, as text. By what it asked, not by being last: a chat that
 * names itself after its first answer makes a call of its own after it.
 */
const callAsking = async (marker) => {
  const seen = await stub('seen')
  // The question's own call: after its answer the chat names itself with a call that carries the
  // question too, and read as the question's it held none of the chips — whenever the naming came
  // first, which a warm lane made every run after its first (`found-13-oct/bcd-reads-the-naming-call`).
  const naming = (c) => JSON.stringify(c.system ?? '').includes('Name this conversation')
  const asked = (c) => !naming(c) && JSON.stringify([...(c.messages ?? [])].reverse().find((m) => m.role === 'user')?.content ?? '').includes(marker)
  const call = [...(seen?.calls ?? [])].reverse().find(asked)
  if (!call) return { system: '', user: '', blocks: [] }
  const system = typeof call.system === 'string' ? call.system : JSON.stringify(call.system ?? '')
  const last = [...(call.messages ?? [])].reverse().find((m) => m.role === 'user')
  const blocks = Array.isArray(last?.content) ? last.content : [{ type: 'text', text: String(last?.content ?? '') }]
  return { system, user: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n'), blocks }
}

let sql = null
let browser = null
let MODEL_ON_FOR_FINALLY = false

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what Brain wrote and made is read by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  const aiStatus = await A('/ai/status')
  const MODEL_ON = aiStatus.status === 200 && aiStatus.data?.available === true
  console.log(`  · /ai/status says a model is ${MODEL_ON ? `configured (stub ${MODEL})` : 'not configured: each check reads the refusal'}`)
  if (MODEL_ON && !(await stub('reset'))) throw new Error(`a model is configured but no stub answers on ${MODEL}`)
  MODEL_ON_FOR_FINALLY = MODEL_ON
  const REFUSED = /AI features are not configured/
  const [me] = await sql`select id, display_name from users where lower(email) = lower(${ADMIN.email})`
  const WS = must(await A('/workspaces', { method: 'POST', body: { name: `Brain ${TAG}` } }), 'make the workspace').id
  madeWorkspace(WS)
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `${who} ${stamp}`, email, password: PASSWORD, organizationName: `Brain ${who} ${stamp}`, organizationSlug: `brain-${who}-${stamp}` })
    must(await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } }), `add ${who}`)
    const [row] = await sql`select id from users where email = ${email}`
    return { id: row.id, api: apiAs(signed.accessToken) }
  }
  const mia = await person('mia', 'member')
  const gus = await person('gus', 'guest')
  const M = mia.api

  const space = must(await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} work` } }), 'make the space')
  const project = must(await A('/projects', { method: 'POST', body: { spaceId: space.id, name: `${TAG} folder` } }), 'make the folder')
  const L = must(await A('/lists', { method: 'POST', body: { projectId: project.id, name: `${TAG} launch` } }), 'make the list').id
  const closed = must(await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} closed`, visibility: 'private' } }), 'make the private space')
  const closedProject = must(await A('/projects', { method: 'POST', body: { spaceId: closed.id, name: `${TAG} closed folder` } }), 'make the private folder')
  const SECRET_LIST = must(await A('/lists', { method: 'POST', body: { projectId: closedProject.id, name: `${TAG} secret` } }), 'make the private list').id
  const WORD = `zebracorn${stamp}`
  const T = must(await A('/tasks', { method: 'POST', body: { listId: L, title: `Plan the launch ${TAG}` } }), 'make the task').id
  const BRIEF = must(await A('/tasks', { method: 'POST', body: { listId: L, title: `Launch brief ${TAG}`, description: `The ${WORD} launch is on Friday.` } }), 'make the brief').id
  const SECRET = must(await A('/tasks', { method: 'POST', body: { listId: SECRET_LIST, title: `Secret pricing ${TAG}`, description: `${WORD} pricing is forty dollars.` } }), 'make the private task').id
  must(await A(`/workspaces/${WS}/knowledge/reindex`, { method: 'POST' }), 'index the workspace')

  const comments = (taskId) => sql`
    select c.id::text as id, c.author_id::text as author, c.parent_comment_id::text as parent, c.body, u.email
    from task_comments c join users u on u.id = c.author_id where c.task_id = ${taskId} order by c.created_at`
  const settle = (predicate, ms = 15_000) => waitUntil(predicate, { timeoutMs: ms, lastLookGraceMs: 0 })
  const brainReplies = async (taskId, threadId) => (await comments(taskId)).filter((c) => c.email === BRAIN_EMAIL && c.parent === threadId)
  /** Post a comment and wait for Brain's answer where a model answers; where none does, wait a moment for nothing. */
  const ask = async (api, taskId, body) => {
    const posted = must(await api(`/tasks/${taskId}/comments`, { method: 'POST', body: { body } }), 'post the comment')
    if (MODEL_ON) await settle(async () => (await brainReplies(taskId, posted.id)).length > 0)
    else await new Promise((r) => setTimeout(r, 2500))
    return { id: posted.id, replies: await brainReplies(taskId, posted.id) }
  }

  // ══ 1. @BRAIN IN A COMMENT ═════════════════════════════════════════════════
  console.log('\n▶ @Brain, asked in a comment, answers in its thread')
  const first = await ask(A, T, `@Brain what does the ${WORD} brief say?`)
  const [brain] = await sql`select id::text as id, is_agent, created_at from users where email = ${BRAIN_EMAIL}`
  if (brain && new Date(brain.created_at) >= started) madeAccount({ id: brain.id })
  const roster = (await A(`/workspaces/${WS}/members`)).data ?? []
  chk(
    MODEL_ON
      ? first.replies.length === 1 && brain?.is_agent === true && !roster.some((m) => m.userId === brain.id)
      : first.replies.length === 0 && (await comments(T)).some((c) => c.id === first.id),
    'a comment naming @Brain is answered once, in that comment’s thread, by Brain — an agent’s account, on no roster',
    MODEL_ON ? `${first.replies.length} answer(s); account ${JSON.stringify(brain ?? null)}` : `where no model answers nothing is posted and the comment stands: ${first.replies.length} answer(s)`,
  )
  chk(
    MODEL_ON ? new RegExp(`on “Plan the launch ${TAG}”`).test(first.replies[0]?.body ?? '') : first.replies.length === 0,
    'Brain answers from the task it was asked on: its words name it',
    first.replies[0]?.body ?? '(no answer)',
  )
  const read = first.replies[0]?.body ?? ''
  chk(
    MODEL_ON ? new RegExp(`I read: .*Launch brief ${TAG}`).test(read) && !read.includes(`Secret pricing ${TAG}`) : first.replies.length === 0,
    'Brain draws on what is public in the workspace, and not on a private task its asker may read — its answer is read by everybody on the task',
    read || '(no answer)',
  )
  const linked = await ask(A, T, `@Brain compare it with ${B}/app/${WS}/${closed.id}/${closedProject.id}/${SECRET_LIST}?task=${SECRET} for ${WORD}`)
  chk(
    MODEL_ON ? new RegExp(`I read: .*Secret pricing ${TAG}`).test(linked.replies[0]?.body ?? '') : linked.replies.length === 0,
    'a private task the comment links, and its asker may read, is read — as ClickUp reads a linked private item',
    linked.replies[0]?.body ?? '(no answer)',
  )
  const inside = await ask(A, SECRET, `@Brain what is the ${WORD} price?`)
  chk(
    MODEL_ON ? new RegExp(`I read: .*Secret pricing ${TAG}`).test(inside.replies[0]?.body ?? '') : inside.replies.length === 0,
    'asked inside a private list, Brain reads that list’s own private work',
    inside.replies[0]?.body ?? '(no answer)',
  )
  const before = (await brainReplies(T, first.id)).length
  must(await A(`/tasks/${T}/comments`, { method: 'POST', body: { body: 'thanks, and what else?', parentCommentId: first.id } }), 'reply in the thread')
  await new Promise((r) => setTimeout(r, 2500))
  chk((await brainReplies(T, first.id)).length === before, 'a reply in the thread that does not name @Brain is not answered — each question names it, as in ClickUp', `${before} → ${(await brainReplies(T, first.id)).length}`)
  if (MODEL_ON) await stub('next', { text: 'Ask @Brain again whenever you like.' })
  const loop = await ask(A, T, '@Brain will you say your own name?')
  await new Promise((r) => setTimeout(r, 2500))
  chk(
    MODEL_ON ? (await brainReplies(T, loop.id)).length === 1 && /@Brain/.test(loop.replies[0]?.body ?? '') : loop.replies.length === 0,
    'Brain’s own words start nothing: an answer that names @Brain is not answered again',
    `${(await brainReplies(T, loop.id)).length} answer(s): ${loop.replies[0]?.body ?? '(none)'}`,
  )
  const brainId = brain?.id ?? '00000000-0000-0000-0000-000000000000'
  const [{ n: follows }] = await sql`select count(*)::int as n from task_watchers where task_id = ${T} and user_id = ${brainId}`
  const [{ n: told }] = await sql`select count(*)::int as n from notifications where user_id = ${brainId}`
  chk(follows === 0 && told === 0, 'Brain follows nothing it answers on and is never notified', `follows ${follows}, notified ${told}`)
  const miaAsk = await ask(M, T, `@brain is the ${WORD} launch on?`)
  chk(
    MODEL_ON ? miaAsk.replies.length === 1 && !(miaAsk.replies[0]?.body ?? '').includes(`Secret pricing ${TAG}`) : miaAsk.replies.length === 0,
    'a member’s @brain, in any case, is answered too — and never from what that member may not read',
    miaAsk.replies[0]?.body ?? '(no answer)',
  )

  // ══ 2. THE COMPOSER'S "+" ═══════════════════════════════════════════════════
  console.log('\n▶ the composer’s "+": what Brain is pointed at, and the files it is given')
  const chat = (api, body) => api('/ai/chat', { method: 'POST', body: { workspaceId: WS, messages: [{ role: 'user', content: 'What should I know?' }], ...body } })
  const hidden = await chat(M, { focus: [{ kind: 'task', id: SECRET }] })
  chk(hidden.status === 403 && /You do not have access to this task/.test(hidden.message ?? ''), 'pointing Brain at a task its asker may not read is refused, in the read rule’s own words, before anything is asked', said(hidden))
  const notAFile = await chat(A, { files: [{ name: 'tool.bin', data: Buffer.from('MZ\u0000\u0001binary').toString('base64') }] })
  chk(notAFile.status === 400 && /Brain reads images, PDFs, sheets, Word documents and text files — not “tool\.bin”/.test(notAFile.message ?? ''), 'a file Brain cannot read is refused by its name', said(notAFile))
  const fakeImage = await chat(A, { files: [{ name: 'photo.png', data: Buffer.from('just words').toString('base64') }] })
  chk(fakeImage.status === 400 && /“photo\.png” is not an image/.test(fakeImage.message ?? ''), 'an "image" that is not one is refused, not passed on as noise', said(fakeImage))
  const tooMany = await chat(A, { files: Array.from({ length: 6 }, (_, i) => ({ name: `n${i}.txt`, data: Buffer.from('x').toString('base64') })) })
  chk(tooMany.status === 400 && /at most 5 files/.test(tooMany.message ?? ''), 'Brain takes at most five files at once, and says so', said(tooMany))
  // The SSE answer is read raw: the request either streams, or is refused before it does.
  if (MODEL_ON) await stub('reset')
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
  const streamed = await fetch(`${API}/ai/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.accessToken}` },
    body: JSON.stringify({
      workspaceId: WS,
      messages: [{ role: 'user', content: `What is in the brief and my notes ${TAG}?` }],
      focus: [{ kind: 'task', id: BRIEF }],
      files: [
        { name: 'notes.txt', data: Buffer.from(`My notes say ${WORD} needs a venue.`).toString('base64') },
        { name: 'dot.png', data: PNG.toString('base64') },
      ],
    }),
  })
  const streamText = await streamed.text()
  const call = MODEL_ON ? await callAsking(`What is in the brief and my notes ${TAG}?`) : null
  chk(
    MODEL_ON
      ? streamed.ok && call.system.includes('The task the person pointed you at') && call.system.includes(`Launch brief ${TAG}`) && call.user.includes(`The file “notes.txt”:\nMy notes say ${WORD} needs a venue.`) && call.blocks.some((b) => b.type === 'image')
      : streamed.status === 503 && REFUSED.test(streamText),
    'what the "+" gave the question reaches Brain: the task’s contents, the text file’s words under its name, and the image as an image',
    MODEL_ON ? `${streamed.status}; system names the brief ${call.system.includes(`Launch brief ${TAG}`)}; file read ${call.user.includes('notes.txt')}; image ${call.blocks.some((b) => b.type === 'image')}` : `${streamed.status} ${streamText.slice(0, 120)}`,
  )

  // ══ 3. A DECK ═══════════════════════════════════════════════════════════════
  console.log('\n▶ a deck Brain makes, as its asker’s own Artifact')
  const SLIDES = [
    { title: `Brain² ${TAG}`, bullets: ['Ask, build, create'] },
    { title: 'Super Agents', bullets: ['Mentioned, messaged, assigned'] },
    { title: 'Artifacts', bullets: ['Decks you page through'] },
    { title: 'What next', bullets: ['Try it'] },
  ]
  let deckId = null
  if (MODEL_ON) {
    await stub('next', { content: [{ type: 'text', text: 'I made you a quick overview. 4 slides.' }, { type: 'tool_use', name: 'create_slide_deck', input: { title: `What’s new in Brain² ${TAG}`, slides: SLIDES } }] })
  }
  const asked = await fetch(`${API}/ai/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.accessToken}` },
    body: JSON.stringify({ workspaceId: WS, messages: [{ role: 'user', content: `What’s new in Brain²? ${TAG}` }] }),
  })
  const askedText = await asked.text()
  const madeEvent = /"artifact":\{"id":"([0-9a-f-]{36})"/.exec(askedText)
  const [made] = await sql`select a.id::text as id, a.created_by_id::text as by, a.current_version as v, (select jsonb_array_length(slides) from ai_artifact_versions where artifact_id = a.id and version = 1) as n
                           from ai_artifacts a where a.workspace_id = ${WS}`
  chk(
    MODEL_ON ? !!madeEvent && made?.id === madeEvent[1] && made?.by === me.id && made?.v === 1 && made?.n === 4 : asked.status === 503 && REFUSED.test(askedText) && !made,
    'asked "What’s new in Brain²?", Brain makes a 4-slide deck kept as its asker’s own, and names it on the wire',
    MODEL_ON ? `${asked.status}; event ${madeEvent?.[1] ?? 'none'}; row ${JSON.stringify(made ?? null)}` : `${asked.status} ${askedText.slice(0, 100)}; row ${JSON.stringify(made ?? null)}`,
  )
  if (MODEL_ON && made) deckId = made.id
  else {
    // Where no model answers, the deck is written as Brain keeps one, so the viewer is measured all the same.
    const [row] = await sql`insert into ai_artifacts (workspace_id, created_by_id, title, current_version) values (${WS}, ${me.id}, ${`What’s new in Brain² ${TAG}`}, 2) returning id::text as id`
    deckId = row.id
    await sql`insert into ai_artifact_versions (artifact_id, version, title, slides, prompt, created_by_id) values
      (${deckId}, 1, ${`What’s new in Brain² ${TAG}`}, ${sql.json(SLIDES)}, 'staged', ${me.id}),
      (${deckId}, 2, ${`What’s new in Brain² ${TAG}`}, ${sql.json([{ title: 'Revised: staged', bullets: ['What changed'] }, ...SLIDES])}, 'staged again', ${me.id})`
  }
  const stranger = await M(`/ai/artifacts/${deckId}`)
  const strangerList = (await M(`/ai/artifacts?workspaceId=${WS}`)).data ?? []
  const guestList = await gus.api(`/ai/artifacts?workspaceId=${WS}`)
  chk(
    stranger.status === 404 && !strangerList.some((a) => a.id === deckId) && guestList.status === 403,
    'a deck is its asker’s own: another member is told it is not there and does not list it, and a guest is refused',
    `member ${said(stranger)}, listed ${strangerList.some((a) => a.id === deckId)}; guest ${said(guestList)}`,
  )

  // ══ 4. THE PAGES ════════════════════════════════════════════════════════════
  console.log('\n▶ the composer, the deck and the comment picker, on screen')
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(15_000)
  page.on('dialog', (d) => void d.accept())
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 2000 }).catch(() => {})

  await page.getByTestId('ai-composer-plus').click({ timeout: 25_000 })
  const offers = [await page.getByTestId('ai-plus-context').filter({ visible: true }).count(), await page.getByTestId('ai-plus-upload').filter({ visible: true }).count()]
  await page.getByTestId('ai-plus-context').click()
  await page.getByTestId('ai-context-search').fill(`Launch brief ${TAG}`)
  const result = page.locator(`[data-testid="ai-context-result"][data-kind="task"][data-id="${BRIEF}"]`)
  await result.waitFor({ timeout: 15_000 }).catch(() => {})
  await result.click().catch(() => {})
  const chip = page.locator(`[data-testid="ai-context-chip"][data-kind="task"][data-id="${BRIEF}"]`)
  await page.getByTestId('ai-file-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from(`My notes ${TAG}`) })
  const fileChip = page.locator('[data-testid="ai-file-chip"][data-name="notes.txt"]')
  await fileChip.waitFor({ timeout: 10_000 }).catch(() => {})
  chk(
    offers[0] === 1 && offers[1] === 1 && (await chip.count()) === 1 && (await fileChip.count()) === 1,
    'the composer’s "+" offers a task, Doc or location to focus on and a file to upload, each shown as a chip on the next question',
    `offers ${offers.join('/')}, task chip ${await chip.count()}, file chip ${await fileChip.count()}`,
  )
  if (MODEL_ON) {
    await stub('reset')
    await page.getByTestId('ai-composer-input').fill(`Summarise these ${TAG}`, { timeout: 10_000 }).catch(() => {})
    await page.getByTestId('ai-composer-input').press('Enter')
    await page.getByTestId('ai-message-attached').filter({ visible: true }).first().waitFor({ timeout: 15_000 }).catch(() => {})
    await settle(async () => (await callAsking(`Summarise these ${TAG}`)).user.includes('notes.txt'), 15_000)
  }
  const sentCall = MODEL_ON ? await callAsking(`Summarise these ${TAG}`) : null
  const attachedText = MODEL_ON ? await page.getByTestId('ai-message-attached').filter({ visible: true }).last().innerText().catch(() => '') : ''
  chk(
    MODEL_ON
      ? sentCall.system.includes(`Launch brief ${TAG}`) && sentCall.user.includes(`My notes ${TAG}`) && attachedText.includes('notes.txt') && (await chip.count()) === 0
      : (await page.getByTestId('ai-composer-input').isDisabled()) && (await chip.count()) === 1,
    'sent, the question carries what the chips held, says so on itself, and the chips are cleared',
    MODEL_ON ? `brief in prompt ${sentCall.system.includes(`Launch brief ${TAG}`)}; file ${sentCall.user.includes(`My notes ${TAG}`)}; on the question "${attachedText}"; chips left ${await chip.count()}` : 'where no model answers the composer cannot send, and keeps the chips',
  )

  if (MODEL_ON) {
    // The last turn names its new chat with a call of its own, after its answer: staged before that call, the deck would be its.
    await settle(async () => ((await stub('seen'))?.calls ?? []).some((c) => JSON.stringify(c.system ?? '').includes('Name this conversation')), 10_000)
    await stub('next', { content: [{ type: 'text', text: 'I made you a quick overview. 4 slides.' }, { type: 'tool_use', name: 'create_slide_deck', input: { title: `Overview on screen ${TAG}`, slides: SLIDES } }] })
    await page.getByTestId('ai-composer-input').fill(`What’s new in Brain²? on screen ${TAG}`, { timeout: 10_000 }).catch(() => {})
    await page.getByTestId('ai-composer-input').press('Enter')
  }
  const card = page.getByTestId('artifact-card').filter({ hasText: `Overview on screen ${TAG}` })
  if (MODEL_ON) await card.waitFor({ timeout: 20_000 }).catch(() => {})
  const cardText = MODEL_ON ? await card.filter({ visible: true }).innerText().catch(() => '') : ''
  chk(
    MODEL_ON ? /Overview on screen/.test(cardText) && /4 slides/.test(cardText) : (await page.getByTestId('artifact-card').count()) === 0,
    'the deck is drawn as a card under the answer, as frame 16:50 draws it: its title and "4 slides"',
    MODEL_ON ? cardText : 'where no model answers no deck is made, and no card is drawn',
  )

  // The deck, opened from the Artifacts list — Brain's, or the one written for it.
  await page.getByTestId('ai-tab-artifacts').click()
  const row = page.locator(`[data-testid="ai-artifact-row"][data-artifact-id="${deckId}"]`)
  await row.waitFor({ timeout: 15_000 }).catch(() => {})
  await row.click().catch(() => {})
  const viewer = page.getByTestId('artifact-viewer')
  await viewer.waitFor({ timeout: 15_000 }).catch(() => {})
  const counter = page.getByTestId('deck-counter')
  const total = MODEL_ON ? 4 : 5
  const c1 = await counter.filter({ visible: true }).innerText().catch(() => '')
  await page.getByTestId('deck-next').click().catch(() => {})
  const c2 = await counter.filter({ visible: true }).innerText().catch(() => '')
  await page.keyboard.press('ArrowRight')
  const c3 = await counter.filter({ visible: true }).innerText().catch(() => '')
  await page.getByTestId('deck-prev').click().catch(() => {})
  const c4 = await counter.filter({ visible: true }).innerText().catch(() => '')
  chk(
    (await row.count()) === 1 && c1 === `1 / ${total}` && c2 === `2 / ${total}` && c3 === `3 / ${total}` && c4 === `2 / ${total}`,
    'the Artifacts list opens the deck, paged through as frame 16:55 pages it: the arrows, ← / →, and where you are',
    `listed ${await row.count()}; ${[c1, c2, c3, c4].join(' → ')}`,
  )

  await page.getByTestId('artifact-ask').fill('add a slide on risks')
  await page.getByTestId('artifact-ask-send').click()
  if (MODEL_ON) await page.getByTestId('artifact-viewer-version').filter({ hasText: 'Version 2' }).waitFor({ timeout: 15_000 }).catch(() => {})
  else await page.waitForTimeout(1500)
  const [afterAsk] = await sql`select current_version as v, (select count(*)::int from ai_artifact_versions where artifact_id = ${deckId}) as n from ai_artifacts where id = ${deckId}`
  const firstTitle = await page.getByTestId('deck-slide-title').filter({ visible: true }).innerText().catch(() => '')
  chk(
    MODEL_ON ? afterAsk?.v === 2 && afterAsk?.n === 2 && firstTitle === 'Revised: add a slide on risks' : afterAsk?.v === 2 && afterAsk?.n === 2 && (await page.getByText(REFUSED).count()) > 0,
    'asked to change it, Brain makes the whole deck again as a new version, shown at its first slide',
    MODEL_ON ? `version ${afterAsk?.v} of ${afterAsk?.n}; first slide "${firstTitle}"` : `where no model answers it says so and keeps version ${afterAsk?.v} of ${afterAsk?.n}`,
  )

  await page.getByTestId('artifact-versions').click().catch(() => {})
  await page.locator('[data-testid="artifact-version"][data-version="1"]').click({ timeout: 5_000 }).catch(() => {})
  await page.getByTestId('artifact-viewer-version').filter({ hasText: 'Version 3' }).waitFor({ timeout: 15_000 }).catch(() => {})
  const versions = await sql`select version, restored_from, jsonb_array_length(slides) as n from ai_artifact_versions where artifact_id = ${deckId} order by version`
  chk(
    versions.length === 3 && versions[2].restored_from === 1 && versions[2].n === versions[0].n && versions[1].version === 2,
    'restoring version 1 writes it again as the newest, version 3, and nothing after it is lost',
    JSON.stringify(versions),
  )

  // The versions menu closes itself once a version is picked; its exit runs a moment, and the deck's buttons wait for it.
  await page.getByRole('menu').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {})
  await page.getByTestId('artifact-publish').click({ timeout: 5_000 }).catch(() => {})
  const linkBox = page.getByTestId('artifact-link')
  await linkBox.waitFor({ timeout: 15_000 }).catch(() => {})
  const link = await linkBox.inputValue().catch(() => '')
  const token = /\/deck\/([A-Za-z0-9_-]+)$/.exec(link)?.[1] ?? ''
  const outsider = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' })
  const pub = await outsider.newPage()
  pub.setDefaultTimeout(15_000)
  await pub.goto(`${B}/deck/${token}`, { waitUntil: 'domcontentloaded' })
  await pub.getByTestId('public-deck-title').waitFor({ timeout: 15_000 }).catch(() => {})
  const pubTitle = await pub.getByTestId('public-deck-title').filter({ visible: true }).innerText().catch(() => '')
  const pubCounter = await pub.getByTestId('deck-counter').filter({ visible: true }).innerText().catch(() => '')
  chk(
    !!token && pubTitle === `What’s new in Brain² ${TAG}` && pubCounter === `1 / ${SLIDES.length}`,
    'published, its link opens the deck for somebody signed in to nothing — its title and its slides, paged',
    `link ${link}; title "${pubTitle}"; ${pubCounter}`,
  )
  await page.getByTestId('artifact-unpublish').click({ timeout: 5_000 }).catch(() => {})
  await page.getByTestId('artifact-publish').waitFor({ timeout: 15_000 }).catch(() => {})
  await pub.goto(`${B}/deck/${token}`, { waitUntil: 'domcontentloaded' })
  await pub.getByTestId('public-deck-not-found').waitFor({ timeout: 15_000 }).catch(() => {})
  const gone = await fetch(`${API}/public/artifacts/${token}`)
  chk(
    (await pub.getByTestId('public-deck-not-found').count()) === 1 && gone.status === 404,
    'unpublished, the same link opens nothing, and says so',
    `page ${await pub.getByTestId('public-deck-not-found').count()}, API ${gone.status}`,
  )
  await outsider.close()

  await page.getByTestId('artifact-delete').click({ timeout: 5_000 }).catch(() => {})
  await settle(async () => (await sql`select 1 from ai_artifacts where id = ${deckId}`).length === 0, 10_000)
  // The list reads again once the delete answers; the row goes when it has.
  await row.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
  const [{ n: leftVersions }] = await sql`select count(*)::int as n from ai_artifact_versions where artifact_id = ${deckId}`
  chk(
    (await sql`select 1 from ai_artifacts where id = ${deckId}`).length === 0 && leftVersions === 0 && (await row.count()) === 0,
    'deleted, the deck goes, every version with it, and it leaves the list',
    `versions left ${leftVersions}, still listed ${await row.count()}`,
  )

  // ══ 5. THE COMMENT PICKER ═══════════════════════════════════════════════════
  const TASK_URL = `${B}/app/${WS}/${space.id}/${project.id}/${L}?task=${T}`
  await page.goto(TASK_URL, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('task-tab-comments').click({ timeout: 25_000 })
  const box = page.getByTestId('comment-input')
  await box.waitFor({ timeout: 15_000 })
  await box.fill('@')
  const brainRow = page.getByTestId('mention-brain')
  await brainRow.waitFor({ timeout: 10_000 }).catch(() => {})
  const brainDisabled = await brainRow.isDisabled().catch(() => true)
  chk(
    (await page.getByTestId('mention-brain-section').count()) === 1 &&
      (MODEL_ON ? !brainDisabled : brainDisabled && (await page.getByTestId('mention-brain-unavailable').count()) === 1),
    'the @ picker opens with frame 04:00’s Brain section — "Brain² — Ask, Build, Create" — above the people',
    MODEL_ON ? `offered, enabled ${!brainDisabled}` : `where no model answers it is offered disabled and says why: disabled ${brainDisabled}, note ${await page.getByTestId('mention-brain-unavailable').count()}`,
  )
  if (MODEL_ON) {
    await brainRow.click()
    await box.click()
    await box.press('End')
    await box.type(`what is next ${TAG}?`)
  } else {
    await box.fill(`@Brain what is next ${TAG}?`)
  }
  const typed = await box.inputValue().catch(() => '')
  await page.getByTestId('comment-post').click()
  const badgesBefore = await page.getByTestId('comment-brain-badge').count()
  if (MODEL_ON) {
    // Answering, then answered: the note stays until Brain's reply to THIS comment lands in its thread.
    await page.getByTestId('brain-answering').waitFor({ timeout: 5_000 }).catch(() => {})
    await page.getByTestId('brain-answering').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {})
  } else {
    await page.getByTestId('brain-unavailable').waitFor({ timeout: 5_000 }).catch(() => {})
  }
  const lastBody = (await comments(T)).filter((c) => c.email !== BRAIN_EMAIL).at(-1)?.body ?? ''
  chk(
    typed.startsWith('@Brain ') && lastBody.startsWith('@Brain') &&
      (MODEL_ON
        ? (await page.getByTestId('comment-brain-badge').count()) > badgesBefore && (await page.getByTestId('brain-answering').count()) === 0
        : (await page.getByTestId('brain-unavailable').count()) === 1),
    'picked, it writes @Brain; posted, the thread shows Brain answering and then its reply, marked as Brain’s',
    MODEL_ON ? `typed "${typed}"; badges ${badgesBefore} → ${await page.getByTestId('comment-brain-badge').count()}, still answering ${await page.getByTestId('brain-answering').count()}` : `where no model answers the composer says why nothing will come: typed "${typed}", note ${await page.getByTestId('brain-unavailable').count()}`,
  )
  await box.fill('@')
  await page.getByTestId('mention-tab-agents').click()
  await page.getByTestId('mention-agents-create').click()
  await page.waitForURL(/hub=agents/, { timeout: 15_000 }).catch(() => {})
  chk(/hub=agents/.test(page.url()) && /agent=new/.test(page.url()), 'the picker’s Agents section ends in frame 04:00’s "+ Create Agent", which opens a new Super Agent', page.url())

  // ══ 6. WHO MADE AN AGENT, SAID ══════════════════════════════════════════════
  const cardAgent = must(await A(`/workspaces/${WS}/super-agents`, { method: 'POST', body: { name: `Card ${TAG}`, description: 'Shows who made it.' } }), 'make an agent')
  madeAccount({ id: cardAgent.userId })
  await page.goto(`${B}/app/${WS}/ai?hub=agents`, { waitUntil: 'domcontentloaded' })
  const cardOf = page.locator('[data-testid="sa-card"]').filter({ hasText: `Card ${TAG}` })
  await cardOf.waitFor({ timeout: 20_000 }).catch(() => {})
  const cardWords = await cardOf.filter({ visible: true }).innerText().catch(() => '')
  chk(
    cardWords.includes(`Made by ${me.display_name}`) && !cardWords.includes('{name}'),
    'a Super Agent’s card says who made it, by name — not "Made by {name}" (found-13-oct/single-brace-placeholders-print-themselves)',
    cardWords.replace(/\s+/g, ' ').slice(0, 160),
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (MODEL_ON_FOR_FINALLY) await stub('reset')
  await browser?.close().catch(() => {})
  stack.close()
  await sql?.end?.({ timeout: 2 }).catch?.(() => {})
}

console.log(`\n${passed} passed, ${failed} failed`)
if (passed + failed !== EXPECTED_CHECKS) {
  console.log(`\n✗ ${passed + failed} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
}
if (failed > 0 || passed + failed !== EXPECTED_CHECKS) process.exitCode = 1
