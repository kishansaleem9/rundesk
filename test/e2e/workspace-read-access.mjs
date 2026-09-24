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

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 15

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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined })
    .catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' } }
  const json = await res.json().catch(() => null)
  return { status: res.status, data: json?.data, error: json?.error }
}
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
    chk(
      memberChat.status === 503,
      'the prompt a model is sent names, for a member, no space they are refused — the admin’s names it',
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
