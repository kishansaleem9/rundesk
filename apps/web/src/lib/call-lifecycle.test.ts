import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  callHasEnded,
  canResetPeer,
  drainIce,
  isLargeCall,
  outgoingVideoTrack,
  queueIce,
  shouldBufferIce,
  takeStream,
} from './call-lifecycle'

/**
 * §2.8 — the twelve defects an adversarial audit found in the first cut of
 * SyncUp, one test each.
 *
 * Worth saying plainly: the parts of this feature that HAD tests were the parts
 * that were right. Everything that was wrong was inside an effect or a ref,
 * where no test could see it — which is why these decisions now live somewhere
 * a test can reach.
 *
 * Every one of these fails the same way in a browser: something is black,
 * frozen or absent, with no error in the console to say so.
 */

describe('§2.8 handing the camera to the call', () => {
  it('empties the ref, so the dialog stops nothing it gave away', () => {
    // The bug: pre-join passed streamRef.current to the call and left the ref
    // pointing at it. Its unmount cleanup — which runs in the same commit that
    // mounts the call — then stopped every track of the stream the call had
    // just been handed.
    const stream = { id: 'the-camera' }
    const ref: { current: typeof stream | null } = { current: stream }

    const handedOver = takeStream(ref)

    assert.equal(handedOver, stream, 'the call did not get the stream')
    assert.equal(ref.current, null, 'the dialog is still holding the stream it gave away')
  })

  it('survives the unmount cleanup that used to kill it', () => {
    // Play the whole sequence: acquire, hand over, unmount.
    const stopped: string[] = []
    const track = { id: 't1', stop: () => stopped.push('t1') }
    const stream = { getTracks: () => [track] }
    const ref: { current: typeof stream | null } = { current: stream }

    const owned = takeStream(ref)
    // ...the cleanup at call-prejoin.tsx, verbatim:
    ref.current?.getTracks().forEach((tr) => tr.stop())

    assert.deepEqual(stopped, [], 'the pre-join cleanup stopped the call’s camera')
    assert.equal(owned?.getTracks()[0].id, 't1', 'the call was handed nothing usable')
  })

  it('hands over nothing when there was nothing', () => {
    const ref: { current: unknown } = { current: null }
    assert.equal(takeStream(ref), null)
  })
})

describe('§2.8 noticing the call ended under us', () => {
  const ended = (liveId: string | null, settled = true) =>
    callHasEnded({ inCallId: 'call-1', liveId, settled })

  it('ends when the host has ended it for everyone', () => {
    // The bug: the check asked `live.endedAt`, and the endpoint that supplies
    // `live` filters on `endedAt is null` — so the field could never be set and
    // nobody was ever hung up. Everyone else stayed in a dead call, cameras on.
    assert.equal(ended(null), true)
  })

  it('ends when a different call is now live in that channel', () => {
    assert.equal(ended('call-2'), true)
  })

  it('does NOT end while our call is still the live one', () => {
    assert.equal(ended('call-1'), false)
  })

  it('does NOT end in the instant after joining, before the query answers', () => {
    // One render after joining, the query for the joined channel has not
    // resolved. Treating undefined as "no call" would hang up on the call as
    // it started.
    assert.equal(ended(null, false), false)
    assert.equal(ended('call-1', false), false)
  })

  it('is silent when we are not in a call at all', () => {
    assert.equal(callHasEnded({ inCallId: null, liveId: null, settled: true }), false)
  })
})

describe('§2.8 the large-call warning counts peers', () => {
  const people = (n: number) => Array.from({ length: n }, (_, i) => `u${i}`)

  it('stays quiet at exactly the number the mesh handles', () => {
    // 7 people is 6 peers, which is MESH_LIMIT — everyone connects, nothing is
    // wrong. Counting participants lit the amber badge here for no reason.
    assert.equal(isLargeCall(people(7), 'u0', 6), false)
  })

  it('warns once there is one peer too many', () => {
    assert.equal(isLargeCall(people(8), 'u0', 6), true)
  })

  it('does not count the person reading it', () => {
    assert.equal(isLargeCall(['me'], 'me', 6), false)
    assert.equal(isLargeCall([], 'me', 6), false)
  })
})

describe('§2.8 a peer who joins mid-share sees the share', () => {
  it('prefers what is currently going out over the camera', () => {
    // The bug: connectTo always added localStream's camera track, and the
    // screen lives in a separate MediaStream. The peer who joined ten seconds
    // into a share saw a face while everyone else saw the screen.
    assert.equal(outgoingVideoTrack('screen', 'camera'), 'screen')
  })

  it('falls back to the camera when nothing is being shared', () => {
    assert.equal(outgoingVideoTrack(null, 'camera'), 'camera')
  })

  it('copes with an audio-only join', () => {
    assert.equal(outgoingVideoTrack(null, undefined), null)
  })
})

describe('§2.8 ICE candidates that arrive early are kept', () => {
  it('buffers when there is no connection yet', () => {
    assert.equal(shouldBufferIce(undefined), true)
    assert.equal(shouldBufferIce(null), true)
  })

  it('buffers when the description they belong to is not set', () => {
    // The offerer's onicecandidate fires during setLocalDescription, before the
    // offer is even sent, so this is the common case rather than the odd one.
    assert.equal(shouldBufferIce({ remoteDescription: null }), true)
  })

  it('applies them once there is a description', () => {
    assert.equal(shouldBufferIce({ remoteDescription: { type: 'offer' } }), false)
  })

  it('keeps every candidate, in order, per peer', () => {
    const q = new Map<string, string[]>()
    queueIce(q, 'a', 'c1')
    queueIce(q, 'b', 'c2')
    queueIce(q, 'a', 'c3')
    assert.deepEqual(drainIce(q, 'a'), ['c1', 'c3'])
    assert.deepEqual(drainIce(q, 'b'), ['c2'])
  })

  it('hands each candidate over exactly once', () => {
    // Draining twice would re-add candidates to a live connection.
    const q = new Map<string, string[]>()
    queueIce(q, 'a', 'c1')
    assert.deepEqual(drainIce(q, 'a'), ['c1'])
    assert.deepEqual(drainIce(q, 'a'), [], 'the same candidate was handed over twice')
    assert.equal(q.has('a'), false, 'the queue leaks')
  })

  it('drains empty for a peer that never sent one', () => {
    assert.deepEqual(drainIce(new Map(), 'nobody'), [])
  })
})

describe('§2.8 rebuilding a failed connection, but not forever', () => {
  it('retries a connection that dropped', () => {
    assert.equal(canResetPeer(0, 3), true)
    assert.equal(canResetPeer(2, 3), true)
  })

  it('gives up rather than looping on a route that is genuinely dead', () => {
    // Unbounded, this is a rebuild loop that burns the machine and shows
    // nothing. At the end of the budget the failed badge is the honest answer.
    assert.equal(canResetPeer(3, 3), false)
    assert.equal(canResetPeer(99, 3), false)
  })
})
