import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BadRequestException } from '@nestjs/common'
import { PgDialect } from 'drizzle-orm/pg-core'
import { NotificationsService } from './notifications.service'
import { NotificationsController } from './notifications.controller'

/**
 * The Inbox is one workspace's, and it pages.
 *
 * `GET /notifications` took no workspace, no page and no type; the service
 * read the newest fifty. So one workspace's Inbox listed, counted and marked
 * read another's, and everything past fifty — the replies among it — was
 * unreachable. These pin the predicate each verb builds and the refusals the
 * route makes; `test/e2e/inbox-scope.mjs` measures the same rules against a
 * real database, including the two page boundaries only Postgres can stage.
 */

const dialect = new PgDialect()
const rendered = (condition: unknown) => {
  const q = dialect.sqlToQuery(condition as never)
  return { sql: q.sql, params: q.params as unknown[] }
}
const config = { get: () => undefined } as never
const WS = '11111111-1111-4111-8111-111111111111'

/** Captures the predicate of an UPDATE, for markAllRead and clearAll. */
function updateDb() {
  const conditions: unknown[] = []
  const where = (condition: unknown) => {
    conditions.push(condition)
    const done = Promise.resolve(undefined)
    return Object.assign(done, { returning: async () => [{ id: 'n1' }] })
  }
  return { conditions, db: { update: () => ({ set: () => ({ where }) }) } }
}

describe('the workspace scope', () => {
  it('mark-all-read in a workspace reads that workspace and the rows with none', async () => {
    const { db, conditions } = updateDb()
    await new NotificationsService(db as never, {} as never, {} as never, config).markAllRead('u1', { workspaceId: WS })
    const { sql, params } = rendered(conditions[0])
    assert.match(sql, /"notifications"\."workspace_id" = \$\d+ or "notifications"\."workspace_id" is null/)
    assert.ok(params.includes(WS))
  })

  it('and with no workspace it is every workspace, as outside one', async () => {
    const { db, conditions } = updateDb()
    await new NotificationsService(db as never, {} as never, {} as never, config).markAllRead('u1')
    assert.doesNotMatch(rendered(conditions[0]).sql, /workspace_id/)
  })

  it('clear-all keeps both halves: the workspace and the chip', async () => {
    const { db, conditions } = updateDb()
    await new NotificationsService(db as never, {} as never, {} as never, config).clearAll('u1', {
      workspaceId: WS,
      types: ['task_assigned'],
    })
    const { sql, params } = rendered(conditions[0])
    assert.match(sql, /workspace_id" = \$\d+ or "notifications"\."workspace_id" is null/)
    assert.match(sql, /"notifications"\."type" in \(\$\d+\)/)
    assert.ok(params.includes(WS) && params.includes('task_assigned'))
  })

  it('an empty type list is none of them — nothing is read', async () => {
    const svc = new NotificationsService({} as never, {} as never, {} as never, config)
    assert.deepEqual(await svc.list('u1', { types: [] }), [])
    assert.deepEqual(await svc.triageCounts('u1', { types: [] }), { inbox: 0, later: 0, cleared: 0, unread: 0 })
    assert.deepEqual(await svc.unreadCount('u1', { types: [] }), { count: 0 })
  })

  it('a cursor that is not one of your notifications is refused before anything is listed', async () => {
    let listed = false
    const db = {
      select: () => ({
        from: () => ({
          // The anchor lookup finds nothing: somebody else's id.
          where: () => ({ limit: async () => [] }),
          leftJoin: () => {
            listed = true
            return { where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }
          },
        }),
      }),
    }
    const svc = new NotificationsService(db as never, {} as never, {} as never, config)
    await assert.rejects(svc.list('u1', { before: WS }), BadRequestException)
    assert.equal(listed, false)
  })
})

describe('the route refuses what it cannot honour', () => {
  const user = { id: 'u1' } as never
  const ctrl = () => {
    const calls: unknown[] = []
    const svc = new Proxy({}, { get: () => (...args: unknown[]) => { calls.push(args); return [] } })
    return { calls, c: new NotificationsController(svc as never) }
  }
  const refuses = (fn: () => unknown, pattern: RegExp) =>
    assert.throws(fn, (e: unknown) => e instanceof BadRequestException && pattern.test((e as Error).message))

  it('a malformed workspace — never read as "no workspace", which is every one', () => {
    const { c, calls } = ctrl()
    refuses(() => c.list(user, undefined, undefined, undefined, 'nope'), /workspaceId/)
    refuses(() => c.unreadCount(user, ''), /workspaceId/)
    refuses(() => c.markAllRead(user, { workspaceId: 'nope' }), /workspaceId/)
    refuses(() => c.markAllRead(user, { workspaceId: 5 as never }), /workspaceId must be a string/)
    assert.equal(calls.length, 0)
  })

  it('an unknown type, by name', () => {
    const { c } = ctrl()
    refuses(() => c.triageCounts(user, WS, 'task_assigned,made_up'), /made_up/)
  })

  it('a page size outside 1–100, a cursor that is not an id, and a view that is not a bucket', () => {
    const { c } = ctrl()
    for (const limit of ['0', '101', '2.5', 'ten']) {
      refuses(() => c.list(user, undefined, undefined, undefined, WS, undefined, undefined, limit), /limit/)
    }
    refuses(() => c.list(user, undefined, undefined, undefined, WS, undefined, 'xyz'), /before/)
    refuses(() => c.list(user, undefined, undefined, 'bogus'), /view must be one of/)
  })

  it('and passes what it can honour straight through', () => {
    const { c, calls } = ctrl()
    c.list(user, 'true', undefined, 'later', WS, 'task_assigned,chat_reply', WS, '51')
    assert.deepEqual(calls[0], [
      'u1',
      {
        unreadOnly: true,
        readOnly: false,
        view: 'later',
        workspaceId: WS,
        types: ['task_assigned', 'chat_reply'],
        before: WS,
        limit: 51,
      },
    ])
  })
})
