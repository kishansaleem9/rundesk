import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { SampleDataService } from './sample-data.service'
import { GUESTS_CANNOT_IMPORT } from '../integrations/clickup-import/import-access'

/**
 * The seeder is mostly orchestration. We unit-test the two guards
 * (workspace must be empty, actor must be a member) plus the audit
 * log call. Full-tree seeding is integration territory because it
 * touches almost every domain table — exercising it here would mean
 * stubbing the entire schema and would not actually catch bugs.
 */

function buildDb(opts: {
  // FIFO queue of result sets, one per `.select()` chain in the call.
  selectQueues?: any[][]
  /**
   * Who is loading it, as the importers' guest rule reads them (`assertMayImport`, a lookup of
   * the role alone) — answered apart from the queue, which holds what the seeder itself reads.
   * A member unless said.
   */
  importerRole?: string
} = {}) {
  const queue = [...(opts.selectQueues ?? [])]
  const chainable = (rows: any[]) => ({
    then: (resolve: (v: any) => void, reject?: (e: any) => void) =>
      Promise.resolve(rows).then(resolve, reject),
    limit: mock.fn(async () => rows),
    orderBy: mock.fn(() => chainable(rows)),
  })
  return {
    select: mock.fn((selection?: Record<string, unknown>) => {
      const rows = () =>
        selection && Object.keys(selection).join() === 'role' ? [{ role: opts.importerRole ?? 'member' }] : queue.shift() ?? []
      return {
        from: mock.fn(() => ({
          where: mock.fn(() => chainable(rows())),
          limit: mock.fn(async () => rows()),
          orderBy: mock.fn(() => chainable(rows())),
        })),
      }
    }),
    insert: mock.fn(() => ({
      values: mock.fn((vals: any) => ({
        // Echo back enough shape for the seeder to read names/ids
        // when it inspects insert returns (labels, spaces, projects,
        // lists, tasks, checklists).
        returning: mock.fn(async () => {
          const rows = Array.isArray(vals) ? vals : [vals]
          return rows.map((v: any, i: number) => ({
            id: `gen-${i}-${Math.random().toString(36).slice(2, 8)}`,
            ...v,
          }))
        }),
        onConflictDoNothing: mock.fn(async () => undefined),
        // Some inserts in the seeder don't chain .returning() (label
        // assignments, checklist items, status seeds) — make those
        // awaitable directly.
        then: (resolve: (v: any) => void) => Promise.resolve(undefined).then(resolve),
      })),
    })),
    update: mock.fn(() => ({ set: mock.fn(() => ({ where: mock.fn(async () => undefined) })) })),
    delete: mock.fn(() => ({ where: mock.fn(async () => undefined) })),
  } as any
}

function buildSecurity() {
  return { logAuditEvent: mock.fn(async () => undefined) } as any
}

const ACTOR = { id: '00000000-0000-0000-0000-000000000001', email: 'admin@example.com' }
const WORKSPACE_ID = '00000000-0000-0000-0000-0000000000aa'

describe('SampleDataService.seed — a guest does not load sample data (found-6-oct/a-guest-who-may-import-makes-a-space)', () => {
  it('a guest is refused 403 “Guests cannot import data into a workspace”, whatever a custom role grants them, before anything else is read or written', async () => {
    const db = buildDb({ importerRole: 'guest', selectQueues: [[{ value: 0 }]] })
    const svc = new SampleDataService(db, buildSecurity())
    await assert.rejects(
      () => svc.seed(WORKSPACE_ID, ACTOR),
      (e) => e instanceof ForbiddenException && (e as Error).message === GUESTS_CANNOT_IMPORT,
    )
    assert.equal((db.select as any).mock.calls.length, 1, 'only who is loading it was read — not how many spaces the workspace holds')
    assert.equal((db.insert as any).mock.calls.length, 0, 'and nothing was written')
  })
})

describe('SampleDataService.seed — empty-workspace guard', () => {
  it('refuses to seed when the workspace already has spaces', async () => {
    // First select call is the count(*) on spaces. Return a positive count.
    const db = buildDb({ selectQueues: [[{ value: 3 }]] })
    const svc = new SampleDataService(db, buildSecurity())
    await assert.rejects(
      () => svc.seed(WORKSPACE_ID, ACTOR),
      (e) =>
        e instanceof ConflictException &&
        /already has 3 spaces/.test((e as Error).message),
    )
  })

  it('uses correct singular grammar when one existing space', async () => {
    const db = buildDb({ selectQueues: [[{ value: 1 }]] })
    const svc = new SampleDataService(db, buildSecurity())
    await assert.rejects(
      () => svc.seed(WORKSPACE_ID, ACTOR),
      (e) =>
        e instanceof ConflictException &&
        /already has 1 space\./.test((e as Error).message),
    )
  })
})

describe('SampleDataService.seed — actor membership guard', () => {
  it('rejects when actor is not a workspace member', async () => {
    // First select: empty workspace (count = 0).
    // Second select: membership lookup returns no rows.
    const db = buildDb({
      selectQueues: [
        [{ value: 0 }], // count(*) on spaces
        [],             // workspaceMembers lookup
      ],
    })
    const svc = new SampleDataService(db, buildSecurity())
    await assert.rejects(
      () => svc.seed(WORKSPACE_ID, ACTOR),
      (e) => e instanceof NotFoundException,
    )
  })
})

describe('SampleDataService — audit logging happy path', () => {
  it('writes a workspace.demo_seeded audit event after seeding succeeds', async () => {
    // Build a DB that lets the seeder complete with minimal happy values.
    // Each select call FIFO order:
    //   1) count(*) spaces → 0 (empty workspace)
    //   2) workspaceMembers lookup → 1 row so actor passes membership
    const db = buildDb({
      selectQueues: [
        [{ value: 0 }],
        [{ id: 'wm-1', workspaceId: WORKSPACE_ID, userId: ACTOR.id, role: 'workspace_admin' }],
      ],
    })

    const security = buildSecurity()
    const svc = new SampleDataService(db, security)
    const summary = await svc.seed(WORKSPACE_ID, ACTOR)

    // Cardinality sanity — recipe is fixed so these are exact.
    assert.ok(summary.spaces >= 3)
    assert.ok(summary.projects >= 4)
    assert.ok(summary.lists >= summary.projects * 4)
    assert.ok(summary.tasks >= 20)
    assert.ok(summary.docs >= 3)
    assert.ok(summary.goals >= 3)
    assert.ok(summary.labels >= 6)

    // Audit log was called exactly once with the expected action.
    const calls = (security.logAuditEvent as any).mock.calls
    assert.equal(calls.length, 1)
    const arg = calls[0].arguments[0]
    assert.equal(arg.action, 'workspace.demo_seeded')
    assert.equal(arg.workspaceId, WORKSPACE_ID)
    assert.equal(arg.actorId, ACTOR.id)
    assert.ok(typeof arg.metadata.tasks === 'number' && arg.metadata.tasks > 0)
  })
})
