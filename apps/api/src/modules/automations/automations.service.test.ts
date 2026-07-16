import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { AutomationsService, renderTemplate } from './automations.service'

/**
 * Unit coverage for the §7.7 "post message to channel" automation action.
 *
 * `renderTemplate` is the pure interpolation half. The execution test drives the
 * (private) runAction with a mocked Drizzle chain — each `select()` resolves to
 * the next queued result set, `insert().values().returning()` captures the row —
 * asserting a chat message is inserted with the interpolated body + resolved
 * author and that the realtime broadcast fires. (The DB-backed path is also
 * exercised end-to-end against Postgres separately.)
 */

// A thenable Drizzle-ish chain that resolves to `rows`; every builder method is
// chainable and ignored.
function chain(rows: any[]): any {
  const c: any = {
    from: () => c,
    where: () => c,
    limit: () => c,
    innerJoin: () => c,
    leftJoin: () => c,
    orderBy: () => c,
    groupBy: () => c,
    then: (resolve: (v: any) => any, reject: (e: any) => any) => Promise.resolve(rows).then(resolve, reject),
  }
  return c
}

function makeDb(selectResults: any[][], insertReturns: any[][] = []) {
  let si = 0
  let ii = 0
  const inserts: Array<{ values: any }> = []
  const db: any = {
    _inserts: inserts,
    select: () => chain(selectResults[si++] ?? []),
    insert: () => ({
      values: (values: any) => {
        inserts.push({ values })
        return { returning: () => Promise.resolve(insertReturns[ii++] ?? [{ id: 'msg-1', ...values }]) }
      },
    }),
  }
  return db
}

function makeRealtime() {
  return { emitToWorkspace: mock.fn() } as any
}

describe('renderTemplate (Plan §7.7 interpolation)', () => {
  it('replaces known {{task.*}} placeholders and leaves unknown ones intact', () => {
    const out = renderTemplate('New: {{task.title}} [{{task.priority}}] {{task.missing}}', {
      'task.title': 'Ship it',
      'task.priority': 'high',
    })
    assert.equal(out, 'New: Ship it [high] {{task.missing}}')
  })

  it('tolerates whitespace inside braces and returns the template unchanged when no vars match', () => {
    assert.equal(renderTemplate('Hi {{ task.title }}', { 'task.title': 'X' }), 'Hi X')
    assert.equal(renderTemplate('no placeholders', {}), 'no placeholders')
  })
})

describe('post_to_channel action execution (Plan §7.7)', () => {
  it('inserts an interpolated chat message authored by the creator and broadcasts it', async () => {
    const db = makeDb(
      [
        [{ id: 'ch1', workspaceId: 'ws1' }], // channel lookup
        [{ title: 'Ship it', status: 'in_progress', priority: 'high' }], // task (message vars)
        [{ userId: 'creator1' }], // author hint is a member
        [{ displayName: 'Alice', avatarUrl: null }], // author enrichment
      ],
      [[{ id: 'msg1', channelId: 'ch1', authorId: 'creator1', body: 'New task: Ship it' }]],
    )
    const realtime = makeRealtime()
    const svc = new AutomationsService(db, realtime)

    await (svc as any).runAction(
      { type: 'post_to_channel', params: { channelId: 'ch1', message: 'New task: {{task.title}}' } },
      { workspaceId: 'ws1', taskId: 'task1' },
      'creator1',
    )

    assert.equal(db._inserts.length, 1, 'one chat message inserted')
    assert.deepEqual(db._inserts[0].values, { channelId: 'ch1', authorId: 'creator1', body: 'New task: Ship it' })

    assert.equal(realtime.emitToWorkspace.mock.callCount(), 1)
    const [wsId, event] = realtime.emitToWorkspace.mock.calls[0].arguments
    assert.equal(wsId, 'ws1')
    assert.equal(event.type, 'chat.message.created')
    assert.equal(event.channelId, 'ch1')
    assert.equal(event.message.body, 'New task: Ship it')
    assert.equal(event.message.authorName, 'Alice')
  })

  it('refuses to post into a channel from another workspace and inserts nothing', async () => {
    const db = makeDb([[{ id: 'ch1', workspaceId: 'other-ws' }]])
    const realtime = makeRealtime()
    const svc = new AutomationsService(db, realtime)

    await assert.rejects(
      (svc as any).runAction(
        { type: 'post_to_channel', params: { channelId: 'ch1', message: 'hi' } },
        { workspaceId: 'ws1', taskId: 'task1' },
        'creator1',
      ),
      /not in this workspace/,
    )
    assert.equal(db._inserts.length, 0)
    assert.equal(realtime.emitToWorkspace.mock.callCount(), 0)
  })

  it('posts nothing when the rendered message is empty', async () => {
    const db = makeDb([
      [{ id: 'ch1', workspaceId: 'ws1' }], // channel
      [{ title: 'Ship it', status: 'todo', priority: 'normal' }], // task vars
    ])
    const realtime = makeRealtime()
    const svc = new AutomationsService(db, realtime)

    await (svc as any).runAction(
      { type: 'post_to_channel', params: { channelId: 'ch1', message: '   ' } },
      { workspaceId: 'ws1', taskId: 'task1' },
      'creator1',
    )
    assert.equal(db._inserts.length, 0)
    assert.equal(realtime.emitToWorkspace.mock.callCount(), 0)
  })
})
