import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { FoldersService } from './folders.service'

/**
 * §13.3 — deleting a folder (a container deletion) must emit a `folder.deleted`
 * audit row with the actor, resource id, and request IP, mirroring
 * space/project/list. Folder delete is a hard delete (projects survive via
 * ON DELETE SET NULL), so the name + owning workspace are resolved BEFORE the
 * delete so the audit row can still be written.
 */
function selectChain(rows: any[]) {
  const q = Promise.resolve(rows) as any
  q.from = () => q
  q.innerJoin = () => q
  q.where = () => q
  q.limit = () => q
  return q
}
function deleteChain() {
  const q = Promise.resolve([]) as any
  q.where = () => q
  return q
}

describe('FoldersService.remove — §13.3 audit event', () => {
  it('hard-deletes and logs folder.deleted with the actor + IP', async () => {
    const db = {
      select: mock.fn(() => selectChain([{ name: 'Sprints', workspaceId: 'w1' }])),
      delete: mock.fn(() => deleteChain()),
    } as any
    const security = { logAuditEvent: mock.fn(async () => undefined) } as any
    const svc = new FoldersService(db, security)

    const res = await svc.remove('s1', 'f1', 'actor-1', '198.51.100.22')

    assert.deepEqual(res, { ok: true })
    assert.equal(db.delete.mock.callCount(), 1, 'the folder row is deleted')
    assert.equal(security.logAuditEvent.mock.callCount(), 1, 'one audit row written')
    const e = security.logAuditEvent.mock.calls[0].arguments[0]
    assert.equal(e.action, 'folder.deleted')
    assert.equal(e.resourceType, 'folder')
    assert.equal(e.resourceId, 'f1')
    assert.equal(e.workspaceId, 'w1')
    assert.equal(e.actorId, 'actor-1')
    assert.equal(e.ipAddress, '198.51.100.22')
  })

  it('throws NotFound and never deletes when the folder does not exist', async () => {
    const db = {
      select: mock.fn(() => selectChain([])),
      delete: mock.fn(() => deleteChain()),
    } as any
    const security = { logAuditEvent: mock.fn(async () => undefined) } as any
    const svc = new FoldersService(db, security)

    await assert.rejects(() => svc.remove('s1', 'missing', 'actor-1'), /Folder not found/)
    assert.equal(db.delete.mock.callCount(), 0, 'no delete when the folder is absent')
    assert.equal(security.logAuditEvent.mock.callCount(), 0)
  })

  it('does not audit an internal (no-actor) delete', async () => {
    const db = {
      select: mock.fn(() => selectChain([{ name: 'X', workspaceId: 'w1' }])),
      delete: mock.fn(() => deleteChain()),
    } as any
    const security = { logAuditEvent: mock.fn(async () => undefined) } as any
    const svc = new FoldersService(db, security)

    await svc.remove('s1', 'f1')
    assert.equal(db.delete.mock.callCount(), 1)
    assert.equal(security.logAuditEvent.mock.callCount(), 0, 'no actor → no audit row')
  })
})
