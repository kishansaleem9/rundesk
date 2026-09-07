import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  VIDEO_RECORDER_TYPES,
  VOICE_NOTE_CHOICES,
  MAX_VOICE_SECONDS,
  MIN_RECORDING_BYTES,
  appendTranscript,
  extensionForType,
  formatDuration,
  isUsableRecording,
  maxSecondsFor,
  pickComposerType,
  presentationFor,
  recordingFileName,
} from './composer-recording'

test('frame 04:16 offers two choices, not three', () => {
  // "Insert as text" is the tooltip above Transcribe, not a third button. This
  // count is asserted rather than re-read off a summary, because it was got
  // wrong once from exactly that summary.
  assert.equal(VOICE_NOTE_CHOICES.length, 2)
  assert.deepEqual([...VOICE_NOTE_CHOICES], ['attach', 'transcribe'])
})

test('a voice recording asks for an audio container and a clip for a video one', () => {
  const seen: string[] = []
  pickComposerType('voice', (t) => {
    seen.push(t)
    return false
  })
  assert.ok(seen.every((t) => t.startsWith('audio/')), `asked for ${seen.join(', ')}`)

  const seenVideo: string[] = []
  pickComposerType('clip', (t) => {
    seenVideo.push(t)
    return false
  })
  assert.ok(seenVideo.every((t) => t.startsWith('video/')), `asked for ${seenVideo.join(', ')}`)
})

test('the first supported container wins, in the listed order', () => {
  assert.equal(pickComposerType('clip', (t) => t === VIDEO_RECORDER_TYPES[1]), VIDEO_RECORDER_TYPES[1])
  // Safari: only MP4. It must still get a recorder rather than nothing.
  assert.equal(pickComposerType('clip', (t) => t === 'video/mp4'), 'video/mp4')
})

test('a browser that can write none of them says so instead of pretending', () => {
  // Null is the caller's cue to disable the button. Handing back a type the
  // browser rejects gives a zero-byte attachment and no error anywhere.
  assert.equal(pickComposerType('voice', () => false), null)
  assert.equal(pickComposerType('clip', () => false), null)
})

test('codec parameters do not change the file extension', () => {
  assert.equal(extensionForType('audio/webm;codecs=opus'), 'webm')
  assert.equal(extensionForType('video/webm;codecs=vp9,opus'), 'webm')
  assert.equal(extensionForType('AUDIO/MP4'), 'm4a')
  assert.equal(extensionForType('video/mp4'), 'mp4')
})

test('an unknown container still gets an extension', () => {
  // Better a `.bin` the browser downloads than a name with no dot at all,
  // which some hosts serve as `text/html`.
  assert.equal(extensionForType('audio/flac'), 'bin')
  assert.equal(extensionForType(''), 'bin')
})

test('two recordings a second apart do not collide on a name', () => {
  const a = recordingFileName('voice', 'audio/webm;codecs=opus', new Date('2026-03-04T09:15:20.123Z'))
  const b = recordingFileName('voice', 'audio/webm;codecs=opus', new Date('2026-03-04T09:15:21.123Z'))
  assert.notEqual(a, b)
  assert.match(a, /^voice-note_2026-03-04_09-15-20\.webm$/)
})

test('a clip and a voice note are named apart', () => {
  const at = new Date('2026-03-04T09:15:20Z')
  assert.match(recordingFileName('clip', 'video/webm', at), /^clip_/)
  assert.match(recordingFileName('voice', 'audio/webm', at), /^voice-note_/)
})

test('audio and video get players, everything else stays a paperclip', () => {
  assert.equal(presentationFor('audio/webm;codecs=opus'), 'audio')
  assert.equal(presentationFor('video/mp4'), 'video')
  assert.equal(presentationFor('image/png'), 'image')
  assert.equal(presentationFor('application/pdf'), 'file')
  // An attachment whose type never arrived must not be rendered into a player
  // that will sit there failing to load.
  assert.equal(presentationFor(null), 'file')
  assert.equal(presentationFor(undefined), 'file')
})

test('a tap that records nothing is refused, a real recording is not', () => {
  assert.equal(isUsableRecording(0), false)
  assert.equal(isUsableRecording(MIN_RECORDING_BYTES - 1), false)
  assert.equal(isUsableRecording(MIN_RECORDING_BYTES), true)
  assert.equal(isUsableRecording(400_000), true)
})

test('both kinds are capped, so a forgotten recording cannot grow without bound', () => {
  assert.equal(maxSecondsFor('voice'), MAX_VOICE_SECONDS)
  assert.ok(maxSecondsFor('clip') > 0)
})

test('durations read the way a player reads', () => {
  assert.equal(formatDuration(0), '0:00')
  assert.equal(formatDuration(7), '0:07')
  assert.equal(formatDuration(61), '1:01')
  assert.equal(formatDuration(600), '10:00')
  // Fractions of a second are floored, not rounded up into a second that has
  // not happened.
  assert.equal(formatDuration(9.9), '0:09')
  assert.equal(formatDuration(-3), '0:00')
})

test('a transcript joins what was already typed instead of replacing it', () => {
  assert.equal(appendTranscript('quick thought:', 'ship it on Friday'), 'quick thought: ship it on Friday')
  assert.equal(appendTranscript('', 'ship it on Friday'), 'ship it on Friday')
  // Trailing whitespace in the box must not become a double space.
  assert.equal(appendTranscript('note:   ', 'done'), 'note: done')
})

test('an empty transcript leaves the box exactly as it was', () => {
  // Speech recognition that heard nothing must not clear or reformat what the
  // person typed while it was listening.
  assert.equal(appendTranscript('half a sentence', '   '), 'half a sentence')
  assert.equal(appendTranscript('half a sentence', ''), 'half a sentence')
})
