import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import { assertCanManageContainer } from './container-access'

/**
 * A stand-in for `CustomRolesService.hasPermission`: holds `keys`, and records
 * every question, so a test says which key a kind asks — and whether any was.
 */
const holding = (...keys: string[]) => {
  const asked: Array<{ workspaceId: string; userId: string; key: string }> = []
  return {
    asked,
    hasPermission: async (workspaceId: string, userId: string, key: string) => {
      asked.push({ workspaceId, userId, key })
      return keys.includes(key)
    },
  }
}

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
  it('lets a workspace admin delete a space — an admin holds space.delete by default', async () => {
    const roles = holding('space.delete', 'project.delete', 'list.delete')
    await assertCanManageContainer(
      dbQueue([...gate('edit', 'workspace_admin'), [{ role: 'workspace_admin' }]]),
      {
        workspaceId: 'w1', createdById: 'other', actorId: 'admin', kind: 'space',
        action: 'delete', spaceId: 's1', roles,
      },
    )
    assert.deepEqual(roles.asked.map((q) => q.key), ['space.delete'])
  })

  it('lets the creator delete their own space (short-circuits after the space gate) — and asks no key', async () => {
    // The space's default is Full edit — every space's, unless told otherwise —
    // which is what deleting asks, so the gate passes the decision back and the
    // creator branch takes it (`found-25-sep/full-edit-enforced-nowhere`).
    const roles = holding()
    await assertCanManageContainer(dbQueue([...gate('admin', 'member')]), {
      workspaceId: 'w1', createdById: 'owner', actorId: 'owner', kind: 'space',
      action: 'delete', spaceId: 's1', roles,
    })
    assert.equal(roles.asked.length, 0, 'the maker is asked no key')
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

  it('forbids a manager from deleting a space somebody else made — a manager holds no space.delete by default', async () => {
    // A manager's defaults: project.delete and list.delete, and not space.delete.
    await assert.rejects(
      () => assertCanManageContainer(
        dbQueue([...gate('edit', 'manager'), [{ role: 'manager' }], [{ userId: 'mgr' }]]),
        {
          workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'space',
          action: 'delete', spaceId: 's1', roles: holding('project.delete', 'list.delete'),
        },
      ),
      /Only the creator, or someone granted "Delete spaces", can delete this space/,
    )
  })

  it('lets a manager delete a project in a space they belong to', async () => {
    // [workspaceMembers → manager, spaceMembers → membership row present]
    await assertCanManageContainer(
      dbQueue([...gate('edit', 'manager'), [{ role: 'manager' }], [{ userId: 'mgr' }]]),
      {
        workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'project',
        action: 'delete', spaceId: 's1', roles: holding('project.delete', 'list.delete'),
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
          action: 'delete', spaceId: 's1', roles: holding('project.delete', 'list.delete'),
        },
      ),
      /Managers can only delete projects in their own spaces/,
    )
  })

  it('holds a manager granted space.delete to their own spaces too — their level is their role', async () => {
    await assert.rejects(
      () => assertCanManageContainer(
        dbQueue([...gate('edit', 'manager'), [{ role: 'manager' }], []]),
        {
          workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'space',
          action: 'delete', spaceId: 's1', roles: holding('space.delete', 'project.delete', 'list.delete'),
        },
      ),
      /Managers can only delete spaces in their own spaces/,
    )
  })

  it('still lets a manager EDIT (manage) any container without space membership — no regression', async () => {
    // Only the workspaceMembers lookup runs; edits never require space membership, and ask no key.
    const roles = holding()
    await assertCanManageContainer(
      dbQueue([...gate('edit', 'manager'), [{ role: 'manager' }]]),
      {
        workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'project',
        action: 'manage', spaceId: 's1', roles,
      },
    )
    assert.equal(roles.asked.length, 0, 'changing a container asks no delete key')
  })
})

/**
 * THE DELETION KEYS (`role-editor-offers-unenforced-permissions`): deleting a
 * space, a project or a list somebody else made asks `space.delete`,
 * `project.delete` or `list.delete` — ANDed with Full edit there, which is
 * asked first. `test/e2e/container-delete-keys.mjs` proves the same over HTTP.
 */
describe('assertCanManageContainer — the deletion keys', () => {
  it('lets a member granted list.delete delete a list somebody else made, where they hold Full edit', async () => {
    const roles = holding('list.delete')
    await assertCanManageContainer(dbQueue([...gate('admin', 'member'), [{ role: 'member' }]]), {
      workspaceId: 'w1', createdById: 'someone-else', actorId: 'u9', kind: 'list',
      action: 'delete', spaceId: 's1', roles,
    })
    assert.deepEqual(roles.asked, [{ workspaceId: 'w1', userId: 'u9', key: 'list.delete' }])
  })

  it('refuses a guest a space even with space.delete and Full edit — ClickUp: guests never delete a Space', async () => {
    const roles = holding('space.delete')
    await assert.rejects(
      () => assertCanManageContainer(dbQueue([...gate('admin', 'guest', { share: [{ level: 'admin' }] }), [{ role: 'guest' }]]), {
        workspaceId: 'w1', createdById: 'someone-else', actorId: 'g1', kind: 'space',
        action: 'delete', spaceId: 's1', roles,
      }),
      /A guest cannot delete a space/,
    )
    assert.deepEqual(roles.asked, [], 'no key is asked: the refusal is the role\'s')
  })

  it('refuses a member without the key, and says which permission it takes', async () => {
    await assert.rejects(
      () => assertCanManageContainer(dbQueue([...gate('admin', 'member'), [{ role: 'member' }]]), {
        workspaceId: 'w1', createdById: 'someone-else', actorId: 'u9', kind: 'list',
        action: 'delete', spaceId: 's1', roles: holding(),
      }),
      /Only the creator, or someone granted "Delete lists", can delete this list/,
    )
  })

  it('asks each kind its own key: a member holding project.delete alone deletes a project, and no list or space', async () => {
    const asked: Record<string, string[]> = {}
    const verdicts: Record<string, boolean> = {}
    for (const kind of ['space', 'project', 'list']) {
      const roles = holding('project.delete')
      verdicts[kind] = await assertCanManageContainer(dbQueue([...gate('admin', 'member'), [{ role: 'member' }]]), {
        workspaceId: 'w1', createdById: 'someone-else', actorId: 'u9', kind,
        action: 'delete', spaceId: 's1', roles,
      }).then(() => true, () => false)
      asked[kind] = roles.asked.map((q) => q.key)
    }
    assert.deepEqual(asked, { space: ['space.delete'], project: ['project.delete'], list: ['list.delete'] })
    assert.deepEqual(verdicts, { space: false, project: true, list: false })
  })

  it('asks the level first: a member granted list.delete where the space is Edit is refused by it, and asked no key', async () => {
    const roles = holding('list.delete')
    await assert.rejects(
      () => assertCanManageContainer(dbQueue([...gate('edit', 'member')]), {
        workspaceId: 'w1', createdById: 'someone-else', actorId: 'u9', kind: 'list',
        action: 'delete', spaceId: 's1', roles,
      }),
      /default permission is "Edit", which does not allow deleting this list/,
    )
    assert.equal(roles.asked.length, 0, 'a key never reaches past the level')
  })

  it('and where it is View only, a member granted space.delete deletes no space', async () => {
    const roles = holding('space.delete')
    await assert.rejects(
      () => assertCanManageContainer(dbQueue([...gate('view', 'member')]), {
        workspaceId: 'w1', createdById: 'someone-else', actorId: 'u9', kind: 'space',
        action: 'delete', spaceId: 's1', roles,
      }),
      /default permission is "View only", which does not allow deleting this space/,
    )
    assert.equal(roles.asked.length, 0)
  })

  it('a folder has no key: a manager in their own space deletes it and a member does not, as before, with no roles given', async () => {
    await assertCanManageContainer(
      dbQueue([...gate('admin', 'manager'), [{ role: 'manager' }], [{ userId: 'mgr' }]]),
      { workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'folder', action: 'delete', spaceId: 's1' },
    )
    await assert.rejects(
      () => assertCanManageContainer(
        dbQueue([...gate('admin', 'member'), [{ role: 'member' }]]),
        { workspaceId: 'w1', createdById: 'other', actorId: 'u9', kind: 'folder', action: 'delete', spaceId: 's1' },
      ),
      /Only the creator or a workspace admin can modify this folder/,
    )
  })

  it('a keyed delete with no `roles` is a programming error, not a refusal that reads as a rule', async () => {
    await assert.rejects(
      () => assertCanManageContainer(dbQueue([...gate('admin', 'member'), [{ role: 'member' }]]), {
        workspaceId: 'w1', createdById: 'someone-else', actorId: 'u9', kind: 'list', action: 'delete', spaceId: 's1',
      }),
      (err: unknown) => !(err instanceof ForbiddenException) && /pass `roles`/.test(String((err as Error)?.message)),
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
