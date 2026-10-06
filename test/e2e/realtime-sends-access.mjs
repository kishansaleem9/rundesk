/**
 * WHAT A SOCKET SENDS GOES ONLY WHERE ITS PERSON MAY READ.
 *
 * NOT A FRAME ROW: `found-6-oct/a-socket-sends-into-rooms-it-may-not-read`.
 * A call reaction went into the room of whichever workspace its body named,
 * from anyone with a socket, and a whiteboard cursor into any canvas's room
 * under the name its body gave. Measured on lane 2 before the fix: a member
 * removed from the workspace and an account never in it each put a reaction
 * on the owner's screen and a cursor on the owner's board as "Rev owner (not
 * really)", while a reaction in a DM's call reached every member.
 *
 * Every "heard nothing" has, beside it, somebody who may send the same thing
 * and is heard: the other person in the DM, a member in a public channel's
 * call, a member on the board.
 *
 *   node test/e2e/realtime-sends-access.mjs --api 3021
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { signInApi, signUpApi } from './lib/signin.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

// The web app's own realtime client, from its own dependencies.
const { io } = createRequire(path.resolve(import.meta.dirname, '../../apps/web/package.json'))('socket.io-client')

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 3

const API_PORT = Number(argOf('--api', process.env.E2E_API_PORT ?? 3011))
const API = `http://127.0.0.1:${API_PORT}/api/v1`
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

/* NEVER THROWS — `{status, data, error, text}`. lib/fixture.mjs's one client. */
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

const stamp = Date.now()
const TAG = `rsa-${stamp}`
const POSED = 'Rev owner (not really)'
let WS = null
let A = null
const sockets = []

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id
  /** An account of its own; a member of the workspace unless told otherwise. */
  const person = async (who, { member = true } = {}) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Rsa ${who}`, email, password: 'Member@12345!',
      organizationName: `Rsa ${who} ${stamp}`, organizationSlug: `rsa-${who}-${stamp}`,
    })
    if (!signed?.accessToken) throw new Error(`could not sign up the ${who}`)
    if (member) {
      const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
      if (!added.ok) throw new Error(`could not add the ${who}: ${said(added)}`)
    }
    return { id: signed.user?.id, token: signed.accessToken }
  }
  const peer = await person('peer')
  const member = await person('member')
  const removed = await person('removed')
  const stranger = await person('stranger', { member: false })
  const out = await A(`/workspaces/${WS}/members/${removed.id}`, { method: 'DELETE' })
  if (!out.ok) throw new Error(`could not remove the member: ${said(out)}`)

  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (!res.ok || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const DM = await make(`/workspaces/${WS}/chat/dms`, { peerUserId: peer.id }, 'the DM')
  const PUB = await make(`/workspaces/${WS}/chat/channels`, { name: `${TAG}-public` }, 'the public channel')
  const DM_CALL = await make(`/workspaces/${WS}/calls`, { channelId: DM }, 'the DM call')
  const PUB_CALL = await make(`/workspaces/${WS}/calls`, { channelId: PUB }, 'the public call')
  const BOARD = await make(`/workspaces/${WS}/canvases`, { type: 'whiteboard', title: `${TAG} board` }, 'the whiteboard')

  /** A socket, keeping everything it hears, in the rooms named (each must let it in). */
  const connect = async (token, rooms = []) => {
    const sock = io(`http://127.0.0.1:${API_PORT}/realtime`, { auth: { token }, transports: ['websocket'], reconnection: false })
    sockets.push(sock)
    const up = await new Promise((res) => {
      sock.on('connect', () => res(true))
      sock.on('connect_error', () => res(false))
      setTimeout(() => res(false), 10_000)
    })
    if (!up) throw new Error('a socket did not connect')
    const heard = []
    sock.on('event', (e) => heard.push(e))
    if (rooms.length) {
      const ack = await new Promise((res) => sock.timeout(10_000).emit('subscribe', { rooms }, (err, a) => res(err ? null : a)))
      const missing = rooms.filter((r) => !(ack?.joined ?? []).includes(r))
      if (missing.length) throw new Error(`a socket could not join ${JSON.stringify(missing)}: ${JSON.stringify(ack)}`)
    }
    return { sock, heard }
  }
  /** What the server answered a message, or null if it did not. */
  const send = (sock, type, body) => new Promise((res) => sock.timeout(5000).emit(type, body, (err, a) => res(err ? null : a)))

  const byAdmin = await connect(auth.accessToken, [`workspace:${WS}`, `canvas:${BOARD}`])
  const byPeer = await connect(peer.token, [`workspace:${WS}`, `canvas:${BOARD}`])
  const byMember = await connect(member.token, [`workspace:${WS}`])
  const byRemoved = await connect(removed.token)
  const byStranger = await connect(stranger.token)
  const reactions = (heard, callId) => heard.filter((e) => e.type === 'call.reaction' && e.callId === callId).map((e) => e.emoji)

  // ══ 1. A REACTION IN A DM'S CALL ═════════════════════════════════════════
  console.log('\n▶ a reaction in a SyncUp in a DM')
  const dmAcks = {
    peer: await send(byPeer.sock, 'call.reaction', { callId: DM_CALL, workspaceId: WS, emoji: 'pDM' }),
    member: await send(byMember.sock, 'call.reaction', { callId: DM_CALL, workspaceId: WS, emoji: 'mDM' }),
    removed: await send(byRemoved.sock, 'call.reaction', { callId: DM_CALL, workspaceId: WS, emoji: 'rDM' }),
    stranger: await send(byStranger.sock, 'call.reaction', { callId: DM_CALL, workspaceId: WS, emoji: 'sDM' }),
  }
  await waitFor(() => reactions(byAdmin.heard, DM_CALL).includes('pDM'))
  await sleep(1500) // what is not sent arrives never; long enough for what is to have
  const adminDm = reactions(byAdmin.heard, DM_CALL)
  const memberDm = reactions(byMember.heard, DM_CALL)
  chk(
    adminDm.includes('pDM') && !adminDm.some((e) => ['mDM', 'rDM', 'sDM'].includes(e)) && memberDm.length === 0,
    'a reaction in a DM’s SyncUp is heard from the other person in it, and not from a member outside the DM, a member removed from the workspace or an account never in it — and the member outside it hears none',
    `the admin heard ${JSON.stringify(adminDm)}; the member outside the DM heard ${JSON.stringify(memberDm)}; the server answered ${JSON.stringify(dmAcks)}`,
  )

  // ══ 2. A REACTION IN A PUBLIC CHANNEL'S CALL ═════════════════════════════
  console.log('\n▶ a reaction in a SyncUp in a public channel')
  const pubAcks = {
    member: await send(byMember.sock, 'call.reaction', { callId: PUB_CALL, workspaceId: WS, emoji: 'mPUB' }),
    removed: await send(byRemoved.sock, 'call.reaction', { callId: PUB_CALL, workspaceId: WS, emoji: 'rPUB' }),
    stranger: await send(byStranger.sock, 'call.reaction', { callId: PUB_CALL, workspaceId: WS, emoji: 'sPUB' }),
  }
  await waitFor(() => reactions(byAdmin.heard, PUB_CALL).includes('mPUB'))
  await sleep(1500)
  const adminPub = reactions(byAdmin.heard, PUB_CALL)
  chk(
    adminPub.includes('mPUB') && !adminPub.some((e) => ['rPUB', 'sPUB'].includes(e)),
    'a reaction in a public channel’s SyncUp is heard from any member, and not from a member removed from the workspace or an account never in it',
    `the admin heard ${JSON.stringify(adminPub)}; the server answered ${JSON.stringify(pubAcks)}`,
  )

  // ══ 3. A CURSOR ON A WHITEBOARD ══════════════════════════════════════════
  console.log('\n▶ a cursor on a whiteboard')
  const cursorAcks = {
    peer: await send(byPeer.sock, 'canvas.cursor', { canvasId: BOARD, x: 10, y: 20, displayName: POSED }),
    member: await send(byMember.sock, 'canvas.cursor', { canvasId: BOARD, x: 11, y: 21, displayName: POSED }),
    removed: await send(byRemoved.sock, 'canvas.cursor', { canvasId: BOARD, x: 12, y: 22, displayName: POSED }),
    stranger: await send(byStranger.sock, 'canvas.cursor', { canvasId: BOARD, x: 13, y: 23, displayName: POSED }),
    strangerLeave: await send(byStranger.sock, 'canvas.cursor.leave', { canvasId: BOARD }),
  }
  const onBoard = () => byAdmin.heard.filter((e) => String(e.type).startsWith('canvas.cursor') && e.canvasId === BOARD)
  await waitFor(() => onBoard().some((e) => e.userId === peer.id))
  await sleep(1500)
  const cursors = onBoard().map((e) => ({ type: e.type, from: e.userId === peer.id ? 'peer' : e.userId === member.id ? 'member' : e.userId === removed.id ? 'removed' : e.userId === stranger.id ? 'stranger' : e.userId, name: e.displayName ?? null }))
  chk(
    cursors.length === 1 && cursors[0].type === 'canvas.cursor' && cursors[0].from === 'peer' && cursors[0].name === 'Rsa peer',
    'a cursor on a whiteboard comes only from a socket on that board, under its account’s name — not from a member who has not opened it, a member removed from the workspace or an account never in it, and not under a name the sender chose',
    `the admin heard ${JSON.stringify(cursors)}; the server answered ${JSON.stringify(cursorAcks)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  for (const s of sockets) s.close()
  if (WS && A) {
    const gone = await A(`/workspaces/${WS}`, { method: 'DELETE' })
    if (![200, 204, 404].includes(gone.status)) console.log(`  cleanup left behind: DELETE /workspaces/${WS} answered ${gone.status || 'nothing'}`)
  }
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
