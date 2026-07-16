import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { parseExternalLinkUrl, isHttpUrl } from './external-links.util'
import { TasksService } from './tasks.service'

/**
 * §12.8 / §12.2 — task ↔ external-service links.
 *
 * Two layers:
 *   1. `parseExternalLinkUrl` — URL → provider/kind/external_id detection for
 *      GitHub + GitLab (commit/PR/issue), Google Drive (file), and the generic
 *      link fallback. Pure + deterministic, no DB.
 *   2. Link CRUD + access checks on `TasksService`, incl. the key guarantee
 *      that `status` stays null when no provider connection is configured
 *      (the live fetch is env-gated behind an integration connection).
 */

describe('parseExternalLinkUrl — GitHub', () => {
  it('detects a pull request', () => {
    const r = parseExternalLinkUrl('https://github.com/acme/webapp/pull/42')
    assert.equal(r.provider, 'github')
    assert.equal(r.kind, 'pull_request')
    assert.equal(r.externalId, 'acme/webapp#42')
    assert.deepEqual(r.ref, { owner: 'acme', repo: 'webapp', number: '42' })
  })

  it('detects a pull request with trailing path segments', () => {
    const r = parseExternalLinkUrl('https://github.com/acme/webapp/pull/42/files')
    assert.equal(r.kind, 'pull_request')
    assert.equal(r.ref.number, '42')
  })

  it('detects an issue', () => {
    const r = parseExternalLinkUrl('https://github.com/acme/webapp/issues/7')
    assert.equal(r.provider, 'github')
    assert.equal(r.kind, 'issue')
    assert.equal(r.externalId, 'acme/webapp#7')
  })

  it('detects a commit and shortens the sha in the title', () => {
    const r = parseExternalLinkUrl('https://github.com/acme/webapp/commit/abcdef1234567890')
    assert.equal(r.provider, 'github')
    assert.equal(r.kind, 'commit')
    assert.equal(r.externalId, 'acme/webapp@abcdef1234567890')
    assert.equal(r.ref.sha, 'abcdef1234567890')
    assert.match(r.title ?? '', /@abcdef1$/)
  })

  it('falls back to a generic github link for a repo root', () => {
    const r = parseExternalLinkUrl('https://github.com/acme/webapp')
    assert.equal(r.provider, 'github')
    assert.equal(r.kind, 'link')
    assert.equal(r.externalId, null)
  })
})

describe('parseExternalLinkUrl — GitLab', () => {
  it('detects a merge request (the /-/ separator)', () => {
    const r = parseExternalLinkUrl('https://gitlab.com/acme/group/webapp/-/merge_requests/12')
    assert.equal(r.provider, 'gitlab')
    assert.equal(r.kind, 'pull_request')
    assert.equal(r.externalId, 'acme/group/webapp!12')
    assert.equal(r.ref.projectPath, 'acme/group/webapp')
    assert.equal(r.ref.number, '12')
    assert.equal(r.ref.host, 'gitlab.com')
  })

  it('detects an issue', () => {
    const r = parseExternalLinkUrl('https://gitlab.com/acme/webapp/-/issues/99')
    assert.equal(r.provider, 'gitlab')
    assert.equal(r.kind, 'issue')
    assert.equal(r.externalId, 'acme/webapp#99')
  })

  it('detects a commit', () => {
    const r = parseExternalLinkUrl('https://gitlab.com/acme/webapp/-/commit/deadbeef12345')
    assert.equal(r.provider, 'gitlab')
    assert.equal(r.kind, 'commit')
    assert.equal(r.ref.sha, 'deadbeef12345')
  })

  it('detects a self-hosted GitLab MR by keyword shape', () => {
    const r = parseExternalLinkUrl('https://git.internal.example.com/team/svc/-/merge_requests/5')
    assert.equal(r.provider, 'gitlab')
    assert.equal(r.kind, 'pull_request')
    assert.equal(r.ref.host, 'git.internal.example.com')
    assert.equal(r.ref.projectPath, 'team/svc')
  })
})

describe('parseExternalLinkUrl — Google Drive', () => {
  it('detects a Drive file URL', () => {
    const r = parseExternalLinkUrl('https://drive.google.com/file/d/1AbC_dEfG/view?usp=sharing', 'google_drive')
    assert.equal(r.provider, 'google_drive')
    assert.equal(r.kind, 'file')
    assert.equal(r.externalId, '1AbC_dEfG')
    assert.equal(r.ref.fileId, '1AbC_dEfG')
  })

  it('detects a Google Docs URL as a file', () => {
    const r = parseExternalLinkUrl('https://docs.google.com/document/d/XYZ123/edit')
    assert.equal(r.provider, 'google_drive')
    assert.equal(r.kind, 'file')
    assert.equal(r.externalId, 'XYZ123')
  })

  it('detects the ?id= open form', () => {
    const r = parseExternalLinkUrl('https://drive.google.com/open?id=FILE_9')
    assert.equal(r.provider, 'google_drive')
    assert.equal(r.kind, 'file')
    assert.equal(r.ref.fileId, 'FILE_9')
  })
})

describe('parseExternalLinkUrl — Dropbox', () => {
  it('detects a legacy /s/ file share and reads the filename', () => {
    const r = parseExternalLinkUrl('https://www.dropbox.com/s/abc123/Q3-report.pdf?dl=0')
    assert.equal(r.provider, 'dropbox')
    assert.equal(r.kind, 'file')
    assert.equal(r.title, 'Q3-report.pdf')
    assert.equal(r.ref.fileId, 'abc123')
    assert.equal(r.ref.sharedUrl, 'https://www.dropbox.com/s/abc123/Q3-report.pdf?dl=0')
  })

  it('detects a current /scl/fi/ file share and decodes the filename', () => {
    const r = parseExternalLinkUrl('https://www.dropbox.com/scl/fi/xyz789/Design%20Spec.fig?rlkey=k&dl=0')
    assert.equal(r.provider, 'dropbox')
    assert.equal(r.kind, 'file')
    assert.equal(r.title, 'Design Spec.fig')
    assert.equal(r.ref.fileId, 'xyz789')
  })

  it('treats a folder share as a plain dropbox link', () => {
    const r = parseExternalLinkUrl('https://www.dropbox.com/scl/fo/folderid/rlkey?dl=0')
    assert.equal(r.provider, 'dropbox')
    assert.equal(r.kind, 'link')
    assert.equal(r.externalId, null)
  })

  it('honours a dropbox hint on an unrecognised URL', () => {
    const r = parseExternalLinkUrl('https://example.com/x', 'dropbox')
    assert.equal(r.provider, 'dropbox')
    assert.equal(r.kind, 'link')
  })
})

describe('parseExternalLinkUrl — generic + hints', () => {
  it('treats an unknown URL as a plain link', () => {
    const r = parseExternalLinkUrl('https://example.com/some/page')
    assert.equal(r.provider, 'link')
    assert.equal(r.kind, 'link')
    assert.equal(r.externalId, null)
  })

  it('honours a provider hint only for the generic case', () => {
    const r = parseExternalLinkUrl('https://example.com/x', 'google_drive')
    assert.equal(r.provider, 'google_drive')
    assert.equal(r.kind, 'link')
  })

  it('lets a recognised URL win over a mismatched hint', () => {
    const r = parseExternalLinkUrl('https://github.com/acme/webapp/pull/1', 'link')
    assert.equal(r.provider, 'github')
    assert.equal(r.kind, 'pull_request')
  })

  it('rejects non-URLs via isHttpUrl', () => {
    assert.equal(isHttpUrl('not a url'), false)
    assert.equal(isHttpUrl('ftp://x/y'), false)
    assert.equal(isHttpUrl('https://github.com/a/b/pull/1'), true)
  })
})

// --- Service: CRUD + access + env-gated status ----------------------------

/** Minimal drizzle stand-in that records insert values and returns them back. */
function makeCaptureDb(selects: unknown[][]) {
  const queue = [...selects]
  const inserted: Array<Record<string, unknown>> = []
  const deletes: unknown[] = []
  const VERBS = ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'set', 'returning', 'onConflictDoNothing']
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
        return node([{ id: 'link-1', ...v }])
      },
    })),
    // `.set(v)` echoes the patched row back through `.returning()` so
    // update-then-return flows (recording attach) can assert the result.
    update: mock.fn(() => ({ set: (v: Record<string, unknown>) => node([{ id: 'link-1', ...v }]) })),
    delete: mock.fn(() => {
      deletes.push(true)
      return node([])
    }),
  } as any
  return { db, inserted, deletes }
}

function makeService(db: any) {
  return new TasksService(db, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any)
}

const CTX = [{ taskId: 't1', listId: 'l1', createdById: 'u-creator', workspaceId: 'w1' }]
const ADMIN = [{ role: 'workspace_admin' }]

describe('TasksService external links — CRUD + access', () => {
  it('persists a GitHub PR link with status null when no provider connection is configured', async () => {
    // selects: task ctx, membership, provider-connection (empty → unconfigured)
    const { db, inserted } = makeCaptureDb([CTX, ADMIN, []])
    const svc = makeService(db)

    const row = await svc.addExternalLink('t1', 'u1', {
      url: 'https://github.com/acme/webapp/pull/42',
      provider: 'github',
    })

    assert.equal(inserted.length, 1)
    assert.equal(inserted[0].provider, 'github')
    assert.equal(inserted[0].kind, 'pull_request')
    assert.equal(inserted[0].externalId, 'acme/webapp#42')
    assert.equal(inserted[0].status, null, 'status stays null when unconfigured (env-gated)')
    assert.equal(inserted[0].workspaceId, 'w1')
    assert.deepEqual((inserted[0].metadata as any).ref, { owner: 'acme', repo: 'webapp', number: '42' })
    assert.equal((row as any).status, null)
  })

  it('persists a Drive file link (unconfigured) with kind=file, status null', async () => {
    const { db, inserted } = makeCaptureDb([CTX, ADMIN, []])
    const svc = makeService(db)

    await svc.addExternalLink('t1', 'u1', {
      url: 'https://drive.google.com/file/d/FILE_1/view',
      provider: 'google_drive',
    })

    assert.equal(inserted[0].provider, 'google_drive')
    assert.equal(inserted[0].kind, 'file')
    assert.equal(inserted[0].externalId, 'FILE_1')
    assert.equal(inserted[0].status, null)
  })

  it('persists a Dropbox file link (unconfigured) with kind=file, status null', async () => {
    const { db, inserted } = makeCaptureDb([CTX, ADMIN, []])
    const svc = makeService(db)

    await svc.addExternalLink('t1', 'u1', {
      url: 'https://www.dropbox.com/s/abc123/spec.pdf?dl=0',
      provider: 'dropbox',
    })

    assert.equal(inserted[0].provider, 'dropbox')
    assert.equal(inserted[0].kind, 'file')
    assert.equal(inserted[0].externalId, 'abc123')
    assert.equal(inserted[0].status, null, 'status stays null when Dropbox is not connected (env-gated)')
    assert.equal(
      (inserted[0].metadata as any).ref.sharedUrl,
      'https://www.dropbox.com/s/abc123/spec.pdf?dl=0',
    )
  })

  it('persists a generic link without any provider-connection lookup', async () => {
    // Only task ctx + membership selects; no connection query for provider=link.
    const { db, inserted } = makeCaptureDb([CTX, ADMIN])
    const svc = makeService(db)

    await svc.addExternalLink('t1', 'u1', { url: 'https://example.com/spec' })

    assert.equal(inserted[0].provider, 'link')
    assert.equal(inserted[0].kind, 'link')
    assert.equal(db.select.mock.callCount(), 2, 'no connection lookup for a generic link')
  })

  it('rejects a non-http URL after the access check', async () => {
    const { db } = makeCaptureDb([CTX, ADMIN])
    const svc = makeService(db)
    await assert.rejects(
      () => svc.addExternalLink('t1', 'u1', { url: 'javascript:alert(1)' }),
      /valid http/i,
    )
  })

  it('denies a guest (access check)', async () => {
    const { db } = makeCaptureDb([CTX, [{ role: 'guest' }]])
    const svc = makeService(db)
    await assert.rejects(
      () => svc.addExternalLink('t1', 'guest-user', { url: 'https://github.com/a/b/pull/1' }),
      /guest/i,
    )
  })

  it('denies a non-member (access check)', async () => {
    const { db } = makeCaptureDb([CTX, []]) // no membership row
    const svc = makeService(db)
    await assert.rejects(
      () => svc.addExternalLink('t1', 'outsider', { url: 'https://github.com/a/b/pull/1' }),
      /workspace not found/i,
    )
  })

  it('lists links for a task', async () => {
    const links = [{ id: 'link-1', provider: 'github', kind: 'pull_request', url: 'u', status: 'open' }]
    const { db } = makeCaptureDb([CTX, ADMIN, links])
    const svc = makeService(db)
    const out = await svc.listExternalLinks('t1', 'u1')
    assert.deepEqual(out, links)
  })

  it('removes a link and returns ok', async () => {
    const { db, deletes } = makeCaptureDb([CTX, ADMIN])
    const svc = makeService(db)
    const out = await svc.removeExternalLink('t1', 'link-1', 'u1')
    assert.deepEqual(out, { ok: true })
    assert.equal(deletes.length, 1)
  })
})

// --- Meetings: create + persistence + not-connected 400 (§12.9) -----------
//
// The provider API is fully mocked (no live Zoom / Google calls). We assert
// the persisted task_external_links meeting row, that the task's due date
// seeds the meeting start_time, and the clean "connect {provider} first" 400
// when the provider isn't connected.

describe('TasksService meetings — Zoom / Google Meet', () => {
  it('creates a Zoom meeting and persists a meeting link with the due date as start_time', async () => {
    const future = new Date(Date.now() + 3_600_000)
    const conn = [{ id: 'conn-1', status: 'connected', accessToken: 'tok', refreshToken: null, tokenExpiresAt: future }]
    const task = [{ title: 'Design review', dueDate: new Date('2026-08-01T10:00:00Z') }]
    const { db, inserted } = makeCaptureDb([CTX, ADMIN, task, conn])
    const svc = makeService(db)

    const fetchMock = mock.method(
      globalThis,
      'fetch',
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            id: 88,
            join_url: 'https://zoom.us/j/88',
            topic: 'Design review',
            start_time: '2026-08-01T10:00:00Z',
          }),
        }) as any,
    )
    try {
      const row = await svc.createTaskMeeting('t1', 'u1', 'zoom')
      assert.equal(inserted.length, 1)
      assert.equal(inserted[0].provider, 'zoom')
      assert.equal(inserted[0].kind, 'meeting')
      assert.equal(inserted[0].url, 'https://zoom.us/j/88')
      assert.equal(inserted[0].externalId, '88')
      assert.equal(inserted[0].status, null)
      assert.equal((row as any).url, 'https://zoom.us/j/88')
      // Exactly one live call (no token refresh — the token is still fresh).
      assert.equal(fetchMock.mock.callCount(), 1)
      const [reqUrl, reqInit] = fetchMock.mock.calls[0].arguments as [string, RequestInit]
      assert.match(String(reqUrl), /users\/me\/meetings/)
      const sentBody = JSON.parse(String(reqInit.body))
      assert.equal(sentBody.start_time, '2026-08-01T10:00:00.000Z')
      assert.equal(sentBody.type, 2)
    } finally {
      fetchMock.mock.restore()
    }
  })

  it('creates a Google Meet meeting reusing the gcal connection', async () => {
    const future = new Date(Date.now() + 3_600_000)
    const conn = [{ id: 'conn-2', status: 'connected', accessToken: 'gtok', refreshToken: null, tokenExpiresAt: future }]
    const task = [{ title: 'Standup', dueDate: null }]
    const { db, inserted } = makeCaptureDb([CTX, ADMIN, task, conn])
    const svc = makeService(db)

    const fetchMock = mock.method(
      globalThis,
      'fetch',
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'evt1',
            hangoutLink: 'https://meet.google.com/abc-defg-hij',
            htmlLink: 'https://calendar.google.com/event',
          }),
        }) as any,
    )
    try {
      await svc.createTaskMeeting('t1', 'u1', 'google_meet')
      assert.equal(inserted[0].provider, 'google_meet')
      assert.equal(inserted[0].kind, 'meeting')
      assert.equal(inserted[0].url, 'https://meet.google.com/abc-defg-hij')
      const [reqUrl] = fetchMock.mock.calls[0].arguments as [string]
      assert.match(String(reqUrl), /conferenceDataVersion=1/)
    } finally {
      fetchMock.mock.restore()
    }
  })

  it('rejects with a clean "connect zoom first" 400 when the provider is not connected', async () => {
    const task = [{ title: 'X', dueDate: null }]
    const { db } = makeCaptureDb([CTX, ADMIN, task, []]) // empty connection lookup
    const svc = makeService(db)
    await assert.rejects(() => svc.createTaskMeeting('t1', 'u1', 'zoom'), /connect zoom first/i)
  })

  it('attaches a recording link to a meeting row', async () => {
    const meetingLink = [{ id: 'link-1', taskId: 't1', kind: 'meeting', metadata: { meeting: { id: '88' } } }]
    const { db, inserted: _i } = makeCaptureDb([CTX, ADMIN, meetingLink])
    void _i
    const svc = makeService(db)
    const updated = await svc.attachMeetingRecording('t1', 'link-1', 'u1', 'https://zoom.us/rec/xyz')
    assert.equal((updated as any).metadata.recordingUrl, 'https://zoom.us/rec/xyz')
  })

  it('rejects attaching a recording to a non-meeting link', async () => {
    const fileLink = [{ id: 'link-2', taskId: 't1', kind: 'file', metadata: {} }]
    const { db } = makeCaptureDb([CTX, ADMIN, fileLink])
    const svc = makeService(db)
    await assert.rejects(
      () => svc.attachMeetingRecording('t1', 'link-2', 'u1', 'https://x.com/rec'),
      /not a meeting/i,
    )
  })
})
