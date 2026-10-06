import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { IntegrationConnectionsService } from './integration-connections.service'

/*
 * WHOSE CONNECTION IT STILL IS (`found-6-oct/calendar-pull-uses-a-leavers-connection`).
 * A connection whose owner has been removed from the workspace, or whose
 * account is gone (`connected_by_id` set null), read connected, healthy — while
 * a calendar's push, its pull and a task's meetings take nothing through it.
 * The list says `owner_left` of it. A queued stand-in answers the selects in
 * order: the workspace's connections, then which of their owners are members.
 */
describe('IntegrationConnectionsService.list — whose connection it still is', () => {
  const row = (provider: string, connectedById: string | null, status = 'connected') => ({
    provider, status, connectedById, tokenExpiresAt: null, scopes: [], externalAccountEmail: null,
    lastError: null, lastErrorAt: null, createdAt: new Date(), updatedAt: new Date(),
  })

  it('says owner_left of a connection whose owner is no longer in the workspace, or nobody’s, and healthy of a member’s', async () => {
    const queue: unknown[][] = [
      [row('gcal', 'keeper'), row('outlook', 'admin'), row('zoom', null), row('slack', 'keeper', 'disconnected')],
      [{ userId: 'admin' }],
    ]
    const node = (rows: unknown[]) => {
      const p = Promise.resolve(rows) as any
      for (const v of ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy']) p[v] = () => p
      return p
    }
    const db = { select: () => node(queue.shift() ?? []) } as any
    const svc = new IntegrationConnectionsService(db, {} as any, {} as any, {} as any, {} as any)
    const health = Object.fromEntries((await svc.list('ws-1')).map((c) => [c.provider, c.health]))
    assert.deepEqual(health, { gcal: 'owner_left', outlook: 'healthy', zoom: 'owner_left', slack: 'disconnected' })
  })
})
