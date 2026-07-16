import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { TasksService } from './tasks.service'

/**
 * §3.3 Delete Items — a workspace `manager` (not workspace_admin/super_admin)
 * may only archive/delete a task whose Space they belong to (space_members).
 * Admins/super_admins keep delete-any; members are already limited to their own
 * tasks by assertTaskWriteAccess, which the DELETE path runs first.
 *
 * The gate lives in a dedicated `assertManagerDeleteScope` so a manager's
 * non-delete writes stay unrestricted — these tests target it directly plus the
 * `deleteTask` wiring, using the repo's queued-thenable Drizzle stand-in.
 */
function makeDb(results: unknown[][]) {
  const queue = [...results]
  const VERBS = [
    'from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy',
    'values', 'onConflictDoNothing', 'set', 'returning',
  ]
  const node = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as any
    for (const v of VERBS) p[v] = () => p
    return p
  }
  const next = () => node(queue.shift() ?? [])
  return {
    select: mock.fn(() => next()),
    insert: mock.fn(() => next()),
    update: mock.fn(() => next()),
    delete: mock.fn(() => next()),
  } as any
}

function makeService(db: any) {
  return new TasksService(
    db,
    { emitToTask: mock.fn(), emitToList: mock.fn(), emitToUser: mock.fn(), emitToWorkspace: mock.fn() } as any,
    {} as any, // search
    {} as any, // automations
    {} as any, // webhooks
    {} as any, // slack
    {} as any, // notifications
    {} as any, // r2
    { deleteEverywhere: mock.fn(async () => undefined) } as any, // calendarSync
  )
}

const CTX = () => [{ spaceId: 's1', workspaceId: 'w1' }]

describe('TasksService.assertManagerDeleteScope (§3.3)', () => {
  it('rejects a manager deleting a task in a space they do NOT belong to', async () => {
    const db = makeDb([
      CTX(),
      [{ role: 'manager' }],
      [], // space_members lookup → not a member
    ])
    const svc = makeService(db)
    await assert.rejects(
      () => (svc as any).assertManagerDeleteScope('t1', 'mgr'),
      /Managers can only delete tasks in their own spaces/,
    )
  })

  it('allows a manager deleting a task in a space they belong to', async () => {
    const db = makeDb([
      CTX(),
      [{ role: 'manager' }],
      [{ userId: 'mgr' }], // space_members lookup → is a member
    ])
    const svc = makeService(db)
    await (svc as any).assertManagerDeleteScope('t1', 'mgr') // resolves, no throw
    assert.equal(db.select.mock.callCount(), 3, 'checks task ctx, role, then space membership')
  })

  it('lets workspace_admin delete anywhere (never checks space membership)', async () => {
    const db = makeDb([CTX(), [{ role: 'workspace_admin' }]])
    const svc = makeService(db)
    await (svc as any).assertManagerDeleteScope('t1', 'admin')
    assert.equal(db.select.mock.callCount(), 2, 'no space_members query for admins')
  })

  it('lets super_admin delete anywhere', async () => {
    const db = makeDb([CTX(), [{ role: 'super_admin' }]])
    const svc = makeService(db)
    await (svc as any).assertManagerDeleteScope('t1', 'root')
    assert.equal(db.select.mock.callCount(), 2)
  })

  it('does not further restrict plain members (handled by write-access check)', async () => {
    const db = makeDb([CTX(), [{ role: 'member' }]])
    const svc = makeService(db)
    await (svc as any).assertManagerDeleteScope('t1', 'u1')
    assert.equal(db.select.mock.callCount(), 2, 'no space_members query for members')
  })

  it('throws NotFound when the task does not exist', async () => {
    const db = makeDb([[]]) // ctx lookup empty
    const svc = makeService(db)
    await assert.rejects(() => (svc as any).assertManagerDeleteScope('t1', 'x'), /Task not found/)
  })
})

describe('TasksService.deleteTask wires the manager space gate', () => {
  it('blocks an out-of-space manager before any archive happens', async () => {
    // write-access passes (managers are privileged there); the new gate rejects.
    const db = makeDb([
      CTX(),
      [{ role: 'manager' }],
      [], // not a space member
    ])
    const svc = makeService(db)
    ;(svc as any).assertTaskWriteAccess = mock.fn(async () => ({
      taskId: 't1',
      listId: 'l1',
      createdById: 'someone',
      workspaceId: 'w1',
    }))

    await assert.rejects(() => svc.deleteTask('t1', 'mgr'), /own spaces/)
    // update() (the archive) must never run once the gate rejects.
    assert.equal(db.update.mock.callCount(), 0)
  })
})
