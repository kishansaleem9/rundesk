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
    update: mock.fn(() => node([])),
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
