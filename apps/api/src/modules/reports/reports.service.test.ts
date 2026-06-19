import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ReportsService } from './reports.service'

/**
 * The custom-report engine runs a few queries then aggregates in memory.
 * We mock Drizzle with a thenable chain that yields the next queued result
 * per top-level select() call (task rows, then assignee rows).
 */
function makeDb(selectResults: any[][]) {
  let i = 0
  const chain = (rows: any[]): any => {
    const c: any = {
      from: () => c,
      where: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      groupBy: () => c,
      orderBy: () => c,
      then: (resolve: (v: any) => any, reject: (e: any) => any) =>
        Promise.resolve(rows).then(resolve, reject),
    }
    return c
  }
  return { select: () => chain(selectResults[i++] ?? []) } as any
}

const day = (s: string) => new Date(s)

// task1: closed + on time (A); task2: open (A); task3: closed + late (B)
const taskRows = () => [
  {
    id: 't1', status: 'done', statusCategory: 'closed', priority: 'high',
    createdAt: day('2026-06-01'), dueDate: day('2026-06-10'), completedAt: day('2026-06-08'),
    projectId: 'p1', projectName: 'Launch',
  },
  {
    id: 't2', status: 'in_progress', statusCategory: 'open', priority: 'normal',
    createdAt: day('2026-06-02'), dueDate: day('2026-06-12'), completedAt: null,
    projectId: 'p1', projectName: 'Launch',
  },
  {
    id: 't3', status: 'done', statusCategory: 'closed', priority: 'low',
    createdAt: day('2026-06-03'), dueDate: day('2026-06-05'), completedAt: day('2026-06-09'),
    projectId: 'p1', projectName: 'Launch',
  },
]
const assigneeRows = () => [
  { taskId: 't1', userId: 'A', name: 'Alice', email: 'a@x.com' },
  { taskId: 't2', userId: 'A', name: 'Alice', email: 'a@x.com' },
  { taskId: 't3', userId: 'B', name: 'Bob', email: 'b@x.com' },
]

describe('ReportsService.runCustomReport', () => {
  it('groups by assignee and computes count/completed/on-time-rate', async () => {
    const svc = new ReportsService(makeDb([taskRows(), assigneeRows()]))
    const res = await svc.runCustomReport('w1', {
      dimension: 'assignee',
      metrics: ['tasks-count', 'tasks-completed', 'on-time-rate'],
      days: 3650,
    })
    assert.equal(res.dimension, 'assignee')
    assert.deepEqual(res.metrics, ['tasks-count', 'tasks-completed', 'on-time-rate'])
    // sorted by primary metric (tasks-count) desc → Alice (2) before Bob (1)
    const alice = res.rows.find((r) => r.label === 'Alice')!
    const bob = res.rows.find((r) => r.label === 'Bob')!
    assert.equal(res.rows[0].label, 'Alice')
    assert.deepEqual(alice.values, { 'tasks-count': 2, 'tasks-completed': 1, 'on-time-rate': 100 })
    assert.deepEqual(bob.values, { 'tasks-count': 1, 'tasks-completed': 1, 'on-time-rate': 0 })
  })

  it('groups by priority', async () => {
    const svc = new ReportsService(makeDb([taskRows(), assigneeRows()]))
    const res = await svc.runCustomReport('w1', { dimension: 'priority', metrics: ['tasks-count'], days: 3650 })
    const labels = res.rows.map((r) => r.label).sort()
    assert.deepEqual(labels, ['high', 'low', 'normal'])
  })

  it('falls back to tasks-count when no valid metric is given', async () => {
    const svc = new ReportsService(makeDb([taskRows(), assigneeRows()]))
    const res = await svc.runCustomReport('w1', { dimension: 'assignee', metrics: ['bogus'], days: 3650 })
    assert.deepEqual(res.metrics, ['tasks-count'])
  })
})

describe('ReportsService.exportCustomReportCsv', () => {
  it('emits a header row and one row per group', async () => {
    const svc = new ReportsService(makeDb([taskRows(), assigneeRows()]))
    const csv = await svc.exportCustomReportCsv('w1', {
      dimension: 'assignee',
      metrics: ['tasks-count', 'tasks-completed'],
      days: 3650,
    })
    const lines = csv.split('\n')
    assert.equal(lines[0], 'group,tasks-count,tasks-completed')
    assert.equal(lines.length, 3) // header + Alice + Bob
    assert.ok(lines.some((l) => l.startsWith('Alice,2,1')))
    assert.ok(lines.some((l) => l.startsWith('Bob,1,1')))
  })
})
