/**
 * AN OPEN SOCKET STOPS HEARING WHAT ITS PERSON MAY NO LONGER READ
 * (`found-6-oct/an-open-socket-outlives-its-access`).
 *
 * A room was asked once, when a socket subscribed to it (`canJoinRoom`), and an
 * event goes to everyone in the room with no question per reader. So when a
 * person's access ended and their session did not, a socket they had open
 * went on hearing. Measured on lane 2 before the fix, three runs alike: a
 * member removed from the workspace, a guest whose share of a list was
 * removed, a member lowered to guest, and members of a list and of a space
 * made private each heard what was made seven seconds after — a task in the
 * list, a comment on a task, a message in a public channel, a doc renamed —
 * while their own read of it was refused 403. The session sweep that ends a
 * signed-out session's sockets left theirs: their sessions were live.
 *
 * And through their own room, which no room is taken from: measured on lane 2
 * after the rooms were swept, each of the five went on being notified about a
 * task they followed — a comment on it, its new title in the notification's
 * own — on the socket and in their inbox, and a member removed from the
 * workspace about a comment on a doc they wrote. A notification about an item
 * now goes only to someone who may read it (`notification-reach.ts`).
 *
 * The sweep takes nothing more: a super_admin who is a plain member reads a
 * list made private, as every guard lets them, and goes on hearing it; and when
 * access comes back — a list made public again, a member added to the private
 * space, a guest made a member again — the same open socket hears it again,
 * where measured it stayed deaf until its page was reloaded.
 *
 * ClickUp: "When you remove someone from your ClickUp Workspace, the person
 * immediately loses access to all Workspace content" (help centre, "Remove
 * someone from a Workspace"); "when an item is set to Private, only specific
 * people or teams can access the item" ("Make Spaces, Folders, Subfolders,
 * Lists, and tasks private"); "Adding followers does not change task
 * permissions. Users still need appropriate Workspace permissions or sharing
 * access to open the task" ("Add and remove task followers"). Read through
 * search excerpts; the help centre is blocked here.
 *
 * Each socket is the web app's own client. Every "hears nothing" is beside
 * somebody who keeps their access hearing the same event, so a delivery that
 * reaches nobody cannot pass, and every person's own read is asked first, so a
 * change of access that did not happen cannot pass either. The gateway asks
 * the rooms again at its room pass, every five seconds; the events are made
 * eight seconds after access ends, and after it comes back. The super_admin is
 * this run's own account, made one in Postgres (DATABASE_URL), since no route
 * grants it.
 *
 *   node test/e2e/realtime-access-ends.mjs --api 3011
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { signUpApi, signInApi } from './lib/signin.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'
import { openDb } from './lib/db.mjs'

// The web app's own realtime client, from its own dependencies.
const { io } = createRequire(path.resolve(import.meta.dirname, '../../apps/web/package.json'))('socket.io-client')

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 10

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`

let passed = 0
let failed = 0
const chk = (cond, good, bad) => {
  if (cond) { passed += 1; console.log(`  \x1b[32mPASS\x1b[0m ${good}`) }
  else { failed += 1; console.log(`  \x1b[31mFAIL\x1b[0m ${good}${bad && bad !== good ? ` — ${bad}` : ''}`) }
}

/* NEVER THROWS — `{status, data, error, text}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const said = (res) => `${res.status} ${JSON.stringify(res.error?.message ?? null)}`
const sleep = (ms) => new Promise((res) => setTimeout(res, ms))
const waitFor = async (pred, ms = 10_000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (pred()) return true
    await sleep(100)
  }
  return pred()
}

/** Past the gateway's sweep (every five seconds), which asks each socket's rooms again. */
const PAST_THE_SWEEP_MS = 8_000
const stamp = Date.now()
const TAG = `rae-${stamp}`
const PASSWORD = 'Access@12345!x'
const sockets = []
let sql = null

try {
  sql = await openDb()
  if (!sql) throw new Error('this suite makes its own super_admin in Postgres, and there is no DATABASE_URL')
  /** A person of this run's own, signed up (and so removed when the run ends): their own workspace comes with them. */
  const person = async (who) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, { email, fullName: `Access ${who}`, password: PASSWORD, organizationName: `Access ${who} ${stamp}` })
    return { who, email, id: signed.user?.id, token: signed.accessToken, ownWorkspace: signed.workspaces?.[0]?.id ?? null, as: apiAs(signed.accessToken) }
  }
  const owner = await person('owner')
  const WS = owner.ownWorkspace
  const O = owner.as
  if (!WS) throw new Error('the owner’s sign-up made no workspace')
  const make = async (route, body, what) => {
    const res = await O(route, { method: 'POST', body })
    if (!res.ok || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data
  }
  const join = async (p, role) => {
    const res = await O(`/workspaces/${WS}/members`, { method: 'POST', body: { email: p.email, role } })
    if (!res.ok) throw new Error(`could not add the ${p.who}: ${said(res)}`)
  }
  // KEEPER keeps every access it has; each of the others loses one, one way.
  // ADMIN reads everything, so follows what the others lose and is told of it.
  const keeper = await person('keeper')
  const removed = await person('removed')
  const guest = await person('guest')
  const lowered = await person('lowered')
  const listReader = await person('listreader')
  const spaceReader = await person('spacereader')
  const admin = await person('admin')
  const superAdmin = await person('super')
  await join(keeper, 'member')
  await join(removed, 'member')
  await join(guest, 'guest')
  await join(lowered, 'member')
  await join(listReader, 'member')
  await join(spaceReader, 'member')
  await join(admin, 'workspace_admin')
  // A super_admin who is a plain member here: a platform role no route grants, so set on this run's own account.
  await sql`update users set role = 'super_admin' where id = ${superAdmin.id}`
  const supIn = await signInApi(API, superAdmin.email, PASSWORD)
  superAdmin.token = supIn.accessToken
  superAdmin.as = apiAs(supIn.accessToken)
  await join(superAdmin, 'member')

  const OPEN = (await make('/spaces', { workspaceId: WS, name: `${TAG} open` }, 'the open space')).id
  const P1 = (await make('/projects', { spaceId: OPEN, name: `${TAG} project` }, 'the project')).id
  const L1 = (await make('/lists', { projectId: P1, name: `${TAG} list` }, 'the list')).id
  const SHARED = (await make('/lists', { projectId: P1, name: `${TAG} shared list` }, 'the shared list')).id
  const TO_PRIVATE = (await make('/lists', { projectId: P1, name: `${TAG} list made private` }, 'the list made private')).id
  const CLOSING = (await make('/spaces', { workspaceId: WS, name: `${TAG} space made private` }, 'the space made private')).id
  const P2 = (await make('/projects', { spaceId: CLOSING, name: `${TAG} closing project` }, 'the closing space’s project')).id
  const IN_CLOSING = (await make('/lists', { projectId: P2, name: `${TAG} list in the space made private` }, 'the closing space’s list')).id
  const T1 = (await make('/tasks', { listId: L1, title: `${TAG} task` }, 'the task')).id
  const SUP_LIST = (await make('/lists', { projectId: P1, name: `${TAG} list a super_admin reads` }, 'the super_admin’s list')).id
  // A task of the shared list whose own room the guest holds, beside the list's.
  const IN_SHARED = (await make('/tasks', { listId: SHARED, title: `${TAG} a task of the shared list` }, 'the shared list’s task')).id
  // A task each person follows while they may read it, and the admin follows all four.
  const followed = {
    inList: (await make('/tasks', { listId: L1, title: `${TAG} followed in the list` }, 'a followed task')).id,
    inShared: (await make('/tasks', { listId: SHARED, title: `${TAG} followed in the shared list` }, 'a followed task')).id,
    inPrivate: (await make('/tasks', { listId: TO_PRIVATE, title: `${TAG} followed in the list made private` }, 'a followed task')).id,
    inClosing: (await make('/tasks', { listId: IN_CLOSING, title: `${TAG} followed in the space made private` }, 'a followed task')).id,
  }
  const D1 = (await make(`/workspaces/${WS}/docs`, { spaceId: OPEN, title: `${TAG} doc` }, 'the doc')).id
  const CHANNEL = (await make(`/workspaces/${WS}/chat/channels`, { name: `${TAG}-public` }, 'the public channel')).id
  const share = await O(`/shares/list/${SHARED}`, { method: 'POST', body: { userId: guest.id, level: 'view' } })
  const shareId = share.data?.id
  if (!share.ok || !shareId) throw new Error(`could not share the list with the guest: ${said(share)}`)
  const follow = async (p, taskId) => {
    const res = await p.as(`/tasks/${taskId}/watchers`, { method: 'POST', body: { userId: p.id } })
    if (!res.ok) throw new Error(`the ${p.who} could not follow a task they may read: ${said(res)}`)
  }
  await follow(removed, followed.inList)
  await follow(lowered, followed.inList)
  await follow(guest, followed.inShared)
  await follow(listReader, followed.inPrivate)
  await follow(spaceReader, followed.inClosing)
  for (const id of Object.values(followed)) await follow(admin, id)
  // A doc each of two members writes: one is then removed, the other stays.
  const docOf = async (p) => {
    const res = await p.as(`/workspaces/${WS}/docs`, { method: 'POST', body: { spaceId: OPEN, title: `${TAG} the ${p.who}’s doc` } })
    if (!res.ok || !res.data?.id) throw new Error(`the ${p.who} could not write a doc: ${said(res)}`)
    return res.data.id
  }
  const DOC_OF_REMOVED = await docOf(removed)
  const DOC_OF_KEEPER = await docOf(keeper)
  // The removed member's own workspace, where nothing changes: a public channel of theirs.
  const OWN_CHANNEL = await removed.as(`/workspaces/${removed.ownWorkspace}/chat/channels`, { method: 'POST', body: { name: `${TAG}-own` } })
  if (!OWN_CHANNEL.ok || !OWN_CHANNEL.data?.id) throw new Error(`could not make the removed member’s own channel: ${said(OWN_CHANNEL)}`)

  /** A socket in these rooms, keeping everything it hears; every room must be joined, or nothing below means anything. */
  const listen = async (p, rooms) => {
    const sock = io(`http://127.0.0.1:${API_PORT}/realtime`, { auth: { token: p.token }, transports: ['websocket'], reconnection: false })
    sockets.push(sock)
    const up = await new Promise((res) => {
      sock.on('connect', () => res(true))
      sock.on('connect_error', () => res(false))
      setTimeout(() => res(false), 10_000)
    })
    if (!up) throw new Error(`the ${p.who}’s socket did not connect`)
    const heard = []
    sock.on('event', (e) => heard.push(e))
    const ack = await new Promise((res) => sock.timeout(10_000).emit('subscribe', { rooms }, (err, a) => res(err ? null : a)))
    const joined = ack?.joined ?? []
    if (!rooms.every((r) => joined.includes(r))) throw new Error(`the ${p.who}’s socket could not join its rooms before its access changed: ${JSON.stringify(ack)}`)
    return { sock, heard }
  }
  const workspaceRooms = [`workspace:${WS}`, `list:${L1}`, `task:${T1}`, `doc:${D1}`]
  const ofKeeper = await listen(keeper, workspaceRooms.concat([`list:${SHARED}`, `task:${IN_SHARED}`]))
  const ofRemoved = await listen(removed, workspaceRooms.concat([`workspace:${removed.ownWorkspace}`]))
  const ofGuest = await listen(guest, [`list:${SHARED}`, `task:${IN_SHARED}`])
  const ofLowered = await listen(lowered, [`workspace:${WS}`, `list:${L1}`])
  const ofListReader = await listen(listReader, [`list:${TO_PRIVATE}`])
  const ofSpaceReader = await listen(spaceReader, [`list:${IN_CLOSING}`])
  const ofOwner = await listen(owner, [`list:${TO_PRIVATE}`, `list:${IN_CLOSING}`, `list:${SUP_LIST}`])
  const ofAdmin = await listen(admin, [])
  const ofSuper = await listen(superAdmin, [`list:${SUP_LIST}`])

  // ── Access ends, five ways at once; every session stays live. ────────────
  const ended = {
    removed: await O(`/workspaces/${WS}/members/${removed.id}`, { method: 'DELETE' }),
    unshared: await O(`/shares/list/${SHARED}/${shareId}`, { method: 'DELETE' }),
    lowered: await O(`/workspaces/${WS}/members/${lowered.id}`, { method: 'PATCH', body: { role: 'guest' } }),
    listPrivate: await O(`/lists/${TO_PRIVATE}`, { method: 'PUT', body: { visibility: 'private' } }),
    spacePrivate: await O(`/spaces/${CLOSING}/visibility`, { method: 'PATCH', body: { visibility: 'private' } }),
    superList: await O(`/lists/${SUP_LIST}`, { method: 'PUT', body: { visibility: 'private' } }),
  }
  // Each one's own read, refused now: the access did end.
  const refusedRead = {
    removed: (await removed.as(`/lists/${L1}`)).status,
    guest: (await guest.as(`/lists/${SHARED}`)).status,
    lowered: (await lowered.as(`/lists/${L1}`)).status,
    listReader: (await listReader.as(`/lists/${TO_PRIVATE}`)).status,
    spaceReader: (await spaceReader.as(`/lists/${IN_CLOSING}`)).status,
  }
  // The super_admin's read of the list made private still answers: every guard passes a super_admin.
  const superRead = (await superAdmin.as(`/lists/${SUP_LIST}`)).status
  await sleep(PAST_THE_SWEEP_MS)

  // ── What is made after, in every room. ──────────────────────────────────
  const mark = (what) => `${TAG}-${what}-after`
  const made = {
    listTask: await O('/tasks', { method: 'POST', body: { listId: L1, title: mark('list-task') } }),
    comment: await O(`/tasks/${T1}/comments`, { method: 'POST', body: { body: mark('comment') } }),
    message: await O(`/chat/channels/${CHANNEL}/messages`, { method: 'POST', body: { body: mark('message') } }),
    doc: await O(`/docs/${D1}`, { method: 'PATCH', body: { title: mark('doc') } }),
    sharedTask: await O('/tasks', { method: 'POST', body: { listId: SHARED, title: mark('shared-task') } }),
    sharedComment: await O(`/tasks/${IN_SHARED}/comments`, { method: 'POST', body: { body: mark('shared-comment') } }),
    privateTask: await O('/tasks', { method: 'POST', body: { listId: TO_PRIVATE, title: mark('private-list-task') } }),
    closedTask: await O('/tasks', { method: 'POST', body: { listId: IN_CLOSING, title: mark('private-space-task') } }),
    own: await removed.as(`/chat/channels/${OWN_CHANNEL.data.id}/messages`, { method: 'POST', body: { body: mark('own-workspace') } }),
    superTask: await O('/tasks', { method: 'POST', body: { listId: SUP_LIST, title: mark('super-list-task') } }),
    followedComments: await Promise.all(Object.values(followed).map((id) => O(`/tasks/${id}/comments`, { method: 'POST', body: { body: mark('followed-comment') } }))),
    removedDocComment: await O(`/docs/${DOC_OF_REMOVED}/comments`, { method: 'POST', body: { body: mark('removed-doc-comment') } }),
    keeperDocComment: await O(`/docs/${DOC_OF_KEEPER}/comments`, { method: 'POST', body: { body: mark('keeper-doc-comment') } }),
  }
  const has = (heard, what) => heard.some((e) => JSON.stringify(e).includes(mark(what)))
  /** The notifications a socket was sent about these items. */
  const notifiedOf = (heard, ids) => heard.filter((e) => e?.type === 'notification.created' && ids.includes(e.notification?.target?.entityId))
  /** The rows in a person's inbox for this workspace about these items. */
  const inboxOf = async (p, ids) => {
    const res = await p.as(`/notifications?workspaceId=${WS}&limit=100`)
    const rows = Array.isArray(res.data) ? res.data : res.data?.items ?? res.data?.notifications ?? []
    return { status: res.status, rows: rows.filter((n) => ids.includes(n?.target?.entityId)) }
  }
  const followedIds = Object.values(followed)
  // Until those who keep their access have heard it all: anyone still in a room has heard it by then too.
  await waitFor(() =>
    ['list-task', 'comment', 'message', 'doc', 'shared-task', 'shared-comment'].every((w) => has(ofKeeper.heard, w)) &&
      ['private-list-task', 'private-space-task', 'super-list-task'].every((w) => has(ofOwner.heard, w)) &&
      has(ofRemoved.heard, 'own-workspace') &&
      notifiedOf(ofAdmin.heard, followedIds).length >= followedIds.length &&
      notifiedOf(ofKeeper.heard, [DOC_OF_KEEPER]).length >= 1,
  )
  /** Whether these were made, and what was refused if not. */
  const madeOk = (...keys) => keys.every((k) => made[k].ok)
  const madeSays = (...keys) => keys.filter((k) => !made[k].ok).map((k) => `${k} ${said(made[k])}`).join('; ') || 'each was made'
  const heardOf = (heard, list) => list.filter((w) => has(heard, w)).join(', ') || 'nothing'

  console.log('\n▶ a member removed from the workspace')
  const fourRooms = ['list-task', 'comment', 'message', 'doc']
  chk(
    ended.removed.ok && refusedRead.removed === 403 && madeOk('listTask', 'comment', 'message', 'doc') &&
      fourRooms.every((w) => !has(ofRemoved.heard, w)) && fourRooms.every((w) => has(ofKeeper.heard, w)),
    'a member removed from the workspace stops hearing it on a socket already open — a task made in a list, a comment on a task, a message in a public channel, a doc renamed — while a member still in it hears every one',
    `the removal answered ${said(ended.removed)} and their read of the list then ${refusedRead.removed}; ${madeSays('listTask', 'comment', 'message', 'doc')}; the removed member heard ${heardOf(ofRemoved.heard, fourRooms)}, the member still in it ${heardOf(ofKeeper.heard, fourRooms)}`,
  )

  console.log('\n▶ a guest whose share of a list is removed')
  const sharedRooms = ['shared-task', 'shared-comment']
  chk(
    ended.unshared.ok && refusedRead.guest === 403 && madeOk('sharedTask', 'sharedComment') &&
      sharedRooms.every((w) => !has(ofGuest.heard, w)) && sharedRooms.every((w) => has(ofKeeper.heard, w)),
    'a guest whose share of a list is removed stops hearing the list and its task on a socket already open, while a member hears both',
    `the share's removal answered ${said(ended.unshared)} and the guest's read of the list then ${refusedRead.guest}; ${madeSays('sharedTask', 'sharedComment')}; a task made in the list and a comment on its task were heard by the guest: ${heardOf(ofGuest.heard, sharedRooms)}, by the member: ${heardOf(ofKeeper.heard, sharedRooms)}`,
  )

  console.log('\n▶ a member lowered to guest')
  const loweredRooms = ['list-task', 'message']
  chk(
    ended.lowered.ok && refusedRead.lowered === 403 && madeOk('listTask', 'message') &&
      loweredRooms.every((w) => !has(ofLowered.heard, w)) && loweredRooms.every((w) => has(ofKeeper.heard, w)),
    'a member lowered to guest stops hearing the workspace’s room and a list nothing shares with them on a socket already open, while a member hears both',
    `the change answered ${said(ended.lowered)} and their read of the list then ${refusedRead.lowered}; ${madeSays('listTask', 'message')}; the lowered member heard ${heardOf(ofLowered.heard, loweredRooms)}, the member ${heardOf(ofKeeper.heard, loweredRooms)}`,
  )

  console.log('\n▶ a list made private')
  chk(
    ended.listPrivate.ok && refusedRead.listReader === 403 && made.privateTask.ok &&
      !has(ofListReader.heard, 'private-list-task') && has(ofOwner.heard, 'private-list-task'),
    'a member of a list made private stops hearing it on a socket already open, while its maker hears it',
    `making it private answered ${said(ended.listPrivate)} and the member's read of it then ${refusedRead.listReader}; a task made there (${made.privateTask.status}) was heard by the member: ${has(ofListReader.heard, 'private-list-task')}, by its maker: ${has(ofOwner.heard, 'private-list-task')}`,
  )

  console.log('\n▶ a space made private')
  chk(
    ended.spacePrivate.ok && refusedRead.spaceReader === 403 && made.closedTask.ok &&
      !has(ofSpaceReader.heard, 'private-space-task') && has(ofOwner.heard, 'private-space-task'),
    'a member of a space made private stops hearing its list on a socket already open, while its maker hears it',
    `making it private answered ${said(ended.spacePrivate)} and the member's read of its list then ${refusedRead.spaceReader}; a task made there (${made.closedTask.status}) was heard by the member: ${has(ofSpaceReader.heard, 'private-space-task')}, by its maker: ${has(ofOwner.heard, 'private-space-task')}`,
  )

  console.log('\n▶ what ends is the workspace’s rooms, not the socket')
  chk(
    ofRemoved.sock.connected && made.own.ok && has(ofRemoved.heard, 'own-workspace'),
    'the removed member’s socket stays open and still hears their own workspace: what ends is what the workspace sends them, not the socket that carries their other workspaces',
    `the removed member's socket is ${ofRemoved.sock.connected ? 'open' : 'CLOSED'}; a message in their own workspace (${made.own.status}) was ${has(ofRemoved.heard, 'own-workspace') ? 'heard' : 'NOT heard'}`,
  )

  // ── Notifications: their own room, which no room is taken from. ─────────
  console.log('\n▶ what a follower is told after their access ends')
  const followers = [
    ['the removed member', removed, ofRemoved, followed.inList],
    ['the member lowered to guest', lowered, ofLowered, followed.inList],
    ['the unshared guest', guest, ofGuest, followed.inShared],
    ['the member of the list made private', listReader, ofListReader, followed.inPrivate],
    ['the member of the space made private', spaceReader, ofSpaceReader, followed.inClosing],
  ]
  const toldAfter = []
  for (const [who, p, of, taskId] of followers) {
    const inbox = await inboxOf(p, [taskId])
    toldAfter.push({ who, socket: notifiedOf(of.heard, [taskId]).length, inbox: inbox.rows.length, status: inbox.status })
  }
  const adminInbox = await inboxOf(admin, followedIds)
  const commentsMade = made.followedComments.every((r) => r.ok)
  chk(
    commentsMade && toldAfter.every((t) => t.socket === 0 && t.inbox === 0 && t.status === 200) &&
      notifiedOf(ofAdmin.heard, followedIds).length === followedIds.length && adminInbox.rows.length === followedIds.length,
    'a follower of a task whose access to it ended — removed from the workspace, lowered to guest, a guest unshared, a member of a list or a space made private — is notified of nothing about it after, on their open socket or in their inbox, while a workspace admin who follows the same tasks is notified of each',
    `the comments answered ${made.followedComments.map((r) => r.status).join(', ')}; ${toldAfter.map((t) => `${t.who}: ${t.socket} on the socket, ${t.inbox} in the inbox (${t.status})`).join('; ')}; the admin: ${notifiedOf(ofAdmin.heard, followedIds).length} on the socket and ${adminInbox.rows.length} in the inbox of ${followedIds.length}`,
  )

  console.log('\n▶ what a doc’s author is told after they leave')
  const removedDocInbox = await inboxOf(removed, [DOC_OF_REMOVED])
  const keeperDocInbox = await inboxOf(keeper, [DOC_OF_KEEPER])
  chk(
    made.removedDocComment.ok && made.keeperDocComment.ok &&
      notifiedOf(ofRemoved.heard, [DOC_OF_REMOVED]).length === 0 && removedDocInbox.status === 200 && removedDocInbox.rows.length === 0 &&
      notifiedOf(ofKeeper.heard, [DOC_OF_KEEPER]).length === 1 && keeperDocInbox.rows.length === 1,
    'a member removed from the workspace is not notified of a comment on a doc they wrote, on their socket or in their inbox, while a member still in it is notified of one on theirs',
    `the comments answered ${made.removedDocComment.status} / ${made.keeperDocComment.status}; the removed author: ${notifiedOf(ofRemoved.heard, [DOC_OF_REMOVED]).length} on the socket, ${removedDocInbox.rows.length} in the inbox (${removedDocInbox.status}); the author still in it: ${notifiedOf(ofKeeper.heard, [DOC_OF_KEEPER]).length} on the socket, ${keeperDocInbox.rows.length} in the inbox`,
  )

  console.log('\n▶ a super_admin who is a plain member')
  chk(
    ended.superList.ok && superRead === 200 && made.superTask.ok && has(ofSuper.heard, 'super-list-task') && has(ofOwner.heard, 'super-list-task'),
    'a super_admin who is a plain member of the workspace goes on hearing a list made private, which the routes still let them read, as every guard lets a super_admin',
    `making it private answered ${said(ended.superList)} and the super_admin's read of it then ${superRead}; a task made there (${made.superTask.status}) was heard by the super_admin: ${has(ofSuper.heard, 'super-list-task')}, by its maker: ${has(ofOwner.heard, 'super-list-task')}`,
  )

  // ── Access comes back, three ways; nobody subscribes again. ──────────────
  console.log('\n▶ when access comes back')
  const restored = {
    listPublic: await O(`/lists/${TO_PRIVATE}`, { method: 'PUT', body: { visibility: 'public' } }),
    spaceMember: await O(`/spaces/${CLOSING}/members`, { method: 'POST', body: { userId: spaceReader.id } }),
    raised: await O(`/workspaces/${WS}/members/${lowered.id}`, { method: 'PATCH', body: { role: 'member' } }),
  }
  const readAgain = {
    listReader: (await listReader.as(`/lists/${TO_PRIVATE}`)).status,
    spaceReader: (await spaceReader.as(`/lists/${IN_CLOSING}`)).status,
    lowered: (await lowered.as(`/lists/${L1}`)).status,
  }
  await sleep(PAST_THE_SWEEP_MS)
  const back = {
    privateList: await O('/tasks', { method: 'POST', body: { listId: TO_PRIVATE, title: mark('back-private-list') } }),
    closedSpace: await O('/tasks', { method: 'POST', body: { listId: IN_CLOSING, title: mark('back-private-space') } }),
    list: await O('/tasks', { method: 'POST', body: { listId: L1, title: mark('back-list') } }),
  }
  await waitFor(() =>
    ['back-private-list', 'back-private-space'].every((w) => has(ofOwner.heard, w)) && has(ofKeeper.heard, 'back-list') &&
      has(ofListReader.heard, 'back-private-list') && has(ofSpaceReader.heard, 'back-private-space') && has(ofLowered.heard, 'back-list'),
  )
  const restoredOk = Object.values(restored).every((r) => r.ok) && Object.values(readAgain).every((s) => s === 200) && Object.values(back).every((r) => r.ok)
  chk(
    restoredOk && has(ofListReader.heard, 'back-private-list') && has(ofSpaceReader.heard, 'back-private-space') && has(ofLowered.heard, 'back-list') &&
      has(ofOwner.heard, 'back-private-list') && has(ofKeeper.heard, 'back-list'),
    'when access comes back — a list made public again, a member added to the private space, a guest made a member again — the same open socket hears it again, without subscribing anew',
    `restored: ${Object.entries(restored).map(([k, r]) => `${k} ${r.status}`).join(', ')}; their reads then ${JSON.stringify(readAgain)}; tasks made ${Object.values(back).map((r) => r.status).join('/')}: the member of the list heard ${has(ofListReader.heard, 'back-private-list')}, the member added to the space ${has(ofSpaceReader.heard, 'back-private-space')}, the member raised again ${has(ofLowered.heard, 'back-list')}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  for (const s of sockets) s.close()
  await sql?.end?.().catch?.(() => {})
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
