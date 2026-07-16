import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Db } from '@rundesk/db'
import { ZapierService } from './zapier.service'
import type { WebhooksService } from '../webhooks/webhooks.service'

/**
 * Mocked-DB idiom (matches the repo's other service tests). Each `select()`
 * chain terminates in `.limit()`, which resolves the next queued result set;
 * `authTest` issues two queries (workspace, then user) so the queue is ordered
 * accordingly.
 */
function makeDb(resultSets: unknown[][]) {
  const queue = [...resultSets]
  const state = { wheres: 0, limits: [] as number[] }
  const shift = () => Promise.resolve(queue.length ? queue.shift()! : [])
  const chain: Record<string, unknown> = {}
  chain.from = () => chain
  chain.innerJoin = () => chain
  chain.where = () => {
    state.wheres++
    return chain
  }
  chain.orderBy = () => chain
  chain.limit = (n: number) => {
    state.limits.push(n)
    return shift()
  }
  const db = { select: () => chain } as unknown as Db
  return { db, state }
}

const EVENTS = ['task.created', 'task.status_changed', 'comment.created', 'time.logged']

function makeWebhooks() {
  const captured: { create?: any; delete?: any } = {}
  const svc = {
    getAvailableEvents: () => EVENTS,
    create: async (workspaceId: string, userId: string, dto: any) => {
      captured.create = { workspaceId, userId, dto }
      return { id: 'wh-123', workspaceId, createdById: userId, ...dto }
    },
    delete: async (workspaceId: string, id: string) => {
      captured.delete = { workspaceId, id }
      return { ok: true }
    },
  } as unknown as WebhooksService
  return { svc, captured }
}

describe('ZapierService.subscribe', () => {
  it('creates an outbound webhook for the event pointed at targetUrl and returns { id }', async () => {
    const { svc: webhooks, captured } = makeWebhooks()
    const service = new ZapierService({} as Db, webhooks)

    const res = await service.subscribe('ws-1', 'user-1', {
      event: 'task.created',
      targetUrl: 'https://hooks.zapier.com/hooks/standard/abc',
    })

    assert.deepEqual(res, { id: 'wh-123' })
    assert.equal(captured.create.workspaceId, 'ws-1')
    assert.equal(captured.create.userId, 'user-1')
    assert.equal(captured.create.dto.url, 'https://hooks.zapier.com/hooks/standard/abc')
    assert.deepEqual(captured.create.dto.events, ['task.created'])
  })

  it('rejects an event outside the webhook enum', async () => {
    const { svc: webhooks } = makeWebhooks()
    const service = new ZapierService({} as Db, webhooks)
    await assert.rejects(
      () => service.subscribe('ws-1', 'user-1', { event: 'not.a.real.event', targetUrl: 'https://x.test' }),
      /Unknown event/,
    )
  })

  it('rejects a missing targetUrl', async () => {
    const { svc: webhooks } = makeWebhooks()
    const service = new ZapierService({} as Db, webhooks)
    await assert.rejects(() => service.subscribe('ws-1', 'user-1', { event: 'task.created' }), /targetUrl is required/)
  })
})

describe('ZapierService.unsubscribe', () => {
  it('deletes the webhook subscription scoped to the workspace', async () => {
    const { svc: webhooks, captured } = makeWebhooks()
    const service = new ZapierService({} as Db, webhooks)

    const res = await service.unsubscribe('ws-1', 'wh-9')

    assert.deepEqual(res, { ok: true })
    assert.deepEqual(captured.delete, { workspaceId: 'ws-1', id: 'wh-9' })
  })
})

describe('ZapierService.sample', () => {
  it('returns recent workspace-scoped tasks in the delivery-envelope shape', async () => {
    const createdAt = new Date('2026-07-16T10:00:00.000Z')
    const rows = [
      { id: 't1', title: 'Task one', status: 'todo', statusCategory: 'open', priority: 'normal', listId: 'l1', createdAt, updatedAt: createdAt },
    ]
    const { db, state } = makeDb([rows])
    const service = new ZapierService(db, makeWebhooks().svc)

    const items = (await service.sample('ws-1', 'task.created')) as any[]

    assert.equal(items.length, 1)
    assert.equal(items[0].id, 't1')
    assert.equal(items[0].event, 'task.created')
    assert.equal(items[0].payload.task.title, 'Task one')
    assert.equal(items[0].timestamp, '2026-07-16T10:00:00.000Z')
    assert.ok(state.wheres >= 1, 'query is workspace-scoped via a where clause')
    assert.deepEqual(state.limits, [5])
  })

  it('rejects an unknown event', async () => {
    const { db } = makeDb([])
    const service = new ZapierService(db, makeWebhooks().svc)
    await assert.rejects(() => service.sample('ws-1', 'nope.nope'), /Unknown event/)
  })
})

describe('ZapierService.authTest', () => {
  it('returns the authenticated workspace and user', async () => {
    const workspaceRows = [{ id: 'ws-1', name: 'Acme', slug: 'acme' }]
    const userRows = [{ id: 'user-1', email: 'areeba@theaura.agency', displayName: 'Areeba' }]
    const { db } = makeDb([workspaceRows, userRows]) // workspace query, then user query
    const service = new ZapierService(db, makeWebhooks().svc)

    const res = (await service.authTest('ws-1', 'user-1')) as any

    assert.equal(res.ok, true)
    assert.equal(res.workspace.name, 'Acme')
    assert.equal(res.user.email, 'areeba@theaura.agency')
    assert.match(res.connectionLabel, /Acme/)
  })
})
