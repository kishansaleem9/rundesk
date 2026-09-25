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
 *
 * Passing a `spaceId` now issues MORE, and they come first: §V2-06's Default
 * permission gate (`space-default-permission.ts`) resolves the actor's level on
 * the space before anything else here runs. `gate()` below writes those rows so
 * each test states what the space's default is rather than inheriting it from
 * the position of a bare array.
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

/**
 * The rows the §V2-06 Default-permission gate reads, in the order it reads
 * them, for a call that carries a `spaceId`.
 *
 * A workspace admin / manager / super-admin is resolved at the role lookup and
 * the gate stops there; anyone else is then asked for an explicit grant
 * (`space_members`, then `object_shares`), which is why those two rows only
 * appear for the other roles.
 */
const gate = (
  defaultPermission: string,
  role: string | null,
  explicit?: { spaceMember?: any[]; share?: any[] },
) => {
  const rows: any[][] = [
    [{ workspaceId: 'w1', defaultPermission }],
    role ? [{ role }] : [],
  ]
  if (role && !['super_admin', 'workspace_admin', 'manager'].includes(role)) {
    rows.push(explicit?.spaceMember ?? [], explicit?.share ?? [])
  }
  return rows
}

describe('assertCanManageContainer — delete scoping (plan §3: Manager own-space)', () => {
  it('lets a workspace admin delete a space', async () => {
    await assertCanManageContainer(
      dbQueue([...gate('edit', 'workspace_admin'), [{ role: 'workspace_admin' }]]),
      {
        workspaceId: 'w1', createdById: 'other', actorId: 'admin', kind: 'space',
        action: 'delete', adminOnlyDelete: true, spaceId: 's1',
      },
    )
  })

  it('lets the creator delete their own space (short-circuits after the space gate)', async () => {
    // The space's default is Full edit — every space's, unless told otherwise —
    // which is what deleting asks, so the gate passes the decision back and the
    // creator branch takes it (`found-25-sep/full-edit-enforced-nowhere`).
    await assertCanManageContainer(dbQueue([...gate('admin', 'member')]), {
      workspaceId: 'w1', createdById: 'owner', actorId: 'owner', kind: 'space',
      action: 'delete', adminOnlyDelete: true, spaceId: 's1',
    })
  })

  it('refuses the creator a delete where the space is Edit — Edit changes and does not delete', async () => {
    await assert.rejects(
      () => assertCanManageContainer(dbQueue([...gate('edit', 'member')]), {
        workspaceId: 'w1', createdById: 'owner', actorId: 'owner', kind: 'list',
        action: 'delete', spaceId: 's1',
      }),
      /does not allow deleting this list/,
    )
  })

  it('lets the creator manage at Edit — renaming asks Edit, not Full edit', async () => {
    await assertCanManageContainer(dbQueue([...gate('edit', 'member')]), {
      workspaceId: 'w1', createdById: 'owner', actorId: 'owner', kind: 'list',
      action: 'manage', spaceId: 's1',
    })
  })

  it('forbids a manager from deleting an entire space (space.delete is admin-only)', async () => {
    await assert.rejects(
      () => assertCanManageContainer(
        dbQueue([...gate('edit', 'manager'), [{ role: 'manager' }]]),
        {
          workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'space',
          action: 'delete', adminOnlyDelete: true, spaceId: 's1',
        },
      ),
      /Only the creator or a workspace admin can delete this space/,
    )
  })

  it('lets a manager delete a project in a space they belong to', async () => {
    // [workspaceMembers → manager, spaceMembers → membership row present]
    await assertCanManageContainer(
      dbQueue([...gate('edit', 'manager'), [{ role: 'manager' }], [{ userId: 'mgr' }]]),
      {
        workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'project',
        action: 'delete', spaceId: 's1',
      },
    )
  })

  it('forbids a manager from deleting a project in a space they do NOT belong to', async () => {
    // [workspaceMembers → manager, spaceMembers → empty (not a member)]
    await assert.rejects(
      () => assertCanManageContainer(
        dbQueue([...gate('edit', 'manager'), [{ role: 'manager' }], []]),
        {
          workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'project',
          action: 'delete', spaceId: 's1',
        },
      ),
      /Managers can only delete projects in their own spaces/,
    )
  })

  it('still lets a manager EDIT (manage) any container without space membership — no regression', async () => {
    // Only the workspaceMembers lookup runs; edits never require space membership.
    await assertCanManageContainer(
      dbQueue([...gate('edit', 'manager'), [{ role: 'manager' }]]),
      {
        workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'project',
        action: 'manage', spaceId: 's1',
      },
    )
  })
})

/**
 * §V2-06 frame `06:52` — the Default permission the wizard collects, enforced.
 *
 * The column was written, validated on create, validated again on update, and
 * read by nothing. These are the cases that make it mean something; the e2e
 * `test/e2e/space-default-permission.mjs` proves the same refusals happen over
 * HTTP, against a real space, to a real member.
 */
describe('assertCanManageContainer — the space Default permission (§V2-06 `06:52`)', () => {
  it('refuses the container CREATOR when the space is view-only', async () => {
    // The sharpest case: "I made this list" is not an exception to a space
    // nobody may write to, and it is the branch that would otherwise let every
    // member edit whatever they had created.
    await assert.rejects(
      () => assertCanManageContainer(dbQueue([...gate('view', 'member')]), {
        workspaceId: 'w1', createdById: 'u9', actorId: 'u9', kind: 'list', spaceId: 's1',
      }),
      /default permission is "View only"/,
    )
  })

  it('refuses at `comment` too — the rung below edit, not just the bottom one', async () => {
    await assert.rejects(
      () => assertCanManageContainer(dbQueue([...gate('comment', 'member')]), {
        workspaceId: 'w1', createdById: 'u9', actorId: 'u9', kind: 'project', spaceId: 's1',
      }),
      /default permission is "Comment"/,
    )
  })

  it('allows at `edit` — the column default, so no space that exists today changes', async () => {
    await assertCanManageContainer(dbQueue([...gate('edit', 'member')]), {
      workspaceId: 'w1', createdById: 'u9', actorId: 'u9', kind: 'list', spaceId: 's1',
    })
  })

  it('allows at `admin` without granting anything the old rules refused', async () => {
    // `admin` clears the gate, and the plain-member rule below still refuses a
    // container they did not create — the column narrows, it never widens.
    await assert.rejects(
      () => assertCanManageContainer(
        dbQueue([...gate('admin', 'member'), [{ role: 'member' }]]),
        { workspaceId: 'w1', createdById: 'someone-else', actorId: 'u9', kind: 'list', spaceId: 's1' },
      ),
      /Only the creator or a workspace admin/,
    )
  })

  it('an explicit space_members grant beats the space default', async () => {
    await assertCanManageContainer(
      dbQueue([...gate('view', 'member', { spaceMember: [{ role: 'edit' }] })]),
      { workspaceId: 'w1', createdById: 'u9', actorId: 'u9', kind: 'list', spaceId: 's1' },
    )
  })

  it('an explicit object_shares grant beats the space default too', async () => {
    await assertCanManageContainer(
      dbQueue([...gate('view', 'member', { share: [{ level: 'admin' }] })]),
      { workspaceId: 'w1', createdById: 'u9', actorId: 'u9', kind: 'list', spaceId: 's1' },
    )
  })

  it('an explicit grant WEAKER than the default still refuses', async () => {
    // Most-specific-wins in both directions: a `view` share on a space whose
    // default is `edit` is a deliberate narrowing, not a floor to ignore.
    await assert.rejects(
      () => assertCanManageContainer(
        dbQueue([...gate('edit', 'member', { spaceMember: [{ role: 'view' }] })]),
        { workspaceId: 'w1', createdById: 'u9', actorId: 'u9', kind: 'list', spaceId: 's1' },
      ),
      /Your access to this space is "View only"/,
    )
  })

  it('does not narrow a workspace admin, whatever the space says', async () => {
    await assertCanManageContainer(
      dbQueue([...gate('view', 'workspace_admin'), [{ role: 'workspace_admin' }]]),
      { workspaceId: 'w1', createdById: 'other', actorId: 'admin', kind: 'space', spaceId: 's1' },
    )
  })

  it('does not fire at all without a spaceId — a caller that passes none keeps its old behaviour', async () => {
    // `email-to-task.service.ts` is such a caller. The gate must be inert for
    // it rather than guessing which space the list is in.
    await assertCanManageContainer(dbWithRole([]), {
      workspaceId: 'w1', createdById: 'u1', actorId: 'u1', kind: 'list email alias',
    })
  })

  it('is inert for an actor with no workspace membership row', async () => {
    // A super-admin acting across workspaces. The column is about MEMBERS; the
    // caller's own rules (which see the global role) stay the authority.
    await assertCanManageContainer(dbQueue([...gate('view', null)]), {
      workspaceId: 'w1', createdById: 'root', actorId: 'root', kind: 'space', spaceId: 's1',
    })
  })
})
