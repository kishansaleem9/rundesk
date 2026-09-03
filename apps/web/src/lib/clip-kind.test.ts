import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clipKind, matchesClipKind } from './clip-kind'

test('a voice memo is audio and a screen recording is not', () => {
  assert.equal(clipKind('clips/ws/main-workspace-voice-memo-abc.webm'), 'audio')
  assert.equal(clipKind('clips/ws/main-workspace-screen-recording-abc.webm'), 'video')
})

test('an unstamped key is a screen clip, not an audio one', () => {
  // The safe default. Calling an unknown object "audio" would hide every
  // legacy clip from the library people actually use.
  assert.equal(clipKind('clips/ws/whatever.webm'), 'video')
})

test('the title is not consulted — only the key', () => {
  // A clip somebody renamed "my voice notes" is still a screen recording, and
  // must not move libraries because of a caption.
  assert.equal(clipKind('clips/ws/main-workspace-screen-recording-xyz.webm'), 'video')
})

test('no kind asked for means everything', () => {
  assert.equal(matchesClipKind('clips/ws/a-voice-memo-1.webm', undefined), true)
  assert.equal(matchesClipKind('clips/ws/a-screen-recording-1.webm', undefined), true)
})

test('asking for one kind excludes the other', () => {
  assert.equal(matchesClipKind('clips/ws/a-voice-memo-1.webm', 'audio'), true)
  assert.equal(matchesClipKind('clips/ws/a-screen-recording-1.webm', 'audio'), false)
  assert.equal(matchesClipKind('clips/ws/a-screen-recording-1.webm', 'video'), true)
  assert.equal(matchesClipKind('clips/ws/a-voice-memo-1.webm', 'video'), false)
})
