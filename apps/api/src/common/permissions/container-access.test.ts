import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertCanManageContainer } from './container-access'

const dbWithRole = (rows: any[]) => ({
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => rows,
      }),
    }),
  }),
}) as any

/**
 * Delete scoping issues TWO selects in sequence (workspaceMembers role, then
 * spaceMembers membership); this mock returns a different result per call so the
 * two lookups can be distinguished.
 */
const dbQueue = (results: any[][]) => {
  const q = [...results]
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => q.shift() ?? [],
        }),
      }),
    }),
  } as any
}

describe('assertCanManageContainer', () => {
  it('allows the creator regardless of role', async () => {
    // No membership row needed — creator short-circuits before the DB lookup.
    await assertCanManageContainer(dbWithRole([]), {
      workspaceId: 'w1', createdById: 'u1', actorId: 'u1', kind: 'list',
    })
  })

  it('allows a workspace admin who is not the creator', async () => {
    await assertCanManageContainer(dbWithRole([{ role: 'workspace_admin' }]), {
      workspaceId: 'w1', createdById: 'someone-else', actorId: 'u2', kind: 'space',
    })
  })

  it('allows a manager', async () => {
    await assertCanManageContainer(dbWithRole([{ role: 'manager' }]), {
      workspaceId: 'w1', createdById: 'x', actorId: 'u3', kind: 'project',
    })
  })

  it('rejects a plain member who is not the creator', async () => {
    await assert.rejects(
      () => assertCanManageContainer(dbWithRole([{ role: 'member' }]), {
        workspaceId: 'w1', createdById: 'owner', actorId: 'intruder', kind: 'list',
      }),
      /Only the creator or a workspace admin/,
    )
  })

  it('rejects a non-member entirely', async () => {
    await assert.rejects(
      () => assertCanManageContainer(dbWithRole([]), {
        workspaceId: 'w1', createdById: 'owner', actorId: 'stranger', kind: 'space',
      }),
      /Only the creator or a workspace admin/,
    )
  })
})

describe('assertCanManageContainer — delete scoping (plan §3: Manager own-space)', () => {
  it('lets a workspace admin delete a space', async () => {
    await assertCanManageContainer(dbQueue([[{ role: 'workspace_admin' }]]), {
      workspaceId: 'w1', createdById: 'other', actorId: 'admin', kind: 'space',
      action: 'delete', adminOnlyDelete: true, spaceId: 's1',
    })
  })

  it('lets the creator delete their own space (short-circuits before any lookup)', async () => {
    await assertCanManageContainer(dbQueue([]), {
      workspaceId: 'w1', createdById: 'owner', actorId: 'owner', kind: 'space',
      action: 'delete', adminOnlyDelete: true, spaceId: 's1',
    })
  })

  it('forbids a manager from deleting an entire space (space.delete is admin-only)', async () => {
    await assert.rejects(
      () => assertCanManageContainer(dbQueue([[{ role: 'manager' }]]), {
        workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'space',
        action: 'delete', adminOnlyDelete: true, spaceId: 's1',
      }),
      /Only the creator or a workspace admin can delete this space/,
    )
  })

  it('lets a manager delete a project in a space they belong to', async () => {
    // [workspaceMembers → manager, spaceMembers → membership row present]
    await assertCanManageContainer(dbQueue([[{ role: 'manager' }], [{ userId: 'mgr' }]]), {
      workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'project',
      action: 'delete', spaceId: 's1',
    })
  })

  it('forbids a manager from deleting a project in a space they do NOT belong to', async () => {
    // [workspaceMembers → manager, spaceMembers → empty (not a member)]
    await assert.rejects(
      () => assertCanManageContainer(dbQueue([[{ role: 'manager' }], []]), {
        workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'project',
        action: 'delete', spaceId: 's1',
      }),
      /Managers can only delete projects in their own spaces/,
    )
  })

  it('still lets a manager EDIT (manage) any container without space membership — no regression', async () => {
    // Only the workspaceMembers lookup runs; edits never require space membership.
    await assertCanManageContainer(dbQueue([[{ role: 'manager' }]]), {
      workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'project',
      action: 'manage', spaceId: 's1',
    })
  })
})
