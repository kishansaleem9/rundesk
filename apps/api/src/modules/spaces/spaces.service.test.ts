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

/**
 * A Drizzle stand-in answering each `select()` with the next rows of `results`,
 * whatever it chains; `update()` answers nothing.
 */
function queueDb(results: unknown[][]) {
  const queue = [...results]
  const chain = (rows: unknown[]) => {
    const q = Promise.resolve(rows) as any
    for (const v of ['from', 'innerJoin', 'leftJoin', 'where', 'limit', 'orderBy', 'set', 'returning']) q[v] = () => q
    return q
  }
  return { select: mock.fn(() => chain(queue.shift() ?? [])), update: mock.fn(() => chain([])) } as any
}

/** Holds the delete key or not, and records each key it is asked. */
const rolesThatSay = (held: boolean) => {
  const asked: string[] = []
  return { asked, hasPermission: async (_w: string, _u: string, key: string) => { asked.push(key); return held } }
}

describe('SpacesService.deleteSpace — §13.3 audit event', () => {
  it('archives and logs space.deleted with the actor + IP', async () => {
    const db = { update: mock.fn(() => updateChain()) } as any
    const security = { logAuditEvent: mock.fn(async () => undefined) } as any
    // §V2-06 added ListsService for preset seeding and PlansService for the
    // `[07:20]` ClickApps plan gate; deleteSpace touches neither, so null
    // stand-ins say that rather than pretending to be them. Its permissions
    // are the rule's, which is stubbed here.
    const svc = new SpacesService(db, security, null as any, null as any, null as any) as any
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
    const svc = new SpacesService(db, security, null as any, null as any, null as any)

    await svc.deleteSpace('s1')

    assert.equal(db.update.mock.callCount(), 1)
    assert.equal(security.logAuditEvent.mock.callCount(), 0, 'no actor → no audit row')
  })
})

/**
 * DELETING A SPACE SOMEBODY ELSE MADE ASKS `space.delete`, where it had asked
 * the admin role (`adminOnlyDelete`): an admin holds the key by default, and a
 * custom role can grant it. A manager in a space they belong to, so only the
 * key decides.
 */
describe('SpacesService.deleteSpace — the space.delete key', () => {
  for (const held of [true, false]) {
    it(held ? 'archives a space somebody else made for a holder of space.delete' : 'archives nothing for one without it', async () => {
      const db = queueDb([
        [{ id: 's1', workspaceId: 'w1', name: 'Product', createdById: 'maker' }],
        [{ workspaceId: 'w1', defaultPermission: 'admin' }], // the level: the space
        [{ role: 'manager' }], // the level: a manager's is Full edit
        [{ role: 'manager' }], // the rule: who asks
        [{ userId: 'mgr' }], // a manager's own space
      ])
      const roles = rolesThatSay(held)
      const svc = new SpacesService(db, { logAuditEvent: mock.fn(async () => undefined) } as any, null as any, null as any, roles as any)
      const done = await svc.deleteSpace('s1', 'mgr').then(() => true, (e) => String(e?.message))
      assert.deepEqual(roles.asked, ['space.delete'], 'the rule asks space.delete of the service’s permissions')
      assert.equal(done, held ? true : 'Only the creator, or someone granted "Delete spaces", can delete this space')
      assert.equal(db.update.mock.callCount(), held ? 1 : 0)
    })
  }
})
