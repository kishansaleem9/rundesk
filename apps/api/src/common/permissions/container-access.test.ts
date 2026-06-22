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
