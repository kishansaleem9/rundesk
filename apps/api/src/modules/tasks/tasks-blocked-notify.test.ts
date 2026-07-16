import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { TasksService } from './tasks.service'

/**
 * §4.4 — adding a blocking dependency that leaves a task blocked must fire a
 * `task_blocked` notification to the blocked task's assignees + watchers,
 * excluding the actor, and must NOT fire when the blocker is already closed
 * (so the task isn't actually blocked).
 *
 * Two levels are covered:
 *   1. `notifyTaskBlocked` — recipient union/dedup/actor-exclusion + the
 *      open-blocker gate + the notification payload.
 *   2. `addDependency` wiring — the (blocked, blocker) selection per dependency
 *      type and the created/type guard.
 */

// A tiny drizzle stand-in: every chain node is a thenable that resolves to the
// next queued result, so we don't need to model each verb's exact position.
function makeDb(results: unknown[][]) {
  const queue = [...results]
  const VERBS = [
    'from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy',
    'values', 'onConflictDoNothing', 'onConflictDoUpdate', 'set', 'returning',
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

function makeService(db: any, notifications: any, realtime?: any) {
  const rt = realtime ?? { emitToTask: mock.fn(), emitToUser: mock.fn(), emitToWorkspace: mock.fn() }
  return new TasksService(
    db,
    rt as any,
    {} as any, // search
    {} as any, // automations
    {} as any, // webhooks
    {} as any, // slack
    notifications as any,
    {} as any, // r2
    {} as any, // calendarSync
  )
}

const WS = { workspaceId: 'w1', spaceId: 's1', projectId: 'p1' }

describe('TasksService.notifyTaskBlocked', () => {
  it('notifies the union of assignees + watchers, de-duped and minus the actor', async () => {
    const db = makeDb([
      [{ id: 'blocked-1', title: 'Blocked Task', listId: 'l1' }], // blockedTask
      [{ userId: 'actor' }, { userId: 'u2' }],                    // assignees
      [{ userId: 'u2' }, { userId: 'u3' }],                       // watchers
    ])
    const notifications = { create: mock.fn(async (_data: any) => ({})) }
    const svc = makeService(db, notifications)

    ;(svc as any).getOpenBlockers = async () => [{ id: 'blocker-1', status: 'in_progress', title: 'Blocker Task' }]
    ;(svc as any).resolveWorkspaceForList = async () => WS
    ;(svc as any).resolveWorkspaceName = async () => 'Acme'

    await (svc as any).notifyTaskBlocked('blocked-1', 'blocker-1', 'actor')

    // actor excluded, u2 de-duped across assignee+watcher → recipients {u2, u3}
    assert.equal(notifications.create.mock.callCount(), 2)
    const calls = notifications.create.mock.calls.map((c) => c.arguments[0] as any)
    assert.deepEqual(calls.map((c) => c.userId).sort(), ['u2', 'u3'])
    for (const payload of calls) {
      assert.equal(payload.type, 'task_blocked')
      assert.equal(payload.actorId, 'actor')
      assert.equal(payload.workspaceId, 'w1')
      assert.match(payload.title, /Blocked Task/)
      assert.match(payload.body, /Blocker Task/)
      assert.equal(payload.target.entityType, 'task')
      assert.equal(payload.target.entityId, 'blocked-1')
    }
  })

  it('does NOT notify when the blocker is not open (task not actually blocked)', async () => {
    const db = makeDb([])
    const notifications = { create: mock.fn(async (_data: any) => ({})) }
    const svc = makeService(db, notifications)

    // Blocker resolved/closed → getOpenBlockers omits it.
    ;(svc as any).getOpenBlockers = async () => []
    ;(svc as any).resolveWorkspaceForList = async () => WS
    ;(svc as any).resolveWorkspaceName = async () => 'Acme'

    await (svc as any).notifyTaskBlocked('blocked-1', 'blocker-1', 'actor')
    assert.equal(notifications.create.mock.callCount(), 0)
  })

  it('does NOT notify when the only assignee/watcher is the actor', async () => {
    const db = makeDb([
      [{ id: 'blocked-1', title: 'Blocked Task', listId: 'l1' }],
      [{ userId: 'actor' }], // assignees
      [{ userId: 'actor' }], // watchers
    ])
    const notifications = { create: mock.fn(async (_data: any) => ({})) }
    const svc = makeService(db, notifications)

    ;(svc as any).getOpenBlockers = async () => [{ id: 'blocker-1', status: 'todo', title: 'Blocker Task' }]
    ;(svc as any).resolveWorkspaceForList = async () => WS
    ;(svc as any).resolveWorkspaceName = async () => 'Acme'

    await (svc as any).notifyTaskBlocked('blocked-1', 'blocker-1', 'actor')
    assert.equal(notifications.create.mock.callCount(), 0)
  })
})

describe('TasksService.addDependency → blocked notification wiring', () => {
  // For a fresh blocking dependency, verifies the (blocked, blocker) pair passed
  // to notifyTaskBlocked and that non-blocking / no-op inserts skip it.
  async function run(type: 'blocks' | 'blocked_by' | 'related_to', created: unknown) {
    const db = makeDb([
      created ? [created] : [],   // insert dependency .returning()
      [{ id: 'act1' }],           // logActivity insert .returning()
    ])
    const notifications = { create: mock.fn(async (_data: any) => ({})) }
    const svc = makeService(db, notifications)
    ;(svc as any).hasBlockingPath = async () => false
    const spy = mock.fn(async (_blocked: string, _blocker: string, _actor: string) => {})
    ;(svc as any).notifyTaskBlocked = spy
    await svc.addDependency('X', 'Y', type, 'actor')
    return spy
  }

  it('blocks: X blocks Y → Y is the blocked task, X the blocker', async () => {
    const spy = await run('blocks', { id: 'dep1' })
    assert.equal(spy.mock.callCount(), 1)
    assert.deepEqual(spy.mock.calls[0].arguments, ['Y', 'X', 'actor'])
  })

  it('blocked_by: X blocked_by Y → X is the blocked task, Y the blocker', async () => {
    const spy = await run('blocked_by', { id: 'dep1' })
    assert.equal(spy.mock.callCount(), 1)
    assert.deepEqual(spy.mock.calls[0].arguments, ['X', 'Y', 'actor'])
  })

  it('related_to: never fires a blocked notification', async () => {
    const spy = await run('related_to', { id: 'dep1' })
    assert.equal(spy.mock.callCount(), 0)
  })

  it('no-op insert (dependency already existed) does not fire', async () => {
    const spy = await run('blocks', undefined)
    assert.equal(spy.mock.callCount(), 0)
  })
})
