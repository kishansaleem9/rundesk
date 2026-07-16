import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getTableName } from 'drizzle-orm'
import { KnowledgeIndexerService } from './knowledge-indexer.service'
import { EmbeddingService } from './embedding.service'
import { contentHash, DEFAULT_EMBED_DIM } from './embedding'

/**
 * §15.1 indexer. Verifies the embed-and-upsert-by-source flow: it embeds
 * changed content, skips content whose hash + dim are unchanged, and drops
 * empty comments. Uses the deterministic local embedder (no API key) and a
 * table-keyed DB mock that also captures inserts.
 */

const localEmbeddings = new EmbeddingService({ get: () => undefined } as any)
const D = DEFAULT_EMBED_DIM

// Table-keyed select mock (like search.service.test.ts) plus an insert capture
// so we can assert exactly which sources were (re)embedded.
function makeIndexerDb(tableRows: Record<string, unknown[]>) {
  const inserts: any[] = []
  const chain = (): any => {
    let rows: unknown[] = []
    const c: any = {
      from: (t: unknown) => {
        rows = tableRows[getTableName(t as never)] ?? []
        return c
      },
      where: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      orderBy: () => c,
      limit: () => c,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    }
    return c
  }
  const db: any = {
    select: () => chain(),
    insert: () => ({
      values: (vals: any) => ({
        onConflictDoUpdate: async () => {
          inserts.push(vals)
        },
      }),
    }),
  }
  return { db, inserts }
}

// A workspace with one task, one doc, one real comment, and one empty comment.
function baseTables() {
  return {
    tasks: [{ id: 't1', title: 'Fix login', description: 'timeout on mobile', listId: 'l1', spaceId: 's1', projectId: 'p1' }],
    docs: [{ id: 'd1', title: 'Onboarding', plaintext: 'welcome to the team' }],
    task_comments: [
      { id: 'c1', body: 'looks good to me', taskId: 't1', taskTitle: 'Fix login', listId: 'l1', spaceId: 's1', projectId: 'p1' },
      { id: 'c2', body: '   ', taskId: 't1', taskTitle: 'Fix login', listId: 'l1', spaceId: 's1', projectId: 'p1' },
    ],
  }
}

describe('KnowledgeIndexerService.collectSources (§15.1)', () => {
  it('collects tasks, docs and non-empty comments with citation urls', async () => {
    const { db } = makeIndexerDb(baseTables())
    const svc = new KnowledgeIndexerService(db, localEmbeddings)
    const items = await svc.collectSources('w1')
    const byType = (t: string) => items.filter((i) => i.sourceType === t)
    assert.equal(byType('task').length, 1)
    assert.equal(byType('doc').length, 1)
    assert.equal(byType('comment').length, 1) // empty-body comment dropped
    assert.equal(byType('task')[0].url, '/app/w1/s1/p1/l1?task=t1')
    assert.equal(byType('doc')[0].url, '/app/w1/docs?doc=d1')
    assert.equal(byType('comment')[0].url, '/app/w1/s1/p1/l1?task=t1')
    assert.equal(byType('comment')[0].title, 'Comment on Fix login')
    assert.equal(byType('task')[0].text, 'Fix login\ntimeout on mobile')
  })
})

describe('KnowledgeIndexerService.indexWorkspaceContent (§15.1)', () => {
  it('embeds every source on a cold workspace (no existing rows)', async () => {
    const { db, inserts } = makeIndexerDb({ ...baseTables(), knowledge_embeddings: [] })
    const svc = new KnowledgeIndexerService(db, localEmbeddings)
    const res = await svc.indexWorkspaceContent('w1')
    assert.deepEqual(res, { total: 3, indexed: 3, skipped: 0 })
    assert.equal(inserts.length, 3)
    // Vectors are stored at the embedder's dimension; the source key is upserted.
    for (const row of inserts) {
      assert.equal(row.dim, D)
      assert.equal(row.embedding.length, D)
      assert.equal(row.workspaceId, 'w1')
    }
    assert.ok(inserts.some((r) => r.sourceType === 'task' && r.sourceId === 't1'))
    assert.ok(inserts.some((r) => r.sourceType === 'comment' && r.sourceId === 'c1'))
  })

  it('skips sources whose content hash + dim are unchanged', async () => {
    const existing = [
      { sourceType: 'task', sourceId: 't1', contentHash: contentHash('Fix login\ntimeout on mobile'), dim: D },
      { sourceType: 'doc', sourceId: 'd1', contentHash: contentHash('Onboarding\nwelcome to the team'), dim: D },
      { sourceType: 'comment', sourceId: 'c1', contentHash: contentHash('looks good to me'), dim: D },
    ]
    const { db, inserts } = makeIndexerDb({ ...baseTables(), knowledge_embeddings: existing })
    const svc = new KnowledgeIndexerService(db, localEmbeddings)
    const res = await svc.indexWorkspaceContent('w1')
    assert.deepEqual(res, { total: 3, indexed: 0, skipped: 3 }, 'all unchanged → nothing re-embedded')
    assert.equal(inserts.length, 0)
  })

  it('re-embeds a source whose content changed (stale hash)', async () => {
    const existing = [
      { sourceType: 'task', sourceId: 't1', contentHash: 'stale-hash', dim: D },
      { sourceType: 'doc', sourceId: 'd1', contentHash: contentHash('Onboarding\nwelcome to the team'), dim: D },
      { sourceType: 'comment', sourceId: 'c1', contentHash: contentHash('looks good to me'), dim: D },
    ]
    const { db, inserts } = makeIndexerDb({ ...baseTables(), knowledge_embeddings: existing })
    const svc = new KnowledgeIndexerService(db, localEmbeddings)
    const res = await svc.indexWorkspaceContent('w1')
    assert.deepEqual(res, { total: 3, indexed: 1, skipped: 2 })
    assert.equal(inserts.length, 1)
    assert.equal(inserts[0].sourceId, 't1')
  })

  it('re-embeds when the stored dim differs from the current embedder (embedder switch)', async () => {
    const existing = [
      { sourceType: 'task', sourceId: 't1', contentHash: contentHash('Fix login\ntimeout on mobile'), dim: 1536 },
      { sourceType: 'doc', sourceId: 'd1', contentHash: contentHash('Onboarding\nwelcome to the team'), dim: D },
      { sourceType: 'comment', sourceId: 'c1', contentHash: contentHash('looks good to me'), dim: D },
    ]
    const { db, inserts } = makeIndexerDb({ ...baseTables(), knowledge_embeddings: existing })
    const svc = new KnowledgeIndexerService(db, localEmbeddings)
    const res = await svc.indexWorkspaceContent('w1')
    assert.equal(res.indexed, 1, 'the dim-mismatched task is re-embedded')
    assert.equal(inserts[0].sourceId, 't1')
    assert.equal(inserts[0].dim, D)
  })
})
