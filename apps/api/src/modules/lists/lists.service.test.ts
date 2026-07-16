import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ListsService } from './lists.service'

/**
 * §13.3 — archiving a List (a container deletion) must emit a `list.deleted`
 * audit row with the actor, resource id, and request IP. The manage-check is
 * covered by the container-access permission tests; here we assert the audit
 * wiring off a chainable update stub.
 */
function updateChain() {
  const q = Promise.resolve([]) as any
  q.set = () => q
  q.where = () => q
  return q
}

describe('ListsService.deleteList — §13.3 audit event', () => {
  it('archives and logs list.deleted with the actor + IP', async () => {
    const db = { update: mock.fn(() => updateChain()) } as any
    const security = { logAuditEvent: mock.fn(async () => undefined) } as any
    const svc = new ListsService(db, security) as any
    svc.assertManageable = mock.fn(async () => ({ workspaceId: 'w1', name: 'Sprint 4', createdById: 'u1' }))

    await svc.deleteList('l1', 'actor-1', '198.51.100.33')

    assert.equal(db.update.mock.callCount(), 1, 'the list is archived')
    assert.equal(security.logAuditEvent.mock.callCount(), 1, 'one audit row written')
    const e = security.logAuditEvent.mock.calls[0].arguments[0]
    assert.equal(e.action, 'list.deleted')
    assert.equal(e.resourceType, 'list')
    assert.equal(e.resourceId, 'l1')
    assert.equal(e.workspaceId, 'w1')
    assert.equal(e.actorId, 'actor-1')
    assert.equal(e.ipAddress, '198.51.100.33')
  })
})
