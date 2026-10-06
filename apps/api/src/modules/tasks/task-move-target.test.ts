import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import { LIST_IN_TRASH_ASK, LIST_IN_TRASH_RESTORE, ListInTrashException } from '../../common/permissions/task-create'
import { lists, spaces, spaceMembers, tasks, users, workspaceMembers } from '@rundesk/db'
import { TasksService } from './tasks.service'

/**
 * A MOVE'S TARGET IS A LIST ITS MOVER MAY OPEN (`found-30-sep/private-task-reads-say-403`).
 *
 * Measured on lane 2, 30 September: a member moved their own task into another
 * member's private list in an open space and was answered 201 — the target was
 * asked the container rule and not the private-list rule, so the task went
 * somewhere its mover could no longer open. A private list is refused now as
 * the route guard refuses it, 403 “This list is private”, and nothing moves; a
 * list in a private space keeps its 403 “You do not have access to that list”.
 *
 * A Drizzle stand-in that answers each select by the table it reads from: the
 * target (`lists`, joined to its project and space), the space's level for the
 * create gate (`spaces`, `workspaceMembers`), the private space's members
 * (`spaceMembers`: not this one), the mover's account (`users`) and the task
 * itself (`tasks`). Everything else reads nothing.
 */
type Rows = Map<unknown, unknown[]>
function makeDb(rows: Rows) {
  const updates: unknown[] = []
  const chain = (state: { table?: unknown }) => {
    const c: any = {
      from: (t: unknown) => { state.table = t; return c },
      innerJoin: () => c,
      leftJoin: () => c,
      where: () => c,
      limit: () => c,
      orderBy: () => c,
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(rows.get(state.table) ?? []).then(res, rej),
    }
    return c
  }
  const db = {
    select: () => chain({}),
    update: (t: unknown) => {
      updates.push(t)
      const c: any = { set: () => c, where: () => c, returning: () => c, then: (res: (v: unknown) => unknown) => Promise.resolve([]).then(res) }
      return c
    },
    insert: () => {
      const c: any = { values: () => c, onConflictDoNothing: () => c, returning: () => c, then: (res: (v: unknown) => unknown) => Promise.resolve([]).then(res) }
      return c
    },
  } as any
  return { db, updates }
}

function mover(target: Record<string, unknown>, accountRole = 'member', workspaceRole = 'member') {
  const { db, updates } = makeDb(new Map<unknown, unknown[]>([
    [lists, [{
      workspaceId: 'w1', spaceId: 's2', spaceVisibility: 'public', projectId: 'p2', projectVisibility: null,
      listVisibility: 'public', listCreatedById: 'the-admin', ...target,
    }]],
    [spaces, [{ workspaceId: 'w1', defaultPermission: 'admin', id: 's2' }]], // Full edit: the create gate passes
    [workspaceMembers, [{ role: workspaceRole }]],
    [spaceMembers, []],
    [users, [{ role: accountRole }]],
    // The task where it is now, read before it is moved.
    [tasks, [{ id: 't1', listId: 'l1' }]],
  ]))
  const realtime = { emitToTask: mock.fn(), emitToList: mock.fn(), emitToUser: mock.fn(), emitToWorkspace: mock.fn() }
  const svc = new TasksService(
    db,
    realtime as any,
    { indexTask: mock.fn(), removeTask: mock.fn() } as any,
    { fire: mock.fn(async () => undefined) } as any,
    { fire: mock.fn(async () => undefined) } as any,
    { notify: mock.fn(async () => undefined) } as any,
    {} as any,
    { configured: false } as any,
    { deleteEverywhere: mock.fn(async () => undefined) } as any,
    { logAuditEvent: mock.fn(async () => undefined) } as any,
  ) as any
  // The task's own write rule passes: it is the mover's own task.
  svc.assertTaskWriteAccess = async () => ({ workspaceId: 'w1' })
  svc.logActivity = async () => undefined
  svc.getTask = async () => ({ id: 't1' })
  return { svc, updates }
}
const refusal = (p: Promise<unknown>) => p.then(() => null, (err: unknown) => err)

describe('moving a task into a list its mover may not open (found-30-sep/private-task-reads-say-403)', () => {
  it('refuses another’s private list in an open space as the guard refuses it, 403 “This list is private”, and moves nothing', async () => {
    const { svc, updates } = mover({ listVisibility: 'private' })
    const refused = await refusal(svc.moveTask('t1', 'a-member', 'l2', 0))
    assert.ok(refused instanceof ForbiddenException, `answered ${(refused as Error)?.constructor?.name}: ${(refused as Error)?.message}`)
    assert.equal((refused as Error).message, 'This list is private')
    assert.equal(updates.length, 0, 'the task was moved into a list its mover may not open')
  })

  it('refuses a list in a private space, 403 “You do not have access to that list”, and moves nothing', async () => {
    const { svc, updates } = mover({ spaceVisibility: 'private' })
    const refused = await refusal(svc.moveTask('t1', 'a-member', 'l2', 0))
    assert.ok(refused instanceof ForbiddenException, `answered ${(refused as Error)?.constructor?.name}: ${(refused as Error)?.message}`)
    assert.equal((refused as Error).message, 'You do not have access to that list')
    assert.equal(updates.length, 0)
  })

  it('and moves the task into the mover’s own private list, so the refusals above are about whose list it is', async () => {
    const { svc, updates } = mover({ listVisibility: 'private', listCreatedById: 'a-member' })
    const moved = await refusal(svc.moveTask('t1', 'a-member', 'l2', 0))
    assert.equal(moved, null, `refused: ${(moved as Error)?.message}`)
    assert.equal(updates.length, 1, 'the task was not moved')
  })

  it('and moves a super_admin’s task into another’s private list, as the guard lets a super_admin open it', async () => {
    const { svc, updates } = mover({ listVisibility: 'private' }, 'super_admin')
    const moved = await refusal(svc.moveTask('t1', 'a-super-admin', 'l2', 0))
    assert.equal(moved, null, `refused: ${(moved as Error)?.message}`)
    assert.equal(updates.length, 1, 'the task was not moved')
  })

  // Found by the triage of 5 October on lane 1: a super_admin who is a plain
  // member opened a private space's list (200) and made a task there (201), and
  // was refused moving one into it (403), on the 1 October revert's first build.
  it('and moves a super_admin’s task into a list of a private space they are not in, as the guard lets them open it', async () => {
    const { svc, updates } = mover({ spaceVisibility: 'private' }, 'super_admin')
    const moved = await refusal(svc.moveTask('t1', 'a-super-admin', 'l2', 0))
    assert.equal(moved, null, `refused: ${(moved as Error)?.message}`)
    assert.equal(updates.length, 1, 'the task was not moved')
  })
})

/*
 * NOR INTO A LIST IN THE TRASH (`found-5-oct/default-list-files-into-an-archived-list`).
 * The create gate refused a deleted list and a move did not: a member moved
 * their task into a list an admin had deleted (201), out of every list of
 * lists, for the purge to take. Refused in the gate's words, and what to do is
 * said by the Trash's rule: an admin, or whoever deleted it, restores it.
 */
describe('moving a task into a list in the trash', () => {
  it('refuses it, 409, telling a member who did not delete it to ask for it to be restored, and moves nothing', async () => {
    const { svc, updates } = mover({ listInTrash: true, listDeletedById: 'the-admin' })
    const refused = await refusal(svc.moveTask('t1', 'a-member', 'l2', 0))
    assert.ok(refused instanceof ListInTrashException, `answered ${(refused as Error)?.constructor?.name}: ${(refused as Error)?.message}`)
    assert.equal((refused as Error).message, LIST_IN_TRASH_ASK)
    assert.equal(updates.length, 0, 'the task was moved into a list in the trash')
  })

  it('and tells a workspace admin to restore it', async () => {
    const { svc, updates } = mover({ listInTrash: true, listDeletedById: 'somebody-else' }, 'member', 'workspace_admin')
    const refused = await refusal(svc.moveTask('t1', 'an-admin', 'l2', 0))
    assert.equal((refused as Error)?.message, LIST_IN_TRASH_RESTORE)
    assert.equal(updates.length, 0)
  })
})
