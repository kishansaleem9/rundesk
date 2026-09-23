import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MeetingsService } from './meetings.service'

/**
 * What a client may put in a meeting's `recordingUrl`. Called on a stub `this`
 * because the rule reads one thing, `r2.keyFromOwnUrl`: whether a URL is one of
 * our own bucket's, and which key it names.
 */
const OWN = 'http://127.0.0.1:9101/rundesk-v1/'
const accept = (input: string | null | undefined, stored: string | null) =>
  (MeetingsService.prototype as any).acceptRecordingInput.call(
    { r2: { keyFromOwnUrl: (u: string) => (u.startsWith(OWN) ? u.slice(OWN.length).split('?')[0] : null) } },
    input,
    stored,
  )

describe('MeetingsService — what a client may store as a recording', () => {
  it('a pasted http(s) link is stored as it was pasted', () => {
    assert.equal(accept('https://zoom.us/rec/share/abc', null), 'https://zoom.us/rec/share/abc')
  })

  it('nothing clears it', () => {
    assert.equal(accept('', 'calls/w1/c1/r.webm'), null)
    assert.equal(accept(null, 'calls/w1/c1/r.webm'), null)
  })

  it('the signed URL of the key already stored KEEPS the key — the AI card’s round trip', () => {
    assert.equal(accept(`${OWN}calls/w1/c1/r.webm?X-Amz-Signature=abc`, 'calls/w1/c1/r.webm'), 'calls/w1/c1/r.webm')
  })

  it('a URL of our bucket naming any OTHER object is refused', () => {
    assert.throws(() => accept(`${OWN}workspaces/w2/tasks/t/attachments/secret.pdf`, null), /own storage/)
  })

  it('a bare key is refused unless it is exactly what is stored — keys are the server’s to write', () => {
    assert.throws(() => accept('workspaces/w2/tasks/t/attachments/secret.pdf', null), /http/)
    assert.equal(accept('calls/w1/c1/r.webm', 'calls/w1/c1/r.webm'), 'calls/w1/c1/r.webm')
  })

  it('and so is any other scheme', () => {
    assert.throws(() => accept('javascript://%0aalert(1)', null), /http/)
  })
})
