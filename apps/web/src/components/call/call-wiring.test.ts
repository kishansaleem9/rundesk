import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

/**
 * §2.8 — the call's wiring, guarded where a unit test cannot reach.
 *
 * call-lifecycle.test.ts checks that each decision is right. This checks that
 * the components still make it that way — because every one of the twelve
 * defects was a correct-looking component wired to nothing, and a helper
 * nobody calls is a fix nobody has.
 */

const here = dirname(fileURLToPath(import.meta.url))
const web = join(here, '../..')

/** Read a file and refuse to check an empty or moved one. */
function source(rel: string, mustContain: string): string {
  const text = readFileSync(join(web, rel), 'utf8')
  assert.ok(text.length > 200, `${rel} is empty or unreadable`)
  assert.ok(
    text.includes(mustContain),
    `${rel} no longer contains "${mustContain}" — this guard is checking the wrong file`,
  )
  return text
}

describe('§2.8 the pre-join dialog gives its stream away', () => {
  const text = source('components/call/call-prejoin.tsx', 'export function CallPreJoin')

  it('hands over through takeStream rather than passing the live ref', () => {
    assert.ok(text.includes('takeStream(streamRef)'), 'the handover no longer transfers ownership')
    assert.ok(
      !/onJoin\(streamRef\.current/.test(text),
      'the ref is being passed straight to onJoin again — its cleanup will stop the call’s camera',
    )
  })

  it('still stops the preview on unmount', () => {
    // The fix must not have been "delete the cleanup": abandoning the preview
    // leaves the camera light on when somebody cancels.
    assert.match(text, /streamRef\.current\?\.getTracks\(\)\.forEach/)
  })
})

describe('§2.8 leaving the page leaves the call', () => {
  const text = source('components/call/channel-call.tsx', 'export function ChannelCall')

  it('stops the camera and tells the server when the component goes away', () => {
    // The chat page is a lazy route, so clicking through to a task unmounts
    // this. Without it the camera stayed on with no UI left to turn it off,
    // and everyone else kept a frozen tile forever.
    assert.ok(text.includes('onUnmount'), 'there is no unmount handover')
    assert.match(text, /open\?\.getTracks\(\)\.forEach\(\(tr\) => tr\.stop\(\)\)/)
    assert.match(text, /if \(callId\) void leave\(callId\)/)
  })

  it('asks whether the call ended, rather than reading a field that is always null', () => {
    assert.ok(text.includes('callHasEnded('), 'the ended check is gone')
    assert.ok(
      !/live\.endedAt|joined\?\.endedAt/.test(text),
      'the end-of-call check is reading endedAt again — the live endpoint can never return it set',
    )
  })

  it('watches the call it is IN, not only the channel on screen', () => {
    assert.ok(
      text.includes("useLiveCall(workspaceId, inCall?.channelId ?? null)"),
      'the in-call query is keyed on the selected channel again — switching channels freezes the participant list',
    )
  })
})

describe('§2.8 the mesh is whole or it is nothing', () => {
  const text = source('lib/use-webrtc-call.ts', 'export function useWebRtcCall')

  it('connects to every peer rather than a per-client slice', () => {
    // Slicing each client's list independently meant each dropped a different
    // peer, so who could see whom came out different on every machine.
    assert.ok(
      !/others\.slice\(/.test(text),
      'the peer list is being sliced per client again — the mesh becomes asymmetric',
    )
    assert.ok(text.includes('for (const id of others) void connectTo(id)'))
  })

  it('buffers early ICE candidates instead of discarding them', () => {
    assert.ok(text.includes('shouldBufferIce('), 'candidates are no longer buffered')
    assert.ok(text.includes('queueIce('), 'nothing is queued')
    assert.ok(text.includes('flushIce('), 'nothing is flushed after setRemoteDescription')
  })

  it('guards the offer, so a peer leaving mid-handshake is not a dead slot', () => {
    assert.match(
      text,
      /try \{\s*const offer = await pc\.createOffer\(\)/,
      'createOffer is unguarded again — a closed connection leaves an unhandled rejection and a half-built peer',
    )
  })

  it('sends the currently-outgoing video, not always the camera', () => {
    assert.ok(text.includes('outgoingVideoTrack('), 'new connections are back to always adding the camera')
  })

  it('clears the failed badge when a peer comes back', () => {
    assert.match(
      text,
      /connectionState === 'connected'/,
      'nothing clears failedPeers — the TURN warning stays up for the rest of the call',
    )
  })
})

describe('§2.8 the minimised call shows something', () => {
  const text = source('components/call/call-surface.tsx', 'export function CallSurface')

  it('attaches the dock preview with a callback ref', () => {
    // A [localStream] effect could never attach it: that <video> does not exist
    // until you minimise, and localStream has not changed by then.
    assert.ok(text.includes('ref={attachLocal}'), 'the dock video is not using the callback ref')
    assert.ok(
      !/ref=\{localRef\}/.test(text),
      'the dock video is back on a plain ref — the corner tile will be black',
    )
  })
})
