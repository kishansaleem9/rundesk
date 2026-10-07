import assert from 'node:assert/strict'
import { test } from 'node:test'
import { followOtherTab, followServerClose, followSignedIn, rejoinAndCatchUp, roomLedger, takesItsPersonBack, whoItHeldWhenCleared } from './realtime'

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
 * A TAB THAT SIGNED ITSELF OUT TAKES ITS PERSON BACK WHEN THEY SIGN IN AGAIN IN
 * ANOTHER TAB (`found-7-oct/a-tab-that-saw-the-sign-out-misses-the-sign-in`).
 * After another tab's sign-out, this tab's own next request finds no session
 * and the tab clears its store; a sign-in heard after that names the person
 * after nobody, but this tab names nobody, and nothing followed it — measured
 * on lane 6, 1 run in 6 lost so. The tab remembers whom it named when it was
 * cleared (`whoItHeldWhenCleared`), and `takesItsPersonBack` says whether a
 * write is that person's sign-in. `session-in-the-browser.mjs` holds the
 * sign-in until the listening tab has cleared itself.
 */
test('a tab that signed itself out takes back the person it named when they sign in again in another tab, while the storage still names them', () => {
  const now = () => stored({ id: 'u1' })
  assert.equal(takesItsPersonBack({ key: KEY, oldValue: stored(null), newValue: stored({ id: 'u1' }) }, KEY, null, 'u1', now), true, 'the person’s sign-in after nobody was not taken back')
  assert.equal(takesItsPersonBack({ key: KEY, oldValue: stored({ id: 'u2' }), newValue: stored({ id: 'u1' }) }, KEY, null, 'u1', now), true, 'the person’s sign-in after somebody else was not taken back')
})

test('somebody else’s sign-in is not taken, nor one the storage has moved on from, nor a write that is no sign-in, nor anything by a tab that names somebody or held nobody', () => {
  const signIn = { key: KEY, oldValue: stored(null), newValue: stored({ id: 'u1' }) }
  const cases: Array<[string, typeof signIn, string | null, string | null, string | null]> = [
    ['somebody else signed in', { ...signIn, newValue: stored({ id: 'u2' }) }, null, 'u1', stored({ id: 'u2' })],
    ['the storage names somebody else since', signIn, null, 'u1', stored({ id: 'u2' })],
    ['the storage names nobody since', signIn, null, 'u1', stored(null)],
    ['a write that names the person before and after (a refresh)', { ...signIn, oldValue: stored({ id: 'u1' }) }, null, 'u1', stored({ id: 'u1' })],
    ['a sign-out', { ...signIn, oldValue: stored({ id: 'u1' }), newValue: stored(null) }, null, 'u1', stored(null)],
    ['another key', { ...signIn, key: 'rundesk.theme' }, null, 'u1', stored({ id: 'u1' })],
    ['the tab names somebody (followOtherTab’s to follow)', signIn, 'u1', 'u1', stored({ id: 'u1' })],
    ['the tab held nobody when it was cleared', signIn, null, null, stored({ id: 'u1' })],
  ]
  for (const [why, change, here, held, storedNow] of cases) {
    assert.equal(takesItsPersonBack(change, KEY, here, held, () => storedNow), false, `${why}: the person was taken back`)
  }
})

test('the person remembered is whom the tab named when its store was cleared, kept while it names nobody, and forgotten once it names somebody', () => {
  assert.equal(whoItHeldWhenCleared('u1', null, null), 'u1', 'a cleared store forgot whom it named')
  assert.equal(whoItHeldWhenCleared(null, null, 'u1'), 'u1', 'clearing a store that names nobody again forgot whom it named')
  assert.equal(whoItHeldWhenCleared(null, 'u1', 'u1'), null, 'a tab that names its person again still remembers them as cleared')
  assert.equal(whoItHeldWhenCleared('u1', 'u2', null), null, 'a tab that names somebody remembers somebody as cleared')
  assert.equal(whoItHeldWhenCleared('u1', 'u1', null), null, 'a tab that names somebody remembers somebody as cleared')
})

/*
 * A socket opened again is a new one, in no room but its person's own, and a
 * page subscribes its rooms once, when it mounts: the tab whose socket opened
 * again heard its own channel and nothing of the list it showed. `roomLedger`
 * keeps what the pages hold, from the socket's outgoing events, and says what
 * to ask for again when the socket opens.
 *
 * And the first opening asks again for every room a page asked for before it
 * (`found-7-oct/a-socket-that-opens-late-misses-what-was-said`): the pages read
 * their data while the socket was not yet open, and what was said in between
 * reached nothing. Asked again, the rooms are answered, and the pages read
 * afresh (`rejoinAndCatchUp`).
 */
test('the rooms a page holds when the socket drops are asked for again when it opens; those let go and those sent while it was down ask for nothing; the first opening asks again for every room asked for before it', () => {
  const rooms = roomLedger()
  rooms.sent('subscribe', { rooms: ['list:a', 'task:b'] })
  assert.deepEqual(rooms.rejoin(), ['list:a', 'task:b'], 'the first opening did not ask again for the rooms its pages asked for before it, so nothing reads afresh what they read meanwhile')
  assert.deepEqual(rooms.rejoin(), [], 'the same rooms were asked for twice for the first opening')
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
