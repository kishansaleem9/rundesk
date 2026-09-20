import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { SpacesService } from './spaces.service'

/**
 * §13.3 — archiving a Space (a container deletion) must emit a `space.deleted`
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

describe('SpacesService.deleteSpace — §13.3 audit event', () => {
  it('archives and logs space.deleted with the actor + IP', async () => {
    const db = { update: mock.fn(() => updateChain()) } as any
    const security = { logAuditEvent: mock.fn(async () => undefined) } as any
    // §V2-06 added ListsService for preset seeding and PlansService for the
    // `[07:20]` ClickApps plan gate; deleteSpace touches neither, so null
    // stand-ins say that rather than pretending to be them.
    const svc = new SpacesService(db, security, null as any, null as any) as any
    svc.assertManageable = mock.fn(async () => ({ workspaceId: 'w1', name: 'Product', createdById: 'u1' }))

    await svc.deleteSpace('s1', 'actor-1', '198.51.100.22')

    assert.equal(db.update.mock.callCount(), 1, 'the space is archived')
    assert.equal(security.logAuditEvent.mock.callCount(), 1, 'one audit row written')
    const e = security.logAuditEvent.mock.calls[0].arguments[0]
    assert.equal(e.action, 'space.deleted')
    assert.equal(e.resourceType, 'space')
    assert.equal(e.resourceId, 's1')
    assert.equal(e.workspaceId, 'w1')
    assert.equal(e.actorId, 'actor-1')
    assert.equal(e.ipAddress, '198.51.100.22')
  })

  it('does not audit an internal (no-actor) archive', async () => {
    const db = { update: mock.fn(() => updateChain()) } as any
    const security = { logAuditEvent: mock.fn(async () => undefined) } as any
    const svc = new SpacesService(db, security, null as any, null as any)

    await svc.deleteSpace('s1')

    assert.equal(db.update.mock.callCount(), 1)
    assert.equal(security.logAuditEvent.mock.callCount(), 0, 'no actor → no audit row')
  })
})
