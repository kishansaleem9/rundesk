import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { TasksService } from './tasks.service'

/**
 * `found-30-sep/private-task-reads-say-403` — WHAT THE CALLER MAY NOT OPEN IS
 * ANSWERED AS WHAT IS NOT THERE, in the same words, on the service paths that
 * name a SECOND task or list: a dependency's other end, and a move's target.
 *
 * Measured on lane 2 before: a dependency on a private task said 403 "This
 * task is private" where one on an id naming nothing said 404 "Related task
 * not found"; a move into a list in a private space said 403 "You do not have
 * access to that list" where a missing list said 404 "Target list not found";
 * and a move into another's private list in an open space was TAKEN (201) —
 * the container rule was asked, the private-list rule was not.
 *
 * The queued Drizzle stand-in of `tasks-security.test.ts`: every select pops
 * the next planned rows.
 */
const VERBS = ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy', 'values', 'onConflictDoNothing', 'set', 'returning']
function node(rows: unknown[]) {
  const p = Promise.resolve(rows) as any
  for (const v of VERBS) p[v] = () => p
  return p
}
function makeDb(selectResults: unknown[][] = []) {
  const selects = [...selectResults]
  const db = {
    select: mock.fn(() => node(selects.shift() ?? [])),
    insert: mock.fn(() => ({ values: () => node([{ id: 'row-1' }]) })),
    update: mock.fn(() => ({ set: () => node([{ id: 'row-1' }]) })),
    delete: mock.fn(() => node([])),
  } as any
  return db
}
function makeService(db: any) {
  const realtime = { emitToTask: mock.fn(), emitToList: mock.fn(), emitToUser: mock.fn(), emitToWorkspace: mock.fn() }
  return new TasksService(
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
  )
}

const OTHER = '77777777-7777-4777-8777-777777777777'
const TARGET = '88888888-8888-4888-8888-888888888888'
const refusal = (p: Promise<unknown>) => p.then(() => null, (err: unknown) => err)
const sameMiss = (refused: unknown, miss: unknown) => {
  assert.ok(miss instanceof NotFoundException, `the miss itself answered ${(miss as Error)?.constructor?.name}`)
  assert.ok(refused instanceof NotFoundException, `refused with ${(refused as Error)?.constructor?.name}: ${(refused as Error)?.message}`)
  assert.equal((refused as NotFoundException).getStatus(), (miss as NotFoundException).getStatus())
  assert.equal((refused as Error).message, (miss as Error).message)
}

/** What `assertTaskReadAccess` reads of a task: the row, the reader's role, the project's folder, and its assignees. */
const privateTaskRead = (over: Record<string, unknown> = {}) => [
  [{
    taskId: OTHER, listId: 'l1', createdById: 'the-admin', workspaceId: 'w1',
    spaceId: 's1', spaceVisibility: 'public', projectId: 'p1', projectVisibility: null,
    listVisibility: 'public', listCreatedById: 'the-admin', taskVisibility: 'private', ...over,
  }],
  [{ role: 'member' }],
  [], // the project's folder: none
  [], // its assignees: not this member
]

describe('a task another task points at, which its caller may not open (found-30-sep/private-task-reads-say-403)', () => {
  it('is refused in the words of one that is not there', async () => {
    // The reference's own lookup (in this workspace), then the read rule's reads.
    const refused = await refusal(
      (makeService(makeDb([[{ workspaceId: 'w1' }], ...privateTaskRead()])) as any).assertTaskReference(OTHER, 'w1', 'a-member', 'Related task not found'),
    )
    const miss = await refusal(
      (makeService(makeDb([[]])) as any).assertTaskReference(OTHER, 'w1', 'a-member', 'Related task not found'),
    )
    sameMiss(refused, miss)
  })

  it('and one the caller may open passes, so the refusal is about the task', async () => {
    const svc = makeService(makeDb([[{ workspaceId: 'w1' }], ...privateTaskRead({ createdById: 'a-member' })]))
    await (svc as any).assertTaskReference(OTHER, 'w1', 'a-member', 'Related task not found')
  })
})

/** What the move asks of its target: the mover's account role, the list where it lives, their role there, the folder. */
const targetRead = (listOver: Record<string, unknown> = {}) => [
  [{ role: 'member' }], // users.role
  [{
    listId: TARGET, listVisibility: 'public', listCreatedById: 'the-admin',
    projectId: 'p2', projectVisibility: null, spaceId: 's2', spaceVisibility: 'public', ...listOver,
  }],
  [{ role: 'member' }], // workspace role
  [], // the project's folder: none
]
const mover = (queue: unknown[][]) => {
  const db = makeDb(queue)
  const svc = makeService(db) as any
  svc.assertTaskWriteAccess = async () => ({ workspaceId: 'w1' })
  return { svc, db }
}

describe('moving a task into a list its mover may not open (found-30-sep/private-task-reads-say-403)', () => {
  it('refuses another’s private list in an open space as a list that is not there, and moves nothing', async () => {
    const { svc, db } = mover(targetRead({ listVisibility: 'private' }))
    const refused = await refusal(svc.moveTask('t1', 'a-member', TARGET, 0))
    const miss = await refusal(mover([[{ role: 'member' }], []]).svc.moveTask('t1', 'a-member', TARGET, 0))
    sameMiss(refused, miss)
    assert.equal(db.update.mock.callCount(), 0, 'the task was moved into a list its mover may not open')
  })

  it('refuses a list in a private space as a list that is not there', async () => {
    // The space is private and the mover is not among its members.
    const refused = await refusal(mover([...targetRead({ spaceVisibility: 'private' }).slice(0, 3), []]).svc.moveTask('t1', 'a-member', TARGET, 0))
    const miss = await refusal(mover([[{ role: 'member' }], []]).svc.moveTask('t1', 'a-member', TARGET, 0))
    sameMiss(refused, miss)
  })
})

/*
 * A MERGE names two tasks, and either may be one its merger may not open
 * (`found-30-sep/private-task-reads-say-403`, review). Measured on lane 2
 * before: a private target said "Task not found" where nothing said "The task
 * to merge into was not found"; a private subtask target said "Subtasks only
 * nest one level deep" (400); a binned source said "A task in the bin cannot be
 * merged" (400) — each to somebody who may not open the task.
 *
 * What a merge reads, in order: the source, the target, the source's
 * subtasks; the source by the read rule; the target's workspace and then the
 * target by the read rule (`assertTaskReference`).
 */
const SOURCE = { id: 'mine', listId: 'l1', parentTaskId: null, title: 'mine', description: null, isArchived: false }
const TARGET_ROW = { id: OTHER, listId: 'l1', parentTaskId: null, title: 'theirs', description: null, isArchived: false }
/** The read rule's reads of the member's own open task. */
const ownTaskRead = [
  [{
    taskId: 'mine', listId: 'l1', createdById: 'a-member', workspaceId: 'w1',
    spaceId: 's1', spaceVisibility: 'public', projectId: 'p1', projectVisibility: null,
    listVisibility: 'public', listCreatedById: 'the-admin', taskVisibility: 'public',
  }],
  [{ role: 'member' }],
  [], // the project's folder: none
]
const merge = (queue: unknown[][], source = 'mine', target = OTHER) =>
  refusal((makeService(makeDb(queue)) as any).mergeTask(source, target, 'a-member'))

describe('merging into, or merging away, a task its merger may not open (found-30-sep/private-task-reads-say-403)', () => {
  it('refuses a private target — and a private subtask, merged into from a task with subtasks — as a target that is not there', async () => {
    const plain = await merge([[SOURCE], [TARGET_ROW], [], ...ownTaskRead, [{ workspaceId: 'w1' }], ...privateTaskRead()])
    const subtask = await merge([[SOURCE], [{ ...TARGET_ROW, parentTaskId: 'their-parent' }], [{ id: 'my-subtask' }], ...ownTaskRead, [{ workspaceId: 'w1' }], ...privateTaskRead()])
    const miss = await merge([[SOURCE], [], [], ...ownTaskRead, []])
    assert.equal((miss as Error)?.message, 'The task to merge into was not found')
    sameMiss(plain, miss)
    sameMiss(subtask, miss)
  })

  it('refuses a source the merger may not open, binned or not, as a task that is not there — not as a merge refusal', async () => {
    const binned = await merge([[{ ...SOURCE, id: OTHER, isArchived: true }], [{ ...TARGET_ROW, id: 'mine' }], [], ...privateTaskRead()], OTHER, 'mine')
    const miss = await merge([[], [{ ...TARGET_ROW, id: 'mine' }]], OTHER, 'mine')
    sameMiss(binned, miss)
  })

  it('and one the merger may open still meets the merge rule (a subtask target of a task with subtasks, 400), so the refusals above are about reading', async () => {
    const theirsOpen = [[{ ...ownTaskRead[0][0] as object, taskId: OTHER, createdById: 'the-admin' }], [{ role: 'member' }], []]
    const nested = await merge([[SOURCE], [{ ...TARGET_ROW, parentTaskId: 'their-parent' }], [{ id: 'my-subtask' }], ...ownTaskRead, [{ workspaceId: 'w1' }], ...theirsOpen])
    assert.ok(nested instanceof BadRequestException, `answered ${(nested as Error)?.constructor?.name}: ${(nested as Error)?.message}`)
    assert.match((nested as Error).message, /nest one level/)
  })
})
