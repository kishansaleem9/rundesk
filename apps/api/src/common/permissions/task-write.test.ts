import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import { assertMayTrackTime, assertTaskWritable, taskCommentAllowed } from './task-write'
import { VIEW_ONLY_REFUSALS } from './view-only'

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
    // The read rule reads their workspace role and the project's folder, and the private list refuses them,
    // in its own words, as the read is refused (`found-6-oct/task-writes-answer-a-refusal-as-not-found`).
    const db = makeDb([[CTX], [{ role: 'member' }], [{ role: 'member' }], [IN_PRIVATE_LIST], [{ role: 'member' }], []])
    await assert.rejects(() => assertTaskWritable(db, 't1', 'm'), (e: unknown) => e instanceof ForbiddenException && e.message === 'This list is private')
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

/*
 * WHERE THEY ONLY VIEW, THEIR SWITCH DECIDES (`found-25-sep/view-only-individual-permissions`).
 * ClickUp lets a view-only member or guest set a time estimate and track time
 * unless an owner or admin turns it off for them, and add or remove tags only
 * where turned on. The selects for a change: the task, the membership, the
 * account, the read rule's row, its workspace role and folder, no assignee,
 * the space's level, then the person's switches.
 */
describe('assertTaskWritable — a view-only person’s switches', () => {
  const OPEN = { ...IN_PRIVATE_LIST, listVisibility: 'public' }
  const switches = (on: Partial<Record<'viewOnlyTimeEstimates' | 'viewOnlyTimeTracking' | 'viewOnlyTags' | 'viewOnlyCreateViews', boolean>>) => [
    { viewOnlyTimeEstimates: true, viewOnlyTimeTracking: true, viewOnlyTags: false, viewOnlyCreateViews: false, ...on },
  ]
  const atView = (row: unknown[]) => makeDb([[CTX], [{ role: 'member' }], [{ role: 'member' }], [OPEN], [{ role: 'member' }], [], [], ...level('view'), row])

  it('lets a person at View set a time estimate where their switch is on, as it is to begin with', async () => {
    const db = atView(switches({}))
    const ctx = await assertTaskWritable(db, 't1', 'm', { orViewOnly: 'timeEstimates' })
    assert.equal(ctx.taskId, 't1')
    assert.equal(db.left(), 0, 'and their switch was read')
  })

  it('refuses it, in the switch’s words, where it is off', async () => {
    const db = atView(switches({ viewOnlyTimeEstimates: false }))
    await assert.rejects(
      () => assertTaskWritable(db, 't1', 'm', { orViewOnly: 'timeEstimates' }),
      (e: unknown) => e instanceof ForbiddenException && e.message === VIEW_ONLY_REFUSALS.timeEstimates,
    )
  })

  it('refuses a person at View a tag while their switch is off, as it is to begin with, and lets them once it is on', async () => {
    await assert.rejects(
      () => assertTaskWritable(atView(switches({})), 't1', 'm', { orViewOnly: 'tags' }),
      (e: unknown) => e instanceof ForbiddenException && e.message === VIEW_ONLY_REFUSALS.tags,
    )
    const ctx = await assertTaskWritable(atView(switches({ viewOnlyTags: true })), 't1', 'm', { orViewOnly: 'tags' })
    assert.equal(ctx.taskId, 't1')
  })

  it('asks no switch for any other change: at View a title is refused whatever the switches say', async () => {
    const db = makeDb([[CTX], [{ role: 'member' }], [{ role: 'member' }], [OPEN], [{ role: 'member' }], [], [], ...level('view'), ...level('view')])
    await assert.rejects(() => assertTaskWritable(db, 't1', 'm'), /View only/)
  })

  it('asks no switch at Comment: the level’s own rule refuses a tag there, as it did', async () => {
    const db = makeDb([[CTX], [{ role: 'member' }], [{ role: 'member' }], [OPEN], [{ role: 'member' }], [], [], ...level('comment'), ...level('comment')])
    await assert.rejects(() => assertTaskWritable(db, 't1', 'm', { orViewOnly: 'tags' }), /default permission is "Comment", which does not allow changing its tasks/)
  })
})

describe('assertMayTrackTime — a view-only person’s time tracking', () => {
  const TRACKED = { listId: 'l1', workspaceId: 'w1', spaceId: 's1', projectId: 'p1', folderId: null }
  const row = (viewOnlyTimeTracking: boolean) => [{ viewOnlyTimeEstimates: true, viewOnlyTimeTracking, viewOnlyTags: false, viewOnlyCreateViews: false }]

  it('lets a person at View track time while their switch is on, as it is to begin with', async () => {
    const db = makeDb([[TRACKED], [{ role: 'member' }], ...level('view'), row(true)])
    await assertMayTrackTime(db, 't1', 'm')
    assert.equal(db.left(), 0, 'and their switch was read')
  })

  it('refuses them, in the switch’s words, once it is off', async () => {
    const db = makeDb([[TRACKED], [{ role: 'member' }], ...level('view'), row(false)])
    await assert.rejects(
      () => assertMayTrackTime(db, 't1', 'm'),
      (e: unknown) => e instanceof ForbiddenException && e.message === VIEW_ONLY_REFUSALS.timeTracking,
    )
  })

  it('asks no switch of a person at Comment or above, nor of a manager', async () => {
    const commenter = makeDb([[TRACKED], [{ role: 'member' }], ...level('comment'), row(false)])
    await assertMayTrackTime(commenter, 't1', 'm')
    assert.equal(commenter.left(), 1, 'the switch was not read')
    const admin = makeDb([[TRACKED], [{ role: 'workspace_admin' }], row(false)])
    await assertMayTrackTime(admin, 't1', 'a')
    assert.equal(admin.left(), 1, 'nor was the level')
  })
})
