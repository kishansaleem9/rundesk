import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { FoldersService } from './folders.service'

/**
 * §13.3/§13.4 — deleting a folder ARCHIVES it (soft delete) so it can be
 * restored from the workspace Trash, and emits a `folder.deleted` audit row
 * with the actor, resource id and request IP (mirroring space/project/list).
 *
 * Folders used to be hard-deleted, which made them the only container that
 * could never be recovered; these tests pin the soft-delete contract so that
 * regression can't come back.
 */
function selectChain(rows: any[]) {
  const q = Promise.resolve(rows) as any
  q.from = () => q
  q.innerJoin = () => q
  q.where = () => q
  q.limit = () => q
  return q
}
/** Captures the payload passed to `.set()` so the archive stamp can be asserted. */
function updateChain(captured: { set?: any }) {
  const q = Promise.resolve([]) as any
  q.set = (payload: any) => {
    captured.set = payload
    return q
  }
  q.where = () => q
  return q
}

describe('FoldersService.remove — soft delete + §13.3 audit event', () => {
  it('archives the folder (never hard-deletes) and stamps who/when', async () => {
    const captured: { set?: any } = {}
    const db = {
      select: mock.fn(() => selectChain([{ name: 'Sprints', workspaceId: 'w1' }])),
      update: mock.fn(() => updateChain(captured)),
      delete: mock.fn(() => ({ where: () => Promise.resolve([]) })),
    } as any
    const security = { logAuditEvent: mock.fn(async () => undefined) } as any
    const svc = new FoldersService(db, security)
    // The container rule is its own concern (below, and the e2e suite
    // `folder-change-rule`); this test is about the soft delete.
    const asked: string[] = []
    ;(svc as any).assertMayChange = async (_s: string, _f: string, _a: string, action: string) => { asked.push(action) }

    const res = await svc.remove('s1', 'f1', 'actor-1', '198.51.100.22')
    assert.deepEqual(asked, ['delete'], 'deleting asks the container rule at its delete level (Full edit)')

    assert.deepEqual(res, { ok: true })
    assert.equal(db.update.mock.callCount(), 1, 'the folder row is archived')
    assert.equal(db.delete.mock.callCount(), 0, 'the row must NOT be hard-deleted — it has to stay restorable')
    assert.equal(captured.set.isArchived, true)
    assert.equal(captured.set.archivedById, 'actor-1', 'records who deleted it (Trash "Deleted by")')
    assert.ok(captured.set.archivedAt instanceof Date, 'records when it was deleted (Trash "Deleted on")')

    assert.equal(security.logAuditEvent.mock.callCount(), 1, 'one audit row written')
    const e = security.logAuditEvent.mock.calls[0].arguments[0]
    assert.equal(e.action, 'folder.deleted')
    assert.equal(e.resourceType, 'folder')
    assert.equal(e.resourceId, 'f1')
    assert.equal(e.workspaceId, 'w1')
    assert.equal(e.actorId, 'actor-1')
    assert.equal(e.ipAddress, '198.51.100.22')
  })

  it('throws NotFound and never archives when the folder does not exist', async () => {
    const captured: { set?: any } = {}
    const db = {
      select: mock.fn(() => selectChain([])),
      update: mock.fn(() => updateChain(captured)),
    } as any
    const security = { logAuditEvent: mock.fn(async () => undefined) } as any
    const svc = new FoldersService(db, security)

    await assert.rejects(() => svc.remove('s1', 'missing', 'actor-1'), /Folder not found/)
    assert.equal(db.update.mock.callCount(), 0, 'no archive when the folder is absent')
    assert.equal(security.logAuditEvent.mock.callCount(), 0)
  })

  it('does not audit an internal (no-actor) delete, and leaves archivedById null', async () => {
    const captured: { set?: any } = {}
    const db = {
      select: mock.fn(() => selectChain([{ name: 'X', workspaceId: 'w1' }])),
      update: mock.fn(() => updateChain(captured)),
    } as any
    const security = { logAuditEvent: mock.fn(async () => undefined) } as any
    const svc = new FoldersService(db, security)

    await svc.remove('s1', 'f1')
    assert.equal(db.update.mock.callCount(), 1)
    assert.equal(captured.set.archivedById, null, 'no actor → unknown deleter')
    assert.equal(security.logAuditEvent.mock.callCount(), 0, 'no actor → no audit row')
  })
})

describe('FoldersService — changing a folder asks the container rule (found-28-sep/folders-changed-by-any-reader)', () => {
  it('update asks it at its manage level before writing, and a refusal writes nothing', async () => {
    const db = { select: mock.fn(() => selectChain([])), update: mock.fn(() => updateChain({})) } as any
    const svc = new FoldersService(db, {} as any)
    const asked: string[] = []
    ;(svc as any).assertMayChange = async (_s: string, _f: string, _a: string, action: string) => {
      asked.push(action)
      throw new Error('refused')
    }
    await assert.rejects(() => svc.update('s1', 'f1', { color: '#fff' }, 'reader-1'), /refused/)
    assert.deepEqual(asked, ['manage'])
    assert.equal(db.update.mock.callCount(), 0, 'nothing is written for a refused change')
  })

  it('remove refused by the rule archives nothing and audits nothing', async () => {
    const db = { select: mock.fn(() => selectChain([{ name: 'Sprints', workspaceId: 'w1' }])), update: mock.fn(() => updateChain({})) } as any
    const security = { logAuditEvent: mock.fn(async () => undefined) } as any
    const svc = new FoldersService(db, security)
    ;(svc as any).assertMayChange = async () => { throw new Error('refused') }
    await assert.rejects(() => svc.remove('s1', 'f1', 'reader-1'), /refused/)
    assert.equal(db.update.mock.callCount(), 0)
    assert.equal(security.logAuditEvent.mock.callCount(), 0)
  })
})
