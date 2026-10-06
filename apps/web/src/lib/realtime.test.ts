import assert from 'node:assert/strict'
import { test } from 'node:test'
import { followSignedIn } from './realtime'

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
