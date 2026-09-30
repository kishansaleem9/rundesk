/**
 * A CALL'S EVENTS REACH ONLY THOSE WHO MAY READ ITS CHANNEL.
 *
 * NOT A FRAME ROW: `found-24-sep/call-events-broadcast-to-the-workspace`.
 * `call.started`, `call.participant.joined`, `…left`, `call.ended` and
 * `call.recording` went to the workspace's realtime room, which every member's
 * socket joins. They carry ids — the call, its channel, who — and that is who
 * is on a call in a DM, told to every member. Measured on lane 1 before the
 * fix: a member outside a DM heard the call start, the other person join, and
 * the call end.
 *
 * Three sockets listen (an outsider, the admin's DM partner, the admin); every
 * "hears nothing" has, on the same event, somebody in the DM who hears it, and
 * a call in a public channel still reaches everyone.
 *
 *   node test/e2e/call-realtime-access.mjs --api 3021
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
const EXPECTED_CHECKS = 2

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

const stamp = Date.now()
const TAG = `cra-${stamp}`
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
      fullName: `Call ${who}`, email, password: 'Member@12345!',
      organizationName: `Call ${who} ${stamp}`, organizationSlug: `call-${who}-${stamp}`,
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
  const DM = await make(`/workspaces/${WS}/chat/dms`, { peerUserId: peer.id }, 'the DM')
  const PUB = await make(`/workspaces/${WS}/chat/channels`, { name: `${TAG}-public` }, 'the public channel')

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
  const byOutsider = await listen(outsider.token)
  const byPeer = await listen(peer.token)
  const callEvents = (heard, callId) => heard.filter((e) => String(e.type).startsWith('call.') && e.callId === callId).map((e) => e.type)

  // ══ 1. A CALL IN A DM ════════════════════════════════════════════════════
  console.log('\n▶ a SyncUp in the DM: started, joined, ended')
  const dmCall = await A(`/workspaces/${WS}/calls`, { method: 'POST', body: { channelId: DM } })
  if (dmCall.status >= 300 || !dmCall.data?.id) throw new Error(`could not start the DM call: ${said(dmCall)}`)
  const joined = await peer.as(`/workspaces/${WS}/calls/${dmCall.data.id}/join`, { method: 'POST' })
  await A(`/workspaces/${WS}/calls/${dmCall.data.id}/end`, { method: 'POST' })
  await waitFor(() => callEvents(byPeer, dmCall.data.id).includes('call.ended'))
  const outsiderHeard = callEvents(byOutsider, dmCall.data.id)
  const peerHeard = callEvents(byPeer, dmCall.data.id)
  chk(
    outsiderHeard.length === 0 && ['call.started', 'call.participant.joined', 'call.ended'].every((t) => peerHeard.includes(t)),
    'a member outside a DM hears nothing of a SyncUp in it — the other person in it hears it start, the join and the end',
    `the outsider heard ${JSON.stringify(outsiderHeard)}; the peer ${JSON.stringify(peerHeard)} (join ${said(joined)})`,
  )

  // ══ 2. A CALL IN A PUBLIC CHANNEL ════════════════════════════════════════
  console.log('\n▶ a SyncUp in a public channel')
  const pubCall = await A(`/workspaces/${WS}/calls`, { method: 'POST', body: { channelId: PUB } })
  if (pubCall.status >= 300 || !pubCall.data?.id) throw new Error(`could not start the public call: ${said(pubCall)}`)
  await waitFor(() => callEvents(byOutsider, pubCall.data.id).includes('call.started'))
  await A(`/workspaces/${WS}/calls/${pubCall.data.id}/end`, { method: 'POST' })
  chk(
    callEvents(byOutsider, pubCall.data.id).includes('call.started') && callEvents(byPeer, pubCall.data.id).includes('call.started'),
    'a SyncUp in a public channel still reaches every member',
    `the outsider heard ${JSON.stringify(callEvents(byOutsider, pubCall.data.id))}; the peer ${JSON.stringify(callEvents(byPeer, pubCall.data.id))}`,
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
