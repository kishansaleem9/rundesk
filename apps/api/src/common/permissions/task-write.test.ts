import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { assertTaskWritable } from './task-write'

/*
 * THE TASK WRITE RULE ANSWERS A TASK ITS CALLER MAY NOT OPEN AS THE TASK THAT
 * IS NOT THERE (`found-30-sep/private-task-reads-say-403`, review). It is the
 * first check of every task write route with no route guard in front of it.
 * Measured on lane 2 before: a user of another organisation was told "Workspace
 * not found" for a real task and "Task not found" for none, on a change, a
 * move, the bin, assignees, recurrence and each id of the bulk editor; and a
 * binned task answered 409 "This task is in the bin" to a stranger, a guest and
 * a member refused its private list, where an id naming nothing answered 404.
 *
 * A queued Drizzle stand-in answers the selects in the order the rule asks
 * them: the task where it lives, the caller's membership, then what
 * `readableTask` reads — the task again, their role, the project's folder, the
 * private task's assignees.
 */
function makeDb(results: unknown[][]) {
  const queue = [...results]
  const node = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as any
    for (const v of ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy']) p[v] = () => p
    return p
  }
  return { select: () => node(queue.shift() ?? []) } as any
}

const CTX = { taskId: 't1', listId: 'l1', createdById: 'the-admin', isArchived: false, workspaceId: 'w1', spaceId: 's1', projectId: 'p1', folderId: null }
const BINNED = { ...CTX, isArchived: true }
/** What `readableTask` reads of a private task in an open space: the row, the reader's role, the folder, the assignees. */
const privateTaskRead = (createdById = 'the-admin') => [
  [{ taskId: 't1', listId: 'l1', taskVisibility: 'private', taskCreatedById: createdById, listVisibility: 'public', listCreatedById: 'the-admin', projectId: 'p1', projectVisibility: null, spaceId: 's1', spaceVisibility: 'public' }],
  [{ role: 'member' }],
  [], // the project's folder: none
  [], // the private task's assignees: not this member
]
const refusal = (p: Promise<unknown>) => p.then(() => null, (err: unknown) => err)
const sameMiss = (refused: unknown, miss: unknown) => {
  assert.ok(miss instanceof NotFoundException, `the miss itself answered ${(miss as Error)?.constructor?.name}`)
  assert.ok(refused instanceof NotFoundException, `refused with ${(refused as Error)?.constructor?.name}: ${(refused as Error)?.message}`)
  assert.equal((refused as Error).message, (miss as Error).message)
}

describe('the task write rule, for a caller who may not open the task (found-30-sep/private-task-reads-say-403)', () => {
  it('tells a user of another organisation the task is not there, in the words of an id naming nothing', async () => {
    const refused = await refusal(assertTaskWritable(makeDb([[CTX], []]), 't1', 'a-stranger'))
    const miss = await refusal(assertTaskWritable(makeDb([[]]), 't1', 'a-stranger'))
    sameMiss(refused, miss)
  })

  it('tells them a binned task is not there either — not that it is in the bin', async () => {
    const stranger = await refusal(assertTaskWritable(makeDb([[BINNED], []]), 't1', 'a-stranger'))
    const member = await refusal(assertTaskWritable(makeDb([[BINNED], [{ role: 'member' }], ...privateTaskRead()]), 't1', 'a-member'))
    const miss = await refusal(assertTaskWritable(makeDb([[]]), 't1', 'a-member'))
    sameMiss(stranger, miss)
    sameMiss(member, miss)
  })

  it('and tells one who may open the binned task that it is in the bin (409), so the refusals above are about reading it', async () => {
    const own = await refusal(assertTaskWritable(makeDb([[BINNED], [{ role: 'member' }], ...privateTaskRead('a-member').slice(0, 3)]), 't1', 'a-member'))
    const admin = await refusal(assertTaskWritable(makeDb([[BINNED], [{ role: 'workspace_admin' }]]), 't1', 'the-admin'))
    assert.ok(own instanceof ConflictException, `its maker was answered ${(own as Error)?.constructor?.name}: ${(own as Error)?.message}`)
    assert.ok(admin instanceof ConflictException, `the admin was answered ${(admin as Error)?.constructor?.name}: ${(admin as Error)?.message}`)
  })
})
