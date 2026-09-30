/**
 * A GUEST READS THE CHANNELS SHARED WITH THEM, AND HEARS NOTHING ELSE.
 *
 * NOT A FRAME ROW: `found-24-sep/guests-read-every-open-channel`. The channel
 * rule read a guest as a member: every public channel of the workspace, and
 * every public channel of an open space, was theirs to list and read, search
 * found its messages, and a guest's socket joined the workspace's room, where
 * a public channel's messages are broadcast whole as they are written.
 *
 * ClickUp's rule (help.clickup.com "Guest-type user roles", "Permissions in
 * detail"; search snippets): guests use the channels they are invited to and
 * the chats of locations shared with them, and cannot create channels. Here a
 * channel reaches a guest through a share of it, a grant on its space, or —
 * for a private channel or a DM — its membership, which is an invitation;
 * a public channel's membership is only somebody having opened it.
 *
 * Channels, messages and grants are planted by SQL; each read is asked of the
 * guest beside a member, who reads every public channel.
 *
 *   node test/e2e/guest-chat-scope.mjs --api 3021
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { signInApi, signUpApi } from './lib/signin.mjs'
import { openDb } from './lib/db.mjs'
import { apiAs as apiAsAt } from './lib/fixture.mjs'

const { io } = createRequire(path.resolve(import.meta.dirname, '../../apps/web/package.json'))('socket.io-client')

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** "0 failed" is not "it ran". EXACT, so a section that stopped early is a failure. */
const EXPECTED_CHECKS = 7

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

/* NEVER THROWS — `{status, data, error}`. Every call site reads `status`.
 * lib/fixture.mjs's one client, not a copy (`suite-hygiene/apiAs-duplicated-62`). */
const apiAs = apiAsAt(API)
const has = (res, word) => res.status === 200 && JSON.stringify(res.data ?? null).includes(word)

const stamp = Date.now()
const TAG = `gcs${stamp}`
let sql = null
let WS = null
let A = null
const sockets = []

try {
  sql = await openDb()
  if (!sql) throw new Error('no DATABASE_URL — channels, messages and grants are planted by SQL')
  const auth = await signInApi(API, ADMIN.email, ADMIN.password)
  A = apiAs(auth.accessToken)
  const adminId = (await A('/users/me')).data?.id
  const made = await A('/workspaces', { method: 'POST', body: { name: TAG } })
  if (!made.ok || !made.data?.id) throw new Error(`could not make the workspace: ${made.status}`)
  WS = made.data.id
  const person = async (who, role) => {
    const email = `${TAG}-${who}@rundesk.invalid`
    const signed = await signUpApi(API, {
      fullName: `Chatter ${who}`, email, password: 'Chatter@12345!',
      organizationName: `Chatter ${who} ${stamp}`, organizationSlug: `chatter-${who}-${stamp}`,
    })
    const added = await A(`/workspaces/${WS}/members`, { method: 'POST', body: { email, role } })
    if (!added.ok) throw new Error(`could not add the ${who}: ${added.status}`)
    return { id: signed.user?.id, token: signed.accessToken, as: apiAs(signed.accessToken) }
  }
  const member = await person('member', 'member')
  const guest = await person('guest', 'guest')
  const M = member.as
  const G = guest.as

  const space = async (name) => {
    const res = await A('/spaces', { method: 'POST', body: { workspaceId: WS, name: `${TAG} ${name}` } })
    if (!res.ok || !res.data?.id) throw new Error(`could not make the ${name} space: ${res.status}`)
    return res.data.id
  }
  const OPEN = await space('open')
  const GRANTED = await space('granted')
  await sql`insert into space_members (space_id, user_id, role) values (${GRANTED}, ${guest.id}, 'view')`
  const channel = async (word, spaceId, isPrivate = false) =>
    (await sql`insert into chat_channels (workspace_id, space_id, name, is_private, created_by_id) values (${WS}, ${spaceId}, ${`${TAG}-${word}`}, ${isPrivate}, ${adminId}) returning id`)[0].id
  const say = (channelId, word) =>
    sql`insert into chat_messages (channel_id, author_id, body) values (${channelId}, ${adminId}, ${`${TAG} ${word}`})`
  const C_WORKSPACE = await channel('workspacewide', null)
  const C_OPEN = await channel('openspace', OPEN)
  const C_GRANTED = await channel('grantedspace', GRANTED)
  const C_SHARED = await channel('sharedalone', null)
  await sql`insert into object_shares (workspace_id, object_type, object_id, user_id, level) values (${WS}, 'channel', ${C_SHARED}, ${guest.id}, 'comment')`
  const C_INVITED = await channel('privateinvited', null, true)
  await sql`insert into chat_channel_members (channel_id, user_id) values (${C_INVITED}, ${guest.id}), (${C_INVITED}, ${adminId})`
  // A private channel of the admin's alone: the member is not in it.
  const C_PRIVATE_OTHER = await channel('privateofadmin', null, true)
  await sql`insert into chat_channel_members (channel_id, user_id) values (${C_PRIVATE_OTHER}, ${adminId})`
  // Somebody OPENING a public channel leaves a member row: the guest's, from
  // before this rule, on the workspace-wide channel. It is not an invitation.
  await sql`insert into chat_channel_members (channel_id, user_id) values (${C_WORKSPACE}, ${guest.id})`
  await say(C_WORKSPACE, 'saidworkspacewide')
  await say(C_OPEN, 'saidinopenspace')
  await say(C_GRANTED, 'saidingrantedspace')
  await say(C_SHARED, 'saidinsharedchannel')
  await say(C_INVITED, 'saidinprivateinvited')

  // ══ 1. THE CHANNEL LIST ══════════════════════════════════════════════════
  console.log('\n▶ the workspace’s channels, as the guest and the member list them')
  const ids = (res) => (Array.isArray(res.data) ? res.data : []).map((c) => c.id)
  const gList = await G(`/workspaces/${WS}/chat/channels`)
  const mList = await M(`/workspaces/${WS}/chat/channels`)
  chk(
    gList.status === 200 && [C_GRANTED, C_SHARED, C_INVITED].every((id) => ids(gList).includes(id))
      && ![C_WORKSPACE, C_OPEN].some((id) => ids(gList).includes(id))
      && [C_WORKSPACE, C_OPEN].every((id) => ids(mList).includes(id)),
    'a guest is listed the channels of a space shared with them, one shared with them and a private one they were invited to — not the workspace’s, nor an open space’s — a member is listed both',
    `the guest ${gList.status}: granted ${ids(gList).includes(C_GRANTED)}, shared ${ids(gList).includes(C_SHARED)}, invited ${ids(gList).includes(C_INVITED)}, workspace-wide ${ids(gList).includes(C_WORKSPACE)}, open space ${ids(gList).includes(C_OPEN)}; the member: workspace-wide ${ids(mList).includes(C_WORKSPACE)}, open space ${ids(mList).includes(C_OPEN)}`,
  )

  // ══ 2. THE MESSAGES ══════════════════════════════════════════════════════
  console.log('\n▶ each channel’s messages, read by the guest')
  const read = async (C, id) => C(`/chat/channels/${id}/messages`)
  const g = {
    workspace: await read(G, C_WORKSPACE),
    open: await read(G, C_OPEN),
    granted: await read(G, C_GRANTED),
    shared: await read(G, C_SHARED),
    invited: await read(G, C_INVITED),
  }
  const mOpen = await read(M, C_OPEN)
  chk(
    (g.workspace.status === 403 || g.workspace.status === 404) && (g.open.status === 403 || g.open.status === 404)
      && has(g.granted, 'saidingrantedspace') && has(g.shared, 'saidinsharedchannel') && has(g.invited, 'saidinprivateinvited')
      && has(mOpen, 'saidinopenspace'),
    'a guest reads the messages of those three, and is refused the workspace’s channel — which they had once opened — and the open space’s; a member reads the open space’s',
    `the guest: workspace ${g.workspace.status}, open ${g.open.status}, granted ${g.granted.status}, shared ${g.shared.status}, invited ${g.invited.status}; the member's open ${mOpen.status}`,
  )

  // ══ 3. SEARCH ════════════════════════════════════════════════════════════
  console.log('\n▶ search, for the words said in every channel')
  const gSearch = await G(`/search/${WS}?q=${encodeURIComponent(TAG)}&limit=50`)
  const mSearch = await M(`/search/${WS}?q=${encodeURIComponent(TAG)}&limit=50`)
  chk(
    gSearch.status === 200 && !has(gSearch, 'saidworkspacewide') && !has(gSearch, 'saidinopenspace')
      && has(mSearch, 'saidworkspacewide'),
    'search finds a guest nothing said in a channel they may not read — and finds it for a member',
    `the guest's search ${gSearch.status}: workspace-wide ${has(gSearch, 'saidworkspacewide')}, open space ${has(gSearch, 'saidinopenspace')}; the member's finds workspace-wide ${has(mSearch, 'saidworkspacewide')}`,
  )

  // ══ 4. REALTIME ══════════════════════════════════════════════════════════
  console.log('\n▶ what the guest’s socket hears as things are said')
  const connect = async (token) => {
    const sock = io(`http://127.0.0.1:${API_PORT}/realtime`, { auth: { token }, transports: ['websocket'], reconnection: false })
    sockets.push(sock)
    const up = await new Promise((res) => {
      sock.on('connect', () => res(true))
      sock.on('connect_error', () => res(false))
      setTimeout(() => res(false), 10_000)
    })
    const heard = []
    sock.on('event', (e) => heard.push(JSON.stringify(e)))
    const ack = await new Promise((res) => {
      sock.timeout(10_000).emit('subscribe', { rooms: [`workspace:${WS}`] }, (err, a) => res(err ? null : a))
    })
    return { up, heard, ack }
  }
  const gSock = await connect(guest.token)
  const mSock = await connect(member.token)
  const post = (id, word) => A(`/chat/channels/${id}/messages`, { method: 'POST', body: { body: `${TAG} ${word}` } })
  await post(C_WORKSPACE, 'livewide')
  await post(C_OPEN, 'liveopen')
  await post(C_GRANTED, 'livegranted')
  const heardOf = (sock, word) => sock.heard.some((e) => e.includes(`${TAG} ${word}`))
  for (let i = 0; i < 40 && !(heardOf(gSock, 'livegranted') && heardOf(mSock, 'livewide')); i += 1) await new Promise((r) => setTimeout(r, 250))
  await new Promise((r) => setTimeout(r, 1000))
  chk(
    gSock.up && !(gSock.ack?.joined ?? []).includes(`workspace:${WS}`) && !heardOf(gSock, 'livewide') && !heardOf(gSock, 'liveopen') && heardOf(gSock, 'livegranted')
      && heardOf(mSock, 'livewide'),
    'a guest’s socket is refused the workspace’s room, hears nothing said in a channel they may not read, and hears what is said in one they may — a member hears the workspace’s channel',
    `the guest joined the workspace room: ${(gSock.ack?.joined ?? []).includes(`workspace:${WS}`)}; heard wide ${heardOf(gSock, 'livewide')}, open ${heardOf(gSock, 'liveopen')}, granted ${heardOf(gSock, 'livegranted')}; the member heard wide ${heardOf(mSock, 'livewide')}`,
  )

  // ══ 5. BEING NAMED ═══════════════════════════════════════════════════════
  console.log('\n▶ the guest and the member named in channels, and what they are told')
  const told = async (userId, word) => (await sql`select count(*)::int as n from notifications where user_id = ${userId} and body like ${`%${TAG} ${word}%`}`)[0].n
  await A(`/chat/channels/${C_WORKSPACE}/messages`, { method: 'POST', body: { body: `${TAG} namedwide`, mentions: [{ userId: guest.id }] } })
  await A(`/chat/channels/${C_PRIVATE_OTHER}/messages`, { method: 'POST', body: { body: `${TAG} namedoutside`, mentions: [{ userId: member.id }] } })
  await A(`/chat/channels/${C_INVITED}/messages`, { method: 'POST', body: { body: `${TAG} namedinvited`, mentions: [{ userId: guest.id }] } })
  for (let i = 0; i < 40 && (await told(guest.id, 'namedinvited')) === 0; i += 1) await new Promise((r) => setTimeout(r, 250))
  await new Promise((r) => setTimeout(r, 1000))
  const tells = {
    guestWide: await told(guest.id, 'namedwide'),
    guestLiveWide: await told(guest.id, 'livewide'),
    memberOutside: await told(member.id, 'namedoutside'),
    guestInvited: await told(guest.id, 'namedinvited'),
  }
  chk(
    tells.guestWide === 0 && tells.guestLiveWide === 0 && tells.memberOutside === 0 && tells.guestInvited === 1,
    'a guest named in a channel they may not read is told nothing of it, nor of what is said there, and neither is a member named in a private channel they are not in — a guest named where they were invited is told',
    `notifications: the guest of the workspace channel's mention ${tells.guestWide}, of its message ${tells.guestLiveWide}; the member outside the private channel ${tells.memberOutside}; the guest where invited ${tells.guestInvited}`,
  )

  // ══ 6. JOINING ═══════════════════════════════════════════════════════════
  console.log('\n▶ the guest asks to join the workspace’s channel')
  const joined = await G(`/chat/channels/${C_WORKSPACE}/join`, { method: 'POST', body: {} })
  const afterJoin = await read(G, C_WORKSPACE)
  chk(
    (joined.status === 403 || joined.status === 404) && (afterJoin.status === 403 || afterJoin.status === 404),
    'a guest cannot join a channel nothing shares with them, and it stays unread',
    `join ${joined.status}; then reading it ${afterJoin.status}`,
  )

  // ══ 7. MAKING A CHANNEL ══════════════════════════════════════════════════
  console.log('\n▶ a new channel, made by the guest and by the member')
  const named = async (name) => (await sql`select count(*)::int as n from chat_channels where workspace_id = ${WS} and name = ${name}`)[0].n
  const gMade = await G(`/workspaces/${WS}/chat/channels`, { method: 'POST', body: { name: `${TAG}-byguest` } })
  const mMade = await M(`/workspaces/${WS}/chat/channels`, { method: 'POST', body: { name: `${TAG}-bymember` } })
  const [gN, mN] = [await named(`${TAG}-byguest`), await named(`${TAG}-bymember`)]
  chk(
    gMade.status === 403 && gN === 0 && mMade.ok && mN === 1,
    'a guest makes no channel (403, none made) — a member does',
    `the guest ${gMade.status}, made ${gN}; the member ${mMade.status}, made ${mN}`,
  )
} catch (e) {
  failed += 1
  console.log(`  \x1b[31mFAIL\x1b[0m threw: ${String(e?.message ?? e).split('\n')[0]}`)
} finally {
  for (const sock of sockets) sock.close()
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
