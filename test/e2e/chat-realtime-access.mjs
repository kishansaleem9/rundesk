/**
 * A CHAT EVENT REACHES ONLY THOSE WHO MAY READ ITS CHANNEL.
 *
 * NOT A FRAME ROW: `found-24-sep/chat-events-broadcast-to-the-workspace`, from
 * the audit's "new chat messages broadcast to the whole workspace whatever the
 * channel's privacy". Every chat event went to the workspace's realtime room,
 * which every member's socket joins. Measured on lane 1 before the fix, as a
 * member refused a DM, a private channel and a private space's channel (403 on
 * each read): the member's socket heard every message in all three as it was
 * written, an edit, and the name of a new private channel. A SyncUp's call card
 * went the same way.
 *
 * Each section listens with the web app's own socket client, as three people:
 * the OUTSIDER (a member in none of these chats), the PEER (the admin's DM
 * partner and a member of the private channel) and the admin, who is in all of
 * them. Every "hears nothing" is beside a "hears it" from somebody entitled to,
 * on the same event, so a delivery that reaches nobody cannot pass.
 *
 *   node test/e2e/chat-realtime-access.mjs --api 3021
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { signInApi, signUpApi } from './lib/signin.mjs'

// The web app's own realtime client, from its own dependencies.
const { io } = createRequire(path.resolve(import.meta.dirname, '../../apps/web/package.json'))('socket.io-client')

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 6

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

/* NEVER THROWS — `{status, data, error, text}`. Every call site reads `status`. */
const apiAs = (token) => async (route, init = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {}
  if (init.body) headers['content-type'] = 'application/json'
  const res = await fetch(`${API}${route}`, { ...init, headers, body: init.body ? JSON.stringify(init.body) : undefined })
    .catch(() => null)
  if (!res) return { status: 0, data: null, error: { message: 'no answer' }, text: '' }
  const text = await res.text().catch(() => '')
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, data: json?.data, error: json?.error, text }
}
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
const TAG = `crr-${stamp}`
let WS = null
let A = null
const sockets = []

try {
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (made.status >= 300 || !made.data?.id) throw new Error(`could not make the workspace: ${said(made)}`)
  WS = made.data.id

  const person = async (who) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Chat ${who}`, email, password: 'Member@12345!',
      organizationName: `Chat ${who} ${stamp}`, organizationSlug: `chat-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role: 'member' } })
    if (added.status >= 300) throw new Error(`could not add the ${who}: ${said(added)}`)
    return { id: signed.user?.id, token: signed.accessToken, as: apiAs(signed.accessToken) }
  }
  const outsider = await person('outsider')
  const peer = await person('peer')

  const make = async (route, body, what) => {
    const res = await A(route, { method: 'POST', body })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not make ${what}: ${said(res)}`)
    return res.data.id
  }
  const privateSpace = await make('/spaces', { workspaceId: WS, name: `${TAG} private space`, visibility: 'private' }, 'the private space')
  const DM = await make(`/workspaces/${WS}/chat/dms`, { peerUserId: peer.id }, 'the DM')
  const PRIV = await make(`/workspaces/${WS}/chat/channels`, { name: `${TAG}-private`, isPrivate: true, memberIds: [peer.id] }, 'the private channel')
  const SPACE_CH = await make(`/workspaces/${WS}/chat/channels`, { name: `${TAG}-in-the-private-space`, spaceId: privateSpace }, 'the private space’s channel')
  const PUB = await make(`/workspaces/${WS}/chat/channels`, { name: `${TAG}-public` }, 'the public channel')
  const refused = await Promise.all([DM, PRIV, SPACE_CH].map((c) => outsider.as(`/chat/channels/${c}/messages`)))
  if (!refused.every((r) => r.status === 403)) {
    throw new Error(`the outsider was not refused all three chats (${refused.map((r) => r.status).join(', ')}), so nothing here would mean anything`)
  }

  /** A socket, in the workspace's room, keeping everything it hears. */
  const listen = async (token) => {
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
    const ack = await new Promise((res) => sock.timeout(10_000).emit('subscribe', { rooms: [`workspace:${WS}`] }, (err, a) => res(err ? null : a)))
    if (!(ack?.joined ?? []).includes(`workspace:${WS}`)) throw new Error(`a socket could not join the workspace room: ${JSON.stringify(ack)}`)
    return heard
  }
  const heardByOutsider = await listen(outsider.token)
  const heardByPeer = await listen(peer.token)
  const heardByAdmin = await listen(auth.accessToken)
  const has = (heard, text) => heard.some((e) => JSON.stringify(e).includes(text))
  /** Everything a socket heard about a channel, but for membership notices (ids only, sent to the workspace on purpose). */
  const about = (heard, channelId) => heard.filter((e) => e.channelId === channelId && !String(e.type).startsWith('chat.channel.members.'))
  const say = async (C, channelId, body) => {
    const res = await C(`/chat/channels/${channelId}/messages`, { method: 'POST', body: { body } })
    if (res.status >= 300 || !res.data?.id) throw new Error(`could not post "${body}": ${said(res)}`)
    return res.data.id
  }

  // ══ 1. A DM ══════════════════════════════════════════════════════════════
  console.log('\n▶ a DM between the admin and the peer')
  const dmMsg = await say(A, DM, `${TAG} DM SECRET`)
  await A(`/chat/messages/${dmMsg}`, { method: 'PATCH', body: { body: `${TAG} DM EDITED SECRET` } })
  await waitFor(() => has(heardByPeer, `${TAG} DM EDITED SECRET`))
  chk(
    about(heardByOutsider, DM).length === 0 && !has(heardByOutsider, 'DM SECRET') &&
      has(heardByPeer, `${TAG} DM SECRET`) && has(heardByPeer, `${TAG} DM EDITED SECRET`),
    'a member outside a DM hears nothing of it, the message or its edit — the other person in it hears both',
    `the outsider heard ${about(heardByOutsider, DM).map((e) => e.type).join(', ') || 'nothing'}; the peer heard the message: ${has(heardByPeer, `${TAG} DM SECRET`)}, the edit: ${has(heardByPeer, `${TAG} DM EDITED SECRET`)}`,
  )

  // ══ 2. A PRIVATE CHANNEL ═════════════════════════════════════════════════
  console.log('\n▶ a private channel the peer is in')
  const privMsg = await say(A, PRIV, `${TAG} PRIVATE SECRET`)
  await A(`/chat/messages/${privMsg}`, { method: 'PATCH', body: { body: `${TAG} PRIVATE EDITED SECRET` } })
  await A(`/chat/messages/${privMsg}/pin`, { method: 'POST' })
  await A(`/chat/messages/${privMsg}/reactions`, { method: 'POST', body: { emoji: '👍' } })
  const privGone = await say(A, PRIV, `${TAG} PRIVATE DELETED SECRET`)
  await A(`/chat/messages/${privGone}`, { method: 'DELETE' })
  await waitFor(() => about(heardByPeer, PRIV).some((e) => e.messageId === privGone))
  const outsiderPriv = about(heardByOutsider, PRIV)
  chk(
    outsiderPriv.length === 0 && !has(heardByOutsider, 'PRIVATE') &&
      has(heardByPeer, `${TAG} PRIVATE SECRET`) && has(heardByPeer, `${TAG} PRIVATE EDITED SECRET`) &&
      about(heardByPeer, PRIV).some((e) => e.type === 'chat.reaction.toggled'),
    'a member outside a private channel hears nothing of it — not a message, an edit, a pin, a reaction or a deletion — while a member of it hears them',
    `the outsider heard ${outsiderPriv.map((e) => e.type).join(', ') || 'nothing'}; the peer heard ${[...new Set(about(heardByPeer, PRIV).map((e) => e.type))].join(', ') || 'nothing'}`,
  )

  // ══ 3. A PRIVATE SPACE'S CHANNEL ═════════════════════════════════════════
  console.log('\n▶ a public channel of a private space')
  await say(A, SPACE_CH, `${TAG} SPACE SECRET`)
  await waitFor(() => has(heardByAdmin, `${TAG} SPACE SECRET`))
  chk(
    about(heardByOutsider, SPACE_CH).length === 0 && about(heardByPeer, SPACE_CH).length === 0 && has(heardByAdmin, `${TAG} SPACE SECRET`),
    'a member refused a private space hears nothing from its channel — the admin, in the space, hears it',
    `the outsider heard ${about(heardByOutsider, SPACE_CH).length} event(s), the peer ${about(heardByPeer, SPACE_CH).length}; the admin heard the message: ${has(heardByAdmin, `${TAG} SPACE SECRET`)}`,
  )

  // ══ 4. A NEW PRIVATE CHANNEL ═════════════════════════════════════════════
  console.log('\n▶ a private channel made while everyone listens')
  const LATE = await make(`/workspaces/${WS}/chat/channels`, { name: `${TAG}-made-while-listening`, isPrivate: true, memberIds: [peer.id] }, 'the late private channel')
  await waitFor(() => has(heardByPeer, `${TAG}-made-while-listening`))
  chk(
    !has(heardByOutsider, `${TAG}-made-while-listening`) && has(heardByPeer, `${TAG}-made-while-listening`),
    'a new private channel’s name reaches its members and nobody else',
    `the outsider heard its name: ${has(heardByOutsider, `${TAG}-made-while-listening`)}; the peer: ${has(heardByPeer, `${TAG}-made-while-listening`)}`,
  )
  void LATE

  // ══ 5. A PUBLIC CHANNEL ══════════════════════════════════════════════════
  console.log('\n▶ a public channel')
  await say(A, PUB, `${TAG} public hello`)
  await waitFor(() => has(heardByOutsider, `${TAG} public hello`) && has(heardByPeer, `${TAG} public hello`))
  chk(
    has(heardByOutsider, `${TAG} public hello`) && has(heardByPeer, `${TAG} public hello`),
    'a public channel’s message still reaches every member, the outsider included',
    `the outsider heard it: ${has(heardByOutsider, `${TAG} public hello`)}; the peer: ${has(heardByPeer, `${TAG} public hello`)}`,
  )

  // ══ 6. A SYNCUP'S CARD ═══════════════════════════════════════════════════
  console.log('\n▶ a SyncUp started in the DM')
  const call = await A(`/workspaces/${WS}/calls`, { method: 'POST', body: { channelId: DM } })
  if (call.status >= 300 || !call.data?.id) throw new Error(`could not start the call: ${said(call)}`)
  const cardFor = (heard) => heard.some((e) => e.type === 'chat.message.created' && e.channelId === DM && e.message?.callId === call.data.id)
  await waitFor(() => cardFor(heardByPeer))
  await A(`/workspaces/${WS}/calls/${call.data.id}/end`, { method: 'POST' })
  chk(
    !cardFor(heardByOutsider) && cardFor(heardByPeer),
    'the card of a SyncUp started in a DM reaches the other person in it, and not the rest of the workspace',
    `the outsider heard the card: ${cardFor(heardByOutsider)}; the peer: ${cardFor(heardByPeer)}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  for (const s of sockets) s.close()
  if (WS && A) await A(`/workspaces/${WS}`, { method: 'DELETE' }).catch(() => {})
  const ran = passed + failed
  console.log(`\n${passed} passed, ${failed} failed`)
  if (ran !== EXPECTED_CHECKS) {
    console.log(`\n✗ ${ran} of ${EXPECTED_CHECKS} checks ran — this run stopped early, so "0 failed" describes the part it reached.`)
  }
  process.exitCode = failed === 0 && ran === EXPECTED_CHECKS ? 0 : 1
}
