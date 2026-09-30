import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { getTableName } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { TasksService } from './tasks.service'

/**
 * HOW A TASK'S FILES ARE READ: in what order, and under whose name.
 *
 *   1. `found-30-sep/attachments-unordered` — `listAttachments` and `getTask`'s
 *      attachments had no ORDER BY, so both came back in heap order. Both now
 *      ask for `created_at, id`: the order the files were attached.
 *   2. `found-30-sep/attachment-card-names-uploader-by-id` — the card drew
 *      `uploadedBy`, an id. The list and the row `addAttachment` returns carry
 *      `uploaderName`, read from `users` through a LEFT join, so a file whose
 *      uploader is gone is still listed.
 *   3. `found-30-sep/comment-files-unordered` — the files each comment carries
 *      (`listComments`), the third read of them, ask for the same order.
 *
 * `task-attachments` measures both on a lane with files written out of heap
 * order; these read the query each read asks for.
 *
 * The Drizzle stand-in answers each select by the table it is FROM, and
 * records every verb it is asked, with its arguments, per table.
 */
const dialect = new PgDialect()
const sqlOf = (x: unknown) => dialect.sqlToQuery(x as never).sql

function makeDb(rowsByTable: Record<string, unknown[]>) {
  const calls: Array<{ table: string; verb: string; args: unknown[] }> = []
  const chain = (): any => {
    let table = '?'
    let rows: unknown[] = []
    const c: any = {
      from: (t: unknown) => {
        table = getTableName(t as never)
        rows = rowsByTable[table] ?? []
        return c
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
    }
    for (const verb of ['where', 'innerJoin', 'leftJoin', 'orderBy', 'limit', 'groupBy']) {
      c[verb] = (...args: unknown[]) => {
        calls.push({ table, verb, args })
        return c
      }
    }
    return c
  }
  const inserted: Array<Record<string, unknown>> = []
  const db = {
    select: mock.fn(() => chain()),
    insert: mock.fn(() => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v)
        const row = { id: 'a-new', commentId: null, createdAt: new Date('2026-09-30T00:00:00Z'), ...v }
        return { returning: async () => [row] }
      },
    })),
    query: {
      tasks: { findFirst: mock.fn(async () => ({ id: 't1', listId: 'l1', subtasks: [], assignees: [], parentTaskId: null, taskTypeId: null })) },
      taskChecklists: { findMany: mock.fn(async () => []) },
    },
  } as any
  return { db, calls, inserted }
}

function makeService(db: any) {
  return new TasksService(
    db,
    { emitToTask: mock.fn(), emitToList: mock.fn(), emitToUser: mock.fn(), emitToWorkspace: mock.fn() } as any,
    { indexTaskAttachment: mock.fn(async () => undefined) } as any, // search
    { fire: mock.fn(async () => undefined) } as any, // automations
    { fire: mock.fn(async () => undefined) } as any, // webhooks
    { notify: mock.fn(async () => undefined) } as any, // slack
    {} as any, // notifications
    { configured: false } as any, // r2: a key reads back as itself
    { deleteEverywhere: mock.fn(async () => undefined) } as any, // calendarSync
    { logAuditEvent: mock.fn(async () => undefined) } as any, // security
  )
}

/** The ORDER BY a read of `task_attachments` asked for, as SQL, or null when it asked for none. */
function orderOf(calls: Array<{ table: string; verb: string; args: unknown[] }>) {
  const order = calls.find((c) => c.table === 'task_attachments' && c.verb === 'orderBy')
  return order ? order.args.map(sqlOf).join(', ') : null
}

const ROW = {
  id: 'a1',
  fileName: 'brief.pdf',
  sizeBytes: 2048,
  contentType: 'application/pdf',
  uploadedById: 'u-uma',
  createdAt: new Date('2026-09-30T01:00:00Z'),
  storageKey: 'workspaces/w1/tasks/t1/attachments/1-brief.pdf',
}

describe('TasksService.listAttachments — the order, and who attached each', () => {
  it('reads a task’s files in the order they were attached: created_at, then id', async () => {
    const { db, calls } = makeDb({ task_attachments: [{ ...ROW, uploaderName: 'Uma Uploader' }] })
    const svc: any = makeService(db)
    svc.assertTaskReadAccess = mock.fn(async () => ({ taskId: 't1', workspaceId: 'w1' }))
    await svc.listAttachments('t1', 'reader-1')
    assert.equal(
      orderOf(calls),
      '"task_attachments"."created_at" asc, "task_attachments"."id" asc',
      'the list asks for no order, or another one: it comes back in whatever order Postgres finds the rows',
    )
  })

  it('names who attached each file, from users, joined so a file whose uploader is gone is still listed', async () => {
    const { db, calls } = makeDb({ task_attachments: [{ ...ROW, uploaderName: 'Uma Uploader' }] })
    const svc: any = makeService(db)
    svc.assertTaskReadAccess = mock.fn(async () => ({ taskId: 't1', workspaceId: 'w1' }))
    const [file] = await svc.listAttachments('t1', 'reader-1')
    const join = calls.find((c) => c.table === 'task_attachments' && (c.verb === 'leftJoin' || c.verb === 'innerJoin'))
    assert.equal(join?.verb, 'leftJoin', `the uploader is read through ${join?.verb ?? 'no join'}, not a LEFT join`)
    assert.equal(getTableName(join?.args[0] as never), 'users')
    assert.equal(file.uploaderName, 'Uma Uploader', `the list names the uploader ${JSON.stringify(file.uploaderName)}`)
    // The id is still handed back, as before, beside the name.
    assert.equal(file.uploadedBy, 'u-uma')
  })

  it('lists a file whose uploader is gone with no name, never with the id in its place', async () => {
    const { db } = makeDb({ task_attachments: [{ ...ROW, uploadedById: null, uploaderName: null }] })
    const svc: any = makeService(db)
    svc.assertTaskReadAccess = mock.fn(async () => ({ taskId: 't1', workspaceId: 'w1' }))
    const [file] = await svc.listAttachments('t1', 'reader-1')
    assert.equal(file.uploaderName, null)
  })
})

describe('TasksService.getTask — the task’s own rows, in the same order', () => {
  it('reads the task’s attachments by created_at, then id, as the list does', async () => {
    const { db, calls } = makeDb({ lists: [{ workspaceId: 'w1', spaceId: 's1', projectId: 'p1' }], task_attachments: [ROW] })
    const out = await makeService(db).getTask('t1')
    assert.ok(out, 'the task was not read')
    assert.equal(
      orderOf(calls),
      '"task_attachments"."created_at" asc, "task_attachments"."id" asc',
      'the task’s own rows ask for no order, or another one than the list’s',
    )
  })
})

/*
 * `found-30-sep/comment-files-unordered` — the third read of a task's files,
 * the files each comment carries, had no ORDER BY either.
 */
describe('TasksService.listComments — each comment’s files, in the same order', () => {
  it('reads each comment’s files by created_at, then id, as the list does, and hands them on in that order', async () => {
    const { db, calls } = makeDb({
      task_attachments: [
        { ...ROW, id: 'a2', commentId: 'c1' },
        { ...ROW, id: 'a1', commentId: 'c1' },
      ],
    })
    db.query.taskComments = { findMany: mock.fn(async () => [{ id: 'c1', body: 'two files' }]) }
    const [comment] = (await makeService(db).listComments('t1')) as unknown as Array<{ attachments: Array<{ id: string }> }>
    assert.equal(
      orderOf(calls),
      '"task_attachments"."created_at" asc, "task_attachments"."id" asc',
      'a comment’s files ask for no order, or another one than the list’s: they come back in whatever order Postgres finds them',
    )
    // As the read gave them, not sorted again on the way out.
    assert.deepEqual(comment.attachments.map((f) => f.id), ['a2', 'a1'])
  })
})

describe('TasksService.addAttachment — the row it hands back is the list’s shape', () => {
  it('names the uploader, as the list does', async () => {
    const { db } = makeDb({ tasks: [{ id: 't1' }], users: [{ displayName: 'Uma Uploader' }] })
    const svc: any = makeService(db)
    svc.assertTaskWriteAccess = mock.fn(async () => ({ taskId: 't1', workspaceId: 'w1' }))
    const out = await svc.addAttachment('t1', 'u-uma', {
      fileName: 'Design doc', url: 'https://example.com/doc', sizeBytes: 1024,
    })
    assert.equal(out.uploadedBy, 'u-uma')
    assert.equal(out.uploaderName, 'Uma Uploader', `the new row names its uploader ${JSON.stringify(out.uploaderName)}`)
    assert.equal(out.kind, 'link')
    assert.equal(out.url, 'https://example.com/doc')
  })
})
