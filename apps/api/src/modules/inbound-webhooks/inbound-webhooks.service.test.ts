import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import { InboundWebhooksService } from './inbound-webhooks.service'
import { LIST_IN_TRASH_RESTORE, ListInTrashException } from '../../common/permissions/task-create'

/*
 * A HOOK'S DELIVERY INTO A LIST IN THE TRASH IS REFUSED IN THE TRASH'S WORDS
 * (`found-5-oct/default-list-files-into-an-archived-list`), not as a maker who
 * lost the list: the gate's trash refusal reached here as a plain no, and was
 * answered 403 "This webhook’s creator can no longer add tasks to its list",
 * of a maker who still could once the list was restored.
 */
function service(gate: () => Promise<unknown>) {
  const node = (rows: unknown[]) => {
    const p = Promise.resolve(rows) as any
    for (const v of ['from', 'where', 'limit', 'innerJoin']) p[v] = () => p
    return p
  }
  const db = { select: mock.fn(() => node([{ id: 'h1', token: 'tok', isEnabled: true, listId: 'l1', createdById: 'the-maker' }])) } as any
  const tasks = { assertCanCreateTaskIn: mock.fn(gate), createTask: mock.fn(async () => ({ id: 'made-1' })) }
  return { svc: new InboundWebhooksService(db, tasks as any), tasks }
}

describe('InboundWebhooksService.receive — its list in the trash', () => {
  it('answers a list in the trash in the trash’s own words (409), and makes nothing', async () => {
    const { svc, tasks } = service(async () => { throw new ListInTrashException() })
    await assert.rejects(
      () => svc.receive('tok', { title: 'from outside' }),
      (e: unknown) => e instanceof ListInTrashException && (e as Error).message === LIST_IN_TRASH_RESTORE,
    )
    assert.equal(tasks.createTask.mock.callCount(), 0)
  })

  it('and its maker’s own refusal in the hook’s words, as before', async () => {
    const { svc, tasks } = service(async () => { throw new ForbiddenException('This space’s default permission is "View only", which does not allow adding a task') })
    await assert.rejects(
      () => svc.receive('tok', { title: 'from outside' }),
      (e: unknown) => e instanceof ForbiddenException && (e as Error).message === 'This webhook’s creator can no longer add tasks to its list',
    )
    assert.equal(tasks.createTask.mock.callCount(), 0)
  })

  it('and makes the task when its maker still may', async () => {
    const { svc, tasks } = service(async () => ({ workspaceId: 'w1' }))
    const out = await svc.receive('tok', { title: 'from outside' })
    assert.deepEqual(out, { ok: true, taskId: 'made-1' })
    assert.equal(tasks.createTask.mock.callCount(), 1)
  })
})
