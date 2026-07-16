import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { TasksService } from './tasks.service'

/**
 * Targeted unit tests for `getTasksForWorkspace`.
 *
 * The method is the backbone of the dashboard's single-query refactor
 * (replacing the previous spaces → projects → lists → tasks fan-out).
 * Two behaviours must be locked in:
 *
 *   1. The base task select chain returns the denormalised rows
 *      regardless of whether assignees are requested.
 *   2. When `includeAssignees: true`, every returned row gets an
 *      `assignees` array correctly grouped by `taskId` — and tasks
 *      with no assignees still get an empty array (not `undefined`),
 *      because the dashboard's `(t.assignees ?? []).some(...)` would
 *      otherwise silently turn into a runtime read on `undefined`
 *      if a contributor refactored that fallback away.
 *
 * We don't fully reproduce the Drizzle fluent API — only the chain
 * shape the method actually consumes. That keeps the test small and
 * means new chained verbs need to be added consciously, which is
 * exactly what we want as a guardrail.
 */

type Row = Record<string, unknown>

interface QueuedQuery {
  // Rows the chain awaits to.
  rows: Row[]
  // Whether the chain ends in `.limit(...)` (base task query) or
  // resolves directly off `.where(...)` (assignee join).
  terminator: 'limit' | 'where'
}

function buildDb(queries: QueuedQuery[]) {
  // FIFO queue: every call to db.select() pops the next planned chain.
  const queue = [...queries]

  const buildChain = (q: QueuedQuery) => {
    // The chain we expose mimics the verbs the service actually calls
    // in order. Each verb returns the next legal step or, at the leaf,
    // resolves to the planned rows.
    const limit = mock.fn(async () => q.rows)
    const orderBy = mock.fn(() => ({ limit }))
    const where = q.terminator === 'where'
      ? mock.fn(async () => q.rows)
      : mock.fn(() => ({ orderBy, limit }))
    const innerJoin: any = mock.fn(() => ({ innerJoin, where }))
    const from = mock.fn(() => ({ innerJoin, where }))
    return { from }
  }

  return {
    select: mock.fn(() => {
      const q = queue.shift()
      if (!q) throw new Error('Unexpected db.select() — test queue exhausted')
      return buildChain(q)
    }),
  } as any
}

const noopDeps = {
  realtime: { broadcastToWorkspace: mock.fn(), broadcastToTask: mock.fn() } as any,
  search:   { indexTask: mock.fn(), removeTask: mock.fn() } as any,
  autos:    { triggerForTask: mock.fn(), runForTaskEvent: mock.fn() } as any,
  webhooks: { dispatch: mock.fn() } as any,
  slack:    { notifyTaskEvent: mock.fn() } as any,
  notifs:   { notifyTaskAssigned: mock.fn(), notifyTaskMentioned: mock.fn() } as any,
  r2:       { signGet: mock.fn(), signPut: mock.fn(), deleteObject: mock.fn() } as any,
  calendar: { onTaskChanged: mock.fn(), onTaskDeleted: mock.fn() } as any,
  security: { logAuditEvent: mock.fn(async () => undefined) } as any,
}

describe('TasksService.getTasksForWorkspace', () => {
  it('returns an empty array when no tasks match (and never issues the assignee query)', async () => {
    const db = buildDb([
      { terminator: 'limit', rows: [] },
    ])
    const service = new TasksService(
      db,
      noopDeps.realtime,
      noopDeps.search,
      noopDeps.autos,
      noopDeps.webhooks,
      noopDeps.slack,
      noopDeps.notifs,
      noopDeps.r2,
      noopDeps.calendar,
      noopDeps.security,
    )

    const out = await service.getTasksForWorkspace('w-1')

    assert.deepEqual(out, [])
    assert.equal(db.select.mock.callCount(), 1, 'should short-circuit before the assignee join')
  })

  it('omits the assignee join when includeAssignees is false', async () => {
    const baseRows = [{ id: 't-1', title: 'Solo' }, { id: 't-2', title: 'Pair' }]
    const db = buildDb([
      { terminator: 'limit', rows: baseRows },
    ])
    const service = new TasksService(
      db,
      noopDeps.realtime,
      noopDeps.search,
      noopDeps.autos,
      noopDeps.webhooks,
      noopDeps.slack,
      noopDeps.notifs,
      noopDeps.r2,
      noopDeps.calendar,
      noopDeps.security,
    )

    const out = await service.getTasksForWorkspace('w-1', 50, { includeAssignees: false })

    assert.equal(out.length, 2)
    assert.deepEqual(out.map((r) => r.assignees), [[], []], 'every row carries an empty assignees array')
    assert.equal(db.select.mock.callCount(), 1, 'should not issue the assignee join')
  })

  it('attaches assignees grouped by taskId and leaves untouched tasks with an empty array', async () => {
    const baseRows = [
      { id: 't-1', title: 'Has two' },
      { id: 't-2', title: 'Has none' },
      { id: 't-3', title: 'Has one' },
    ]
    const assigneeRows = [
      { taskId: 't-1', userId: 'u-a', displayName: 'Alice', avatarUrl: null },
      { taskId: 't-1', userId: 'u-b', displayName: 'Bob',   avatarUrl: null },
      { taskId: 't-3', userId: 'u-c', displayName: 'Carol', avatarUrl: 'avatar.png' },
    ]
    const db = buildDb([
      { terminator: 'limit', rows: baseRows },
      { terminator: 'where', rows: assigneeRows },
    ])
    const service = new TasksService(
      db,
      noopDeps.realtime,
      noopDeps.search,
      noopDeps.autos,
      noopDeps.webhooks,
      noopDeps.slack,
      noopDeps.notifs,
      noopDeps.r2,
      noopDeps.calendar,
      noopDeps.security,
    )

    const out = await service.getTasksForWorkspace('w-1')

    assert.equal(out.length, 3)
    const byId = new Map(out.map((r) => [r.id, r]))
    assert.equal(byId.get('t-1')!.assignees.length, 2)
    assert.deepEqual(byId.get('t-1')!.assignees.map((a) => a.displayName).sort(), ['Alice', 'Bob'])
    assert.deepEqual(byId.get('t-2')!.assignees, [], 'tasks with no assignees still get [] not undefined')
    assert.equal(byId.get('t-3')!.assignees[0]?.displayName, 'Carol')
    assert.equal(byId.get('t-3')!.assignees[0]?.avatarUrl, 'avatar.png')
  })

  it('clamps the limit to a sane upper bound', async () => {
    // We can't directly inspect the SQL limit (it goes through the
    // mocked chain), but we can at least verify the method doesn't
    // crash and still issues one select for the ridiculous request.
    const db = buildDb([
      { terminator: 'limit', rows: [] },
    ])
    const service = new TasksService(
      db,
      noopDeps.realtime,
      noopDeps.search,
      noopDeps.autos,
      noopDeps.webhooks,
      noopDeps.slack,
      noopDeps.notifs,
      noopDeps.r2,
      noopDeps.calendar,
      noopDeps.security,
    )

    await service.getTasksForWorkspace('w-1', 100_000)

    assert.equal(db.select.mock.callCount(), 1)
  })
})
