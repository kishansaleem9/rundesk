import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { NotFoundException } from '@nestjs/common'
import {
  tenantDatabases,
  users,
  organizations,
  organizationMembers,
  workspaces,
  workspaceMembers,
  spaces,
  projects,
  lists,
  tasks,
  taskAssignees,
} from '@rundesk/db'
import {
  TenantDatabasesService,
  maskConnectionHost,
  resolveMigrationsDir,
  orderTasksByParent,
} from './tenant-databases.service'

// Minimal thenable query-builder stub (mirrors the organizations.service test idiom):
// select().from().where().limit() eventually resolves to `rows`.
const selectChain = (rows: any[]): any => ({
  from: () => selectChain(rows),
  where: () => selectChain(rows),
  limit: () => selectChain(rows),
  then: (res: (v: any) => any, rej: (e: any) => any) => Promise.resolve(rows).then(res, rej),
})

describe('TenantDatabasesService.getDbForOrganization (resolver)', () => {
  it('returns the SHARED db when no active row exists', async () => {
    const db = { select: () => selectChain([]) }
    const svc = new TenantDatabasesService(db as any)
    const resolved = await svc.getDbForOrganization('org-1')
    assert.equal(resolved, db, 'must fall back to the injected shared db handle')
  })
})

describe('TenantDatabasesService masked projection', () => {
  const secret = 'postgres://admin:sup3r-s3cret-pw@db.internal.example.com:5432/tenant_acme'

  it('getForOrg never returns the raw connectionUrl', async () => {
    const row = {
      organizationId: 'org-1',
      connectionUrl: secret,
      status: 'active',
      label: 'Acme dedicated',
      lastCheckedAt: null,
    }
    const db = { select: () => selectChain([row]) }
    const svc = new TenantDatabasesService(db as any)

    const view = await svc.getForOrg('org-1')
    if (!view) throw new Error('expected a masked view')

    const serialized = JSON.stringify(view)
    assert.ok(!serialized.includes('sup3r-s3cret-pw'), 'must not leak the password')
    assert.ok(!serialized.includes(secret), 'must not leak the raw DSN')
    assert.equal((view as any).connectionUrl, undefined, 'view must not carry connectionUrl')
    assert.equal(view.status, 'active')
    assert.equal(view.host, 'db.internal.example.com:5432', 'host is masked to host:port only')
  })

  it('listAll masks every row', async () => {
    const rows = [
      { organizationId: 'o1', connectionUrl: 'postgres://u:pw-one@h1:5432/d', status: 'active', label: null, lastCheckedAt: null },
      { organizationId: 'o2', connectionUrl: 'postgres://u:pw-two@h2:6543/d', status: 'disabled', label: null, lastCheckedAt: null },
    ]
    const db = { select: () => selectChain(rows) }
    const svc = new TenantDatabasesService(db as any)

    const views = await svc.listAll()
    const serialized = JSON.stringify(views)
    assert.ok(!serialized.includes('pw-one') && !serialized.includes('pw-two'), 'must not leak any password')
    assert.equal(views[0].host, 'h1:5432')
    assert.equal(views[1].host, 'h2:6543')
  })

  it('maskConnectionHost collapses unparseable DSNs to ***', () => {
    assert.equal(maskConnectionHost('not a dsn'), '***')
    assert.equal(maskConnectionHost('postgres://u:p@only-host/db'), 'only-host')
  })
})

describe('TenantDatabasesService.upsertForOrg', () => {
  it('upserts and returns a masked view carrying the given status', async () => {
    let capturedValues: any
    let capturedSet: any
    const db = {
      insert: () => ({
        values: (values: any) => {
          capturedValues = values
          return {
            onConflictDoUpdate: (cfg: any) => {
              capturedSet = cfg.set
              return {
                returning: () =>
                  Promise.resolve([
                    {
                      organizationId: values.organizationId,
                      connectionUrl: values.connectionUrl,
                      status: values.status,
                      label: values.label,
                      lastCheckedAt: null,
                    },
                  ]),
              }
            },
          }
        },
      }),
    }
    const svc = new TenantDatabasesService(db as any)

    const view = await svc.upsertForOrg('org-1', {
      connectionUrl: 'postgres://u:pw@dedicated-host:5432/acme',
      label: 'Primary',
      status: 'active',
    })

    assert.equal(capturedValues.status, 'active', 'insert values carry the status')
    assert.equal(capturedSet.status, 'active', 'onConflict set updates the status')
    assert.equal(view.status, 'active')
    assert.equal(view.host, 'dedicated-host:5432')
    assert.equal((view as any).connectionUrl, undefined, 'view must not carry connectionUrl')
  })

  it('defaults status to pending when omitted', async () => {
    let capturedValues: any
    const db = {
      insert: () => ({
        values: (values: any) => {
          capturedValues = values
          return {
            onConflictDoUpdate: () => ({
              returning: () =>
                Promise.resolve([{ ...values, lastCheckedAt: null }]),
            }),
          }
        },
      }),
    }
    const svc = new TenantDatabasesService(db as any)
    const view = await svc.upsertForOrg('org-1', { connectionUrl: 'postgres://u:pw@h:5432/d' })
    assert.equal(capturedValues.status, 'pending')
    assert.equal(view.status, 'pending')
  })
})

describe('TenantDatabasesService.disable', () => {
  it('updates status to disabled and returns the masked view', async () => {
    let capturedSet: any
    const db = {
      update: () => ({
        set: (patch: any) => {
          capturedSet = patch
          return {
            where: () => ({
              returning: () =>
                Promise.resolve([
                  {
                    organizationId: 'org-1',
                    connectionUrl: 'postgres://u:pw@h:5432/d',
                    status: 'disabled',
                    label: null,
                    lastCheckedAt: null,
                  },
                ]),
            }),
          }
        },
      }),
    }
    const svc = new TenantDatabasesService(db as any)

    const view = await svc.disable('org-1')
    assert.equal(capturedSet.status, 'disabled', 'update sets status to disabled')
    if (!view) throw new Error('expected a masked view')
    assert.equal(view.status, 'disabled')
    assert.equal((view as any).connectionUrl, undefined, 'view must not carry connectionUrl')
  })
})

// ---------------------------------------------------------------------------
// Provisioning + data-migration (§14.2 caveat closure)
// ---------------------------------------------------------------------------

/**
 * Table-aware fake of the SHARED drizzle handle: `select().from(t).where()[.limit()]`
 * resolves to whatever rows are registered for table `t`. Mirrors the real
 * builder closely enough for both the registry guard (`.where().limit()`) and the
 * data-migration reads (`.where()`), keyed by the actual imported table objects.
 */
const tableAwareDb = (dataByTable: Map<unknown, any[]>): any => {
  const chain = (table: unknown): any => ({
    from: (t: unknown) => chain(t),
    where: () => chain(table),
    limit: () => chain(table),
    then: (res: (v: any) => any, rej: (e: any) => any) =>
      Promise.resolve(dataByTable.get(table) ?? []).then(res, rej),
  })
  return { select: () => chain(undefined) }
}

const DEDICATED_ROW = {
  organizationId: 'org-1',
  connectionUrl: 'postgres://u:pw@dedicated-host:5432/acme',
  status: 'pending',
  label: null,
  lastCheckedAt: null,
}

/** Subclass exposing the dedicated-connection + schema-sync seams for assertions. */
class FakeTenantDbService extends TenantDatabasesService {
  constructor(
    sharedDb: any,
    private readonly _handle: any,
    private readonly _trackers: { syncCalls: Array<{ connectionUrl: string }>; onSync?: () => void },
    private readonly _openError?: Error,
  ) {
    super(sharedDb)
  }
  protected openDedicatedConnection(): any {
    if (this._openError) throw this._openError
    return this._handle
  }
  protected async runSchemaSync(connectionUrl: string): Promise<void> {
    this._trackers.syncCalls.push({ connectionUrl })
    this._trackers.onSync?.()
  }
}

describe('TenantDatabasesService.provisionSchema', () => {
  it('syncs the schema against the DEDICATED connection URL and verifies core tables', async () => {
    // Verification probe: `to_regclass(...) is not null` for the core tables → present.
    const handle = { execute: () => Promise.resolve([{ present: true }]) }
    const trackers = { syncCalls: [] as Array<{ connectionUrl: string }> }
    const shared = tableAwareDb(new Map([[tenantDatabases, [DEDICATED_ROW]]]))
    const svc = new FakeTenantDbService(shared, handle, trackers)

    const res = await svc.provisionSchema('org-1')
    if (!res.ok) throw new Error(`expected ok, got: ${res.error}`)
    assert.equal(res.provisioned, true, 'core tables verified present after the push')
    assert.equal(res.method, 'drizzle-kit push --force', 'reports the declarative-sync mechanism')
    assert.equal(res.organizationId, 'org-1')
    assert.equal(trackers.syncCalls.length, 1, 'schema sync ran exactly once')
    assert.equal(
      trackers.syncCalls[0].connectionUrl,
      DEDICATED_ROW.connectionUrl,
      'push targeted the dedicated connection URL, not the shared db',
    )
  })

  it('fails (ok:false) when the sync ran but the core tables are still absent', async () => {
    const handle = { execute: () => Promise.resolve([{ present: false }]) }
    const trackers = { syncCalls: [] as Array<{ connectionUrl: string }> }
    const shared = tableAwareDb(new Map([[tenantDatabases, [DEDICATED_ROW]]]))
    const svc = new FakeTenantDbService(shared, handle, trackers)

    const res = await svc.provisionSchema('org-1')
    assert.equal(res.ok, false)
    if (res.ok) throw new Error('expected failure')
    assert.equal(trackers.syncCalls.length, 1, 'the sync still ran')
    assert.match(res.error, /core tables/)
  })

  it('throws NotFoundException when the org has no dedicated database row', async () => {
    const shared = tableAwareDb(new Map()) // no registry row
    const svc = new FakeTenantDbService(shared, {}, { syncCalls: [] })
    await assert.rejects(() => svc.provisionSchema('org-x'), NotFoundException)
  })

  it('never crashes on a schema-sync failure — returns { ok: false, error }', async () => {
    const handle = { execute: () => Promise.resolve([{ present: true }]) }
    const trackers = {
      syncCalls: [] as Array<{ connectionUrl: string }>,
      onSync: () => {
        throw new Error('boom')
      },
    }
    const shared = tableAwareDb(new Map([[tenantDatabases, [DEDICATED_ROW]]]))
    const svc = new FakeTenantDbService(shared, handle, trackers)

    const res = await svc.provisionSchema('org-1')
    assert.equal(res.ok, false)
    if (res.ok) throw new Error('expected failure')
    assert.match(res.error, /Provisioning failed/)
  })

  it('never crashes when the dedicated connection cannot be opened for verification', async () => {
    const shared = tableAwareDb(new Map([[tenantDatabases, [DEDICATED_ROW]]]))
    const svc = new FakeTenantDbService(shared, {}, { syncCalls: [] }, new Error('ECONNREFUSED'))
    const res = await svc.provisionSchema('org-1')
    assert.equal(res.ok, false)
    if (res.ok) throw new Error('expected failure')
    assert.match(res.error, /Failed to open dedicated connection/)
  })
})

describe('TenantDatabasesService.getSchemaStatus', () => {
  it('reports provisioned when the sentinel table exists', async () => {
    const handle = { execute: () => Promise.resolve([{ present: true, count: 81 }]) }
    const shared = tableAwareDb(new Map([[tenantDatabases, [DEDICATED_ROW]]]))
    const svc = new FakeTenantDbService(shared, handle, { syncCalls: [] })

    const res = await svc.getSchemaStatus('org-1')
    if (!res.ok) throw new Error('expected ok')
    assert.equal(res.reachable, true)
    assert.equal(res.provisioned, true)
    assert.equal(res.appliedMigrations, 81)
    assert.equal(res.state, 'provisioned')
  })

  it('reports needs-provisioning when the sentinel table is absent', async () => {
    const handle = { execute: () => Promise.resolve([{ present: false, count: 0 }]) }
    const shared = tableAwareDb(new Map([[tenantDatabases, [DEDICATED_ROW]]]))
    const svc = new FakeTenantDbService(shared, handle, { syncCalls: [] })

    const res = await svc.getSchemaStatus('org-1')
    if (!res.ok) throw new Error('expected ok')
    assert.equal(res.provisioned, false)
    assert.equal(res.state, 'needs-provisioning')
  })

  it('reports reachable:false (never throws) when the dedicated DB is down', async () => {
    const handle = { execute: () => Promise.reject(new Error('ECONNREFUSED')) }
    const shared = tableAwareDb(new Map([[tenantDatabases, [DEDICATED_ROW]]]))
    const svc = new FakeTenantDbService(shared, handle, { syncCalls: [] })

    const res = await svc.getSchemaStatus('org-1')
    assert.equal(res.ok, false)
    if (res.ok) throw new Error('expected failure')
    assert.equal(res.reachable, false)
    assert.match(res.error, /ECONNREFUSED/)
  })

  it('throws NotFoundException when the org has no dedicated database row', async () => {
    const shared = tableAwareDb(new Map())
    const svc = new FakeTenantDbService(shared, {}, { syncCalls: [] })
    await assert.rejects(() => svc.getSchemaStatus('org-x'), NotFoundException)
  })
})

describe('TenantDatabasesService.migrateOrgData', () => {
  // A minimal but complete core tree for org-1.
  const buildSharedTree = () =>
    new Map<unknown, any[]>([
      [tenantDatabases, [DEDICATED_ROW]],
      [organizations, [{ id: 'org-1', name: 'Acme' }]],
      [organizationMembers, [{ id: 'om1', organizationId: 'org-1', userId: 'u1' }]],
      [workspaces, [{ id: 'w1', organizationId: 'org-1' }]],
      [workspaceMembers, [{ id: 'wm1', workspaceId: 'w1', userId: 'u1' }]],
      [spaces, [{ id: 's1', workspaceId: 'w1', createdById: 'u1' }]],
      [projects, [{ id: 'p1', spaceId: 's1', createdById: 'u1' }]],
      [lists, [{ id: 'l1', projectId: 'p1' }]],
      [
        tasks,
        [
          { id: 't2', listId: 'l1', parentTaskId: 't1', createdById: 'u1' },
          { id: 't1', listId: 'l1', parentTaskId: null, createdById: 'u1' },
        ],
      ],
      [taskAssignees, [{ id: 'ta1', taskId: 't1', userId: 'u1' }]],
      [users, [{ id: 'u1', email: 'u1@x.dev' }]],
    ])

  it('dry-run returns per-table counts in FK order WITHOUT writing', async () => {
    const target = {
      insert: () => {
        throw new Error('dry run must not write to the dedicated db')
      },
    }
    const svc = new FakeTenantDbService(tableAwareDb(buildSharedTree()), target, { syncCalls: [] })

    const res = await svc.migrateOrgData('org-1', { dryRun: true })
    assert.equal(res.ok, true)
    assert.equal(res.dryRun, true)
    assert.equal(res.totalInserted, 0, 'dry run inserts nothing')

    const found = Object.fromEntries(res.tables.map((t) => [t.table, t.found]))
    assert.equal(found['users'], 1)
    assert.equal(found['organizations'], 1)
    assert.equal(found['organization_members'], 1)
    assert.equal(found['workspaces'], 1)
    assert.equal(found['workspace_members'], 1)
    assert.equal(found['spaces'], 1)
    assert.equal(found['projects'], 1)
    assert.equal(found['lists'], 1)
    assert.equal(found['tasks'], 2)
    assert.equal(found['task_assignees'], 1)
    assert.equal(res.totalFound, 11) // 9 singleton tables + tasks(2) = 11

    const order = res.tables.map((t) => t.table)
    assert.ok(order.indexOf('users') < order.indexOf('organizations'), 'users seeded first')
    assert.ok(order.indexOf('organizations') < order.indexOf('workspaces'))
    assert.ok(order.indexOf('workspaces') < order.indexOf('spaces'))
    assert.ok(order.indexOf('spaces') < order.indexOf('projects'))
    assert.ok(order.indexOf('projects') < order.indexOf('lists'))
    assert.ok(order.indexOf('lists') < order.indexOf('tasks'))
    assert.ok(order.indexOf('tasks') < order.indexOf('task_assignees'))
  })

  it('real run inserts into the DEDICATED db idempotently, parents before children', async () => {
    const writes: Array<{ table: unknown; rows: any[] }> = []
    const target = {
      insert: (table: unknown) => ({
        values: (rows: any[]) => ({
          onConflictDoNothing: () => ({
            returning: () => {
              writes.push({ table, rows })
              return Promise.resolve(rows.map((r: any) => ({ id: r.id })))
            },
          }),
        }),
      }),
    }
    const svc = new FakeTenantDbService(tableAwareDb(buildSharedTree()), target, { syncCalls: [] })

    const res = await svc.migrateOrgData('org-1', { dryRun: false })
    assert.equal(res.ok, true)
    assert.equal(res.totalInserted, res.totalFound, 'every source row inserted (no conflicts)')

    assert.equal(writes[0].table, users, 'first write is users')
    assert.equal(writes[writes.length - 1].table, taskAssignees, 'last write is task_assignees')

    const taskWrite = writes.find((w) => w.table === tasks)
    if (!taskWrite) throw new Error('expected a tasks write')
    assert.deepEqual(
      taskWrite.rows.map((r: any) => r.id),
      ['t1', 't2'],
      'tasks topologically ordered: parent t1 before child t2',
    )
  })

  it('throws NotFoundException when the org has no dedicated database row', async () => {
    const svc = new FakeTenantDbService(tableAwareDb(new Map()), {}, { syncCalls: [] })
    await assert.rejects(() => svc.migrateOrgData('org-x', { dryRun: true }), NotFoundException)
  })

  it('never crashes when the dedicated connection cannot be opened', async () => {
    const svc = new FakeTenantDbService(
      tableAwareDb(new Map([[tenantDatabases, [DEDICATED_ROW]]])),
      {},
      { syncCalls: [] },
      new Error('ECONNREFUSED'),
    )
    const res = await svc.migrateOrgData('org-1', { dryRun: false })
    assert.equal(res.ok, false)
    assert.match(res.error ?? '', /Failed to open dedicated connection/)
  })
})

describe('tenant-databases helpers', () => {
  it('orderTasksByParent emits every parent before its children', () => {
    const ordered = orderTasksByParent([
      { id: 'c', parentTaskId: 'b' },
      { id: 'b', parentTaskId: 'a' },
      { id: 'a', parentTaskId: null },
    ])
    assert.deepEqual(
      ordered.map((t) => t.id),
      ['a', 'b', 'c'],
    )
  })

  it('orderTasksByParent tolerates a cycle without infinite recursion', () => {
    const ordered = orderTasksByParent([
      { id: 'a', parentTaskId: 'b' },
      { id: 'b', parentTaskId: 'a' },
    ])
    assert.equal(ordered.length, 2, 'both rows still emitted exactly once')
  })

  it('resolveMigrationsDir points at a real folder containing meta/_journal.json', () => {
    const dir = resolveMigrationsDir()
    assert.ok(existsSync(path.join(dir, 'meta', '_journal.json')), 'resolved dir has the drizzle journal')
    assert.ok(dir.endsWith(path.join('migrations')), 'resolves to a migrations directory')
  })
})
