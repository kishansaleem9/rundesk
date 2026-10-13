/**
 * SUPER AGENTS, AS CLICKUP HAS THEM (`commit-log/log-214dac0-1`,
 * `ledger-rows/row-852`, `ledger-rows/row-770`, the Agents half of
 * `ledger-rows/row-745`).
 *
 * An agent is a profile — Instructions, Triggers, Skills, Knowledge, Memory —
 * with its own account in the workspace, started by the product's own moments:
 * an @mention in a comment or in Chat, a direct message, an assignment, a
 * schedule, an Automation, or "Run agent" on its profile. It answers where it
 * was asked, as itself, and what it does with its Skills is done under the
 * rights of the person it acts for. Each check below reads what the product
 * WROTE — a comment's author and thread, a message's channel, a task's maker,
 * a run's row — so a box that draws an agent without one cannot pass.
 *
 * A MODEL LANE: the agent's turn and the builder are answered by
 * `model-stub.mjs`, which signs each answer with the agent's name and what
 * started it, and a staged tool call is how a Skill is exercised.
 *
 *   node test/e2e/super-agents.mjs --api 3029 --dist /tmp/claude-0/dist-9
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

const EXPECTED_CHECKS = 39

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const MODEL = `http://127.0.0.1:${argOf('--model', process.env.E2E_MODEL_PORT ?? String(9200 + (API_PORT - 3020)))}`
const REPO = path.resolve(import.meta.dirname, '../..')
const ADMIN = { email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal', password: process.env.E2E_PASSWORD ?? 'Admin@123!' }

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

const stamp = Date.now()
const TAG = `sa${stamp}`
const PASSWORD = 'SuperAgents@12345!'

const stack = await startLocalStack({ dist: path.resolve(REPO, argOf('--dist', 'apps/web/dist')), apiPort: API_PORT })
const B = stack.base
const API = `${B}/api/v1`
const apiAs = apiAsAt(API, { emptyBodyOn: ['POST'] })
const said = (res) => `${res.status} ${JSON.stringify(res.message || null)}`
const must = (res, what) => {
  if (!res.ok || !res.data) throw new Error(`could not ${what}: ${said(res)}`)
  return res.data
}
/** The stub's control routes: reset what an earlier run left staged, stage the next answer, read what was asked. */
const stub = (route, body) =>
  fetch(`${MODEL}/__control/${route}`, {
    method: body === undefined && route === 'seen' ? 'GET' : 'POST',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
    .then(async (r) => (r.ok ? (route === 'seen' ? r.json() : true) : false))
    .catch(() => false)

let sql = null
let browser = null
let WS = null
// Whether the stub was in use, for the clean-up at the end, which runs outside the block that read it.
let MODEL_ON_FOR_FINALLY = false

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — what the agents wrote is read by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  const A = apiAs(auth.accessToken)
  /*
   * WHERE NO MODEL ANSWERS, AS IN CI: every check keeps its sentence and reads
   * the other half of it — the run is written down as failed with the refusal,
   * and nothing is answered, made or remembered. A model lane reads the answers.
   */
  const aiStatus = await A('/ai/status')
  const MODEL_ON = aiStatus.status === 200 && aiStatus.data?.available === true
  console.log(`  · /ai/status says a model is ${MODEL_ON ? `configured (stub ${MODEL})` : 'not configured: each check reads the refusal'}`)
  if (MODEL_ON && !(await stub('reset'))) throw new Error(`a model is configured but no stub answers on ${MODEL}`)
  MODEL_ON_FOR_FINALLY = MODEL_ON
  const REFUSED = /AI features are not configured/
  const [me] = await sql`select id, timezone from users where lower(email) = lower(${ADMIN.email})`
  WS = must(await A('/workspaces', { method: 'POST', body: { name: `Super agents ${TAG}` } }), 'make the workspace').id
  madeWorkspace(WS)
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { fullName: `${who} ${stamp}`, email, password: PASSWORD, organizationName: `Agents ${who} ${stamp}`, organizationSlug: `agents-${who}-${stamp}` })
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
  const T = must(await M('/tasks', { method: 'POST', body: { listId: L, title: `Plan the launch ${TAG}` } }), 'make the task').id
  const T2 = must(await M('/tasks', { method: 'POST', body: { listId: L, title: `Book the venue ${TAG}` } }), 'make the second task').id

  const comments = (taskId) => sql`select id, author_id::text as author, parent_comment_id::text as parent, body from task_comments where task_id = ${taskId} order by created_at`
  const runsOf = (agentId) => sql`select trigger, status, triggered_by_id::text as by, error, input, output from super_agent_runs where agent_id = ${agentId} order by started_at`
  const settle = (predicate, ms = 15_000) => waitUntil(predicate, { timeoutMs: ms, lastLookGraceMs: 0 })
  const msgs = (channelId) => sql`select author_id::text as author, parent_message_id::text as parent, body from chat_messages where channel_id = ${channelId} order by created_at`
  const dmOf = async (a, b) =>
    (
      await sql`
        select c.id::text as id from chat_channels c
        where c.is_dm and c.workspace_id = ${WS}
          and exists (select 1 from chat_channel_members m where m.channel_id = c.id and m.user_id = ${a})
          and exists (select 1 from chat_channel_members m where m.channel_id = c.id and m.user_id = ${b})`
    )[0]?.id ?? null

  // ══ 1. WHO HAS AGENTS ═════════════════════════════════════════════════════
  console.log('\n▶ who has Super Agents, and what an agent is')
  const guestList = await gus.api(`/workspaces/${WS}/super-agents`)
  chk(guestList.status === 403, 'a guest is refused the workspace’s Super Agents (403), as in ClickUp', said(guestList))
  const helperRes = await M(`/workspaces/${WS}/super-agents`, {
    method: 'POST',
    body: { name: `Helper ${TAG}`, description: 'Answers questions about the launch.', instructions: 'Be brief.' },
  })
  const helper = must(helperRes, 'make Mia’s agent')
  madeAccount({ id: helper.userId })
  const [account] = await sql`select is_agent, password_hash is null as no_password from users where id = ${helper.userId}`
  const [membership] = await sql`select role from workspace_members where workspace_id = ${WS} and user_id = ${helper.userId}`
  const roster = (await A(`/workspaces/${WS}/members`)).data ?? []
  chk(
    helperRes.status === 201 && account?.is_agent === true && account?.no_password === true && membership?.role === 'member' && !roster.some((m) => m.userId === helper.userId),
    'a new agent is its own account — an agent, with no password, a member of the workspace — and is not on the people roster',
    `${said(helperRes)}; account ${JSON.stringify(account ?? null)}; member ${JSON.stringify(membership ?? null)}; on roster ${roster.some((m) => m.userId === helper.userId)}`,
  )
  // Made, it says what it is, as ClickUp's agents do: a direct message to its maker.
  await settle(async () => {
    const id = await dmOf(helper.userId, mia.id)
    return !!id && (await msgs(id)).some((m) => m.author === helper.userId)
  })
  const introDm = await dmOf(helper.userId, mia.id)
  const intro = introDm ? (await msgs(introDm)).find((m) => m.author === helper.userId) : null
  chk(
    /^Hi, I'm Helper sa\d+\. Answers questions about the launch\.\nWhat I can do: find tasks, create tasks\.\nWhat starts me: an @mention in a comment or in Chat, a direct message, being assigned a task\./.test(intro?.body ?? ''),
    'made, the agent DMs its maker what it can do and what starts it',
    JSON.stringify(intro?.body ?? null),
  )
  const secret = must(await A(`/workspaces/${WS}/super-agents`, { method: 'POST', body: { name: `Secret ${TAG}` } }), 'make the admin’s agent')
  madeAccount({ id: secret.userId })
  must(await A(`/super-agents/${secret.id}/access`, { method: 'PUT', body: { isPrivate: true, userIds: [] } }), 'make it private')
  const miaSees = ((await M(`/workspaces/${WS}/super-agents`)).data ?? []).map((a) => a.id)
  const miaOpens = await M(`/super-agents/${secret.id}`)
  chk(
    miaSees.includes(helper.id) && !miaSees.includes(secret.id) && miaOpens.status === 404,
    'a private agent is not listed to, nor opened by, somebody it is not shared with',
    `Mia sees ${JSON.stringify(miaSees)}; opening it: ${said(miaOpens)}`,
  )
  // An agent's account is a member, and takes no member's place: the plan's count and each member's AI credits are people's.
  const [people] = await sql`
    select count(*)::int as all, count(*) filter (where wm.role <> 'guest')::int as credited, count(*) filter (where u.is_agent)::int as agents
    from workspace_members wm join users u on u.id = wm.user_id where wm.workspace_id = ${WS}`
  const plan = must(await A(`/workspaces/${WS}/plan`), 'read the plan')
  const credits = must(await A(`/ai/credits?workspaceId=${WS}`), 'read the credits')
  chk(
    people.agents === 2 && plan.usage?.members === people.all - people.agents && credits.members === people.credited - people.agents,
    'an agent takes no member’s place: not in the plan’s member count, nor in the credits each member brings',
    JSON.stringify({ people, planMembers: plan.usage?.members, creditMembers: credits.members }),
  )
  // Nor among the people a comment may mention: agents are offered in their own section, which asks who may see them.
  const candidates = must(await M(`/tasks/${T}/comments/mention-candidates`), 'read the people Mia may mention')
  const candidateIds = (Array.isArray(candidates) ? candidates : candidates.items ?? []).map((c) => c.userId)
  chk(
    candidateIds.includes(mia.id) && !candidateIds.includes(helper.userId) && !candidateIds.includes(secret.userId),
    'no agent is offered among the people a comment may mention — a private one least of all',
    JSON.stringify(candidateIds),
  )
  const adminChanges = await A(`/super-agents/${helper.id}`, { method: 'PATCH', body: { instructions: 'Be brief. Sign off with a wave.' } })
  must(await A(`/super-agents/${secret.id}/access`, { method: 'PUT', body: { isPrivate: true, userIds: [mia.id] } }), 'share it with Mia')
  const sharedNow = ((await M(`/workspaces/${WS}/super-agents`)).data ?? []).map((a) => a.id)
  /*
   * Shared with her, so she sees it and may use it — and still may not change it:
   * the change rule is asked of an agent its reader can see. Asked of one she
   * cannot, the 404 came from visibility and the rule was never reached, so the
   * check passed with the rule removed (`sa-4`, 13 October).
   */
  const miaChanges = await M(`/super-agents/${secret.id}`, { method: 'PATCH', body: { name: 'Mine now' } })
  chk(
    miaChanges.status === 403 && /Only its maker or a workspace admin/.test(miaChanges.message ?? '') && adminChanges.ok && adminChanges.data?.instructions === 'Be brief. Sign off with a wave.',
    'only its maker or a workspace admin changes an agent',
    `Mia on the admin’s, shared with her: ${said(miaChanges)}; admin on Mia’s: ${said(adminChanges)}`,
  )
  chk(sharedNow.includes(secret.id), 'shared with Mia, the private agent is listed to her', JSON.stringify(sharedNow))
  must(await A(`/super-agents/${secret.id}/access`, { method: 'PUT', body: { isPrivate: true, userIds: [] } }), 'unshare it')

  // ══ 2. THE BUILDER ════════════════════════════════════════════════════════
  console.log('\n▶ the builder drafts; nothing is made until it is saved')
  const before = (await sql`select count(*)::int as n from super_agents where workspace_id = ${WS}`)[0].n
  const draft = await M(`/workspaces/${WS}/super-agents/build`, { method: 'POST', body: { description: 'Every Monday, list overdue work and who owns it.' } })
  const after = (await sql`select count(*)::int as n from super_agents where workspace_id = ${WS}`)[0].n
  chk(
    (MODEL_ON
      ? draft.ok && draft.data?.name === 'Stub Triage Agent' && JSON.stringify(draft.data?.skills) === '["search_tasks"]' &&
        draft.data?.triggers?.schedule?.every === 'weekly' && draft.data?.triggers?.schedule?.at === '08:30'
      : draft.status === 503 && REFUSED.test(draft.message ?? '')) && before === after,
    'the builder’s draft keeps the profile’s own values (a skill that is not one is dropped) and saves nothing',
    `${said(draft)} ${JSON.stringify(draft.data ?? null)}; agents ${before} → ${after}`,
  )
  const empty = await M(`/workspaces/${WS}/super-agents/build`, { method: 'POST', body: { description: '  ' } })
  chk(empty.status === 400, 'a builder asked nothing is refused in words (400)', said(empty))

  // ══ 3. AN @MENTION IN A COMMENT ═══════════════════════════════════════════
  console.log('\n▶ @mentioned in a comment, it answers in the thread, as itself')
  const asked = must(await M(`/tasks/${T}/comments`, { method: 'POST', body: { body: `<@${helper.userId}> what is left?`, mentions: [{ userId: helper.userId, offset: 0, length: 0 }] } }), 'mention the agent')
  /** Finished: the run row is no longer running (an answer is posted before it is finished). */
  const finished = (agentId, trigger, count = 1) =>
    settle(async () => (await runsOf(agentId)).filter((r) => r.trigger === trigger && r.status !== 'running').length >= count)
  await finished(helper.id, 'mention')
  const reply = (await comments(T)).find((c) => c.author === helper.userId)
  const [run1] = await runsOf(helper.id)
  chk(
    MODEL_ON
      ? reply?.parent === asked.id && /^Helper sa\d+ here, started by an @mention/.test(reply?.body ?? '')
      : !reply && run1?.status === 'failed' && REFUSED.test(run1?.error ?? ''),
    'the agent replies in the comment’s own thread, as itself, with its own answer',
    JSON.stringify(MODEL_ON ? reply ?? null : { reply: reply ?? null, run: run1 ?? null }),
  )
  chk(
    run1?.trigger === 'mention' && run1?.status === (MODEL_ON ? 'completed' : 'failed') && run1?.by === mia.id,
    'the run is written down: an @mention, completed, started by Mia',
    JSON.stringify(run1 ?? null),
  )
  const agentNotes = (await sql`select count(*)::int as n from notifications where user_id = ${helper.userId}`)[0].n
  chk(agentNotes === 0, 'an agent’s account gets no notifications — what reaches it are its triggers', `${agentNotes} notification(s)`)

  // An agent’s own words start nothing: an answer that names the other agent does not wake it.
  must(await A(`/super-agents/${secret.id}/access`, { method: 'PUT', body: { isPrivate: false, userIds: [] } }), 'make the other agent public')
  if (MODEL_ON) await stub('next', { text: `Ask <@${secret.userId}> about that.` })
  must(await M(`/tasks/${T2}/comments`, { method: 'POST', body: { body: `<@${helper.userId}> who knows?`, mentions: [{ userId: helper.userId, offset: 0, length: 0 }] } }), 'mention it again')
  await finished(helper.id, 'mention', 2)
  await new Promise((r) => setTimeout(r, 1500))
  const handedOn = (await comments(T2)).find((c) => c.author === helper.userId)
  const secretRuns = await runsOf(secret.id)
  chk(
    (MODEL_ON ? (handedOn?.body ?? '').includes(secret.userId) : !handedOn) && secretRuns.length === 0,
    'an agent’s answer that mentions another agent does not start it — no loop between agents',
    `answer ${JSON.stringify(handedOn?.body ?? null)}; the other agent ran ${secretRuns.length} time(s)`,
  )
  must(await A(`/super-agents/${secret.id}/access`, { method: 'PUT', body: { isPrivate: true, userIds: [] } }), 'make it private again')

  // Mentioned by somebody it is not shared with: written down as skipped, and silent.
  must(await M(`/tasks/${T2}/comments`, { method: 'POST', body: { body: `<@${secret.userId}> hello?`, mentions: [{ userId: secret.userId, offset: 0, length: 0 }] } }), 'mention the private agent')
  await settle(async () => (await runsOf(secret.id)).length > 0)
  const [skipped] = await runsOf(secret.id)
  chk(
    skipped?.status === 'skipped' && /may not use/.test(skipped?.error ?? '') && !(await comments(T2)).some((c) => c.author === secret.userId),
    'a private agent mentioned by somebody it is not shared with does not answer; its run is skipped, with why',
    JSON.stringify(skipped ?? null),
  )

  // Switched off: kept with its history, started by nothing.
  must(await M(`/super-agents/${helper.id}`, { method: 'PATCH', body: { isActive: false } }), 'switch it off')
  const offCount = (await comments(T)).length
  must(await M(`/tasks/${T}/comments`, { method: 'POST', body: { body: `<@${helper.userId}> still there?`, mentions: [{ userId: helper.userId, offset: 0, length: 0 }] } }), 'mention it switched off')
  await settle(async () => (await runsOf(helper.id)).some((r) => r.status === 'skipped'))
  const offRuns = await runsOf(helper.id)
  chk(
    offRuns.some((r) => r.status === 'skipped' && /switched off/.test(r.error ?? '')) && (await comments(T)).length === offCount + 1,
    'a switched-off agent answers nothing; the run says it was switched off',
    JSON.stringify(offRuns.map((r) => [r.status, r.error])),
  )
  must(await M(`/super-agents/${helper.id}`, { method: 'PATCH', body: { isActive: true } }), 'switch it back on')

  // ══ 4. ASSIGNED A TASK ════════════════════════════════════════════════════
  console.log('\n▶ assigned a task, it starts on it')
  must(await M(`/tasks/${T2}/assignees`, { method: 'POST', body: { userId: helper.userId } }), 'assign the agent')
  await finished(helper.id, 'assign')
  const onAssign = (await comments(T2)).find((c) => c.author === helper.userId && /being assigned a task/.test(c.body))
  const assignRun = (await runsOf(helper.id)).find((r) => r.trigger === 'assign')
  chk(
    MODEL_ON ? !!onAssign && onAssign.parent === null : assignRun?.status === 'failed' && REFUSED.test(assignRun?.error ?? '') && assignRun?.by === mia.id,
    'given a task, the agent writes on it — a comment of its own, not a reply',
    JSON.stringify(MODEL_ON ? onAssign ?? null : assignRun ?? null),
  )

  // ══ 5. SKILLS, UNDER THE RIGHTS OF THE PERSON IT ACTS FOR ═════════════════
  console.log('\n▶ what it does with its Skills is done as the person it acts for')
  if (MODEL_ON) await stub('next', { content: [{ type: 'tool_use', name: 'create_task', input: { listId: L, title: `Made by the agent ${TAG}` } }] })
  const made = await M(`/super-agents/${helper.id}/run`, { method: 'POST', body: { prompt: 'Make a task for the launch' } })
  const [madeTask] = await sql`select created_by_id::text as by, list_id::text as list from tasks where title = ${`Made by the agent ${TAG}`}`
  chk(
    MODEL_ON
      ? made.ok && made.data?.status === 'completed' && madeTask?.by === mia.id && madeTask?.list === L && /✓/.test(made.data?.output ?? '')
      : made.ok && made.data?.status === 'failed' && REFUSED.test(made.data?.error ?? '') && !madeTask,
    'a Skill the agent uses is carried out as Mia, who started it: the task is hers, in her list',
    `${said(made)} ${JSON.stringify(made.data?.output ?? null)}; task ${JSON.stringify(madeTask ?? null)}`,
  )
  if (MODEL_ON) await stub('next', { content: [{ type: 'tool_use', name: 'create_task', input: { listId: SECRET_LIST, title: `Smuggled ${TAG}` } }] })
  const smuggle = await M(`/super-agents/${helper.id}/run`, { method: 'POST', body: { prompt: 'Make a task in the closed list' } })
  const [smuggled] = await sql`select id from tasks where title = ${`Smuggled ${TAG}`}`
  chk(
    smuggle.ok && !smuggled && (MODEL_ON ? /⚠ Skipped creating/.test(smuggle.data?.output ?? '') : smuggle.data?.status === 'failed'),
    'nor can it do for her what she may not: a list she cannot read gets no task, and the answer says it was skipped',
    `${said(smuggle)} ${JSON.stringify(smuggle.data?.output ?? null)}; task ${JSON.stringify(smuggled ?? null)}`,
  )

  // ══ 6. MEMORY ═════════════════════════════════════════════════════════════
  console.log('\n▶ what it remembers')
  must(await M(`/super-agents/${helper.id}/run`, { method: 'POST', body: { prompt: `remember that the launch is on Friday ${TAG}` } }), 'ask it to remember')
  const mems = must(await M(`/super-agents/${helper.id}/memories`), 'read its memory')
  const pref = mems.find((m) => m.kind === 'preference')
  chk(
    MODEL_ON
      ? pref?.approved === false && pref?.content === `the launch is on Friday ${TAG}` && mems.some((m) => m.kind === 'recent')
      : mems.length === 0,
    'asked to remember, it keeps a preference waiting for approval; its recent work is remembered too',
    JSON.stringify(mems.map((m) => [m.kind, m.approved, m.content.slice(0, 40)])),
  )
  if (MODEL_ON) {
    must(await M(`/super-agents/${helper.id}/memories/${pref.id}/approve`, { method: 'POST' }), 'approve the preference')
    await stub('reset')
  }
  const again = must(await M(`/super-agents/${helper.id}/run`, { method: 'POST', body: { prompt: 'When is the launch?' } }), 'ask it again')
  const seen = MODEL_ON ? await stub('seen') : null
  const lastSystem = JSON.stringify(seen?.calls?.at(-1)?.system ?? '')
  chk(
    MODEL_ON ? lastSystem.includes(`the launch is on Friday ${TAG}`) : again.status === 'failed' && REFUSED.test(again.error ?? ''),
    'an approved preference is in what it is told the next time it runs',
    MODEL_ON ? lastSystem.slice(0, 300) : JSON.stringify(again),
  )

  // ══ 7. DIRECT MESSAGES AND CHAT ═══════════════════════════════════════════
  console.log('\n▶ in Chat: a direct message, and a mention in a channel')
  const dm = must(await M(`/workspaces/${WS}/chat/dms`, { method: 'POST', body: { peerUserId: helper.userId } }), 'open the DM')
  must(await M(`/chat/channels/${dm.id}/messages`, { method: 'POST', body: { body: 'Anything due today?' } }), 'message the agent')
  await finished(helper.id, 'dm')
  const dmAnswer = (await msgs(dm.id)).find((m) => m.author === helper.userId && /started by a direct message/.test(m.body))
  const dmRun = (await runsOf(helper.id)).find((r) => r.trigger === 'dm')
  chk(
    MODEL_ON ? dmAnswer?.parent === null : !dmAnswer && dmRun?.status === 'failed' && REFUSED.test(dmRun?.error ?? ''),
    'a direct message is answered in the DM, by the agent',
    JSON.stringify(MODEL_ON ? dmAnswer ?? null : dmRun ?? null),
  )
  const channel = must(await A(`/workspaces/${WS}/chat/channels`, { method: 'POST', body: { name: `${TAG}-launch` } }), 'make a channel')
  const root = must(await M(`/chat/channels/${channel.id}/messages`, { method: 'POST', body: { body: `<@${helper.userId}> summarise please` } }), 'mention it in the channel')
  // The fourth @mention of it: two answered, one while it was switched off, and this one.
  await finished(helper.id, 'mention', 4)
  const threaded = (await msgs(channel.id)).find((m) => m.author === helper.userId)
  const channelRun = (await runsOf(helper.id)).filter((r) => r.trigger === 'mention').at(-1)
  chk(
    MODEL_ON
      ? threaded?.parent === root.id && /started by an @mention/.test(threaded?.body ?? '')
      : !threaded && channelRun?.status === 'failed' && channelRun?.input === `<@${helper.userId}> summarise please`,
    'mentioned in a channel, it replies in the message’s thread',
    JSON.stringify(MODEL_ON ? threaded ?? null : channelRun ?? null),
  )

  // ══ 8. AN AUTOMATION ══════════════════════════════════════════════════════
  console.log('\n▶ an Automation’s “Run a Super Agent”')
  must(
    await A(`/workspaces/${WS}/automations`, {
      method: 'POST',
      body: { name: `${TAG} triage`, trigger: { type: 'task.created', filters: { listId: L } }, actions: [{ type: 'run_super_agent', params: { agentId: helper.id, instructions: `Triage this ${TAG}` } }] },
    }),
    'make the automation',
  )
  const T3 = must(await M('/tasks', { method: 'POST', body: { listId: L, title: `Fresh work ${TAG}` } }), 'make a task the rule fires on').id
  await finished(helper.id, 'automation')
  const byRule = (await runsOf(helper.id)).find((r) => r.trigger === 'automation')
  const ruleAnswered = (await comments(T3)).some((c) => c.author === helper.userId && /an Automation/.test(c.body))
  chk(
    byRule?.input === `Triage this ${TAG}` && (MODEL_ON ? byRule?.status === 'completed' && ruleAnswered : byRule?.status === 'failed' && !ruleAnswered),
    'the rule runs the agent on the task with the action’s own instructions, and it answers on the task',
    JSON.stringify(byRule ?? null),
  )

  // ══ 9. A SCHEDULE ═════════════════════════════════════════════════════════
  console.log('\n▶ on a schedule, its answer goes to its maker')
  const zone = me.timezone || 'UTC'
  const nextMinute = new Intl.DateTimeFormat('en-GB', { timeZone: zone, minute: '2-digit' }).format(new Date(Date.now() + 60_000)).padStart(2, '0')
  const sched = must(await A(`/workspaces/${WS}/super-agents`, { method: 'POST', body: { name: `Clock ${TAG}`, triggers: { mention: { on: true }, dm: { on: true }, assign: { on: true }, schedule: { on: true, every: 'hourly', at: `00:${nextMinute}` } } } }), 'make the scheduled agent')
  madeAccount({ id: sched.userId })
  // Written down when it starts, finished when it has answered: waited for until it is finished.
  await settle(async () => (await runsOf(sched.id)).some((r) => r.trigger === 'schedule' && r.status !== 'running'), 150_000)
  const [ranOnce] = (await runsOf(sched.id)).filter((r) => r.trigger === 'schedule')
  const [dmWithMaker] = await sql`
    select c.id from chat_channels c
    where c.is_dm and c.workspace_id = ${WS}
      and exists (select 1 from chat_channel_members m where m.channel_id = c.id and m.user_id = ${sched.userId})
      and exists (select 1 from chat_channel_members m where m.channel_id = c.id and m.user_id = ${me.id})`
  const scheduled = dmWithMaker ? (await msgs(dmWithMaker.id)).find((m) => m.author === sched.userId && /started by your schedule/.test(m.body)) : null
  chk(
    ranOnce?.by === null && (MODEL_ON ? ranOnce?.status === 'completed' && /started by your schedule/.test(scheduled?.body ?? '') : ranOnce?.status === 'failed' && !scheduled),
    'its hour comes, it runs by itself — started by nobody — and DMs its maker the answer',
    `run ${JSON.stringify(ranOnce ?? null)}; DM ${JSON.stringify(scheduled ?? null)}`,
  )

  // ══ 10. ACTIVITY ══════════════════════════════════════════════════════════
  console.log('\n▶ Activity')
  const skippedOnly = must(await A(`/workspaces/${WS}/super-agents/activity?status=skipped`), 'read the skipped runs')
  const miasOnly = must(await M(`/workspaces/${WS}/super-agents/activity?mine=true`), 'read Mia’s agents’ runs')
  chk(
    skippedOnly.length >= 2 && skippedOnly.every((r) => r.status === 'skipped') && miasOnly.length > 0 && miasOnly.every((r) => r.agentId === helper.id),
    'Activity filters by status and by “My agents”',
    `skipped ${JSON.stringify(skippedOnly.map((r) => r.status))}; Mia’s ${JSON.stringify([...new Set(miasOnly.map((r) => r.agentName))])}`,
  )
  const miaActivity = must(await M(`/workspaces/${WS}/super-agents/activity`), 'read Activity as Mia')
  chk(!miaActivity.some((r) => r.agentId === secret.id), 'a private agent’s runs are not in the Activity of somebody it is not shared with', JSON.stringify([...new Set(miaActivity.map((r) => r.agentName))]))

  // ══ 11. THE PAGES ═════════════════════════════════════════════════════════
  console.log('\n▶ the AI hub, the create menu and the pickers')
  const chromium = await resolveChromium()
  browser = await chromium.launch(launchOptions())
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  page.setDefaultTimeout(15_000)
  await page.goto(`${B}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', ADMIN.email)
  await page.fill('input[type=password]', ADMIN.password)
  await page.click('button[type=submit]')
  await page.waitForURL(/\/app/, { timeout: LOGIN_NAV_TIMEOUT_MS })
  await page.goto(`${B}/app/${WS}/ai`, { waitUntil: 'domcontentloaded' })
  // Bounded: a switch that is gone fails the check below by name, not the run (`sa-23`).
  await page.getByTestId('ai-mode-agents').click({ timeout: 25_000 }).catch(() => {})
  await page.getByRole('button', { name: /^Accept$/ }).click({ timeout: 2000 }).catch(() => {})
  const cards = page.locator('[data-testid="sa-card"]')
  await page.locator(`[data-testid="sa-card"][data-agent-id="${helper.id}"]`).waitFor({ timeout: 15_000 }).catch(() => {})
  const cardIds = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-agent-id')))
  chk(
    cardIds.includes(helper.id) && cardIds.includes(secret.id) && cardIds.includes(sched.id),
    'Ask | Agents: All Agents lists the workspace’s agents the reader may see',
    JSON.stringify(cardIds),
  )

  await page.getByTestId('sa-new').click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('sa-builder-input').fill('Every Monday, list overdue work.', { timeout: 10_000 }).catch(() => {})
  await page.getByTestId('sa-builder-submit').click({ timeout: 10_000 }).catch(() => {})
  // Where no model answers the builder says so, and the form is started from scratch instead.
  let builderRefusal = null
  if (!MODEL_ON) {
    await page.getByTestId('sa-builder-error').waitFor({ timeout: 15_000 }).catch(() => {})
    builderRefusal = await page.getByTestId('sa-builder-error').filter({ visible: true }).textContent().catch(() => null)
    await page.getByTestId('sa-from-scratch').click().catch(() => {})
  }
  await page.getByTestId('sa-form-name').waitFor({ timeout: 15_000 }).catch(() => {})
  const drafted = await page.getByTestId('sa-form-name').inputValue().catch(() => null)
  // Bounded, as the presses above them: with no Agents switch there is no form (`sa-23`).
  await page.getByTestId('sa-form-name').fill(`Built ${TAG}`, { timeout: 10_000 }).catch(() => {})
  await page.getByTestId('sa-form-create').click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('sa-profile').waitFor({ timeout: 15_000 }).catch(() => {})
  const [built] = await sql`select id, user_id::text as user, skills, triggers from super_agents where name = ${`Built ${TAG}`}`
  if (built) madeAccount({ id: built.user })
  chk(
    (MODEL_ON
      ? drafted === 'Stub Triage Agent' && built && JSON.stringify(built.skills) === '["search_tasks"]' && built.triggers?.schedule?.every === 'weekly'
      : REFUSED.test(builderRefusal ?? '') && drafted === '' && built && JSON.stringify(built.skills) === '["search_tasks","create_task"]') &&
      (await page.getByTestId('sa-profile-name').filter({ visible: true }).textContent().catch(() => null)) === `Built ${TAG}`,
    'New Super Agent: the builder fills the form, and Create makes the agent from it and opens its profile',
    `drafted ${JSON.stringify(drafted)}; made ${JSON.stringify(built ?? null)}`,
  )

  await page.getByTestId('sa-run-input').fill('Say hello', { timeout: 10_000 }).catch(() => {})
  await page.getByTestId('sa-run-submit').click({ timeout: 10_000 }).catch(() => {})
  const output = page.locator('[data-testid="sa-run-output"]')
  await output.waitFor({ timeout: 20_000 }).catch(() => {})
  chk(
    MODEL_ON
      ? (await output.getAttribute('data-status').catch(() => null)) === 'completed' && /^Built sa\d+ here, started by a test run from your profile/.test((await output.filter({ visible: true }).textContent().catch(() => '')) ?? '')
      : (await output.getAttribute('data-status').catch(() => null)) === 'failed' && REFUSED.test((await output.filter({ visible: true }).textContent().catch(() => '')) ?? ''),
    'Run agent on the profile answers on the page, from the agent the page is about',
    `${await output.getAttribute('data-status').catch(() => null)}: ${await output.textContent().catch(() => null)}`,
  )

  await page.getByTestId('sa-message').click({ timeout: 10_000 }).catch(() => {})
  await page.waitForURL(/\/chat\?.*channel=/, { timeout: 15_000 }).catch(() => {})
  const channelInUrl = new URL(page.url()).searchParams.get('channel')
  const [dmMembers] = channelInUrl
    ? await sql`select array_agg(user_id::text order by user_id) as ids from chat_channel_members where channel_id = ${channelInUrl}`
    : [null]
  chk(
    !!channelInUrl && (dmMembers?.ids ?? []).includes(built?.user) && (dmMembers?.ids ?? []).includes(me.id),
    'Message on the profile opens a DM with the agent',
    `${page.url()}; members ${JSON.stringify(dmMembers?.ids ?? null)}`,
  )

  // The same Message, on a colleague's profile panel, opened from her name in Chat
  // (`found-13-oct/person-panel-message-sends-the-wrong-field`: it sent `userId`, refused 400).
  await page.goto(`${B}/app/${WS}/chat?channel=${channel.id}`, { waitUntil: 'domcontentloaded' })
  const miaName = page.getByRole('button', { name: `mia ${stamp}`, exact: true }).first()
  await miaName.waitFor({ timeout: 20_000 }).catch(() => {})
  await miaName.click().catch(() => {})
  await page.getByTestId('person-message').click({ timeout: 10_000 }).catch(() => {})
  const dmWithMia = async () =>
    (
      await sql`
        select c.id::text as id from chat_channels c
        where c.is_dm and c.workspace_id = ${WS}
          and exists (select 1 from chat_channel_members m where m.channel_id = c.id and m.user_id = ${me.id})
          and exists (select 1 from chat_channel_members m where m.channel_id = c.id and m.user_id = ${mia.id})
          and (select count(*) from chat_channel_members m where m.channel_id = c.id) = 2`
    )[0]?.id ?? null
  const inUrl = () => new URL(page.url()).searchParams.get('channel')
  await waitUntil(async () => {
    const id = await dmWithMia()
    return !!id && inUrl() === id
  }, { timeoutMs: 10_000 })
  const miaDm = await dmWithMia()
  chk(
    !!miaDm && inUrl() === miaDm,
    'Message on a colleague’s profile panel opens a DM with them',
    `${page.url()}; the DM with Mia ${JSON.stringify(miaDm)}`,
  )

  await page.goto(`${B}/app/${WS}/ai?hub=agents&agentsView=activity`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-testid="sa-activity-row"]').first().waitFor({ timeout: 20_000 }).catch(() => {})
  await page.getByTestId('sa-activity-status').selectOption('skipped')
  await waitUntil(async () => {
    const st = await page.locator('[data-testid="sa-activity-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))
    return st.length > 0 && st.every((s) => s === 'skipped')
  }, { timeoutMs: 10_000 })
  const rowStatuses = await page.locator('[data-testid="sa-activity-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))
  chk(rowStatuses.length >= 2 && rowStatuses.every((s) => s === 'skipped'), 'the Activity page lists runs and filters them by status', JSON.stringify(rowStatuses))

  await page.goto(`${B}/app/${WS}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('quick-create-open').click({ timeout: 25_000 })
  // Bounded, as above: an item that is gone fails its check, not the run (`sa-28`).
  await page.getByTestId('create-footer-super-agent').click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('sa-builder-input').waitFor({ timeout: 15_000 }).catch(() => {})
  chk(
    (await page.getByTestId('sa-builder-input').count()) === 1 && /hub=agents/.test(page.url()) && /agent=new/.test(page.url()),
    'the Create menu makes a Super Agent: it opens the new-agent page',
    page.url(),
  )

  const TASK_URL = `${B}/app/${WS}/${space.id}/${project.id}/${L}?task=${T}`
  await page.goto(TASK_URL, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('task-tab-comments').click({ timeout: 25_000 })
  const box = page.getByTestId('comment-input')
  await box.waitFor({ timeout: 15_000 })
  await box.fill('@')
  await page.getByTestId('mention-tab-agents').click()
  const agentRow = page.locator(`[data-testid="mention-agents-row"][data-user-id="${helper.userId}"]`)
  await agentRow.waitFor({ timeout: 10_000 }).catch(() => {})
  const offeredPrivate = await page.locator(`[data-testid="mention-agents-row"][data-user-id="${secret.userId}"]`).count()
  chk((await agentRow.count()) === 1 && offeredPrivate === 1, 'the comment @ picker has an Agents section listing the agents the reader may use', `helper ${await agentRow.count()}, private (the admin’s own) ${offeredPrivate}`)
  await agentRow.click().catch(() => {})
  const typed = await box.inputValue().catch(() => '')
  // The row took the focus when it was clicked: back into the box, after what was inserted.
  await box.click()
  await box.press('End')
  await box.type('anything new?')
  const sent = (await comments(T)).length
  await page.getByTestId('comment-post').click().catch(() => {})
  // The run the mention started, by what was written: answered where a model is, refused where none is.
  const pickerRun = async () => (await runsOf(helper.id)).find((r) => r.trigger === 'mention' && /anything new\?/.test(r.input) && r.status !== 'running')
  await settle(async () => !!(await pickerRun()))
  const fromPicker = (await comments(T)).slice(sent)
  chk(
    typed.startsWith(`@Helper ${TAG}`) && fromPicker.some((c) => c.author === me.id) && (await pickerRun())?.by === me.id &&
      (MODEL_ON ? fromPicker.some((c) => c.author === helper.userId) : (await pickerRun())?.status === 'failed'),
    'picked from the Agents section and posted, the mention reaches the agent and it answers',
    `typed ${JSON.stringify(typed)}; new comments ${JSON.stringify(fromPicker.map((c) => c.author === helper.userId ? 'agent' : c.author === me.id ? 'admin' : c.author))}`,
  )

  await page.getByTestId('task-tab-overview').click({ timeout: 10_000 }).catch(() => {})
  await page.getByTestId('assignee-picker-open').click({ timeout: 15_000 }).catch(() => {})
  const assignAgent = page.locator(`[data-testid="assign-agent-${sched.userId}"]`)
  await assignAgent.waitFor({ timeout: 10_000 }).catch(() => {})
  chk(
    (await assignAgent.count()) === 1 && /Agent/.test((await assignAgent.filter({ visible: true }).textContent().catch(() => '')) ?? '') && (await page.locator(`[data-testid="assign-member-${sched.userId}"]`).count()) === 0,
    'the assignee picker lists agents in their own section, marked as agents, not among the people',
    `${await assignAgent.count()} row(s): ${await assignAgent.textContent().catch(() => null)}`,
  )

  await page.goto(`${B}/app/${WS}/automations`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('automations-new').click({ timeout: 25_000 }).catch(() => {})
  const actionSelect = page.locator('select').filter({ has: page.locator('option[value="run_super_agent"]') }).first()
  await actionSelect.selectOption('run_super_agent').catch(() => {})
  const optionsOf = () => page.getByTestId('automation-agent-picker').locator('option').evaluateAll((els) => els.map((e) => e.getAttribute('value'))).catch(() => [])
  await waitUntil(async () => (await optionsOf()).includes(helper.id), { timeoutMs: 10_000 })
  const agentOptions = await optionsOf()
  chk(agentOptions.includes(helper.id) && agentOptions.includes(sched.id), 'an Automation’s actions include Run a Super Agent, with the agents to pick from', JSON.stringify(agentOptions))

  // ══ 12. DELETE ════════════════════════════════════════════════════════════
  console.log('\n▶ deleted, it leaves the workspace and what it wrote keeps its author')
  const del = await M(`/super-agents/${helper.id}`, { method: 'DELETE' })
  const [stillMember] = await sql`select 1 as one from workspace_members where workspace_id = ${WS} and user_id = ${helper.userId}`
  const [stillRow] = await sql`select 1 as one from super_agents where id = ${helper.id}`
  const keptReply = (await comments(T)).find((c) => c.author === helper.userId)
  const [runsLeft] = await sql`select count(*)::int as n from super_agent_runs where agent_id = ${helper.id}`
  chk(del.ok && !stillMember && !stillRow && runsLeft.n === 0 && (MODEL_ON ? !!keptReply : true), 'deleting an agent removes it and its membership; its comments stay, authored by it', `${said(del)}; member ${!!stillMember}, row ${!!stillRow}, reply kept ${!!keptReply}`)
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
// Said only when it is so, as every suite says it: the break runner reads this line as a short run.
if (passed + failed !== EXPECTED_CHECKS) {
  console.log(`\n✗ ${passed + failed} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
}
if (failed > 0 || passed + failed !== EXPECTED_CHECKS) process.exitCode = 1
