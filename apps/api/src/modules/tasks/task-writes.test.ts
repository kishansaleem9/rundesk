import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { labels, taskLabelAssignments, tasks } from '@rundesk/db'
import { TasksService } from './tasks.service'

/**
 * THE WRITES THAT SET A TASK'S DATES, ESTIMATE AND TAGS, asked of the service
 * itself with its database stood in for:
 *
 *   · a task's two dates and its estimate are written as they are sent, on
 *     create, patch, the bulk editor and the next occurrence of a recurring
 *     task — a start after the due date and an estimate below nought among
 *     them (the owner's decision of 1 October);
 *   · `found-30-sep/refused-create-leaves-tags` — a tag named for a task was
 *     made before the create was asked about, so a refused create left it.
 *     Asked twice: that it is refused, and that nothing was written — the
 *     database's inserts are counted.
 */

const noop = () => undefined
function service(db: any) {
  const svc: any = new TasksService(
    db,
    { emitToList: mock.fn(noop), emitToTask: mock.fn(noop) } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { autoFollowEnabled: mock.fn(async () => false) } as any,
    {} as any,
    { pushTask: mock.fn(async () => undefined) } as any,
    { logAuditEvent: mock.fn(async () => undefined) } as any,
  )
  // What `createTask` asks before it writes, answered for a list anybody here may add to.
  svc.assertCanCreateTaskIn = mock.fn(async () => ({ workspaceId: 'w', spaceId: 's', projectId: 'p' }))
  svc.assertPeopleCanSeeList = mock.fn(async () => undefined)
  svc.resolveWorkspaceForList = mock.fn(async () => ({ workspaceId: 'w', spaceId: 's', projectId: 'p' }))
  svc.resolveStatusForList = mock.fn(async () => ({ key: 'todo', category: 'open' }))
  svc.taskTypeBelongsToList = mock.fn(async () => true)
  svc.defaultTaskTypeForList = mock.fn(async () => null)
  svc.typeIsMilestone = mock.fn(async () => false)
  svc.milestoneTypeForList = mock.fn(async () => null)
  svc.logActivity = mock.fn(async () => undefined)
  svc.getTask = mock.fn(async (id: string) => ({ id }))
  svc.indexTaskInSearch = mock.fn(async () => undefined)
  svc.fireTaskEvent = mock.fn(async () => undefined)
  svc.fireCalendarPush = mock.fn(noop)
  svc.assertTaskWriteAccess = mock.fn(async () => ({ workspaceId: 'w', listId: 'l', projectId: 'p', spaceId: 's' }))
  return svc
}

/**
 * A database whose selects answer from a queue, however they are chained, and
 * which keeps every insert (with the table it went to, and whether it was
 * inside the transaction) and every update.
 */
function recordingDb(selects: unknown[][]) {
  const queue = [...selects]
  const written: Array<{ table: unknown; values: any; inTx: boolean }> = []
  const updates: any[] = []
  let transactions = 0
  const select = () => {
    const rows = queue.shift() ?? []
    const q: any = Promise.resolve(rows)
    for (const step of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit']) q[step] = () => q
    return q
  }
  const insertOn = (inTx: boolean) => (table: unknown) => ({
    values: (values: any) => {
      written.push({ table, values, inTx })
      const done: any = Promise.resolve(undefined)
      done.returning = async () => [{ id: table === tasks ? 'task-new' : 'row-new', ...(Array.isArray(values) ? {} : values) }]
      done.onConflictDoNothing = () => done
      return done
    },
  })
  const db: any = {
    select: mock.fn(select),
    insert: mock.fn(insertOn(false)),
    update: mock.fn(() => ({ set: (v: any) => { updates.push(v); const w: any = { where: () => w, returning: async () => [{ id: 't', listId: 'l', ...v }] }; return w } })),
    transaction: mock.fn(async (fn: (tx: any) => Promise<unknown>) => {
      transactions += 1
      return fn({ select: mock.fn(select), insert: mock.fn(insertOn(true)) })
    }),
  }
  return { db, written, updates, transactions: () => transactions }
}

const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12))

describe('TasksService.createTask — dates and estimate as sent, tags asked before anything is written', () => {
  it('makes a task that starts after it is due, with an estimate below nought, writing both as sent', async () => {
    const { db, written } = recordingDb([])
    await service(db).createTask({ listId: 'l', title: 'Late', startDate: day(10), dueDate: day(3), timeEstimate: -3600, createdById: 'u' })
    const task = written.find((w) => w.table === tasks)
    assert.ok(task, `no task was written: ${JSON.stringify(written.map((w) => w.values))}`)
    assert.equal(task.values.startDate.getTime(), day(10).getTime())
    assert.equal(task.values.dueDate.getTime(), day(3).getTime())
    assert.equal(task.values.timeEstimate, -3600)
  })

  it('makes a tag named for the task only after the task, in its transaction — and a create refused after the names are read makes none', async () => {
    // The names asked of the workspace (one found, whatever its case), then the maker's role.
    const made = recordingDb([[{ id: 'label-design', name: 'design' }], [{ role: 'member' }], [{ id: 'label-later' }]])
    await service(made.db).createTask({
      listId: 'l', title: 'Tagged', createdById: 'u',
      labelsByName: [{ name: 'Design' }, { name: 'Later', color: '#00ff00' }],
    })
    assert.deepEqual(made.written.map((w) => [w.table === tasks ? 'task' : w.table === labels ? 'label' : w.table === taskLabelAssignments ? 'tagging' : 'other', w.inTx]), [
      ['task', true], ['label', true], ['tagging', true],
    ])
    assert.deepEqual(made.written[1].values, [{ workspaceId: 'w', name: 'Later', color: '#00ff00' }])
    assert.deepEqual(made.written[2].values.map((v: any) => v.labelId).sort(), ['label-design', 'label-later'])

    const refused = recordingDb([[], [{ role: 'member' }]])
    const svc = service(refused.db)
    svc.taskTypeBelongsToList = mock.fn(async () => false)
    await assert.rejects(
      svc.createTask({
        listId: 'l', title: 'Refused', createdById: 'u', taskTypeId: 'not-the-lists',
        labelsByName: [{ name: 'Never made' }],
      }),
      /does not belong/,
    )
    assert.equal(refused.written.length, 0, `wrote ${JSON.stringify(refused.written.map((w) => w.values))}`)
    assert.equal(refused.transactions(), 0)
  })
})

describe('TasksService.updateTask — the dates and the estimate as sent', () => {
  it('writes a start moved past the due date it holds, a due date moved before its start, both the wrong way round, and an estimate below nought', async () => {
    const before = { id: 't', listId: 'l', startDate: day(1), dueDate: day(3), status: 'todo', statusCategory: 'open' }
    for (const patch of [{ startDate: day(10) }, { dueDate: new Date(Date.UTC(2026, 8, 20, 12)) }, { startDate: day(10), dueDate: day(3) }, { timeEstimate: -60 }]) {
      const { db, updates } = recordingDb([[before]])
      await service(db).updateTask('t', 'u', patch)
      assert.equal(updates.length, 1, `changed the task once for ${JSON.stringify(patch)}`)
      for (const [field, value] of Object.entries(patch)) {
        assert.deepEqual(updates[0][field], value, `wrote ${field} as sent for ${JSON.stringify(patch)}`)
      }
    }
  })
})

describe('TasksService.bulkUpdateTasks — the dates and the estimate handed to each task as sent', () => {
  it('hands two dates the wrong way round, and an estimate below nought, to each task, changing every one', async () => {
    const { db } = recordingDb([])
    const svc = service(db)
    svc.updateTask = mock.fn(async (id: string) => ({ id }))
    const dates = await svc.bulkUpdateTasks(['a', 'b'], 'u', { startDate: day(10), dueDate: day(3) })
    const estimate = await svc.bulkUpdateTasks(['a', 'b'], 'u', { timeEstimate: -120 })
    assert.equal(dates.updatedCount, 2)
    assert.equal(estimate.updatedCount, 2)
    const sent = svc.updateTask.mock.calls.map((c: any) => c.arguments[2])
    assert.deepEqual(sent.slice(0, 2).map((p: any) => [p.startDate.getTime(), p.dueDate.getTime()]), [[day(10).getTime(), day(3).getTime()], [day(10).getTime(), day(3).getTime()]])
    assert.deepEqual(sent.slice(2).map((p: any) => p.timeEstimate), [-120, -120])
  })
})

describe('TasksService.createNextRecurringOccurrence — each date moved by the rule on its own', () => {
  it('moves the start and the due date each by the rule, a start after the due among them, and carries the estimate as it is', async () => {
    const { db } = recordingDb([])
    const svc = service(db)
    const source = {
      id: 't', listId: 'l', title: 'Monthly', description: null, priority: 'normal', status: 'todo', statusCategory: 'open',
      startDate: new Date(2026, 9, 5, 14), dueDate: new Date(2026, 9, 20, 9), timeEstimate: -60, assignees: [], parentTaskId: null,
    }
    svc.getTask = mock.fn(async () => source)
    svc.createTask = mock.fn(async () => ({ id: 'next' }))
    await svc.createNextRecurringOccurrence('t', 'u', null, { mode: 'monthly', dayOfMonth: 1 })
    const next = svc.createTask.mock.calls[0].arguments[0]
    // A monthly rule puts both on the 1st, each keeping its time: the start at 14:00, the due at 09:00.
    assert.equal(next.startDate.getTime(), new Date(2026, 10, 1, 14).getTime())
    assert.equal(next.dueDate.getTime(), new Date(2026, 10, 1, 9).getTime())
    assert.equal(next.timeEstimate, -60)
  })
})
