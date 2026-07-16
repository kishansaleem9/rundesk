import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ZoomRecordingsService } from './zoom-recordings.service'

/**
 * §12.9 — recording.completed → recording-link service. DB + Zoom API mocked;
 * asserts the env-gate on the Zoom connection, idempotency, and that the
 * extracted share URL is persisted as a kind:'recording' link.
 */

function makeDb(selectResults: unknown[][]) {
  const queue = [...selectResults]
  const inserted: Array<Record<string, unknown>> = []
  const VERBS = ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'set']
  const node = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as any
    for (const v of VERBS) p[v] = () => p
    return p
  }
  const db = {
    select: mock.fn(() => node(queue.shift() ?? [])),
    insert: mock.fn(() => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v)
        return Promise.resolve([])
      },
    })),
    update: mock.fn(() => ({ set: () => ({ where: () => Promise.resolve([]) }) })),
  } as any
  return { db, inserted }
}

const MEETING_LINK = {
  id: 'link-1',
  taskId: 't1',
  workspaceId: 'w1',
  title: 'Design review',
  metadata: { meeting: { id: '88' } },
}
const FUTURE = new Date(Date.now() + 3_600_000)
const ZOOM_CONN = [{ id: 'c1', status: 'connected', accessToken: 'ztok', refreshToken: null, tokenExpiresAt: FUTURE }]

const webhook = { event: 'recording.completed', payload: { object: { id: 88 } } }

describe('ZoomRecordingsService.handleRecordingCompleted', () => {
  it('fetches the recording and attaches a kind:recording link', async () => {
    // selects: [meeting links, existing-recording-check(empty), zoom connection]
    const { db, inserted } = makeDb([[MEETING_LINK], [], ZOOM_CONN])
    const svc = new ZoomRecordingsService(db)

    const fetchMock = mock.method(
      globalThis,
      'fetch',
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            id: 88,
            topic: 'Design review',
            share_url: 'https://zoom.us/rec/share/xyz',
            recording_files: [{ file_type: 'MP4', play_url: 'https://zoom.us/rec/play/xyz', status: 'completed' }],
          }),
        }) as any,
    )
    try {
      const summary = await svc.handleRecordingCompleted(webhook)
      assert.equal(summary.meetingId, '88')
      assert.equal(summary.attached, 1)
      assert.equal(summary.skippedExisting, 0)
      const [reqUrl] = fetchMock.mock.calls[0].arguments as [string]
      assert.match(String(reqUrl), /meetings\/88\/recordings/)
      assert.equal(inserted.length, 1)
      assert.equal(inserted[0].taskId, 't1')
      assert.equal(inserted[0].provider, 'zoom')
      assert.equal(inserted[0].kind, 'recording')
      assert.equal(inserted[0].url, 'https://zoom.us/rec/share/xyz')
      assert.equal(inserted[0].externalId, '88')
      assert.equal((inserted[0].metadata as any).source, 'zoom_webhook')
      assert.equal((inserted[0].metadata as any).recordingUrl, 'https://zoom.us/rec/share/xyz')
    } finally {
      fetchMock.mock.restore()
    }
  })

  it('is idempotent: skips when a recording is already attached for the meeting', async () => {
    // existing-recording-check returns a row
    const { db, inserted } = makeDb([[MEETING_LINK], [{ id: 'rec-existing' }]])
    const svc = new ZoomRecordingsService(db)
    const fetchMock = mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({}) }) as any)
    try {
      const summary = await svc.handleRecordingCompleted(webhook)
      assert.equal(summary.attached, 0)
      assert.equal(summary.skippedExisting, 1)
      assert.equal(fetchMock.mock.callCount(), 0, 'no Zoom API call when already attached')
      assert.equal(inserted.length, 0)
    } finally {
      fetchMock.mock.restore()
    }
  })

  it('env-gate: skips when the workspace has no Zoom connection', async () => {
    // existing-check empty, connection lookups empty (fetchRecording + distinguisher)
    const { db, inserted } = makeDb([[MEETING_LINK], [], [], []])
    const svc = new ZoomRecordingsService(db)
    const fetchMock = mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({}) }) as any)
    try {
      const summary = await svc.handleRecordingCompleted(webhook)
      assert.equal(summary.attached, 0)
      assert.equal(summary.skippedNoConnection, 1)
      assert.equal(fetchMock.mock.callCount(), 0, 'no Zoom API call when unconnected')
      assert.equal(inserted.length, 0)
    } finally {
      fetchMock.mock.restore()
    }
  })

  it('no-ops cleanly when the webhook carries no meeting id', async () => {
    const { db, inserted } = makeDb([])
    const svc = new ZoomRecordingsService(db)
    const summary = await svc.handleRecordingCompleted({ event: 'recording.completed', payload: {} })
    assert.equal(summary.meetingId, null)
    assert.equal(summary.meetingLinks, 0)
    assert.equal(inserted.length, 0)
  })

  it('no-ops when no task meeting-link matches the meeting id', async () => {
    const { db } = makeDb([[]]) // meeting-links select → empty
    const svc = new ZoomRecordingsService(db)
    const summary = await svc.handleRecordingCompleted(webhook)
    assert.equal(summary.meetingLinks, 0)
    assert.equal(summary.attached, 0)
  })
})
