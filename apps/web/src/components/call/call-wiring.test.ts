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

  it('takes the preview back when the join fails', () => {
    // Handing it over unconditionally left the dialog open with an empty ref:
    // the Join button looked enabled, pressed to no effect, and the camera it
    // had let go of ran on with no owner to stop it.
    assert.match(
      text,
      /if \(joined === false\) streamRef\.current = stream/,
      'a failed join no longer returns the preview — Join goes inert and the camera is orphaned',
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

  it('tells callHasEnded how old the answer is', () => {
    // The two live-call queries share a cache key, so the joined query is
    // served the pre-call `null` the instant it mounts — already isSuccess.
    // Without the timing, starting a SyncUp hangs itself up on the first
    // render. A correct callHasEnded is worth nothing if this stops feeding it.
    assert.ok(text.includes('joinedAt: joinedAt.current'), 'the ended check is no longer given the join time')
    assert.ok(text.includes('answeredAt: joinedQuery.dataUpdatedAt'), 'the ended check is no longer given the answer time')
    assert.ok(
      /joinedAt\.current = Date\.now\(\)/.test(text),
      'nothing stamps the moment of joining, so the guard compares against 0 and never fires',
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

  it('actually STOPS rebuilding a peer once the budget is spent', () => {
    // MAX_RESETS bounded the reset signal and nothing else: dropPeer ran
    // either way and the connect effect re-runs on every render, so the peer
    // was rebuilt immediately and a dead route rebuilt forever. A commit
    // message of mine called that bounded. It was not.
    assert.ok(text.includes('gaveUp'), 'nothing records a peer we have stopped trying to reach')
    assert.match(
      text,
      /if \(gaveUp\.current\.has\(peerId\)\) return/,
      'connectTo rebuilds a peer the budget has already given up on',
    )
    assert.match(
      text,
      /\} else \{\s*gaveUp\.current\.add\(peerId\)/,
      'running out of attempts no longer marks the peer as given up',
    )
  })

  it('lets somebody who left and rejoined try again', () => {
    // Otherwise a person who reconnects to fix their connection is refused by
    // a budget they cannot see and did not know they had spent.
    assert.match(text, /gaveUp\.current\.delete\(id\)/, 'a rejoining peer stays given up forever')
  })

  it('clears the failed badge when a peer comes back', () => {
    assert.match(
      text,
      /connectionState === 'connected'/,
      'nothing clears failedPeers — the TURN warning stays up for the rest of the call',
    )
  })
})

describe('§2.8 AI Notes does not spin when it cannot work', () => {
  const text = source('lib/use-call-recording.ts', 'export function useCallRecording')

  it('stops rather than hammering when the microphone is refused', () => {
    // A permanent failure ends recognition the instant it starts, so an
    // unconditional restart is a hot loop for the length of the call with
    // nothing on screen to explain it.
    assert.match(text, /'not-allowed'/, 'a revoked microphone no longer stops the restart loop')
    // The COMPARISON, not the identifier. Checking that the name merely
    // appears passed with the ceiling replaced by `if (false)`, because the
    // import line still mentioned it.
    assert.match(
      text,
      /restarts >= MAX_SPEECH_RESTARTS/,
      'the restart loop has no ceiling — a permanent failure spins for the whole call',
    )
    assert.match(text, /Math\.min\(2000, 250 \* 2 \*\* \(restarts - 1\)\)/, 'restarts no longer back off')
  })

  it('clears its restart timer on the way out', () => {
    assert.match(text, /if \(restartTimer\) clearTimeout\(restartTimer\)/, 'a pending restart outlives the call')
  })

  it('tells the server which lines are revisions', () => {
    assert.ok(
      text.includes('replacesPrevious: replaces'),
      'revisions are posted as new lines again — the transcript will say everything twice',
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


/**
 * §2.8 gap 11 — the gate has to refresh the thing it is gating on.
 *
 * Guarded by source because the failure is a modal that re-opens: nothing
 * throws, nothing looks wrong, and the instruction on screen is simply false.
 */
describe('§2.8 an already-enabled feature stops being gated', () => {
  const text = source('components/feature-gate.tsx', 'export function FeatureGateDialog')

  it('refetches the flags when the server says it is already on', () => {
    // Being told "already enabled" means this browser holds a stale snapshot
    // from before an admin switched it on. Without a refetch, "close this and
    // try again" re-opens the identical modal — forever.
    assert.match(
      text,
      /if \(res\?\.status === 'already_enabled'\)/,
      'nothing notices the answer that means our flags are out of date',
    )
    assert.match(
      text,
      /invalidateQueries\(\{ queryKey: \['feature-flags', 'resolved'\] \}\)/,
      'the stale flag snapshot is never refreshed, so retrying cannot work',
    )
  })
})

/**
 * §2.8 `[19:46]` — "aur yahan SPEAKER ka option hai."
 *
 * The re-audit found the pre-join offering a microphone and a camera and
 * nothing for output. This is the wiring half of that fix, and it is the half
 * that can rot: a picker whose value never reaches the elements the call's
 * audio comes out of is indistinguishable, from the seat, from no picker at
 * all — you choose your headphones, the sound keeps coming from the laptop,
 * and there is nothing on screen to suggest the control was ignored.
 *
 * So each of the four joints is asserted separately: enumerate, offer, carry,
 * apply. Any one of them missing is the whole feature missing.
 */
describe('§2.8 the speaker you choose is the speaker it uses', () => {
  const prejoin = source('components/call/call-prejoin.tsx', 'export function CallPreJoin')
  const surface = source('components/call/call-surface.tsx', 'export function CallSurface')
  const channel = source('components/call/channel-call.tsx', 'CallPreJoin')

  it('enumerates outputs, not just inputs', () => {
    assert.match(prejoin, /kind === 'audiooutput'/, 'output devices are never collected')
  })

  it('offers them, and only where the browser can honour the choice', () => {
    assert.match(prejoin, /data-testid="call-prejoin-speaker-select"/, 'no speaker picker in the pre-join')
    // Firefox keeps setSinkId behind a pref and Safari has never shipped it. A
    // picker drawn there would silently do nothing, which is worse than the
    // gap this replaced: the person would have every reason to believe it had
    // worked.
    assert.match(prejoin, /'setSinkId' in HTMLMediaElement\.prototype/, 'the picker is drawn without checking it can work')
    assert.match(prejoin, /showSpeakers = canPickSpeaker\(\) && devices\.speakers\.length > 0/,
      'the picker is not gated on both support and having something to offer')
  })

  it('carries the choice out of the dialog and into the call', () => {
    assert.match(prejoin, /onJoin\(stream, background, speakerId\)/, 'the choice never leaves the pre-join')
    assert.match(channel, /setSpeakerId\(speaker\)/, 'the join handler drops the chosen speaker')
    assert.match(channel, /speakerId=\{speakerId\}/, 'the call surface is never told which speaker')
  })

  it('and applies it to the elements the call actually plays through', () => {
    // The tiles are where remote audio comes out; routing anything else would
    // be a setting that looks applied and is not.
    assert.match(surface, /speakerId=\{speakerId\}/, 'the peer tiles are not given the speaker')
    assert.match(surface, /void applySink\(ref\.current, speakerId \?\? ''\)/, 'nothing ever calls setSinkId')
    assert.match(surface, /\}, \[speakerId, stream\]\)/,
      're-routing does not re-run when the tile swaps to another stream')
  })

  it('survives a device that disappears between listing and using it', () => {
    // Unplugging headphones between enumerate and setSinkId is ordinary. An
    // unhandled rejection here would take down a call that is otherwise fine.
    const fn = /export async function applySink\(([\s\S]*?)\n\}/.exec(prejoin)?.[1] ?? ''
    assert.ok(fn, 'could not find applySink')
    assert.match(fn, /try \{[\s\S]*?\} catch \{/, 'a vanished output device would reject unhandled')
  })
})

/**
 * §2.8 `[19:44]` — "Aap ke VOICE RECORDING wali options hain — check for the
 * high quality voice."
 *
 * The frames say what "check" is: the pre-join's microphone row carries a live
 * input-level bar underneath it. Picking a mic tells you which device is
 * selected and nothing about whether it can hear you — which is the thing
 * people actually get wrong, and the thing you want to find out before anyone
 * is listening rather than after.
 */
describe('§2.8 the pre-join shows whether the microphone is hearing you', () => {
  const prejoin = source('components/call/call-prejoin.tsx', 'export function CallPreJoin')

  it('reads a real level rather than trusting the track', () => {
    // MediaStreamTrack carries no level, so this has to go through Web Audio.
    assert.match(prejoin, /createMediaStreamSource\(stream\)/, 'nothing is analysing the mic stream')
    assert.match(prejoin, /getByteTimeDomainData\(buf\)/, 'no samples are read')
  })

  it('measures the peak, not the average', () => {
    /*
     * Averaged over a frame, ordinary speech reads near zero and the bar looks
     * broken — which would send someone off to debug a microphone that was
     * working perfectly well.
     */
    assert.match(prejoin, /peak = Math\.max\(peak, Math\.abs\(v - 128\)\)/, 'the level is not a peak')
  })

  it('and tears the analyser down with the stream it was built from', () => {
    // Switching mic re-acquires the stream. Without this, each switch leaves
    // another AudioContext running against a track that has ended.
    const effect = /const \[micLevel, setMicLevel\][\s\S]*?\}, \[ready, micOn, micId\]\)/.exec(prejoin)?.[0] ?? ''
    assert.ok(effect, 'could not find the level effect')
    assert.match(effect, /cancelAnimationFrame\(raf\)/, 'the animation frame is never cancelled')
    assert.match(effect, /void ctx\.close\(\)/, 'the AudioContext is never closed')
    assert.match(effect, /\[ready, micOn, micId\]/, 'the effect does not re-run when the mic changes')
  })

  it('is drawn as a meter, not just a coloured div', () => {
    assert.match(prejoin, /data-testid="call-prejoin-mic-level"/, 'no level bar in the pre-join')
    assert.match(prejoin, /role="meter"/, 'the level is invisible to assistive tech')
    assert.match(prejoin, /aria-valuenow=\{Math\.round\(micLevel \* 100\)\}/, 'the meter reports no value')
  })

  it('and survives a browser with no Web Audio at all', () => {
    // Safari-shaped environments and locked-down embeds. The device pickers
    // must keep working; only the bar is optional.
    assert.match(prejoin, /catch \{\n\s*\/\/ No Web Audio here/, 'a missing AudioContext would throw')
  })
})
