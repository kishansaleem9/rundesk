import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ChatService } from './chat.service'

/**
 * Unit coverage for the per-user "saved messages" methods. We mock Drizzle's
 * fluent builder with a thenable chain so each top-level `select()` resolves to
 * the next queued result set (message lookup → channel → workspace membership).
 */
function makeDb(selectResults: any[][]) {
  let i = 0
  const chain = (rows: any[]): any => {
    const c: any = {
      from: () => c,
      where: () => c,
      limit: () => c,
      leftJoin: () => c,
      innerJoin: () => c,
      orderBy: () => c,
      then: (resolve: (v: any) => any, reject: (e: any) => any) => Promise.resolve(rows).then(resolve, reject),
    }
    return c
  }
  const inserted: any[] = []
  const deleted: any[] = []
  const db: any = {
    select: mock.fn(() => chain(selectResults[i++] ?? [])),
    insert: mock.fn(() => ({
      values: (v: any) => {
        inserted.push(v)
        return { onConflictDoNothing: async () => undefined }
      },
    })),
    delete: mock.fn(() => ({ where: async () => { deleted.push(true) } })),
  }
  return { db, inserted, deleted }
}

function buildSvc(db: any) {
  const realtime = { emitToWorkspace: mock.fn() } as any
  const notifications = {} as any
  const tasks = {} as any
  const ai = { isAvailable: () => false } as any
  const r2 = { configured: false, getObjectUrl: async (k: string) => k } as any
  return new ChatService(db, realtime, notifications, tasks, ai, r2)
}

describe('ChatService.setSaved', () => {
  // message lookup, then assertChannelAccess: channel + workspace membership
  const accessGranted = () => [
    [{ id: 'm1', channelId: 'c1' }],                                  // message exists
    [{ id: 'c1', workspaceId: 'w1', isPrivate: false, isDm: false }], // channel (public)
    [{ userId: 'u1' }],                                               // workspace membership
  ]

  it('inserts a save row when saving', async () => {
    const { db, inserted } = makeDb(accessGranted())
    const svc = buildSvc(db)
    const res = await svc.setSaved('m1', 'u1', true)
    assert.deepEqual(res, { messageId: 'm1', saved: true })
    assert.equal(inserted.length, 1)
    assert.deepEqual(inserted[0], { messageId: 'm1', userId: 'u1' })
  })

  it('deletes the save row when unsaving', async () => {
    const { db, inserted, deleted } = makeDb(accessGranted())
    const svc = buildSvc(db)
    const res = await svc.setSaved('m1', 'u1', false)
    assert.deepEqual(res, { messageId: 'm1', saved: false })
    assert.equal(inserted.length, 0)
    assert.equal(deleted.length, 1)
  })

  it('throws when the message does not exist', async () => {
    const { db } = makeDb([[]]) // message lookup returns nothing
    const svc = buildSvc(db)
    await assert.rejects(() => svc.setSaved('missing', 'u1', true), /Message not found/)
  })

  it('throws when the caller is not a workspace member', async () => {
    const { db } = makeDb([
      [{ id: 'm1', channelId: 'c1' }],
      [{ id: 'c1', workspaceId: 'w1', isPrivate: false, isDm: false }],
      [], // no workspace membership
    ])
    const svc = buildSvc(db)
    await assert.rejects(() => svc.setSaved('m1', 'u1', true), /Workspace membership required/)
  })
})

describe('ChatService.listSaved', () => {
  it('returns the saved rows for the workspace', async () => {
    const rows = [
      { id: 'm1', channelId: 'c1', channelName: 'general', body: 'hi', savedAt: '2026-01-01' },
      { id: 'm2', channelId: 'c2', channelName: 'design', body: 'yo', savedAt: '2026-01-02' },
    ]
    const { db } = makeDb([rows])
    const svc = buildSvc(db)
    const res = await svc.listSaved('w1', 'u1')
    assert.equal(res.length, 2)
    assert.equal(res[0].channelName, 'general')
  })
})
