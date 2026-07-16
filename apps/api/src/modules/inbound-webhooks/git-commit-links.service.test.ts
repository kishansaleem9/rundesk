import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { GitCommitLinksService } from './git-commit-links.service'

/**
 * §12.8 — push → commit-link service. DB fully mocked; asserts the env-gate on
 * the provider connection, idempotency, and the persisted commit-link shape.
 */

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

/** Chainable drizzle stand-in: a queue of select results + captured inserts. */
function makeDb(selectResults: unknown[][]) {
  const queue = [...selectResults]
  const inserted: Array<Record<string, unknown>> = []
  const VERBS = ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy']
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
  } as any
  return { db, inserted }
}

function githubPush(message: string) {
  return {
    repository: { full_name: 'acme/webapp' },
    commits: [
      {
        id: 'abcdef1234567890',
        message,
        url: 'https://github.com/acme/webapp/commit/abcdef1234567890',
        author: { name: 'Dev' },
      },
    ],
  }
}

describe('GitCommitLinksService.ingestPush', () => {
  it('auto-links a commit to a referenced task when the workspace has GitHub connected', async () => {
    // selects: [resolveWorkspace, isConnected, existing-link-check(empty)]
    const { db, inserted } = makeDb([[{ workspaceId: 'w1' }], [{ status: 'connected' }], []])
    const svc = new GitCommitLinksService(db)

    const summary = await svc.ingestPush('github', githubPush(`fix login RD-${UUID}`))

    assert.equal(summary.commitsScanned, 1)
    assert.equal(summary.referencesFound, 1)
    assert.equal(summary.linked, 1)
    assert.equal(summary.skippedNoConnection, 0)
    assert.equal(inserted.length, 1)
    assert.equal(inserted[0].taskId, UUID)
    assert.equal(inserted[0].workspaceId, 'w1')
    assert.equal(inserted[0].provider, 'github')
    assert.equal(inserted[0].kind, 'commit')
    assert.equal(inserted[0].externalId, 'acme/webapp@abcdef1234567890')
    assert.equal(inserted[0].url, 'https://github.com/acme/webapp/commit/abcdef1234567890')
    assert.equal((inserted[0].metadata as any).source, 'push_webhook')
    assert.equal((inserted[0].metadata as any).autoLinked, true)
    assert.deepEqual((inserted[0].metadata as any).ref, { owner: 'acme', repo: 'webapp', sha: 'abcdef1234567890' })
    assert.equal(inserted[0].createdById, null)
  })

  it('is idempotent: does not double-link a commit already linked to the task', async () => {
    // existing-link-check returns a row → skip insert
    const { db, inserted } = makeDb([[{ workspaceId: 'w1' }], [{ status: 'connected' }], [{ id: 'existing' }]])
    const svc = new GitCommitLinksService(db)

    const summary = await svc.ingestPush('github', githubPush(`redo RD-${UUID}`))
    assert.equal(summary.linked, 0)
    assert.equal(summary.skippedExisting, 1)
    assert.equal(inserted.length, 0)
  })

  it('env-gate: skips linking when the workspace has no GitHub connection', async () => {
    // isConnected returns [] → not connected; no existing-check, no insert
    const { db, inserted } = makeDb([[{ workspaceId: 'w1' }], []])
    const svc = new GitCommitLinksService(db)

    const summary = await svc.ingestPush('github', githubPush(`fix RD-${UUID}`))
    assert.equal(summary.linked, 0)
    assert.equal(summary.skippedNoConnection, 1)
    assert.equal(inserted.length, 0)
  })

  it('skips a reference whose task cannot be resolved to a workspace', async () => {
    const { db, inserted } = makeDb([[]]) // resolveWorkspace → empty
    const svc = new GitCommitLinksService(db)

    const summary = await svc.ingestPush('github', githubPush(`fix #${UUID}`))
    assert.equal(summary.skippedUnknownTask, 1)
    assert.equal(summary.linked, 0)
    assert.equal(inserted.length, 0)
  })

  it('scans commits with no task reference without linking anything', async () => {
    const { db, inserted } = makeDb([])
    const svc = new GitCommitLinksService(db)

    const summary = await svc.ingestPush('github', githubPush('chore: bump deps'))
    assert.equal(summary.commitsScanned, 1)
    assert.equal(summary.referencesFound, 0)
    assert.equal(summary.linked, 0)
    assert.equal(inserted.length, 0)
  })
})
