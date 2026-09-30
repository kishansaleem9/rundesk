import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { BadRequestException } from '@nestjs/common'
import { labels, taskLabelAssignments, tasks } from '@rundesk/db'
import { TasksService } from './tasks.service'

/**
 * THE WRITES THAT SET A TASK'S DATES, ESTIMATE AND TAGS, asked of the service
 * itself with its database stood in for:
 *
 *   · `found-30-sep/a-task-starts-after-it-is-due` — nothing refused a start
 *     after the due date on create, patch or the bulk editor;
 *   · `found-30-sep/task-estimate-below-zero` — nor an estimate below nought;
 *   · `found-30-sep/refused-create-leaves-tags` — and a tag named for a task
 *     was made before the create was asked about, so a refused create left it.
 *
 * Every refusal is asked twice: that it is refused, and that nothing was
 * written — the database's inserts and updates are counted.
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
    update: mock.fn(() => ({ set: (v: any) => { updates.push(v); const w: any = { where: () => w, returning: async () => [] }; return w } })),
    transaction: mock.fn(async (fn: (tx: any) => Promise<unknown>) => {
      transactions += 1
      return fn({ select: mock.fn(select), insert: mock.fn(insertOn(true)) })
    }),
  }
  return { db, written, updates, transactions: () => transactions }
}

const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12))

describe('TasksService.createTask — dates, estimate and tags asked before anything is written', () => {
  it('refuses a task that starts after it is due, or an estimate below nought, and writes nothing', async () => {
    const { db, written, transactions } = recordingDb([])
    const svc = service(db)
    await assert.rejects(
      svc.createTask({ listId: 'l', title: 'Late', startDate: day(10), dueDate: day(3), createdById: 'u' }),
      (e: unknown) => e instanceof BadRequestException && /cannot start after it is due/.test((e as Error).message),
    )
    await assert.rejects(
      svc.createTask({ listId: 'l', title: 'Negative', timeEstimate: -3600, createdById: 'u' }),
      BadRequestException,
    )
    assert.equal(written.length, 0)
    assert.equal(transactions(), 0)
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

describe('TasksService.updateTask — the dates it would hold, and its estimate', () => {
  it('refuses one date moved past the other it holds, both sent the wrong way round, and an estimate below nought — and changes nothing', async () => {
    const before = { id: 't', listId: 'l', startDate: day(1), dueDate: day(3), status: 'todo', statusCategory: 'open' }
    // The start moved past the due it holds; the due moved before the start it holds; both the wrong way round; below nought.
    for (const patch of [{ startDate: day(10) }, { dueDate: new Date(Date.UTC(2026, 8, 20, 12)) }, { startDate: day(10), dueDate: day(3) }, { timeEstimate: -60 }]) {
      const { db, updates } = recordingDb([[before]])
      await assert.rejects(service(db).updateTask('t', 'u', patch), BadRequestException, `refuses ${JSON.stringify(patch)}`)
      assert.equal(updates.length, 0, `changed nothing for ${JSON.stringify(patch)}`)
    }
  })
})

describe('TasksService.bulkUpdateTasks — what is wrong whatever the task is refused for the whole request', () => {
  it('refuses an estimate below nought, or two dates the wrong way round, before any task is changed', async () => {
    const { db } = recordingDb([])
    const svc = service(db)
    svc.updateTask = mock.fn(async () => ({}))
    await assert.rejects(svc.bulkUpdateTasks(['a', 'b'], 'u', { timeEstimate: -120 }), BadRequestException)
    await assert.rejects(svc.bulkUpdateTasks(['a', 'b'], 'u', { startDate: day(10), dueDate: day(3) }), BadRequestException)
    assert.equal(svc.updateTask.mock.callCount(), 0)
  })
})

/*
 * A review of this work: a due day with no time beside a start typed at 09:00
 * on the next day in Karachi (04:00Z) was taken from the sheet, a list row and
 * the calendar — the server, knowing no zone, refuses only what every zone
 * sees out of order. The web now names its zone on every write, and each write
 * asks the order there.
 */
describe('TasksService — a day beside a moment, ordered where its writer is', () => {
  const dueThe4th = new Date('2026-10-04T00:00:00Z')
  const nineInKarachiOnThe5th = new Date('2026-10-05T04:00:00Z')
  it('refuses it on create, patch and the bulk editor in the writer’s zone, writing nothing, and hands the bulk editor’s zone to each task', async () => {
    const made = recordingDb([])
    await assert.rejects(
      service(made.db).createTask({ listId: 'l', title: 'Karachi', startDate: nineInKarachiOnThe5th, dueDate: dueThe4th, createdById: 'u', writerZone: 'Asia/Karachi' }),
      (e: unknown) => e instanceof BadRequestException && /cannot start after it is due/.test((e as Error).message),
    )
    assert.equal(made.written.length, 0)

    const patched = recordingDb([[{ id: 't', listId: 'l', startDate: null, dueDate: dueThe4th, status: 'todo', statusCategory: 'open' }]])
    await assert.rejects(
      service(patched.db).updateTask('t', 'u', { startDate: nineInKarachiOnThe5th }, { writerZone: 'Asia/Karachi' }),
      BadRequestException,
    )
    assert.equal(patched.updates.length, 0)

    const bulk = recordingDb([])
    const svc = service(bulk.db)
    svc.updateTask = mock.fn(async () => ({ id: 'a' }))
    await assert.rejects(
      svc.bulkUpdateTasks(['a'], 'u', { startDate: nineInKarachiOnThe5th, dueDate: dueThe4th }, { writerZone: 'Asia/Karachi' }),
      BadRequestException,
    )
    assert.equal(svc.updateTask.mock.callCount(), 0)
    // Where it is on the due day (Los Angeles), the bulk editor sends it on, with the zone, to each task.
    const answer = await svc.bulkUpdateTasks(['a'], 'u', { startDate: nineInKarachiOnThe5th, dueDate: dueThe4th }, { writerZone: 'America/Los_Angeles' })
    assert.equal(answer.updatedCount, 1)
    assert.deepEqual(svc.updateTask.mock.calls[0].arguments[3], { writerZone: 'America/Los_Angeles' })
  })
})

describe('TasksService.createNextRecurringOccurrence — the next one starts no later than it is due', () => {
  it('keeps the start its old distance before the due date where the rule would put it after, and none for a task already inverted', async () => {
    const { db } = recordingDb([])
    const svc = service(db)
    const source = {
      id: 't', listId: 'l', title: 'Monthly', description: null, priority: 'normal', status: 'todo', statusCategory: 'open',
      startDate: new Date(2026, 9, 5, 14), dueDate: new Date(2026, 9, 20, 9), timeEstimate: null, assignees: [], parentTaskId: null,
    }
    svc.getTask = mock.fn(async () => source)
    svc.createTask = mock.fn(async () => ({ id: 'next' }))
    await svc.createNextRecurringOccurrence('t', 'u', null, { mode: 'monthly', dayOfMonth: 1 })
    const next = svc.createTask.mock.calls[0].arguments[0]
    assert.equal(next.dueDate.getTime(), new Date(2026, 10, 1, 9).getTime())
    assert.equal(next.dueDate.getTime() - next.startDate.getTime(), source.dueDate.getTime() - source.startDate.getTime())

    svc.getTask = mock.fn(async () => ({ ...source, startDate: new Date(2026, 9, 25, 14) }))
    await svc.createNextRecurringOccurrence('t', 'u', null, { mode: 'monthly', dayOfMonth: 1 })
    assert.equal(svc.createTask.mock.calls[1].arguments[0].startDate, undefined)
  })
})
