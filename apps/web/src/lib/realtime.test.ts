import assert from 'node:assert/strict'
import { test } from 'node:test'
import { followOtherTab, followServerClose, followSignedIn, rejoinAndCatchUp, roomLedger } from './realtime'

/*
 * THE TAB'S SOCKET FOLLOWS WHO IS SIGNED IN
 * (`found-30-sep/an-open-socket-outlives-its-session`).
 *
 * The server ends a socket whose session has ended, signing out ends the
 * session, and socket.io does not reconnect after the server closes a socket.
 * The tab keeps one socket for its life, and nothing opened it again: measured
 * in a browser on a lane, signing out and back in on the same tab left it with
 * no socket until a reload. `followSignedIn` is what the store's changes do to
 * the socket; `session-in-the-browser.mjs` signs out and back in on one tab on
 * a lane and listens for the account's own channel.
 */
function fakeSocket() {
  const did: string[] = []
  const sock = {
    auth: { token: 'the-first-session' } as unknown,
    connect: () => { did.push(`connect ${JSON.stringify(sock.auth)}`); return sock as never },
    disconnect: () => { did.push('disconnect'); return sock as never },
  }
  return { sock, did }
}

test('signing out closes the tab’s socket, and signing in again opens it on the new session’s token', () => {
  const { sock, did } = fakeSocket()
  followSignedIn(sock, 'u1', null, null)
  assert.deepEqual(did, ['disconnect'], 'signing out left the ended session’s socket as it was')
  followSignedIn(sock, null, 'u1', 'the-second-session')
  assert.deepEqual(did, ['disconnect', 'connect {"token":"the-second-session"}'], 'signing in again did not open the socket on the new session')
})

test('the same person staying signed in (a refresh, a profile change) leaves the tab’s socket as it is', () => {
  const { sock, did } = fakeSocket()
  followSignedIn(sock, 'u1', 'u1', 'a-refreshed-token')
  assert.deepEqual(did, [], 'the socket was closed and opened again for a person who stayed signed in')
  // No socket yet (nothing on the page has asked for one): nothing to follow.
  assert.doesNotThrow(() => followSignedIn(null, null, 'u1', 'token'))
})

/*
 * ANOTHER TAB'S SIGN-IN OPENS THIS TAB'S SOCKET AGAIN
 * (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
 *
 * The tabs of a browser share one session. Measured with two tabs on lane 2:
 * the person signed out and back in from one, the server ended the other's
 * socket with the old session, and nothing opened it again — the other tab
 * heard nothing until it was reloaded. The signing-in tab writes who is
 * signed in to the shared storage; `followOtherTab` is what this tab does when
 * it hears that write. `session-in-the-browser.mjs` signs out and in from one
 * tab of a browser on a lane and listens in the other.
 */
const KEY = 'rundesk.auth'
const stored = (user: { id: string } | null) => JSON.stringify({ state: { user, organizations: [], workspaces: [] }, version: 0 })

test('another tab’s sign-in as this tab’s person closes this tab’s socket and opens it again on the browser’s session, not on the token this tab holds', () => {
  const { sock, did } = fakeSocket()
  followOtherTab(sock, { key: KEY, oldValue: stored(null), newValue: stored({ id: 'u1' }) }, KEY, 'u1')
  assert.deepEqual(did, ['disconnect', 'connect {}'], 'another tab’s sign-in left this tab’s socket on the ended session')
})

// A browser where somebody else had signed in since: this tab still names its person, and their sign-in is followed too.
test('another tab’s sign-in as this tab’s person after somebody else was signed in there opens this tab’s socket again on the browser’s session', () => {
  const { sock, did } = fakeSocket()
  followOtherTab(sock, { key: KEY, oldValue: stored({ id: 'u2' }), newValue: stored({ id: 'u1' }) }, KEY, 'u1')
  assert.deepEqual(did, ['disconnect', 'connect {}'], 'a sign-in after somebody else’s left this tab’s socket on the ended session')
})

test('a write by another tab that is not this person signing in — a refresh, a sign-out, somebody else, another key — leaves this tab’s socket be', () => {
  const { sock, did } = fakeSocket()
  followOtherTab(sock, { key: KEY, oldValue: stored({ id: 'u1' }), newValue: stored({ id: 'u1' }) }, KEY, 'u1')
  followOtherTab(sock, { key: KEY, oldValue: stored({ id: 'u1' }), newValue: stored(null) }, KEY, 'u1')
  followOtherTab(sock, { key: KEY, oldValue: stored(null), newValue: stored({ id: 'u2' }) }, KEY, 'u1')
  followOtherTab(sock, { key: 'rundesk.theme', oldValue: stored(null), newValue: stored({ id: 'u1' }) }, KEY, 'u1')
  followOtherTab(sock, { key: KEY, oldValue: null, newValue: 'not json' }, KEY, 'u1')
  // Nobody signed in here: this tab follows nobody.
  followOtherTab(sock, { key: KEY, oldValue: stored(null), newValue: stored({ id: 'u1' }) }, KEY, null)
  assert.deepEqual(did, [], 'a write that is not this person’s sign-in closed or opened the socket')
  assert.doesNotThrow(() => followOtherTab(null, { key: KEY, oldValue: stored(null), newValue: stored({ id: 'u1' }) }, KEY, 'u1'))
})

/*
 * A socket opened again is a new one, in no room but its person's own, and a
 * page subscribes its rooms once, when it mounts: the tab whose socket opened
 * again heard its own channel and nothing of the list it showed. `roomLedger`
 * keeps what the pages hold, from the socket's outgoing events, and says what
 * to ask for again when the socket opens.
 */
test('the rooms a page holds when the socket drops are asked for again when it opens; those let go, those sent while it was down, and the first opening ask for nothing', () => {
  const rooms = roomLedger()
  rooms.sent('subscribe', { rooms: ['list:a', 'task:b'] })
  assert.deepEqual(rooms.rejoin(), [], 'the first opening asked for rooms its pages are asking for themselves')
  rooms.sent('unsubscribe', { rooms: ['task:b'] })
  rooms.sent('presence.ping', undefined)
  rooms.dropped()
  // Sent by socket.io itself as the socket opens: what a page asked for while it was down.
  rooms.sent('subscribe', { rooms: ['doc:c'] })
  assert.deepEqual(rooms.rejoin(), ['list:a'], 'the socket did not ask again for exactly the rooms held when it dropped')
  assert.deepEqual(rooms.rejoin(), [], 'the same rooms were asked for twice for one opening')
  rooms.sent('unsubscribe', { rooms: ['list:a'] })
  rooms.dropped()
  assert.deepEqual(rooms.rejoin(), ['doc:c'], 'a room a page let go was asked for again, or one it holds was not')
})

/*
 * A SOCKET THE SERVER CLOSED IS OPENED AGAIN WHEN THE BROWSER IS STILL SIGNED IN
 * AS THIS TAB'S PERSON (`found-6-oct/a-second-tab-loses-realtime-after-a-sign-in`).
 * Signing in again from another tab without signing out, or accepting an
 * invitation there, hands the browser a new session and writes the same person
 * to the storage, or nothing new; under a policy of one session at a time the
 * old session ends, and the server closes this tab's socket. Measured with two
 * tabs on lane 2: none opened again, and a task made in the list the tab showed
 * was not drawn. `session-in-the-browser.mjs` signs in again from one tab of a
 * browser on a lane and listens in the other.
 */
function closedSocket() {
  const did: string[] = []
  const sock = {
    auth: { token: 'the-ended-session' } as unknown,
    active: false,
    connected: false,
    connect: () => { did.push(`connect ${JSON.stringify(sock.auth)}`); return sock as never },
  }
  return { sock, did }
}
// Each test its own moment, a minute apart: a socket is reopened at most once a second.
let clock = 0
const later = () => { clock += 60_000; const at = clock; return () => at }

test('a socket the server closed is opened again on the browser’s session when that session is still this tab’s person', async () => {
  const { sock, did } = closedSocket()
  const asked: string[] = []
  const reopened = await followServerClose(sock, 'io server disconnect', () => 'u1', async () => { asked.push('who'); return 'u1' }, later())
  assert.equal(reopened, true)
  assert.deepEqual(asked, ['who'], 'the browser’s session was not asked who it is')
  assert.deepEqual(did, ['connect {}'], 'the socket stayed closed, or opened again on the ended session’s token')
})

test('a socket closed by the tab itself, or while the browser’s session is nobody or somebody else, or already open again, stays as it is', async () => {
  const cases: Array<[string, string, () => string | null, () => Promise<string | null>, Partial<{ active: boolean; connected: boolean }>]> = [
    ['the tab closed it (a sign-out here)', 'io client disconnect', () => 'u1', async () => 'u1', {}],
    ['the browser’s session has ended (401)', 'io server disconnect', () => 'u1', async () => null, {}],
    ['the browser is signed in as somebody else', 'io server disconnect', () => 'u1', async () => 'u2', {}],
    ['the read of the session failed', 'io server disconnect', () => 'u1', async () => { throw new Error('offline') }, {}],
    ['nobody is signed in on this tab', 'io server disconnect', () => null, async () => 'u1', {}],
    ['another tab’s sign-in already opened it', 'io server disconnect', () => 'u1', async () => 'u1', { active: true }],
  ]
  for (const [why, reason, here, signedInNow, state] of cases) {
    const { sock, did } = closedSocket()
    Object.assign(sock, state)
    const reopened = await followServerClose(sock, reason, here, signedInNow, later())
    assert.equal(reopened, false, `${why}: the socket was opened again`)
    assert.deepEqual(did, [], `${why}: the socket was opened again`)
  }
  assert.equal(await followServerClose(null, 'io server disconnect', () => 'u1', async () => 'u1', later()), false)
})

test('a socket the server closes again at once is not reopened more often than once a second', async () => {
  const at = later()()
  const first = closedSocket()
  assert.equal(await followServerClose(first.sock, 'io server disconnect', () => 'u1', async () => 'u1', () => at), true)
  const again = closedSocket()
  assert.equal(await followServerClose(again.sock, 'io server disconnect', () => 'u1', async () => 'u1', () => at + 200), false, 'a socket closed again at once was reopened at once')
  assert.equal(await followServerClose(again.sock, 'io server disconnect', () => 'u1', async () => 'u1', () => at + 1_500), true, 'a socket closed again a while later was not reopened')
})

test('the rooms asked for again wait for the server’s answer, and then the page reads afresh what it shows; no rooms, nothing asked', () => {
  const sent: Array<{ event: string; payload: unknown; ack?: () => void }> = []
  const sock = { emit: (event: string, payload: unknown, ack?: () => void) => { sent.push({ event, payload, ack }); return sock } }
  let caughtUp = 0
  assert.equal(rejoinAndCatchUp(sock as never, ['list:l1', 'task:t1'], () => { caughtUp += 1 }), true)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].event, 'subscribe')
  assert.deepEqual(sent[0].payload, { rooms: ['list:l1', 'task:t1'] })
  assert.equal(caughtUp, 0, 'the page read afresh before the server held its rooms')
  assert.equal(typeof sent[0].ack, 'function', 'the subscribe asked for no answer, so nothing knows when the rooms are held')
  sent[0].ack?.()
  assert.equal(caughtUp, 1, 'the server’s answer did not lead the page to read afresh')
  assert.equal(rejoinAndCatchUp(sock as never, [], () => { caughtUp += 1 }), false)
  assert.equal(rejoinAndCatchUp(null, ['list:l1'], () => { caughtUp += 1 }), false)
  assert.equal(sent.length, 1, 'something was asked for with no rooms to ask for')
  assert.equal(caughtUp, 1)
})
