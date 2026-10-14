import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { recallConfig, readTranscript, stateOf, transcriptText, transcriptUrlOf } from './recall'
import { findMeetingUrl, meetingPlatformOf } from '../../common/meeting-links'

/**
 * `commit-log/log-39863ff-1` — the AI Notetaker. What is pinned here is what a
 * stub cannot check for us: which links are meetings it may join, how the
 * service's status codes read as where a visit stands, and how a transcript of
 * participants and their words becomes who said what, in order.
 */
describe('AI Notetaker: which links are meetings', () => {
  it('takes Zoom, Google Meet and Teams meeting links, and nothing else', () => {
    assert.equal(meetingPlatformOf('https://meet.google.com/abc-defg-hij'), 'google_meet')
    assert.equal(meetingPlatformOf('https://zoom.us/j/1234567890?pwd=x'), 'zoom')
    assert.equal(meetingPlatformOf('https://acme.zoom.us/j/1234567890'), 'zoom')
    assert.equal(meetingPlatformOf('https://teams.microsoft.com/l/meetup-join/19%3ameeting_x/0'), 'teams')
    assert.equal(meetingPlatformOf('https://teams.live.com/meet/9387492'), 'teams')
    for (const not of ['http://meet.google.com/abc-defg-hij', 'https://meet.google.com/', 'https://zoom.us/', 'https://evil.com/zoom.us/j/1', 'https://zoom.us.evil.com/j/1', 'https://user:pw@zoom.us/j/1', 'tel:+15551234', 'not a link', 42]) {
      assert.equal(meetingPlatformOf(not), null, `${String(not)} was taken for a meeting`)
    }
  })

  it('finds the meeting link in an event’s words, past the ones that are not', () => {
    assert.equal(findMeetingUrl('Dial in at https://example.com/menu.', 'Join: https://acme.zoom.us/j/42, thanks'), 'https://acme.zoom.us/j/42')
    assert.equal(findMeetingUrl(null, undefined, 'Room 4'), null)
  })
})

describe('AI Notetaker: the meeting bot service', () => {
  it('is set up by its key, at us-east-1 unless a region is given', () => {
    assert.equal(recallConfig({}), null)
    assert.deepEqual(recallConfig({ RECALL_API_KEY: 'k' }), { key: 'k', base: 'https://us-east-1.recall.ai', botName: 'Rundesk Notetaker' })
    assert.deepEqual(recallConfig({ RECALL_API_KEY: 'k', RECALL_API_URL: 'https://eu-central-1.recall.ai/', NOTETAKER_BOT_NAME: 'Acme notes' }), { key: 'k', base: 'https://eu-central-1.recall.ai', botName: 'Acme notes' })
  })

  it('reads where a visit stands from the bot’s latest status change', () => {
    const at = (...codes: string[]) => stateOf({ id: 'b', status_changes: codes.map((code) => ({ code })) }).status
    assert.equal(at(), 'scheduled')
    assert.equal(at('joining_call'), 'joining')
    assert.equal(at('joining_call', 'in_waiting_room'), 'waiting')
    assert.equal(at('joining_call', 'in_call_recording'), 'recording')
    assert.equal(at('joining_call', 'in_call_recording', 'call_ended'), 'processing')
    assert.equal(at('joining_call', 'in_call_recording', 'call_ended', 'done'), 'done')
    const fatal = stateOf({ id: 'b', status_changes: [{ code: 'joining_call' }, { code: 'fatal', sub_code: 'meeting_not_found' }] })
    assert.deepEqual(fatal, { status: 'failed', detail: 'meeting_not_found' })
  })

  it('finds a done recording’s transcript, and turns its participants’ words into who said what, in order', () => {
    assert.equal(transcriptUrlOf({ id: 'b', recordings: [] }), null)
    assert.equal(transcriptUrlOf({ id: 'b', recordings: [{ media_shortcuts: { transcript: { data: { download_url: 'https://s3/t.json' } } } }] }), 'https://s3/t.json')
    const parts = readTranscript([
      { participant: { name: 'Bo' }, words: [{ text: 'Agreed.', start_timestamp: { relative: 9.5 } }] },
      { participant: { name: 'Ana' }, words: [{ text: 'Let us', start_timestamp: { relative: 1 } }, { text: 'ship   Friday.', start_timestamp: { relative: 1.4 } }] },
      { participant: { name: '' }, words: [{ text: 'Hello?', start_timestamp: { relative: 20 } }] },
      { participant: { name: 'Mute' }, words: [] },
    ])
    assert.deepEqual(parts, [
      { speaker: 'Ana', text: 'Let us ship Friday.' },
      { speaker: 'Bo', text: 'Agreed.' },
      { speaker: 'Someone', text: 'Hello?' },
    ])
    assert.equal(transcriptText(parts), 'Ana: Let us ship Friday.\nBo: Agreed.\nSomeone: Hello?')
    assert.deepEqual(readTranscript({ not: 'a list' }), [])
  })
})
