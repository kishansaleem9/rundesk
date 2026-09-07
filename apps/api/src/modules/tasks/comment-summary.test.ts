import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeAttachments } from './comment-summary'

/**
 * §V2-05 — the snippet a wordless comment gets in a notification.
 *
 * A comment can now be posted with nothing but a voice note (frame `04:45`) or
 * a clip (`05:35`). These checks are about the teammate who is emailed about
 * it: "New comment on X" over a blank quote reads as the product having lost
 * the comment.
 */

test('a comment with words does not reach this at all, but no attachments still says nothing', () => {
  // The caller only asks for a description when the body is empty; an empty
  // list here means a bug upstream, and returning '' keeps the old behaviour
  // rather than emailing the word "Sent".
  assert.equal(describeAttachments([]), '')
})

test('one voice note is named as a voice note, not as a file', () => {
  assert.equal(
    describeAttachments([{ fileName: 'voice-note_x.webm', contentType: 'audio/webm;codecs=opus' }]),
    'Sent a voice note',
  )
})

test('one clip is named as a clip', () => {
  assert.equal(describeAttachments([{ fileName: 'clip_x.webm', contentType: 'video/webm;codecs=vp9,opus' }]), 'Sent a clip')
})

test('several of a kind are counted', () => {
  assert.equal(
    describeAttachments([
      { fileName: 'a.webm', contentType: 'video/webm' },
      { fileName: 'b.webm', contentType: 'video/webm' },
    ]),
    'Sent 2 clips',
  )
})

test('mixed kinds read as a sentence, in a fixed order', () => {
  // Fixed order so two notifications about the same comment cannot describe it
  // two different ways.
  const files = [
    { fileName: 'notes.pdf', contentType: 'application/pdf' },
    { fileName: 'v.webm', contentType: 'audio/webm' },
    { fileName: 'shot.png', contentType: 'image/png' },
  ]
  assert.equal(describeAttachments(files), 'Sent a voice note, an image and a file')
  // Same set, different arrival order — same sentence.
  assert.equal(describeAttachments([...files].reverse()), 'Sent a voice note, an image and a file')
})

test('a file whose type never arrived is still described', () => {
  // An attachment row with no content type must not fall through to "" and
  // leave the snippet blank, which is the case this whole module exists for.
  assert.equal(describeAttachments([{ fileName: 'thing', contentType: null }]), 'Sent a file')
  assert.equal(describeAttachments([{ fileName: 'thing' }]), 'Sent a file')
})

test('the description is not the stored body', () => {
  // Guard on intent rather than on a string: nothing here may look like the
  // person typed it. If this ever starts returning first-person text it is
  // being written into a comment somebody will be quoted on.
  const out = describeAttachments([{ fileName: 'v.webm', contentType: 'audio/webm' }])
  assert.ok(out.startsWith('Sent '), out)
  assert.ok(!/\bI\b|\bmy\b/.test(out), out)
})
