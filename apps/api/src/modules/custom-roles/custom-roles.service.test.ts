import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { CustomRolesService } from './custom-roles.service'
import { isKnownPermission, LEGACY_ROLE_PERMISSIONS } from './permission-catalog'

/**
 * Drizzle-shaped mock builder. Tests script per-call returns so a single
 * service method can exercise multiple chained queries. `selectQueues`
 * is consumed in FIFO order across all `.select()` calls.
 */
function buildDb(opts: {
  selectQueues?: any[][]
  insertReturning?: any[]
  insertThrows?: boolean | string
} = {}) {
  const queue = [...(opts.selectQueues ?? [])]

  const chainableArray = (rows: any[]) => {
    // Each terminal method (`limit`, `orderBy`, awaiting the chain itself)
    // resolves to the same rows array. We make the chain thenable so
    // `await db.select().from().where()` works without an explicit limit.
    const fns = {
      then: (resolve: (v: any) => void, reject?: (e: any) => void) =>
        Promise.resolve(rows).then(resolve, reject),
      limit: mock.fn(async () => rows),
      orderBy: mock.fn(() => chainableArray(rows)),
    }
    return fns
  }

  return {
    select: mock.fn(() => ({
      from: mock.fn(() => ({
        where: mock.fn(() => {
          const next = queue.shift() ?? []
          return chainableArray(next)
        }),
        innerJoin: mock.fn(() => ({
          where: mock.fn(() => {
            const next = queue.shift() ?? []
            return chainableArray(next)
          }),
        })),
        orderBy: mock.fn(() => chainableArray(queue.shift() ?? [])),
        limit: mock.fn(async () => queue.shift() ?? []),
      })),
    })),
    insert: mock.fn(() => ({
      values: mock.fn(async () => {
        if (opts.insertThrows) {
          throw new Error(
            typeof opts.insertThrows === 'string'
              ? opts.insertThrows
              : 'insert failed',
          )
        }
        return opts.insertReturning ?? []
      }),
    })),
    update: mock.fn(() => ({
      set: mock.fn(() => ({
        where: mock.fn(async () => undefined),
      })),
    })),
    delete: mock.fn(() => ({
      where: mock.fn(async () => undefined),
    })),
  } as any
}

function buildSecurity() {
  return { logAuditEvent: mock.fn(async () => undefined) } as any
}

const ACTOR = { id: '11111111-1111-1111-1111-111111111111', email: 'admin@example.com' }
const WORKSPACE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('permission-catalog', () => {
  it('admin and workspace_admin grant every catalog permission', () => {
    // workspace_admin should grant every key in the catalog so legacy
    // workspace admins continue to pass every permission check.
    const wsAdmin = new Set(LEGACY_ROLE_PERMISSIONS.workspace_admin)
    for (const p of LEGACY_ROLE_PERMISSIONS.super_admin) assert.ok(wsAdmin.has(p))
  })

  it('guests get zero permissions by default', () => {
    assert.equal(LEGACY_ROLE_PERMISSIONS.guest.length, 0)
  })

  it('isKnownPermission rejects unknown keys', () => {
    assert.equal(isKnownPermission('unknown.thing'), false)
    assert.equal(isKnownPermission('sso.manage'), true)
  })
})

describe('CustomRolesService.create — input validation', () => {
  it('rejects empty names', async () => {
    const db = buildDb()
    const svc = new CustomRolesService(db, buildSecurity())
    await assert.rejects(
      () => svc.create(WORKSPACE_ID, { name: '   ' }, ACTOR),
      (e) => e instanceof BadRequestException,
    )
  })

  it('rejects reserved names regardless of case', async () => {
    const db = buildDb()
    const svc = new CustomRolesService(db, buildSecurity())
    await assert.rejects(
      () => svc.create(WORKSPACE_ID, { name: 'Workspace Admin' }, ACTOR),
      (e) => e instanceof BadRequestException && /reserved/i.test((e as Error).message),
    )
  })

  it('rejects unknown permissions', async () => {
    const db = buildDb({ selectQueues: [[]] })
    const svc = new CustomRolesService(db, buildSecurity())
    await assert.rejects(
      () =>
        svc.create(
          WORKSPACE_ID,
          { name: 'Auditor', permissions: ['some.fake.permission'] },
          ACTOR,
        ),
      (e) => e instanceof BadRequestException && /Unknown permission/.test((e as Error).message),
    )
  })

  it('rejects malformed colors', async () => {
    const db = buildDb({ selectQueues: [[]] })
    const svc = new CustomRolesService(db, buildSecurity())
    await assert.rejects(
      () =>
        svc.create(WORKSPACE_ID, { name: 'Auditor', color: 'red' }, ACTOR),
      (e) => e instanceof BadRequestException && /hex/i.test((e as Error).message),
    )
  })

  it('rejects duplicate names within the same workspace', async () => {
    // First select: name-availability check returns an existing row.
    const db = buildDb({ selectQueues: [[{ id: 'existing' }]] })
    const svc = new CustomRolesService(db, buildSecurity())
    await assert.rejects(
      () => svc.create(WORKSPACE_ID, { name: 'Auditor' }, ACTOR),
      (e) => e instanceof ConflictException,
    )
  })
})

describe('CustomRolesService.update — locked-role guard', () => {
  it('refuses to rename a locked role', async () => {
    // First select: requireRole returns a locked role.
    const db = buildDb({
      selectQueues: [[{ id: 'role-1', workspaceId: WORKSPACE_ID, name: 'Admin', isLocked: true }]],
    })
    const svc = new CustomRolesService(db, buildSecurity())
    await assert.rejects(
      () => svc.update(WORKSPACE_ID, 'role-1', { name: 'Renamed' }, ACTOR),
      (e) => e instanceof BadRequestException && /Locked/.test((e as Error).message),
    )
  })

  it('refuses to delete a locked role', async () => {
    const db = buildDb({
      selectQueues: [[{ id: 'role-1', workspaceId: WORKSPACE_ID, name: 'Admin', isLocked: true }]],
    })
    const svc = new CustomRolesService(db, buildSecurity())
    await assert.rejects(
      () => svc.remove(WORKSPACE_ID, 'role-1', ACTOR),
      (e) => e instanceof BadRequestException,
    )
  })

  it('throws NotFound for a missing role', async () => {
    const db = buildDb({ selectQueues: [[]] })
    const svc = new CustomRolesService(db, buildSecurity())
    await assert.rejects(
      () => svc.remove(WORKSPACE_ID, 'missing', ACTOR),
      (e) => e instanceof NotFoundException,
    )
  })
})

describe('CustomRolesService.resolveForMember — permission union', () => {
  it("returns the legacy role's baseline permissions when no custom roles are assigned", async () => {
    // First select: empty role-assignment list. No second select needed
    // because `customRoleIds` is empty.
    const db = buildDb({ selectQueues: [[]] })
    const svc = new CustomRolesService(db, buildSecurity())
    const resolution = await svc.resolveForMember('member-1', 'member')
    assert.deepEqual(
      resolution.permissions.sort(),
      [...LEGACY_ROLE_PERMISSIONS.member].sort(),
    )
    assert.equal(resolution.legacyRole, 'member')
    assert.deepEqual(resolution.customRoleIds, [])
  })

  it('unions custom role permissions on top of legacy role permissions', async () => {
    // 1st select: assignment rows (role IDs). 2nd select: permissions for those roles.
    const db = buildDb({
      selectQueues: [
        [{ roleId: 'role-1' }],
        [
          { roleId: 'role-1', permission: 'sso.manage' },
          { roleId: 'role-1', permission: 'workspace.audit.view' },
        ],
      ],
    })
    const svc = new CustomRolesService(db, buildSecurity())
    const resolution = await svc.resolveForMember('member-2', 'member')

    // Member legacy grants `space.create`, `doc.publish`, `report.export`.
    // Custom role adds `sso.manage` + `workspace.audit.view`. All unioned.
    const set = new Set(resolution.permissions)
    assert.ok(set.has('space.create'))
    assert.ok(set.has('sso.manage'))
    assert.ok(set.has('workspace.audit.view'))
  })

  it('drops unknown permission strings from the union (forward compatibility)', async () => {
    // Old permission strings that have since been removed from the catalog
    // should be silently filtered rather than crashing the resolver.
    const db = buildDb({
      selectQueues: [
        [{ roleId: 'role-1' }],
        [
          { roleId: 'role-1', permission: 'sso.manage' },
          { roleId: 'role-1', permission: 'permission.from.future.version' },
        ],
      ],
    })
    const svc = new CustomRolesService(db, buildSecurity())
    const resolution = await svc.resolveForMember('member-3', 'guest')
    assert.ok(resolution.permissions.includes('sso.manage'))
    assert.equal(
      resolution.permissions.includes('permission.from.future.version' as any),
      false,
    )
  })

  it('caches resolutions per workspaceMemberId', async () => {
    const db = buildDb({ selectQueues: [[], []] })
    const svc = new CustomRolesService(db, buildSecurity())
    await svc.resolveForMember('member-cached', 'member')
    // Second call should hit cache and NOT consume another select.
    await svc.resolveForMember('member-cached', 'member')
    // Only one .select() invocation total (the first resolution).
    assert.equal((db.select as any).mock.callCount(), 1)
  })
})
