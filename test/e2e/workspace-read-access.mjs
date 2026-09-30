/**
 * WORKSPACE-WIDE READS SHOW ONLY WHAT THE CALLER MAY OPEN.
 *
 * NOT A FRAME ROW: `found-23-sep/workspace-reads-skip-the-container-rule`.
 * Routes that list tasks from across a workspace are guarded by workspace
 * membership alone, so each has to apply the caller's access itself: the
 * container rule (a private space or project is its members'; managers see
 * all; `containerVisibilityFilter` is the guard's own SQL twin) and the
 * private-item rule (a private task is its creator's, its assignees' and the
 * managers'). Measured on lane 1 before the fix, as a member who gets 403 on a
 * private space's list, and as a guest:
 *
 *   · `GET /tasks/workspace/:ws/members/:userId` applied neither rule. Asking
 *     for the admin's assigned tasks returned the private space's task, with
 *     the space's and the list's names.
 *   · `GET /tasks/workspace/:ws/timeline` applied only the private-item rule.
 *     The private space's dated task was on the member's timeline.
 *   · The AI routes took the workspace from the body and checked nothing: a
 *     user of ANOTHER organisation had AI chat and command build their prompts
 *     from it, and a member's prompts named a private space they were refused
 *     (read in the model stub's request log). §3.
 *
 * Each read is made three times: by a member refused the private space, by a
 * guest, and by the admin, who may open everything and must still see it all.
 *
 *   node test/e2e/workspace-read-access.mjs --api 3021
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 30

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const ADMIN = {
  email: process.env.E2E_EMAIL ?? 'admin@rundesk.internal',
  password: process.env.E2E_PASSWORD ?? 'Admin@123!',
}
const PERSON_PASSWORD = 'Member@12345!'
// The web app's own realtime client, from its own dependencies.
const { io } = createRequire(path.resolve(import.meta.dirname, '../../apps/web/package.json'))('socket.io-client')

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error ?? null).slice(0, 120)}`
/** Poll `ok` until it holds or `ms` pass; never throws. */
const waitFor = async (ok, ms) => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (ok()) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return ok()
}

const stamp = Date.now()
const TAG = `wra-${stamp}`
const day = 24 * 60 * 60 * 1000
let sql = null
let WS = null
let A = null

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — the private task is marked private by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (label, role) => {
    const email = `${TAG}-${label}@rundesk.invalid`
    const data = await signUpApi(API, {
      fullName: `Reads ${label}`, email, password: PERSON_PASSWORD,
      organizationName: `Reads ${label} ${stamp}`, organizationSlug: `reads-${label}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (added.status >= 300) throw new Error(`could not add the ${label}: ${said(added)}`)
    const client = apiAs(data.accessToken)
    client.id = data.user?.id
    client.token = data.accessToken
    return client
  }
  const M = await person('member', 'member')
  const G = await person('guest', 'guest')

  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const spaceOf = {}
  const listIn = async (spaceBody, what) => {
    const space = await make('/spaces', { workspaceId: WS, ...spaceBody }, `the ${what} space`)
    spaceOf[what] = space
    const project = await make('/projects', { spaceId: space, name: `${TAG} ${what}` }, `the ${what} project`)
    return make('/lists', { projectId: project, name: `${TAG} ${what} list` }, `the ${what} list`)
  }
  const OPEN_LIST = await listIn({ name: `${TAG} open` }, 'open')
  // A guest reads only what is shared with them (`found-24-sep/guests-read-every-open-space`):
  // the open space is shared with this one to VIEW, so each read below still
  // asks whether a guest sees what is hidden beside what they may see.
  await sql`insert into space_members (space_id, user_id, role) values (${spaceOf.open}, ${G.id}, 'view')`
  const PRIVATE_LIST = await listIn({ name: `${TAG} private`, visibility: 'private' }, 'private')
  // Dated, so the timeline has them; assigned to the admin, whose list is read.
  const adminTask = (listId, title) =>
    make('/tasks', {
      listId, title: `${TAG} ${title}`, assigneeIds: [adminId],
      dueDate: new Date(Date.now() + 2 * day).toISOString(),
    }, title)
  const OPEN = await adminTask(OPEN_LIST, 'in the open space')
  const HIDDEN = await adminTask(PRIVATE_LIST, 'in the private space')
  const PRIVATE = await adminTask(OPEN_LIST, 'a private task')
  await sql`update tasks set visibility = 'private' where id = ${PRIVATE}`

  const refused = await M(`/tasks/list/${PRIVATE_LIST}`)
  if (refused.status !== 403) throw new Error(`the member was not refused the private list (${said(refused)}), so nothing here would mean anything`)

  const ids = (res) => (res.data ?? []).map((t) => t.id)
  const shown = (res) => JSON.stringify((res.data ?? []).map((t) => `${t.title}${t.spaceName ? ` [${t.spaceName}]` : ''}`)).slice(0, 220)
  const holdsOnly = (res) => res.status === 200 && ids(res).includes(OPEN) && !ids(res).includes(HIDDEN) && !ids(res).includes(PRIVATE)

  // ══ 1. SOMEBODY ELSE'S ASSIGNED TASKS ════════════════════════════════════
  console.log('\n▶ another member’s assigned tasks, read as the caller may see them')

  const memberReads = await M(`/tasks/workspace/${WS}/members/${adminId}`)
  chk(
    holdsOnly(memberReads),
    'a member reading the admin’s tasks gets none from a space they are refused, nor a private task — while the rest are listed',
    `it answered ${memberReads.status} with ${shown(memberReads)}`,
  )
  const guestReads = await G(`/tasks/workspace/${WS}/members/${adminId}`)
  chk(
    holdsOnly(guestReads),
    'and so does a guest',
    `it answered ${guestReads.status} with ${shown(guestReads)}`,
  )
  const adminReads = await A(`/tasks/workspace/${WS}/members/${adminId}`)
  chk(
    adminReads.status === 200 && [OPEN, HIDDEN, PRIVATE].every((id) => ids(adminReads).includes(id)),
    'while the admin, whose tasks they are and who may open everything, reads all three',
    `it answered ${adminReads.status} with ${shown(adminReads)}`,
  )

  // ══ 2. THE WORKSPACE TIMELINE ════════════════════════════════════════════
  console.log('\n▶ the workspace timeline, drawn as the caller may see it')

  const memberTimeline = await M(`/tasks/workspace/${WS}/timeline`)
  chk(
    holdsOnly(memberTimeline),
    'a member’s timeline has nothing from a space they are refused, nor a private task — while the rest are on it',
    `it answered ${memberTimeline.status} with ${shown(memberTimeline)}`,
  )
  const guestTimeline = await G(`/tasks/workspace/${WS}/timeline`)
  chk(
    holdsOnly(guestTimeline),
    'and neither does a guest’s',
    `it answered ${guestTimeline.status} with ${shown(guestTimeline)}`,
  )
  const adminTimeline = await A(`/tasks/workspace/${WS}/timeline`)
  chk(
    adminTimeline.status === 200 && [OPEN, HIDDEN, PRIVATE].every((id) => ids(adminTimeline).includes(id)),
    'while the admin’s timeline has all three',
    `it answered ${adminTimeline.status} with ${shown(adminTimeline)}`,
  )

  // ══ 3. THE AI ════════════════════════════════════════════════════════════
  console.log('\n▶ the AI reads a workspace as the caller may, and only a workspace the caller is in')

  /*
   * The AI routes take the workspace in the body, and nothing checked the
   * caller belonged to it: measured with the model stub, a user of another
   * organisation (404 on the workspace itself) had AI chat and AI command
   * build their prompts from it. The new guard runs BEFORE the model check,
   * so the refusal is measurable with no model at all: a stranger gets 404
   * where a member gets past the guard (201 with a model, 503 without one).
   */
  const outsider = await signUpApi(API, {
    fullName: 'Reads outsider', email: `${TAG}-outsider@rundesk.invalid`, password: PERSON_PASSWORD,
    organizationName: `Reads outsider ${stamp}`, organizationSlug: `reads-outsider-${stamp}`,
  })
  const O = apiAs(outsider.accessToken)
  const chatBody = { workspaceId: WS, messages: [{ role: 'user', content: 'What spaces are there?' }] }
  const outsiderChat = await O('/ai/chat', { method: 'POST', body: chatBody })
  const outsiderCommand = await O('/ai/command', { method: 'POST', body: { workspaceId: WS, message: 'what lists are there' } })
  const memberCommand = await M('/ai/command', { method: 'POST', body: { workspaceId: WS, message: 'what lists are there' } })
  chk(
    outsiderChat.status === 404 && outsiderCommand.status === 404 && memberCommand.status !== 404,
    'a user outside the workspace is refused AI chat and AI command on it, before any model is asked — while a member is not',
    `the outsider's chat answered ${said(outsiderChat)} and command ${said(outsiderCommand)}; the member's command ${said(memberCommand)}`,
  )
  // The AI is not for guests, and the account-wide check could only refuse an
  // account whose GLOBAL role is guest; this guest's account is a member's.
  const guestCommand = await G('/ai/command', { method: 'POST', body: { workspaceId: WS, message: 'what lists are there' } })
  chk(
    guestCommand.status === 403,
    'and a guest of the workspace is refused them too',
    `the guest's command answered ${said(guestCommand)}`,
  )

  // The breakdown behind a status answer; no model needed.
  const totalOf = (res) => res.data?.total ?? null
  const memberStatus = await M(`/ai/project-status?workspaceId=${WS}`)
  const adminStatus = await A(`/ai/project-status?workspaceId=${WS}`)
  chk(
    memberStatus.status === 200 && adminStatus.status === 200 && totalOf(adminStatus) === 3 && totalOf(memberStatus) === 1,
    'the AI’s status breakdown counts, for a member, nothing from a space they are refused nor a private task — the admin’s counts all three',
    `the member's total is ${totalOf(memberStatus)} (${memberStatus.status}), the admin's ${totalOf(adminStatus)} (${adminStatus.status})`,
  )

  /*
   * THE PROMPT ITSELF, where a model answers. On a lane with
   * RUNDESK_LANE_MODEL the API talks to `model-stub.mjs`, which records every
   * prompt it is sent; with no model (CI), no prompt is ever built, and the
   * member is refused with 503 before it would be.
   */
  const modelOn = (await A('/ai/status')).data?.available === true
  const MODEL = `http://127.0.0.1:${argOf('--model', process.env.E2E_MODEL_PORT ?? String(9200 + (API_PORT - 3020)))}`
  const seen = async () => (await fetch(`${MODEL}/__control/seen`).then((r) => r.json()).catch(() => null))?.calls ?? null
  if (modelOn) {
    // Chat and command build their contexts separately, and both named it.
    const before = (await seen())?.length ?? null
    await M('/ai/chat', { method: 'POST', body: chatBody })
    await M('/ai/command', { method: 'POST', body: { workspaceId: WS, message: 'list every space and list' } })
    const memberPrompts = ((await seen()) ?? []).slice(before ?? 0)
    const mid = (await seen())?.length ?? null
    await A('/ai/chat', { method: 'POST', body: chatBody })
    await A('/ai/command', { method: 'POST', body: { workspaceId: WS, message: 'list every space and list' } })
    const adminPrompts = ((await seen()) ?? []).slice(mid ?? 0)
    const names = (calls) => calls.some((c) => JSON.stringify(c).includes(`${TAG} private`))
    const namesInEach = (calls) => calls.length >= 2 && calls.every((c) => JSON.stringify(c).includes(`${TAG} private`))
    chk(
      before !== null && memberPrompts.length >= 2 && !names(memberPrompts) && namesInEach(adminPrompts),
      'the prompt a model is sent names, for a member, no space they are refused — the admin’s names it',
      before === null
        ? `a model is configured but its stub could not be read at ${MODEL}`
        : `the member's ${memberPrompts.length} prompt(s) ${names(memberPrompts) ? 'NAME' : 'do not name'} the private space; ` +
          `the admin's ${adminPrompts.length} ${names(adminPrompts) ? 'name' : 'do not name'} it`,
    )
  } else {
    const memberChat = await M('/ai/chat', { method: 'POST', body: chatBody })
    /*
     * ITS OWN SENTENCE. This branch printed the prompt's, having read no
     * prompt: a run with no model reported the prompt rule as measured, and the
     * two patches aimed at it (`wra-11`, `wra-12`) read as having reddened
     * nothing when they had not been measured at all.
     */
    chk(
      memberChat.status === 503,
      'with no model configured, a member’s chat is refused with 503 before any prompt is built — the prompt rule is measured only where a model answers',
      `no model is configured here, so no prompt is built; the member's chat answered ${said(memberChat)}, not the 503 that says so`,
    )
  }

  // ══ 4. CHAT ══════════════════════════════════════════════════════════════
  console.log('\n▶ chat: a member’s activity and the channel list hold only what the reader can open')

  /*
   * `GET /workspaces/:ws/chat/members/:id/activity` returned everything the
   * member wrote anywhere: measured on lane 1, a member refused a DM and a
   * private channel (403 on each) read both through another member's
   * activity. And the channel list left out the private-space half of the
   * rule, so a space's channel was listed, by name, to a member refused it.
   * The admin writes in a DM with the member, a private channel with the
   * member, a public channel, and a channel of the private space; the guest is
   * in none of the three private ones, and the member is not in the space.
   */
  const post = async (channelId, body) => {
    const res = await A(`/chat/channels/${channelId}/messages`, { method: 'POST', body: { body } })
    if (res.status >= 300) throw new Error(`could not post in the channel: ${said(res)}`)
  }
  const channel = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const DM = await channel(`/workspaces/${WS}/chat/dms`, { peerUserId: M.id }, 'the DM')
  const PRIV_CH = await channel(`/workspaces/${WS}/chat/channels`, { name: `${TAG}-private`, isPrivate: true, memberIds: [M.id] }, 'the private channel')
  const PUB_CH = await channel(`/workspaces/${WS}/chat/channels`, { name: `${TAG}-public` }, 'the public channel')
  // A guest reads a public channel only when it is shared with them
  // (`found-24-sep/guests-read-every-open-channel`): this one is, to VIEW.
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'channel', ${PUB_CH}, ${G.id}, 'view')`
  const SPACE_CH = await channel(`/workspaces/${WS}/chat/channels`, { name: `${TAG}-in-the-private-space`, spaceId: spaceOf.private }, 'the private space’s channel')
  await post(DM, `${TAG} said in the DM`)
  await post(PRIV_CH, `${TAG} said in the private channel`)
  await post(PUB_CH, `${TAG} said in public`)
  await post(SPACE_CH, `${TAG} said in the private space`)
  const bodies = (res) => (res.data ?? []).map((m) => m.body)
  const has = (res, where) => bodies(res).includes(`${TAG} said ${where}`)

  const guestActivity = await G(`/workspaces/${WS}/chat/members/${adminId}/activity`)
  chk(
    guestActivity.status === 200 && has(guestActivity, 'in public') && !has(guestActivity, 'in the DM') &&
      !has(guestActivity, 'in the private channel') && !has(guestActivity, 'in the private space'),
    'a member’s chat activity, read by someone outside their DM and private channels, holds none of them — only what the reader can open',
    `it answered ${guestActivity.status} with ${JSON.stringify(bodies(guestActivity)).slice(0, 220)}`,
  )
  const memberActivity = await M(`/workspaces/${WS}/chat/members/${adminId}/activity`)
  chk(
    memberActivity.status === 200 && has(memberActivity, 'in the DM') && has(memberActivity, 'in the private channel') &&
      has(memberActivity, 'in public') && !has(memberActivity, 'in the private space'),
    'while someone in the DM and the private channel reads both — and still not a channel of a space they are refused',
    `it answered ${memberActivity.status} with ${JSON.stringify(bodies(memberActivity)).slice(0, 220)}`,
  )
  const names = (res) => (res.data ?? []).map((c) => c.name)
  const memberChannels = await M(`/workspaces/${WS}/chat/channels`)
  const adminChannels = await A(`/workspaces/${WS}/chat/channels`)
  chk(
    memberChannels.status === 200 && !names(memberChannels).includes(`${TAG}-in-the-private-space`) &&
      names(memberChannels).includes(`${TAG}-public`) && names(adminChannels).includes(`${TAG}-in-the-private-space`),
    'the channel list names no channel of a private space the member is not in — the admin’s names it',
    `the member's list: ${JSON.stringify(names(memberChannels)).slice(0, 200)}; the admin's has it: ${names(adminChannels).includes(`${TAG}-in-the-private-space`)}`,
  )

  // ══ 5. REALTIME ROOMS ════════════════════════════════════════════════════
  console.log('\n▶ realtime: a list’s or a task’s room is for whoever may read the list or the task')

  /*
   * A room carries what its list or task shows: the new task whole, every
   * change, every comment. Joining needed workspace membership alone:
   * measured on lane 1, a member refused a private space's list and task
   * (403 on each) joined both rooms and heard a task created and a comment
   * posted there.
   */
  const sockets = []
  const connect = async (token) => {
    const sock = io(`http://127.0.0.1:${API_PORT}/realtime`, { auth: { token }, transports: ['websocket'], reconnection: false })
    sockets.push(sock)
    const up = await new Promise((res) => {
      sock.on('connect', () => res(true))
      sock.on('connect_error', () => res(false))
      setTimeout(() => res(false), 10_000)
    })
    const heard = []
    sock.on('event', (e) => heard.push(e))
    const join = (rooms) =>
      new Promise((res) => {
        sock.timeout(10_000).emit('subscribe', { rooms }, (err, ack) => res(err ? null : ack))
      })
    return { up, heard, join }
  }
  const memberSock = await connect(M.token)
  const adminSock = await connect(auth.accessToken)
  const refusedRooms = [`list:${PRIVATE_LIST}`, `task:${HIDDEN}`, `task:${PRIVATE}`]
  const memberAck = await memberSock.join([...refusedRooms, `list:${OPEN_LIST}`])
  const adminAck = await adminSock.join([`list:${PRIVATE_LIST}`])
  await A('/tasks', { method: 'POST', body: { listId: PRIVATE_LIST, title: `${TAG} made where the member may not look` } })
  await A(`/tasks/${HIDDEN}/comments`, { method: 'POST', body: { body: `${TAG} said on the hidden task` } })
  await A('/tasks', { method: 'POST', body: { listId: OPEN_LIST, title: `${TAG} made in the open` } })
  const heardIn = (sock, what) => sock.heard.some((e) => JSON.stringify(e).includes(`${TAG} ${what}`))
  await waitFor(() => heardIn(memberSock, 'made in the open') && heardIn(adminSock, 'made where the member may not look'), 10_000)
  chk(
    memberSock.up && refusedRooms.every((r) => (memberAck?.denied ?? []).includes(r)) &&
      !heardIn(memberSock, 'made where the member may not look') && !heardIn(memberSock, 'said on the hidden task'),
    'a member cannot join the realtime room of a list or a task they may not read, and hears nothing from it',
    `the member ${memberSock.up ? 'connected' : 'never connected'}; subscribing answered ${JSON.stringify(memberAck).slice(0, 220)}; ` +
      `heard from the private list: ${heardIn(memberSock, 'made where the member may not look')}, from the hidden task: ${heardIn(memberSock, 'said on the hidden task')}`,
  )
  chk(
    (memberAck?.joined ?? []).includes(`list:${OPEN_LIST}`) && heardIn(memberSock, 'made in the open') &&
      (adminAck?.joined ?? []).includes(`list:${PRIVATE_LIST}`) && heardIn(adminSock, 'made where the member may not look'),
    'while they join an open list’s room and hear a task made there — and the admin joins the private list’s room and hears it',
    `the member joined ${JSON.stringify(memberAck?.joined ?? [])} and heard the open task: ${heardIn(memberSock, 'made in the open')}; ` +
      `the admin joined ${JSON.stringify(adminAck?.joined ?? [])} and heard the private one: ${heardIn(adminSock, 'made where the member may not look')}`,
  )
  for (const sock of sockets) sock.close()

  // ══ 6. PEOPLE, THE LIST CATALOGUE, THE ICAL FEED ═════════════════════════
  console.log('\n▶ a colleague’s pages, the list catalogue and a calendar feed hold only what the reader may open')

  /*
   * Measured on the build before the fix, as the member refused the private
   * space: the admin's profile, their activity (and its search) and their
   * calendar all carried the private space's task, and so did the member's
   * DM Tasks tab with the admin (lane 1); their standup listed it,
   * and the private task, as what they did and what held them up; their
   * priorities showed its title, and the member could pin it and the private
   * task (201) to read both titles back; the workspace's list catalogue named
   * its list; the member's own iCal feed carried it, title and description;
   * and a member removed from the workspace kept a working feed of it.
   */
  const text = (res) => JSON.stringify(res.data ?? null)
  const hiddenIn = (res) => text(res).includes(HIDDEN) || text(res).includes(`${TAG} in the private space`)
  // The profile reads each bucket with its own query, so each needs a task of
  // the private space in it: the assigned one above, and one finished, one
  // handed to somebody else and one on nobody. Their state is set by SQL.
  const HIDDEN_DONE = await make('/tasks', { listId: PRIVATE_LIST, title: `${TAG} in the private space, finished`, assigneeIds: [adminId] }, 'the finished task')
  await sql`update tasks set status_category = 'closed', completed_at = now() where id = ${HIDDEN_DONE}`
  const HIDDEN_HANDED = await make('/tasks', { listId: PRIVATE_LIST, title: `${TAG} in the private space, handed over` }, 'the handed-over task')
  await sql`insert into task_assignees (task_id, user_id) values (${HIDDEN_HANDED}, ${G.id})`
  const HIDDEN_NOBODY = await make('/tasks', { listId: PRIVATE_LIST, title: `${TAG} in the private space, on nobody` }, 'the unassigned task')
  const BUCKETED = { assignedTasks: HIDDEN, done: HIDDEN_DONE, delegated: HIDDEN_HANDED, createdUnassigned: HIDDEN_NOBODY }
  const profileIds = (res, name) =>
    ((name === 'assignedTasks' ? res.data?.assignedTasks : res.data?.taskBuckets?.[name]) ?? []).map((t) => t.id)
  const pages = async (C) => [
    await C(`/workspaces/${WS}/people/${adminId}`),
    await C(`/workspaces/${WS}/people/${adminId}/activity?q=${encodeURIComponent(TAG)}`),
    await C(`/workspaces/${WS}/people/${adminId}/calendar`),
    // The planner's team grid reads each column through the same calendar.
    await C(`/planner/${WS}/team-schedules?userIds=${adminId}`),
  ]
  const memberPages = await pages(M)
  const adminPages = await pages(A)
  const bucketsShown = Object.entries(BUCKETED).filter(([name, id]) => profileIds(adminPages[0], name).includes(id)).map(([name]) => name)
  chk(
    memberPages.every((r) => r.status === 200 && !hiddenIn(r) && !text(r).includes(PRIVATE)) &&
      Object.values(BUCKETED).every((id) => !text(memberPages[0]).includes(id)) &&
      memberPages.some((r) => text(r).includes(OPEN)) && adminPages.every((r) => r.status === 200 && hiddenIn(r)) &&
      bucketsShown.length === Object.keys(BUCKETED).length,
    'a colleague’s profile (every bucket), activity, calendar and team-schedule column show a member nothing from a space they are refused — the admin’s own show it',
    `the member's four answered ${memberPages.map((r) => `${r.status}${hiddenIn(r) ? ' with the hidden task' : ''}`).join(', ')}; ` +
      `the admin's ${adminPages.map((r) => `${r.status}${hiddenIn(r) ? '' : ' WITHOUT it'}`).join(', ')}, ` +
      `with the private space's task in ${bucketsShown.join(', ') || 'no bucket'} of ${Object.keys(BUCKETED).join(', ')}`,
  )

  // A DM's Tasks tab: the open tasks either of two people is on.
  const sharedIds = (res) => (res.data?.tasks ?? []).map((t) => t.id)
  const memberShared = await M(`/workspaces/${WS}/people/${adminId}/shared`)
  const adminShared = await A(`/workspaces/${WS}/people/${M.id}/shared`)
  chk(
    memberShared.status === 200 && !sharedIds(memberShared).includes(HIDDEN) && !sharedIds(memberShared).includes(PRIVATE) &&
      sharedIds(memberShared).includes(OPEN) && sharedIds(adminShared).includes(HIDDEN),
    'what a member and a colleague are both on (a DM’s Tasks tab) lists nothing of a space the member is refused, nor a private task — the admin’s lists it',
    `the member's answered ${memberShared.status} with ${JSON.stringify(sharedIds(memberShared).map((id) => [OPEN, HIDDEN, PRIVATE].indexOf(id)))} ` +
      `(0 open, 1 private space, 2 private task); the admin's ${JSON.stringify(sharedIds(adminShared).map((id) => [OPEN, HIDDEN, PRIVATE].indexOf(id)))}`,
  )

  /*
   * The panel's other two reads about a person: their standup (what they did,
   * what holds them up) and their priorities. Each task below is held up by one
   * open task; the dependencies and the admin's pins are written by SQL, so the
   * routes read here are the only ones under test.
   */
  const BLOCKER = await make('/tasks', { listId: OPEN_LIST, title: `${TAG} the blocker` }, 'the blocker')
  await sql`
    insert into task_dependencies (task_id, related_task_id, type)
    values (${OPEN}, ${BLOCKER}, 'blocked_by'), (${HIDDEN}, ${BLOCKER}, 'blocked_by'), (${PRIVATE}, ${BLOCKER}, 'blocked_by')`
  const standupOf = (C) => C(`/workspaces/${WS}/people/${adminId}/standup`, { method: 'POST', body: {} })
  const memberStandup = await standupOf(M)
  const adminStandup = await standupOf(A)
  const bucket = (res, name) => (res.data?.data?.[name] ?? []).map((t) => t.id)
  const everyBucket = (res) => ['done', 'active', 'overdue', 'blocked'].flatMap((name) => bucket(res, name))
  const memberHeard = everyBucket(memberStandup)
  chk(
    memberStandup.ok && !memberHeard.includes(HIDDEN) && !memberHeard.includes(PRIVATE) &&
      !text(memberStandup).includes(`${TAG} in the private space`) && !text(memberStandup).includes(`${TAG} a private task`) &&
      bucket(memberStandup, 'active').includes(OPEN) && bucket(memberStandup, 'blocked').includes(OPEN) &&
      bucket(adminStandup, 'active').includes(HIDDEN) && bucket(adminStandup, 'blocked').includes(HIDDEN) &&
      bucket(adminStandup, 'blocked').includes(PRIVATE),
    'a colleague’s standup, what they did and what holds them up, tells a member nothing of a space they are refused nor of a private task — the admin’s own tells it',
    `the member's answered ${said(memberStandup)}: active ${JSON.stringify(bucket(memberStandup, 'active').map((id) => [OPEN, HIDDEN, PRIVATE].indexOf(id)))}, ` +
      `blocked ${JSON.stringify(bucket(memberStandup, 'blocked').map((id) => [OPEN, HIDDEN, PRIVATE].indexOf(id)))} (0 open, 1 private space, 2 private task); ` +
      `the admin's active ${JSON.stringify(bucket(adminStandup, 'active').map((id) => [OPEN, HIDDEN, PRIVATE].indexOf(id)))}, ` +
      `blocked ${JSON.stringify(bucket(adminStandup, 'blocked').map((id) => [OPEN, HIDDEN, PRIVATE].indexOf(id)))}`,
  )

  await sql`
    insert into user_priorities (user_id, workspace_id, task_id, title, position)
    values (${adminId}, ${WS}, ${OPEN}, null, 0), (${adminId}, ${WS}, ${HIDDEN}, null, 1), (${adminId}, ${WS}, null, ${`${TAG} a typed line`}, 2)`
  const pinnedTitles = (res) => (res.data ?? []).map((p) => p.title)
  const memberReadsPins = await M(`/workspaces/${WS}/people/${adminId}/priorities`)
  const adminReadsPins = await A(`/workspaces/${WS}/priorities`)
  chk(
    memberReadsPins.status === 200 && !pinnedTitles(memberReadsPins).includes(`${TAG} in the private space`) &&
      pinnedTitles(memberReadsPins).includes(`${TAG} in the open space`) && pinnedTitles(memberReadsPins).includes(`${TAG} a typed line`) &&
      pinnedTitles(adminReadsPins).includes(`${TAG} in the private space`),
    'a colleague’s priorities show a member the typed ones and the tasks they may open, and no title from a space they are refused — the admin’s own show it',
    `the member's answered ${memberReadsPins.status} with ${JSON.stringify(pinnedTitles(memberReadsPins).map((t) => String(t).replace(`${TAG} `, '')))}; ` +
      `the admin's own ${JSON.stringify(pinnedTitles(adminReadsPins).map((t) => String(t).replace(`${TAG} `, '')))}`,
  )

  // Pinning is a way to read a title back, so pinning is refused what reading is.
  const pinAs = (taskId) => M(`/workspaces/${WS}/priorities`, { method: 'POST', body: { taskId } })
  const pinHidden = await pinAs(HIDDEN)
  const pinPrivate = await pinAs(PRIVATE)
  const pinOpen = await pinAs(OPEN)
  const [{ n: refusedRows }] = await sql`
    select count(*)::int as n from user_priorities where user_id = ${M.id} and task_id in (${HIDDEN}, ${PRIVATE})`
  chk(
    pinHidden.status === 404 && pinPrivate.status === 404 && refusedRows === 0 && pinOpen.ok && pinOpen.data?.taskId === OPEN,
    'and a member cannot pin a task they may not open to read its title back (404 and no row, for a refused space and a private task) — while they pin an open one',
    `pinning the private space's task answered ${said(pinHidden)}, the private task ${said(pinPrivate)}, rows made ${refusedRows}; the open one ${said(pinOpen)}`,
  )

  const listNames = (res) => (res.data ?? []).map((l) => l.id)
  const memberLists = await M(`/lists/workspace/${WS}`)
  const adminLists = await A(`/lists/workspace/${WS}`)
  chk(
    memberLists.status === 200 && !listNames(memberLists).includes(PRIVATE_LIST) && listNames(memberLists).includes(OPEN_LIST) &&
      listNames(adminLists).includes(PRIVATE_LIST),
    'the workspace’s list catalogue names no list of a space the member is refused — the admin’s names it',
    `the member's catalogue ${listNames(memberLists).includes(PRIVATE_LIST) ? 'HAS' : 'lacks'} the private list; the admin's ${listNames(adminLists).includes(PRIVATE_LIST) ? 'has' : 'lacks'} it`,
  )

  const feedOf = async (C) => {
    const minted = await C(`/workspaces/${WS}/calendar-sync/ical-token`, { method: 'POST', body: {} })
    const token = minted.data?.token
    const read = async () =>
      typeof token === 'string'
        ? fetch(`${API}/ical/${token}.ics`).then(async (r) => ({ status: r.status, text: await r.text() }), () => ({ status: 0, text: '' }))
        : { status: 0, text: `no token: ${said(minted)}` }
    return read
  }
  const memberFeed = await (await feedOf(M))()
  chk(
    memberFeed.status === 200 && memberFeed.text.includes(`${TAG} in the open space`) &&
      !memberFeed.text.includes(`${TAG} in the private space`) && !memberFeed.text.includes(`${TAG} a private task`),
    'a member’s calendar feed carries no task of a space they are refused, nor a private task — while it carries the open space’s',
    `the feed answered ${memberFeed.status}; open task in it: ${memberFeed.text.includes(`${TAG} in the open space`)}, ` +
      `the private space's: ${memberFeed.text.includes(`${TAG} in the private space`)}, the private task: ${memberFeed.text.includes(`${TAG} a private task`)}`,
  )

  // Somebody who leaves: a person of their own, so the member keeps their seat.
  const leaver = await person('leaver', 'member')
  const leaverFeed = await feedOf(leaver)
  const whileIn = await leaverFeed()
  const removedLeaver = await A(`/workspaces/${WS}/members/${leaver.id}`, { method: 'DELETE' })
  const afterLeaving = await leaverFeed()
  chk(
    whileIn.status === 200 && whileIn.text.includes(`${TAG} in the open space`) && removedLeaver.ok && afterLeaving.status === 404,
    'and once somebody is removed from the workspace, their calendar feed answers nothing',
    `while a member the feed answered ${whileIn.status}; removing them answered ${said(removedLeaver)}; afterwards the feed answered ${afterLeaving.status}`,
  )

  // ══ 7. DOCS ══════════════════════════════════════════════════════════════
  console.log('\n▶ a doc is read where it lives: its space, the doc above it, or a share')

  /*
   * A doc filed in a space follows that space, and a page follows the doc it
   * lives in (ClickUp: a Doc in a location inherits the location's
   * permissions; pages inherit the Doc's). A share on a doc opens it, and the
   * pages under it. Measured on lane 1 before the fix: the doc read was
   * workspace membership alone, so the member opened, listed and counted the
   * private space's doc and its page, edited them, and joined their room.
   *
   * The page under the private doc is made with NO space of its own — as the
   * docs hub makes one — so only the doc above it can say where it lives.
   */
  const makeDoc = (body, what) => make(`/workspaces/${WS}/docs`, body, what)
  const OPEN_DOC = await makeDoc({ title: `${TAG} open doc`, spaceId: spaceOf.open }, 'the open doc')
  const PRIV_DOC = await makeDoc({ title: `${TAG} private doc`, spaceId: spaceOf.private }, 'the private doc')
  const SUB_DOC = await makeDoc({ title: `${TAG} private doc's page`, parentDocId: PRIV_DOC }, 'the private doc’s page')
  const SHARED_DOC = await makeDoc({ title: `${TAG} shared doc`, spaceId: spaceOf.private }, 'the shared doc')
  const SHARED_SUB = await makeDoc({ title: `${TAG} shared doc's page`, parentDocId: SHARED_DOC }, 'the shared doc’s page')
  await sql`
    insert into object_shares (workspace_id, object_type, object_id, user_id, level)
    values (${WS}, 'doc', ${SHARED_DOC}, ${M.id}, 'view')`
  const REFUSED_DOCS = [PRIV_DOC, SUB_DOC]
  const OPENED_DOCS = [OPEN_DOC, SHARED_DOC, SHARED_SUB]
  const ALL_DOCS = [...OPENED_DOCS, ...REFUSED_DOCS]
  const docName = (id) => ['open', 'shared', 'shared page', 'private', 'private page'][ALL_DOCS.indexOf(id)] ?? id

  const statusOf = async (C, id) => (await C(`/docs/${id}`)).status
  const memberOpens = Object.fromEntries(await Promise.all(ALL_DOCS.map(async (id) => [id, await statusOf(M, id)])))
  const adminOpens = Object.fromEntries(await Promise.all(ALL_DOCS.map(async (id) => [id, await statusOf(A, id)])))
  chk(
    REFUSED_DOCS.every((id) => memberOpens[id] === 404) && OPENED_DOCS.every((id) => memberOpens[id] === 200) &&
      ALL_DOCS.every((id) => adminOpens[id] === 200),
    'a member cannot open a doc of a space they are refused, nor the page under it (404) — while they open an open doc, and a doc and page shared with them; the admin opens all five',
    `the member: ${ALL_DOCS.map((id) => `${docName(id)} ${memberOpens[id]}`).join(', ')}; the admin: ${ALL_DOCS.map((id) => `${docName(id)} ${adminOpens[id]}`).join(', ')}`,
  )

  const hubIds = (res) => (res.data ?? []).map((d) => d.id)
  const memberHub = await M(`/workspaces/${WS}/docs`)
  const adminHub = await A(`/workspaces/${WS}/docs`)
  const memberCounts = (await M(`/workspaces/${WS}/docs/scope-counts`)).data
  const adminCounts = (await A(`/workspaces/${WS}/docs/scope-counts`)).data
  chk(
    memberHub.status === 200 && REFUSED_DOCS.every((id) => !hubIds(memberHub).includes(id)) &&
      OPENED_DOCS.every((id) => hubIds(memberHub).includes(id)) && ALL_DOCS.every((id) => hubIds(adminHub).includes(id)) &&
      memberCounts?.all === hubIds(memberHub).length && adminCounts?.all - memberCounts?.all === REFUSED_DOCS.length,
    'the docs hub lists and counts only what the member may open — the admin’s lists and counts all of it',
    `the member's hub has ${JSON.stringify(ALL_DOCS.filter((id) => hubIds(memberHub).includes(id)).map(docName))} and counts ${memberCounts?.all} of ${hubIds(memberHub).length} listed; ` +
      `the admin's has ${JSON.stringify(ALL_DOCS.filter((id) => hubIds(adminHub).includes(id)).map(docName))} and counts ${adminCounts?.all}`,
  )

  // Writes go through the same door as the read.
  const renamed = await M(`/docs/${PRIV_DOC}`, { method: 'PATCH', body: { title: `${TAG} renamed by the member` } })
  const commented = await M(`/docs/${PRIV_DOC}/comments`, { method: 'POST', body: { body: `${TAG} a comment from outside` } })
  const exported = await M(`/docs/${PRIV_DOC}/export`)
  const templated = await M(`/workspaces/${WS}/doc-templates`, { method: 'POST', body: { docId: PRIV_DOC, name: `${TAG} lifted` } })
  const [{ title: privTitle }] = await sql`select title from docs where id = ${PRIV_DOC}`
  const [{ n: strayRows }] = await sql`
    select (select count(*) from doc_comments where doc_id = ${PRIV_DOC})
         + (select count(*) from doc_templates where workspace_id = ${WS} and name = ${`${TAG} lifted`}) as n`
  const renamedOpen = await M(`/docs/${OPEN_DOC}`, { method: 'PATCH', body: { title: `${TAG} open doc` } })
  chk(
    [renamed, commented, exported, templated].every((r) => r.status === 404) && privTitle === `${TAG} private doc` && Number(strayRows) === 0 &&
      renamedOpen.status === 200,
    'a member cannot edit, comment on, export or template a doc they may not open (404 each, the doc unchanged, nothing made) — while they edit an open one',
    `rename ${renamed.status}, comment ${commented.status}, export ${exported.status}, template ${templated.status}; the title is now "${privTitle}", rows made ${strayRows}; renaming the open doc ${said(renamedOpen)}`,
  )

  // Nor file something of their own under it, which would hide it from themselves and name its parent.
  const pageUnder = await M(`/workspaces/${WS}/docs`, { method: 'POST', body: { title: `${TAG} the member's page`, parentDocId: PRIV_DOC } })
  const own = await M(`/workspaces/${WS}/docs`, { method: 'POST', body: { title: `${TAG} the member's doc`, spaceId: spaceOf.open } })
  const movedUnder = own.data?.id ? await M(`/docs/${own.data.id}`, { method: 'PATCH', body: { parentDocId: PRIV_DOC } }) : { status: 0 }
  const pageUnderOpen = await M(`/workspaces/${WS}/docs`, { method: 'POST', body: { title: `${TAG} the member's open page`, parentDocId: OPEN_DOC } })
  const [{ n: underPriv }] = await sql`select count(*)::int as n from docs where parent_doc_id = ${PRIV_DOC}`
  chk(
    pageUnder.status === 404 && movedUnder.status === 404 && underPriv === 1 && own.ok && pageUnderOpen.ok,
    'and a member cannot hang a page under a doc they may not open, nor move one there (404) — while they add one under an open doc',
    `a new page there answered ${pageUnder.status}, a move there ${movedUnder.status}; the private doc now has ${underPriv} page(s); under the open doc ${said(pageUnderOpen)}`,
  )

  // Its room carries every edit, whole.
  const docSockets = []
  const docSocketFor = async (token) => {
    const s = io(`http://127.0.0.1:${API_PORT}/realtime`, { auth: { token }, transports: ['websocket'], reconnection: false })
    docSockets.push(s)
    s.heard = []
    s.on('event', (e) => s.heard.push(e))
    const up = await new Promise((resolve) => {
      s.on('connect', () => resolve(true))
      s.on('connect_error', () => resolve(false))
      setTimeout(() => resolve(false), 8000)
    })
    return up ? s : null
  }
  const docJoin = (s, rooms) =>
    new Promise((resolve) => {
      s.emit('subscribe', { rooms }, (ack) => resolve(ack))
      setTimeout(() => resolve(null), 5000)
    })
  const memberDocSock = await docSocketFor(M.token)
  const adminDocSock = await docSocketFor(auth.accessToken)
  const memberDocAck = memberDocSock ? await docJoin(memberDocSock, [`doc:${PRIV_DOC}`, `doc:${SUB_DOC}`, `doc:${OPEN_DOC}`]) : null
  const adminDocAck = adminDocSock ? await docJoin(adminDocSock, [`doc:${PRIV_DOC}`]) : null
  await A(`/docs/${PRIV_DOC}`, { method: 'PATCH', body: { title: `${TAG} private doc, SECRET edit` } })
  await A(`/docs/${OPEN_DOC}`, { method: 'PATCH', body: { title: `${TAG} open doc, edited in the open` } })
  const heardDoc = (s, words) => (s?.heard ?? []).some((e) => JSON.stringify(e).includes(words))
  await waitFor(() => heardDoc(memberDocSock, 'edited in the open') && heardDoc(adminDocSock, 'SECRET edit'), 6000)
  chk(
    Boolean(memberDocSock && adminDocSock) && !(memberDocAck?.joined ?? []).includes(`doc:${PRIV_DOC}`) &&
      !(memberDocAck?.joined ?? []).includes(`doc:${SUB_DOC}`) && !heardDoc(memberDocSock, 'SECRET edit') &&
      (memberDocAck?.joined ?? []).includes(`doc:${OPEN_DOC}`) && heardDoc(memberDocSock, 'edited in the open') &&
      (adminDocAck?.joined ?? []).includes(`doc:${PRIV_DOC}`) && heardDoc(adminDocSock, 'SECRET edit'),
    'a member cannot join the realtime room of a doc they may not open, nor hear its edits — while they join an open doc’s and hear it, and the admin hears the private one',
    `the member joined ${JSON.stringify((memberDocAck?.joined ?? []).map((r) => docName(r.slice(4))))} and heard the secret edit: ${heardDoc(memberDocSock, 'SECRET edit')}, ` +
      `the open edit: ${heardDoc(memberDocSock, 'edited in the open')}; the admin joined ${JSON.stringify((adminDocAck?.joined ?? []).map((r) => docName(r.slice(4))))} ` +
      `and heard the secret edit: ${heardDoc(adminDocSock, 'SECRET edit')}`,
  )
  for (const s of docSockets) s.close()

  // A task's linked docs name the doc: they list, and link, what may be opened.
  // The member's own task, since LINKING asks for write access: on a task they
  // may only read, the link is refused before the doc is looked at. (Listing
  // asked for it too, until `found-24-sep/linked-docs-read-needs-write-access`.)
  const minePosted = await M('/tasks', { method: 'POST', body: { listId: OPEN_LIST, title: `${TAG} the member's task` } })
  const MINE = minePosted.data?.id
  if (!MINE) throw new Error(`the member could not make a task: ${said(minePosted)}`)
  await sql`insert into task_doc_links (task_id, doc_id) values (${MINE}, ${PRIV_DOC}), (${MINE}, ${OPEN_DOC})`
  const linkedIds = (res) => (res.data ?? []).map((l) => l.docId)
  const memberLinked = await M(`/tasks/${MINE}/linked-docs`)
  const adminLinked = await A(`/tasks/${MINE}/linked-docs`)
  const memberLinks = await M(`/tasks/${MINE}/linked-docs`, { method: 'POST', body: { docId: SUB_DOC } })
  const [{ n: subLinks }] = await sql`select count(*)::int as n from task_doc_links where doc_id = ${SUB_DOC}`
  chk(
    memberLinked.status === 200 && !linkedIds(memberLinked).includes(PRIV_DOC) && linkedIds(memberLinked).includes(OPEN_DOC) &&
      linkedIds(adminLinked).includes(PRIV_DOC) && memberLinks.status === 404 && subLinks === 0,
    'a task’s linked docs name none the member may not open, and linking one is refused (404, no link) — the admin’s name it',
    `the member's list has ${JSON.stringify(linkedIds(memberLinked).map(docName))} (${memberLinked.status}); the admin's ${JSON.stringify(linkedIds(adminLinked).map(docName))}; ` +
      `linking the private page answered ${said(memberLinks)}, links made ${subLinks}`,
  )

  // The knowledge answer cites docs by title. No model is needed: without one
  // it returns its sources as they are, which is what is read here.
  const reindexed = await A(`/workspaces/${WS}/knowledge/reindex`, { method: 'POST', body: {} })
  const askAs = (C) => C('/ai/knowledge', { method: 'POST', body: { workspaceId: WS, question: `${TAG} private doc's page` } })
  const memberAsks = await askAs(M)
  const adminAsks = await askAs(A)
  const cited = (res) => (res.data?.sources ?? []).filter((s) => s.type === 'doc').map((s) => s.id)
  chk(
    reindexed.ok && memberAsks.ok && REFUSED_DOCS.every((id) => !cited(memberAsks).includes(id)) &&
      cited(memberAsks).includes(SHARED_SUB) && cited(adminAsks).includes(SUB_DOC),
    'the knowledge answer cites no doc the member may not open, nor the page under one — while it cites the page shared with them, and the admin’s cites the private page',
    `reindex ${said(reindexed)}; the member's (${memberAsks.status}) cites ${JSON.stringify(cited(memberAsks).map(docName))}; the admin's ${JSON.stringify(cited(adminAsks).map(docName))}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (gone.status >= 300 || gone.status === 0) console.log(`  \x1b[33mnote\x1b[0m cleanup answered ${gone.status}`)
  }
  await sql?.end?.({ timeout: 5 })
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
