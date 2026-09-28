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

describe('ListsService.deleteList — §13.3 audit event', () => {
  it('archives and logs list.deleted with the actor + IP', async () => {
    const db = { update: mock.fn(() => updateChain()) } as any
    const security = { logAuditEvent: mock.fn(async () => undefined) } as any
    const svc = new ListsService(db, security, {} as any) as any
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

/**
 * DELETING A LIST SOMEBODY ELSE MADE ASKS `list.delete`
 * (`role-editor-offers-unenforced-permissions`): the service hands the rule its
 * permissions, and the rule asks that key of them. A manager, whose level is
 * their role, in a space they belong to.
 */
describe('ListsService.deleteList — the list.delete key', () => {
  for (const held of [true, false]) {
    it(held ? 'archives a list somebody else made for a holder of list.delete' : 'archives nothing for one without it', async () => {
      const db = queueDb([
        [{ createdById: 'maker', workspaceId: 'w1', name: 'Sprint 4', spaceId: 's1', projectId: 'p1', folderId: null }],
        [{ workspaceId: 'w1', defaultPermission: 'admin' }], // the level: the space
        [{ role: 'manager' }], // the level: a manager's is Full edit
        [{ role: 'manager' }], // the rule: who asks
        [{ userId: 'mgr' }], // a manager's own space
      ])
      const roles = rolesThatSay(held)
      const svc = new ListsService(db, { logAuditEvent: mock.fn(async () => undefined) } as any, roles as any)
      const done = await svc.deleteList('l1', 'mgr').then(() => true, (e) => String(e?.message))
      assert.deepEqual(roles.asked, ['list.delete'], 'the rule asks list.delete of the service’s permissions')
      assert.equal(done, held ? true : 'Only the creator, or someone granted "Delete lists", can delete this list')
      assert.equal(db.update.mock.callCount(), held ? 1 : 0)
    })
  }
})
