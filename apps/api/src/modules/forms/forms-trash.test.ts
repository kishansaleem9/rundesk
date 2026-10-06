import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { FormsService } from './forms.service'
import { heldInTrashWords, LIST_IN_TRASH_ASK, LIST_IN_TRASH_RESTORE, ListInTrashException } from '../../common/permissions/task-create'

/*
 * A LIST IN THE TRASH TAKES NO TASK, A FORM'S INCLUDED
 * (`found-5-oct/default-list-files-into-an-archived-list`). A submission's task
 * is inserted by the form itself, past `createTask` and its gate: a public
 * submission to a form whose list had been deleted made its task in it, and a
 * form could be made, and aimed, at a list already in the trash. A queued
 * Drizzle stand-in answers each select in the order it is asked; inserts are kept.
 */
function service(selects: unknown[][]) {
  const queue = [...selects]
  const inserts: unknown[] = []
  const node = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as any
    for (const v of ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy']) p[v] = () => p
    return p
  }
  const db = {
    select: mock.fn(() => node(queue.shift() ?? [])),
    insert: mock.fn(() => ({ values: (v: unknown) => { inserts.push(v); const r: any = Promise.resolve([{ id: 'made-1' }]); r.returning = async () => [{ id: 'made-1' }]; r.onConflictDoNothing = async () => undefined; return r } })),
  } as any
  const svc: any = new FormsService(db, { configured: false } as any, { fire: mock.fn(async () => undefined) } as any)
  return { svc, inserts, left: () => queue.length }
}

const LIST = '44444444-4444-4444-8444-444444444444'
const FORM = { id: 'f1', workspaceId: 'w1', title: 'Intake', targetListId: LIST, fields: [] }

describe('FormsService — a list in the trash', () => {
  it('makes no task for a submission whose list is in the trash: the refusal is the routing error the submission keeps', async () => {
    const { svc, inserts } = service([[{ id: LIST, workspaceId: 'w1', inTrash: true }]])
    await assert.rejects(
      () => svc.createTaskForSubmission(FORM, {}, 'someone@example.invalid', 'Someone'),
      (e: unknown) => e instanceof ListInTrashException && (e as Error).message === LIST_IN_TRASH_RESTORE,
    )
    assert.equal(inserts.length, 0, 'a task was made in a list in the trash')
  })

  it('nor for a submission whose list’s project is in the trash, naming it (found-6-oct/task-fallback-files-into-a-deleted-project)', async () => {
    const { svc, inserts } = service([[{ id: LIST, workspaceId: 'w1', inTrash: false }], [{ projectInTrash: true, projectDeletedById: 'the-admin' }]])
    await assert.rejects(
      () => svc.createTaskForSubmission(FORM, {}, null, null),
      (e: unknown) => e instanceof ListInTrashException && (e as Error).message === heldInTrashWords('project', true),
    )
    assert.equal(inserts.length, 0, 'a task was made in a list whose project is in the trash')
  })

  it('and makes it once the list is not in the trash', async () => {
    const { svc, inserts } = service([[{ id: LIST, workspaceId: 'w1', inTrash: false }]])
    const made = await svc.createTaskForSubmission(FORM, {}, null, null)
    assert.equal(made, 'made-1')
    assert.equal(inserts.length, 1)
  })

  it('refuses a form aimed at a list in the trash, telling a member who did not delete it to ask for it to be restored', async () => {
    // The read rule's selects (the list, the workspace role, the project's folder), then the list's trash state.
    const { svc } = service([
      [{ listId: LIST, listVisibility: 'public', listCreatedById: 'the-admin', projectId: 'p1', projectVisibility: 'public', spaceId: 's1', spaceVisibility: 'public' }],
      [{ role: 'member' }],
      [],
      [{ inTrash: true, deletedById: 'the-admin' }],
    ])
    await assert.rejects(
      () => svc.assertMayFileInto('w1', LIST, 'a-member'),
      (e: unknown) => e instanceof ListInTrashException && (e as Error).message === LIST_IN_TRASH_ASK,
    )
  })
})
