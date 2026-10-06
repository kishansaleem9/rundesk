import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { TasksService } from './tasks.service'
import { ListInTrashException } from '../../common/permissions/task-create'

/*
 * WHERE A TASK WITH NO LIST GOES WHEN THE CHOSEN DEFAULT LIST IS IN THE TRASH
 * (`found-5-oct/default-list-files-into-an-archived-list`). `/task`, a chat
 * message and the AI's "Create task from this" filed their tasks into a
 * deleted Default list. The create gate now refuses a list in the trash, and
 * the picker says so rather than passing the choice over; a list the person
 * may not add to is still passed over, as before. The database answers the
 * person's settings and then the fallback's candidates; the gate is stood in for.
 */
function service(selects: unknown[][]) {
  const queue = [...selects]
  const node = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as any
    for (const v of ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy']) p[v] = () => p
    return p
  }
  const db = { select: mock.fn(() => node(queue.shift() ?? [])) }
  const svc: any = new TasksService(db as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any)
  svc.resolveWorkspaceForList = mock.fn(async () => ({ workspaceId: 'w', spaceId: 's', projectId: 'p' }))
  svc.canCreateTaskIn = mock.fn(async () => true)
  return { svc, db }
}

const CHOSEN = '22222222-2222-4222-8222-222222222222'
const settings = [{ settings: { defaultListId: CHOSEN } }]

describe('TasksService.defaultListFor — the chosen list', () => {
  it('refuses, saying the chosen Default list is in the trash, rather than filing the task there or elsewhere', async () => {
    const { svc, db } = service([settings, [{ id: 'oldest' }]])
    svc.assertCanCreateTaskIn = mock.fn(async () => {
      throw new ListInTrashException()
    })
    await assert.rejects(
      () => svc.defaultListFor('w', 'u'),
      (e: unknown) => e instanceof ConflictException && /"Default list for new tasks" is in the trash/.test(e.message),
    )
    assert.equal(db.select.mock.callCount(), 1, 'no other list was looked for')
  })

  it('still passes over a chosen list the person may not add to, for the oldest one they may', async () => {
    const { svc } = service([settings, [{ id: 'oldest' }]])
    svc.assertCanCreateTaskIn = mock.fn(async () => {
      throw new ForbiddenException('This space’s default permission is "View only", which does not allow adding a task')
    })
    assert.equal(await svc.defaultListFor('w', 'u'), 'oldest')
  })

  it('tells somebody the Trash will not let restore it to ask an admin, or whoever deleted it, not to restore it', async () => {
    const { svc } = service([settings, [{ id: 'oldest' }]])
    svc.assertCanCreateTaskIn = mock.fn(async () => {
      throw new ListInTrashException(false)
    })
    await assert.rejects(
      () => svc.defaultListFor('w', 'u'),
      (e: unknown) =>
        e instanceof ConflictException &&
        e.message === 'Your "Default list for new tasks" is in the trash. Ask a workspace admin, or whoever deleted it, to restore it, or choose another in Calendar settings → Time blocking.',
    )
  })

  it('takes the chosen list when the gate lets the task in', async () => {
    const { svc } = service([settings])
    svc.assertCanCreateTaskIn = mock.fn(async () => ({ workspaceId: 'w', spaceId: 's', projectId: 'p' }))
    assert.equal(await svc.defaultListFor('w', 'u'), CHOSEN)
  })
})
