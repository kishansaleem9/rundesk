import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ReportsService } from './reports.service'

/**
 * §3.3 View-Reports scoping + §9.3 completion/status-duration filters.
 *
 * Uses the repo's queued-result Drizzle stand-in: each top-level `select()`
 * pops the next planned rows and every chain verb (including `.limit`) is a
 * no-op that returns the same thenable. The WHERE/CASE SQL the service builds
 * is therefore exercised for real (drizzle builds the AST eagerly) but not
 * evaluated — so these tests lock the role→scope mapping, the in-memory
 * aggregation, and that the new scoped/ filtered SQL builds without throwing.
 */
function makeDb(selectResults: any[][]) {
  const queue = [...selectResults]
  const VERBS = ['from', 'where', 'innerJoin', 'leftJoin', 'groupBy', 'orderBy', 'limit'] as const
  const node = (rows: any[]): any => {
    const p: any = Promise.resolve(rows)
    for (const v of VERBS) p[v] = () => p
    return p
  }
  return { select: () => node(queue.shift() ?? []) } as any
}

describe('ReportsService.getViewerScope (§3.3)', () => {
  it('workspace_admin → { kind: all }', async () => {
    const svc = new ReportsService(makeDb([[{ role: 'workspace_admin' }]]))
    assert.deepEqual(await svc.getViewerScope('w1', 'admin'), { kind: 'all' })
  })

  it('super_admin → { kind: all }', async () => {
    const svc = new ReportsService(makeDb([[{ role: 'super_admin' }]]))
    assert.deepEqual(await svc.getViewerScope('w1', 'root'), { kind: 'all' })
  })

  it('manager → { kind: containers } with de-duped space/project ids + own userId', async () => {
    const svc = new ReportsService(
      makeDb([
        [{ role: 'manager' }],
        [{ spaceId: 's1' }, { spaceId: 's2' }, { spaceId: 's1' }],
        [{ projectId: 'p1' }],
      ]),
    )
    const scope = await svc.getViewerScope('w1', 'mgr')
    assert.deepEqual(scope, { kind: 'containers', spaceIds: ['s1', 's2'], projectIds: ['p1'], userId: 'mgr' })
  })

  it('manager with no container memberships still scopes to their own userId', async () => {
    const svc = new ReportsService(makeDb([[{ role: 'manager' }], [], []]))
    assert.deepEqual(await svc.getViewerScope('w1', 'mgr'), {
      kind: 'containers',
      spaceIds: [],
      projectIds: [],
      userId: 'mgr',
    })
  })

  it('plain member → { kind: user }', async () => {
    const svc = new ReportsService(makeDb([[{ role: 'member' }]]))
    assert.deepEqual(await svc.getViewerScope('w1', 'u1'), { kind: 'user', userId: 'u1' })
  })

  it('non-member (safe default) → { kind: user }', async () => {
    const svc = new ReportsService(makeDb([[]]))
    assert.deepEqual(await svc.getViewerScope('w1', 'u1'), { kind: 'user', userId: 'u1' })
  })
})

describe('ReportsService.getProductivity viewer scope', () => {
  const prodRow = () => [
    { userId: 'a', displayName: 'Alice', email: 'a@x', avatarUrl: null, tasksCompleted: 2, tasksCreated: 1, totalAssigned: 3 },
  ]

  it('manager containers scope builds a scoped query and returns rows', async () => {
    const svc = new ReportsService(makeDb([prodRow()]))
    const rows = await svc.getProductivity('w1', 30, {
      kind: 'containers',
      spaceIds: ['s1'],
      projectIds: ['p1'],
      userId: 'mgr',
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].tasksCompleted, 2)
  })

  it('member (user scope) still returns their own row', async () => {
    const svc = new ReportsService(makeDb([prodRow()]))
    const rows = await svc.getProductivity('w1', 30, { kind: 'user', userId: 'a' })
    assert.equal(rows.length, 1)
  })

  it('containers scope with empty ids falls back to own-only without throwing', async () => {
    const svc = new ReportsService(makeDb([[]]))
    const rows = await svc.getProductivity('w1', 30, { kind: 'containers', spaceIds: [], projectIds: [], userId: 'mgr' })
    assert.deepEqual(rows, [])
  })

  it('defaults to { kind: all } when no viewer is supplied', async () => {
    const svc = new ReportsService(makeDb([prodRow()]))
    const rows = await svc.getProductivity('w1')
    assert.equal(rows.length, 1)
  })
})

describe('ReportsService time reports viewer scope', () => {
  it('getTimeReport containers scope wraps sums and converts to hours', async () => {
    const svc = new ReportsService(
      makeDb([[{ userId: 'a', displayName: 'Alice', email: 'a@x', totalSeconds: 3600, billableSeconds: 1800, entryCount: 2 }]]),
    )
    const rows = await svc.getTimeReport('w1', 30, { kind: 'containers', spaceIds: ['s1'], projectIds: [], userId: 'mgr' })
    assert.equal(rows[0].totalHours, 1)
    assert.equal(rows[0].billableHours, 0.5)
  })

  it('getTimeByProject user scope filters by owner and returns per-project hours', async () => {
    const svc = new ReportsService(
      makeDb([[{ projectId: 'p1', projectName: 'P', clientId: null, clientName: null, totalSeconds: 7200, billableSeconds: 3600, entryCount: 4 }]]),
    )
    const rows = await svc.getTimeByProject('w1', 30, { kind: 'user', userId: 'a' })
    assert.equal(rows[0].totalHours, 2)
    assert.equal(rows[0].billableHours, 1)
  })

  it('getTimeByProject containers scope builds an OR predicate without throwing', async () => {
    const svc = new ReportsService(makeDb([[]]))
    const rows = await svc.getTimeByProject('w1', 30, { kind: 'containers', spaceIds: ['s1'], projectIds: ['p1'], userId: 'mgr' })
    assert.deepEqual(rows, [])
  })
})

describe('ReportsService.getContribution manager scope (§3.3)', () => {
  it('applies the container aggregate filter without dropping team members', async () => {
    const svc = new ReportsService(
      makeDb([
        [
          { userId: 'a', name: 'Alice', email: 'a@x' },
          { userId: 'b', name: 'Bob', email: 'b@x' },
        ],
        [{ userId: 'a', completed: 2, onTime: 2, assigned: 3 }],
        [{ actorId: 'a', action: 'commented', count: 1 }],
      ]),
    )
    const res = await svc.getContribution('w1', {
      period: 'this-month',
      viewer: { kind: 'containers', spaceIds: ['s1'], projectIds: ['p1'], userId: 'a' },
    })
    assert.equal(res.members.length, 2)
    const alice = res.members.find((m) => m.name === 'Alice')!
    assert.equal(alice.tasksCompleted, 2)
    assert.equal(alice.onTimeRate, 100)
  })
})

describe('ReportsService.getCompletionAnalytics filters (§9.3)', () => {
  // t1 done on-time, t2 open, t3 done late.
  const taskRows = () => [
    { id: 't1', status: 'done', dueDate: new Date('2026-06-10'), completedAt: new Date('2026-06-08'), createdAt: new Date('2026-06-01') },
    { id: 't2', status: 'in_progress', dueDate: null, completedAt: null, createdAt: new Date('2026-06-02') },
    { id: 't3', status: 'done', dueDate: new Date('2026-06-05'), completedAt: new Date('2026-06-09'), createdAt: new Date('2026-06-03') },
  ]

  it('computes totals / on-time / late with no filter (current behaviour)', async () => {
    const svc = new ReportsService(makeDb([taskRows()]))
    const res = await svc.getCompletionAnalytics('w1', 3650)
    assert.equal(res.total, 3)
    assert.equal(res.completed, 2)
    assert.equal(res.onTime, 1)
    assert.equal(res.late, 1)
    assert.equal(res.completionRate, 67)
  })

  it('accepts space/project/member filters (builds the assignee EXISTS predicate)', async () => {
    const svc = new ReportsService(makeDb([taskRows()]))
    const res = await svc.getCompletionAnalytics('w1', 3650, { spaceId: 's1', projectId: 'p1', memberId: 'u1' })
    assert.equal(res.total, 3)
    assert.equal(res.completed, 2)
    assert.equal(res.onTime, 1)
  })
})

describe('ReportsService.getStatusDurations filters (§9.3)', () => {
  // t1: enters in_progress, then done 2h later.
  const events = () => [
    { taskId: 't1', meta: { to: 'in_progress' }, createdAt: new Date('2026-06-01T00:00:00Z') },
    { taskId: 't1', meta: { to: 'done' }, createdAt: new Date('2026-06-01T02:00:00Z') },
  ]

  it('derives per-status average hours with no filter', async () => {
    const svc = new ReportsService(makeDb([events()]))
    const res = await svc.getStatusDurations('w1', 3650)
    const inProgress = res.find((r) => r.status === 'in_progress')!
    assert.equal(inProgress.avgHours, 2)
    assert.equal(inProgress.samples, 1)
  })

  it('accepts space/project/member filters without changing the derivation', async () => {
    const svc = new ReportsService(makeDb([events()]))
    const res = await svc.getStatusDurations('w1', 3650, { spaceId: 's1', projectId: 'p1', memberId: 'u1' })
    const inProgress = res.find((r) => r.status === 'in_progress')!
    assert.equal(inProgress.avgHours, 2)
  })
})
