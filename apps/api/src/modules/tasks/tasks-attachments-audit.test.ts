import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { TasksService } from './tasks.service'

/**
 * §4.5 attachment hardening + §13.3 container-deletion auditing.
 *
 *   1. `assertAttachmentSize` now REQUIRES a valid, positive declared size ≤ the
 *      100 MB cap (previously an omitted size silently stored 0).
 *   2. `removeAttachment` may only be run by the attachment's uploader OR a
 *      workspace moderator (mirrors `deleteComment`).
 *   3. `deleteTask` emits an `task.deleted` audit event with the actor + IP.
 *
 * Uses the repo's queued-thenable Drizzle stand-in: every db.select() pops the
 * next planned rows; insert/update/delete are no-op nodes so we can assert call
 * counts without threading their results through the select queue.
 */
const VERBS = [
  'from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy',
  'values', 'onConflictDoNothing', 'set', 'returning',
]
function node(rows: unknown[]) {
  const p = Promise.resolve(rows) as any
  for (const v of VERBS) p[v] = () => p
  return p
}
function makeDb(selectResults: unknown[][]) {
  const selects = [...selectResults]
  return {
    select: mock.fn(() => node(selects.shift() ?? [])),
    insert: mock.fn(() => node([{ id: 'act-1' }])),
    update: mock.fn(() => node([])),
    delete: mock.fn(() => node([])),
  } as any
}

function makeService(db: any, security: any = { logAuditEvent: mock.fn(async () => undefined) }) {
  return new TasksService(
    db,
    { emitToTask: mock.fn(), emitToList: mock.fn(), emitToUser: mock.fn(), emitToWorkspace: mock.fn() } as any,
    {} as any, // search
    { fire: mock.fn(async () => undefined) } as any, // automations
    { fire: mock.fn(async () => undefined) } as any, // webhooks
    { notify: mock.fn(async () => undefined) } as any, // slack
    {} as any, // notifications
    { configured: false } as any, // r2 (unconfigured → skips object delete)
    { deleteEverywhere: mock.fn(async () => undefined) } as any, // calendarSync
    security,
  )
}

describe('TasksService.assertAttachmentSize — §4.5 mandatory declared size', () => {
  const svc = makeService(makeDb([])) as any
  it('rejects a missing size', () => {
    assert.throws(() => svc.assertAttachmentSize(undefined), /valid attachment sizeBytes/)
  })
  it('rejects a zero / negative / non-finite size', () => {
    assert.throws(() => svc.assertAttachmentSize(0), /valid attachment sizeBytes/)
    assert.throws(() => svc.assertAttachmentSize(-1), /valid attachment sizeBytes/)
    assert.throws(() => svc.assertAttachmentSize(Number.NaN), /valid attachment sizeBytes/)
  })
  it('rejects a size over the 100 MB cap', () => {
    assert.throws(() => svc.assertAttachmentSize(200 * 1024 * 1024), /100 MB limit/)
  })
  it('accepts a valid positive size at/under the cap', () => {
    assert.doesNotThrow(() => svc.assertAttachmentSize(1024))
    assert.doesNotThrow(() => svc.assertAttachmentSize(100 * 1024 * 1024))
  })
})

describe('TasksService.removeAttachment — §4.5 uploader-or-moderator only', () => {
  const ATT = (uploadedById: string) => [{ id: 'a1', uploadedById, storageKey: 'k1' }]

  it('lets the uploader delete their own attachment', async () => {
    const db = makeDb([ATT('u1')])
    const svc = makeService(db)
    ;(svc as any).assertTaskWriteAccess = mock.fn(async () => ({ taskId: 't1', workspaceId: 'w1' }))
    const out = await svc.removeAttachment('t1', 'a1', 'u1')
    assert.deepEqual(out, { ok: true })
    assert.equal(db.delete.mock.callCount(), 1, 'the row is deleted')
  })

  it('lets a workspace moderator delete someone else\'s attachment', async () => {
    const db = makeDb([ATT('other'), [{ role: 'workspace_admin' }]])
    const svc = makeService(db)
    ;(svc as any).assertTaskWriteAccess = mock.fn(async () => ({ taskId: 't1', workspaceId: 'w1' }))
    const out = await svc.removeAttachment('t1', 'a1', 'mod')
    assert.deepEqual(out, { ok: true })
    assert.equal(db.delete.mock.callCount(), 1)
  })

  it('forbids a non-uploader, non-moderator task-writer', async () => {
    const db = makeDb([ATT('other'), [{ role: 'member' }]])
    const svc = makeService(db)
    ;(svc as any).assertTaskWriteAccess = mock.fn(async () => ({ taskId: 't1', workspaceId: 'w1' }))
    await assert.rejects(
      () => svc.removeAttachment('t1', 'a1', 'u2'),
      /uploader or a workspace admin/,
    )
    assert.equal(db.delete.mock.callCount(), 0, 'nothing is deleted when authz fails')
  })

  it('404s when the attachment does not exist', async () => {
    const db = makeDb([[]]) // attachment lookup empty
    const svc = makeService(db)
    ;(svc as any).assertTaskWriteAccess = mock.fn(async () => ({ taskId: 't1', workspaceId: 'w1' }))
    await assert.rejects(() => svc.removeAttachment('t1', 'missing', 'u1'), /Attachment not found/)
  })
})

describe('TasksService.deleteTask — §13.3 audit event', () => {
  it('logs task.deleted with the actor, resource id, workspace, and IP', async () => {
    // After the write + manager-scope gates (mocked), deleteTask does:
    //   select `before`, then resolveWorkspaceForList, then the audit call.
    const db = makeDb([
      [{ id: 't1', listId: 'l1', title: 'Ship it' }], // before
      [{ workspaceId: 'w1', spaceId: 's1', projectId: 'p1' }], // resolveWorkspaceForList
    ])
    const security = { logAuditEvent: mock.fn(async (_event?: any) => undefined) }
    const svc = makeService(db, security)
    ;(svc as any).assertTaskWriteAccess = mock.fn(async () => ({ taskId: 't1', workspaceId: 'w1' }))
    ;(svc as any).assertManagerDeleteScope = mock.fn(async () => undefined)

    await svc.deleteTask('t1', 'actor-1', '203.0.113.9')

    assert.equal(security.logAuditEvent.mock.callCount(), 1, 'one audit row written')
    const event = security.logAuditEvent.mock.calls[0].arguments[0] as any
    assert.equal(event.action, 'task.deleted')
    assert.equal(event.resourceType, 'task')
    assert.equal(event.resourceId, 't1')
    assert.equal(event.workspaceId, 'w1')
    assert.equal(event.actorId, 'actor-1')
    assert.equal(event.ipAddress, '203.0.113.9')
  })
})
