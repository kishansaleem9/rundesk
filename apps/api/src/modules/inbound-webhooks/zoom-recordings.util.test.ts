import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extractZoomRecordingUrl, extractMeetingIdFromWebhook } from './zoom-recordings.util'

/**
 * §12.9 — Zoom cloud-recording response parsing. Pure, no DB / no network.
 */

describe('extractZoomRecordingUrl', () => {
  it('prefers the top-level share_url', () => {
    const out = extractZoomRecordingUrl({
      id: 88,
      topic: 'Design review',
      share_url: 'https://zoom.us/rec/share/abc',
      recording_count: 2,
      total_size: 1234,
      recording_files: [
        { file_type: 'MP4', play_url: 'https://zoom.us/rec/play/mp4', download_url: 'https://zoom.us/rec/dl/mp4', status: 'completed' },
        { file_type: 'M4A', play_url: 'https://zoom.us/rec/play/m4a', status: 'completed' },
      ],
    })
    assert.ok(out)
    assert.equal(out.shareUrl, 'https://zoom.us/rec/share/abc')
    assert.equal(out.playUrl, 'https://zoom.us/rec/play/mp4', 'picks the MP4 video file play url')
    assert.equal(out.downloadUrl, 'https://zoom.us/rec/dl/mp4')
    assert.equal(out.topic, 'Design review')
    assert.equal(out.recordingCount, 2)
    assert.equal(out.totalSize, 1234)
  })

  it('falls back to the video file play_url when there is no share_url', () => {
    const out = extractZoomRecordingUrl({
      id: 88,
      recording_files: [
        { file_type: 'M4A', play_url: 'https://zoom.us/rec/play/audio' },
        { file_type: 'MP4', play_url: 'https://zoom.us/rec/play/video', status: 'completed' },
      ],
    })
    assert.ok(out)
    assert.equal(out.shareUrl, 'https://zoom.us/rec/play/video')
  })

  it('falls back to download_url when no share_url and no play_url', () => {
    const out = extractZoomRecordingUrl({
      id: 88,
      recording_files: [{ file_type: 'MP4', download_url: 'https://zoom.us/rec/dl/only', status: 'completed' }],
    })
    assert.ok(out)
    assert.equal(out.shareUrl, 'https://zoom.us/rec/dl/only')
  })

  it('returns null when there is no usable url', () => {
    assert.equal(extractZoomRecordingUrl({ id: 88, recording_files: [] }), null)
    assert.equal(extractZoomRecordingUrl({ id: 88 }), null)
    assert.equal(extractZoomRecordingUrl(null), null)
    assert.equal(extractZoomRecordingUrl(undefined), null)
  })

  it('ignores an empty share_url string and uses a file url instead', () => {
    const out = extractZoomRecordingUrl({
      share_url: '',
      recording_files: [{ file_type: 'MP4', play_url: 'https://zoom.us/rec/play/x', status: 'completed' }],
    })
    assert.ok(out)
    assert.equal(out.shareUrl, 'https://zoom.us/rec/play/x')
  })
})

describe('extractMeetingIdFromWebhook', () => {
  it('reads payload.object.id as a string', () => {
    assert.equal(
      extractMeetingIdFromWebhook({ event: 'recording.completed', payload: { object: { id: 88 } } }),
      '88',
    )
  })

  it('handles a string id already', () => {
    assert.equal(extractMeetingIdFromWebhook({ payload: { object: { id: '99' } } }), '99')
  })

  it('returns null when the shape is missing', () => {
    assert.equal(extractMeetingIdFromWebhook({}), null)
    assert.equal(extractMeetingIdFromWebhook({ payload: {} }), null)
    assert.equal(extractMeetingIdFromWebhook(null), null)
  })
})
