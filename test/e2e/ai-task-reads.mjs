/**
 * AN AI ROUTE THAT TAKES A TASK BY ID READS IT ONLY FOR SOMEONE WHO MAY OPEN IT.
 *
 * NOT A FRAME ROW: `found-25-sep/ai-task-paths-skip-the-read-rule`, found
 * closing `guest-guard-reads-the-account-role`. Summarising a task, streaming
 * its summary and suggesting its deadline asked only that the caller belonged
 * to the task's workspace; suggesting its assignee asked only that they were
 * not a guest. Measured on lane 2 with the model stub: a guest with nothing
 * shared, and a member refused the task's private list, each had its summary
 * built — the task's title, description, activity and comments sent to the
 * model for them (201).
 *
 * ClickUp (help centre, "What is ClickUp Brain?", search snippets): Brain only
 * surfaces information the person already has permission to see.
 *
 * Where a model answers, the prompts the stub is sent are read back
 * (`model-stub.mjs` records each one); where none does, the refusal must come
 * before the "not configured" answer, so a check reads the same either way.
 *
 *   node test/e2e/ai-task-reads.mjs --api 3022
 */
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 4

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const MODEL = `http://127.0.0.1:${argOf('--model', process.env.E2E_MODEL_PORT ?? String(9200 + (API_PORT - 3020)))}`
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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`

const stamp = Date.now()
const TAG = `atr${stamp}`
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the staging is written by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (key, role) => {
    const email = `${TAG}-${key}@rundesk.invalid`
    const fullName = `${key[0].toUpperCase()}${key.slice(1)} ${TAG}`
    const signed = await signUpApi(API, { fullName, email, password: 'AiTaskReads@12345!', organizationName: `${key} ${stamp}`, organizationSlug: `${key}-${stamp}` })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${key}: ${said(added)}`)
    const [row] = await sql`select id from users where email = ${email}`
    return { id: row.id, name: fullName, as: apiAs(signed.accessToken) }
  }
  const guest = await person('guest', 'guest')
  const member = await person('member', 'member')
  const busy = await person('busy', 'member')

  const listIn = async (name) => {
    const space = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}` } })
    const project = await A('/projects', { method: 'POST', body: { spaceId: space.data?.id, name: `${TAG} ${name}` } })
    const list = await A('/lists', { method: 'POST', body: { projectId: project.data?.id, name: `${TAG} ${name}` } })
    if (list.status >= 300 || !list.data?.id) throw new Error(`could not make the ${name} list: ${said(space)} ${said(list)}`)
    return list.data.id
  }
  const OPEN = await listIn('open')
  const PRIVATE = await listIn('private')
  // Private: its creator and the workspace's managers see it, and the member neither.
  await sql`update lists set visibility = 'private' where id = ${PRIVATE}`
  const task = async (listId, word) => {
    const t = await A('/tasks', { method: 'POST', body: { listId, title: `${TAG} ${word}`, description: `${TAG} ${word} body` } })
    if (t.status >= 300 || !t.data?.id) throw new Error(`could not make "${word}": ${said(t)}`)
    return t.data.id
  }
  const OPEN_WORD = `${TAG}openword`
  const PRIVATE_WORD = `${TAG}privateword`
  const open = await task(OPEN, OPEN_WORD)
  const hidden = await task(PRIVATE, PRIVATE_WORD)
  // The busy member's load: one task the member may read, two they may not.
  const busyOpen = await task(OPEN, `${TAG} busy open`)
  const busyHidden = [await task(PRIVATE, 'busy hidden one'), await task(PRIVATE, 'busy hidden two')]
  for (const id of [busyOpen, ...busyHidden]) await sql`insert into task_assignees (task_id, user_id) values (${id}, ${busy.id})`

  const modelOn = (await A('/ai/status')).data?.available === true
  const seen = async () => (await fetch(`${MODEL}/__control/seen`).then((r) => r.json()).catch(() => null))?.calls ?? null
  /** The prompts `ask` sends a model: those the stub recorded while it ran. */
  const promptsOf = async (ask) => {
    const before = modelOn ? (await seen())?.length ?? null : null
    const res = await ask()
    const calls = modelOn ? ((await seen()) ?? []).slice(before ?? 0) : []
    return { res, text: JSON.stringify(calls), stubRead: !modelOn || before !== null }
  }
  // Allowed: 2xx where a model answers, 503 "not configured" where none does.
  const served = (res) => (modelOn ? res.status < 300 : res.status === 503)
  const why = `a model is ${modelOn ? `configured (stub ${MODEL})` : 'not configured here'}`

  // ══ 1. A SUMMARY ═════════════════════════════════════════════════════════
  console.log(`\n▶ a task summarised by id: by a guest it is not shared with, by a member refused its private list, by a member who reads it — ${why}`)
  const guestSums = await promptsOf(() => guest.as('/ai/summarize', { method: 'POST', body: { taskId: open, type: 'task' } }))
  const memberSumsHidden = await promptsOf(() => member.as('/ai/summarize', { method: 'POST', body: { taskId: hidden, type: 'task' } }))
  const memberSums = await promptsOf(() => member.as('/ai/summarize', { method: 'POST', body: { taskId: open, type: 'task' } }))
  chk(
    guestSums.res.status === 403 && memberSumsHidden.res.status === 403 && served(memberSums.res)
      && guestSums.stubRead && !guestSums.text.includes(OPEN_WORD) && !memberSumsHidden.text.includes(PRIVATE_WORD)
      && (!modelOn || memberSums.text.includes(OPEN_WORD)),
    'a task is summarised for nobody who may not open it — a guest it is not shared with, a member refused its private list (403 each, nothing of it sent to a model) — and for a member who reads it, it is',
    `guest ${said(guestSums.res)}${guestSums.text.includes(OPEN_WORD) ? ', its words SENT' : ''}; member, private list ${said(memberSumsHidden.res)}${memberSumsHidden.text.includes(PRIVATE_WORD) ? ', its words SENT' : ''}; member, open list ${said(memberSums.res)}${modelOn && !memberSums.text.includes(OPEN_WORD) ? ', its words not sent' : ''}; ${why}`,
  )

  // ══ 2. A STREAMED SUMMARY ════════════════════════════════════════════════
  console.log('\n▶ the same, streamed')
  const guestStreams = await promptsOf(() => guest.as('/ai/summarize/stream', { method: 'POST', body: { taskId: open, type: 'task' } }))
  const memberStreamsHidden = await promptsOf(() => member.as('/ai/summarize/stream', { method: 'POST', body: { taskId: hidden, type: 'task' } }))
  const memberStreams = await promptsOf(() => member.as('/ai/summarize/stream', { method: 'POST', body: { taskId: open, type: 'task' } }))
  chk(
    guestStreams.res.status === 403 && memberStreamsHidden.res.status === 403 && served(memberStreams.res)
      && !guestStreams.text.includes(OPEN_WORD) && !memberStreamsHidden.text.includes(PRIVATE_WORD)
      && (!modelOn || memberStreams.text.includes(OPEN_WORD)),
    'a streamed summary is refused as the summary is — to the guest and to the member refused the private list (403 each, nothing sent) — and streamed for the member who reads the task',
    `guest ${said(guestStreams.res)}; member, private list ${said(memberStreamsHidden.res)}; member, open list ${said(memberStreams.res)}; ${why}`,
  )

  // ══ 3. A DEADLINE ════════════════════════════════════════════════════════
  console.log('\n▶ a deadline suggested for a task by id, and the workload counted for it')
  const guestDeadline = await promptsOf(() => guest.as('/ai/task/deadline', { method: 'POST', body: { title: 'when?', taskId: open } }))
  const memberDeadlineHidden = await promptsOf(() => member.as('/ai/task/deadline', { method: 'POST', body: { title: 'when?', taskId: hidden } }))
  const memberDeadline = await promptsOf(() => member.as('/ai/task/deadline', { method: 'POST', body: { title: 'when?', taskId: busyOpen } }))
  const adminDeadline = await promptsOf(() => A('/ai/task/deadline', { method: 'POST', body: { title: 'when?', taskId: busyOpen } }))
  const load = (p) => Number(new RegExp(`${busy.name}: (\\d+) open task`).exec(p.text)?.[1] ?? NaN)
  chk(
    guestDeadline.res.status === 403 && memberDeadlineHidden.res.status === 403 && served(memberDeadline.res) && served(adminDeadline.res)
      && (!modelOn || (load(memberDeadline) === 1 && load(adminDeadline) === 3)),
    'a deadline is suggested for no task its asker may not open (403 each) — and the workload it weighs counts, for a member, only the tasks they may open: one of the busy member’s three, where the admin’s counts all three',
    `guest ${said(guestDeadline.res)}; member, private list ${said(memberDeadlineHidden.res)}; member ${said(memberDeadline.res)}, counted ${load(memberDeadline)}; admin ${said(adminDeadline.res)}, counted ${load(adminDeadline)}; ${why}`,
  )

  // ══ 4. AN ASSIGNEE ═══════════════════════════════════════════════════════
  console.log('\n▶ an assignee suggested for a task, by the member, in the private list and in the open one')
  const pickHidden = await member.as(`/ai/assignee-suggestion?taskId=${hidden}`)
  const pickOpen = await member.as(`/ai/assignee-suggestion?taskId=${open}`)
  chk(
    pickHidden.status === 200 && pickHidden.data?.ok === false && pickHidden.data?.reason === 'no_permission' && !pickHidden.data?.pick
      && pickOpen.status === 200 && pickOpen.data?.ok === true,
    'an assignee is suggested for no task the asker may not open — the private list’s answers that they may not, with no pick — and for one they read, it is',
    `private list ${pickHidden.status} ${JSON.stringify(pickHidden.data ?? pickHidden.error ?? null).slice(0, 160)}; open list ${pickOpen.status} ok=${pickOpen.data?.ok}`,
  )
} catch (err) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(err?.message ?? err).split('\n')[0]}`)
} finally {
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
