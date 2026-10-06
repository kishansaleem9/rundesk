import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NotFoundException } from '@nestjs/common'
import { assertTaskWritable, taskCommentAllowed } from './task-write'

/*
 * THE WRITE RULE ASKS THE READ RULE WITH THE ACCOUNT'S ROLE
 * (`found-5-oct/super-admin-cannot-write-a-task-it-reads`). It handed
 * `readableTask` the workspace role, which is never "super_admin", so a
 * super_admin who is a plain member opened a task in a private list or space
 * and every change of it answered 404. A queued Drizzle stand-in answers the
 * selects in the order the rule asks them: the task, the membership, the
 * account, the read rule's own, the assignee, then the space's level.
 */
function makeDb(results: unknown[][]) {
  const queue = [...results]
  const node = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as any
    for (const v of ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy']) p[v] = () => p
    return p
  }
  return {
    select: () => node(queue.shift() ?? []),
    /** What was left unasked: a rule that stopped early leaves its later answers here. */
    left: () => queue.length,
  } as any
}

const CTX = { taskId: 't1', listId: 'l1', createdById: 'maker', isArchived: false, workspaceId: 'w1', spaceId: 's1', projectId: 'p1', folderId: null }
/** The read rule's row: a task in a list its maker made private, in an open space and project. */
const IN_PRIVATE_LIST = {
  taskId: 't1', listId: 'l1', taskVisibility: 'public', taskCreatedById: 'maker',
  listVisibility: 'private', listCreatedById: 'maker', projectId: 'p1', projectVisibility: 'public',
  spaceId: 's1', spaceVisibility: 'public',
}
/** The same task in a private space the actor is not in. */
const IN_PRIVATE_SPACE = { ...IN_PRIVATE_LIST, listVisibility: 'public', spaceVisibility: 'private' }
/**
 * The space's level, Full edit by default: its row, the membership, no share or
 * grant below it, none on it — read twice, once to see the level and once by
 * the refusal that asks it (`assertSpaceLevel`).
 */
const level = (defaultPermission: string) => [[{ workspaceId: 'w1', defaultPermission }], [{ role: 'member' }], [], [], [], []]
const FULL_EDIT_SPACE = [...level('admin'), ...level('admin')]

describe('assertTaskWritable — the account role', () => {
  it('lets a super_admin who is a plain member change a task in a private list they may open', async () => {
    const db = makeDb([[CTX], [{ role: 'member' }], [{ role: 'super_admin' }], [IN_PRIVATE_LIST], [], ...FULL_EDIT_SPACE])
    const ctx = await assertTaskWritable(db, 't1', 'sa')
    assert.equal(ctx.taskId, 't1')
    assert.equal(db.left(), 0, 'and the space’s level was asked of them, as of any member')
  })

  it('lets a super_admin who is a plain member change a task in a private space they are not in', async () => {
    const db = makeDb([[CTX], [{ role: 'member' }], [{ role: 'super_admin' }], [IN_PRIVATE_SPACE], [], ...FULL_EDIT_SPACE])
    const ctx = await assertTaskWritable(db, 't1', 'sa')
    assert.equal(ctx.taskId, 't1')
  })

  it('still refuses a plain member, whose account is no super_admin, the task in somebody else’s private list', async () => {
    // The read rule reads their workspace role and the project's folder, and the private list refuses them.
    const db = makeDb([[CTX], [{ role: 'member' }], [{ role: 'member' }], [IN_PRIVATE_LIST], [{ role: 'member' }], []])
    await assert.rejects(() => assertTaskWritable(db, 't1', 'm'), (e: unknown) => e instanceof NotFoundException && e.message === 'Task not found')
  })

  it('still asks a super_admin who is a plain member the space’s level', async () => {
    // A view-only space: the read passes, the change does not.
    const db = makeDb([[CTX], [{ role: 'member' }], [{ role: 'super_admin' }], [IN_PRIVATE_LIST], [], ...level('view'), ...level('view')])
    await assert.rejects(() => assertTaskWritable(db, 't1', 'sa'), /View only/)
  })
})

/*
 * AND THE MAIL COMMENT RULE ASKS IT SO TOO (`found-6-oct/mail-comments-read-the-workspace-role`):
 * it handed `readableTask` the workspace role, so a super_admin who is a plain
 * member commented on a private space's task in the app and was refused the
 * same comment by mail. The selects: the task, the membership, the account,
 * the read rule's own, then the space's level.
 */
describe('taskCommentAllowed — the account role', () => {
  const MAILED = { isArchived: false, listId: 'l1', workspaceId: 'w1', spaceId: 's1', projectId: 'p1', folderId: null }

  it('lets a super_admin who is a plain member comment by mail on a task in a private space they are not in, as in the app; a plain member still may not', async () => {
    const sa = makeDb([[MAILED], [{ role: 'member' }], [{ role: 'super_admin' }], [IN_PRIVATE_SPACE], ...level('admin')])
    assert.equal(await taskCommentAllowed(sa, 't1', 'sa'), true)
    // The plain member: the read rule's row, their workspace role, no seat in the private space.
    const plain = makeDb([[MAILED], [{ role: 'member' }], [{ role: 'member' }], [IN_PRIVATE_SPACE], [{ role: 'member' }], []])
    assert.equal(await taskCommentAllowed(plain, 't1', 'm'), false)
  })
})

/*
 * ADDING A SUBTASK IS FULL EDIT, SAID AS WHAT IT IS
 * (`found-6-oct/adding-a-subtask-is-refused-as-deleting`): the parent was asked
 * Full edit with the words for deleting it.
 */
describe('assertTaskWritable — adding a subtask', () => {
  it('refuses a parent where the space’s default is Edit, saying it does not allow adding subtasks to its tasks', async () => {
    // The task, the membership, the account, the read rule's row (an open task), no assignee, then the space's level at Edit, twice.
    const OPEN = { ...IN_PRIVATE_LIST, listVisibility: 'public' }
    const db = makeDb([[CTX], [{ role: 'member' }], [{ role: 'member' }], [OPEN], [{ role: 'member' }], [], [], ...level('edit'), ...level('edit')])
    await assert.rejects(
      () => assertTaskWritable(db, 't1', 'm', { level: 'subtask' }),
      (e: unknown) => e instanceof Error && /which does not allow adding subtasks to its tasks$/.test(e.message),
    )
  })
})
