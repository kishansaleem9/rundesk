import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MIN_RECORDING_BYTES,
  RECORDER_TYPES,
  captionsTail,
  isRevisionOf,
  pickRecorderType,
  capturerFor,
  shouldSendLine,
  streamsToWire,
} from './call-recording'

/**
 * §2.8 gap 10 — AI Notes.
 *
 * Every decision here fails silently and produces something that LOOKS like it
 * worked: a container the browser cannot write gives a zero-byte file, and
 * speech recognition revising itself gives a transcript that says the same
 * sentence three times — which a model will faithfully report as three
 * separate commitments.
 */

describe('§2.8 picking a container the browser can write', () => {
  it('prefers opus in webm, which is what transcription reads', () => {
    assert.equal(pickRecorderType(() => true), 'audio/webm;codecs=opus')
  })

  it('falls back rather than giving up, on a browser that only does mp4', () => {
    // Safari writes MP4/AAC and nothing else. No recording at all there would
    // be a worse answer than a container we can still read.
    assert.equal(pickRecorderType((t) => t === 'audio/mp4'), 'audio/mp4')
  })

  it('returns null when none of them work, instead of picking one anyway', () => {
    // MediaRecorder with an unsupported type throws in some browsers and
    // quietly writes an empty file in others. The second is much worse, so the
    // caller has to be told there is no recorder here.
    assert.equal(pickRecorderType(() => false), null)
  })

  it('offers a real list, not one hopeful guess', () => {
    assert.ok(RECORDER_TYPES.length >= 3)
    assert.ok(RECORDER_TYPES.every((t) => t.startsWith('audio/')))
  })
})

describe('§2.8 the transcript does not say everything twice', () => {
  it('sends a new line', () => {
    assert.equal(shouldSendLine('we should ship on Friday', null), true)
    assert.equal(shouldSendLine('and update the docs', 'we should ship on Friday'), true)
  })

  it('drops an exact repeat of the line just sent', () => {
    assert.equal(shouldSendLine('we should ship on Friday', 'we should ship on Friday'), false)
  })

  it('sends a REVISION that grew, and drops one that shrank', () => {
    // The Web Speech API re-emits a final result when it revises one: "we
    // should ship" becomes "we should ship on Friday".
    assert.equal(shouldSendLine('we should ship on Friday', 'we should ship'), true)
    assert.equal(shouldSendLine('we should ship', 'we should ship on Friday'), false)
  })

  it('marks a revision as replacing, not following', () => {
    // Without this the transcript reads "we should ship / we should ship on
    // Friday" and the model has to guess they are one sentence.
    assert.equal(isRevisionOf('we should ship on Friday', 'we should ship'), true)
    assert.equal(isRevisionOf('and update the docs', 'we should ship'), false)
    assert.equal(isRevisionOf('anything', null), false)
  })

  it('keeps genuine repetition, which is not a duplicate', () => {
    // Somebody saying "yes. yes." said it twice. A transcript that quietly
    // drops that has been edited.
    assert.equal(shouldSendLine('yes', 'no'), true)
    const twice = ['yes', 'okay', 'yes']
    let last: string | null = null
    const sent: string[] = []
    for (const line of twice) {
      if (shouldSendLine(line, last)) {
        sent.push(line)
        last = line
      }
    }
    assert.deepEqual(sent, ['yes', 'okay', 'yes'])
  })

  it('ignores noise that is not a word', () => {
    assert.equal(shouldSendLine('', null), false)
    assert.equal(shouldSendLine('   ', null), false)
    assert.equal(shouldSendLine('a', null), false)
  })
})

describe('§2.8 the captions strip', () => {
  it('shows only the tail', () => {
    assert.deepEqual(captionsTail([1, 2, 3, 4, 5], 3), [3, 4, 5])
  })

  it('shows everything when there is less than a tail', () => {
    assert.deepEqual(captionsTail([1], 3), [1])
    assert.deepEqual(captionsTail([], 3), [])
  })
})

describe('§2.8 an empty recording is not uploaded', () => {
  it('has a floor above a bare container header', () => {
    // A few hundred bytes is a webm header and no audio. Uploading it attaches
    // an unplayable recording to the meeting record, which reads as a bug in
    // playback rather than as a call nobody spoke on.
    assert.ok(MIN_RECORDING_BYTES >= 512, `${MIN_RECORDING_BYTES} is not a meaningful floor`)
  })
})

describe('§2.8 somebody who joins mid-recording still ends up in the file', () => {
  const stream = (id: string, audio = 1) => ({ id, getAudioTracks: () => Array(audio).fill(0) })

  it('wires a stream nobody has wired yet', () => {
    assert.deepEqual(
      streamsToWire([stream('a'), stream('b')], new Set()).map((s) => s.id),
      ['a', 'b'],
    )
  })

  it('does NOT wire the same stream twice', () => {
    // Connecting a stream to the destination a second time doubles its volume
    // and is the obvious bug when the peer list re-renders, which it does
    // constantly during a call.
    assert.deepEqual(
      streamsToWire([stream('a'), stream('b')], new Set(['a'])).map((s) => s.id),
      ['b'],
    )
  })

  it('deduplicates within a single pass', () => {
    assert.deepEqual(
      streamsToWire([stream('a'), stream('a')], new Set()).map((s) => s.id),
      ['a'],
    )
  })

  it('skips a stream with no audio, and comes back for it later', () => {
    // A peer's video can arrive before their microphone. Marking them done now
    // would leave them silent for the whole call; leaving them unwired means
    // the next pass picks them up.
    const silent = stream('a', 0)
    assert.deepEqual(streamsToWire([silent], new Set()), [])
    assert.deepEqual(
      streamsToWire([stream('a', 1)], new Set()).map((s) => s.id),
      ['a'],
      'a peer whose microphone came up later was never wired',
    )
  })

  it('ignores the gaps a peer list has while people connect', () => {
    assert.deepEqual(streamsToWire([null, undefined, stream('a')], new Set()).map((s) => s.id), ['a'])
    assert.deepEqual(streamsToWire([], new Set()), [])
  })
})


describe('§2.8 who captures the recording', () => {
  it('is one person, and the same person on every client', () => {
    // Every client computes this from the same participant list, so exactly
    // one of them records — N copies of one call is N-1 wasted uploads.
    const present = ['u-c', 'u-a', 'u-b']
    assert.equal(capturerFor(present), 'u-a')
    assert.equal(capturerFor([...present].reverse()), 'u-a', 'two clients disagreed about who records')
  })

  it('moves when that person leaves', () => {
    // Pinned to whoever STARTED the call, a host who left mid-recording took
    // the recording with them: banner still up, transcript still flowing,
    // nothing being captured.
    assert.equal(capturerFor(['u-a', 'u-b', 'u-c']), 'u-a')
    assert.equal(capturerFor(['u-b', 'u-c']), 'u-b', 'nobody picked up the recording after the capturer left')
  })

  it('is nobody in an empty room', () => {
    assert.equal(capturerFor([]), null)
  })
})
