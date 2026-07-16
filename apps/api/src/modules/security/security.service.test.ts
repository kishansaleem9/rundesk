import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SecurityService } from './security.service'

/**
 * The audit list/export filtering (Plan §13.3) is exercised against a small
 * mock DB that records the pagination arguments and echoes fixed rows, plus
 * a check that `logAuditEvent` forwards the request IP to the insert.
 */
function buildDb(rows: any[] = []) {
  const captured: { limit?: number; offset?: number; inserted?: any } = {}
  // `.limit(n)` must be awaitable (export path) AND expose `.offset(o)` (list path).
  const afterOrderBy = {
    limit: (n: number) => {
      captured.limit = n
      const awaitable = Promise.resolve(rows)
      return Object.assign(awaitable, {
        offset: (o: number) => {
          captured.offset = o
          return Promise.resolve(rows)
        },
      })
    },
  }
  const db = {
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => afterOrderBy }) }) }),
    insert: () => ({ values: async (v: any) => { captured.inserted = v } }),
  } as any
  return { db, captured }
}

describe('SecurityService.logAuditEvent — IP capture (§13.3)', () => {
  it('forwards ipAddress to the inserted row', async () => {
    const { db, captured } = buildDb()
    const svc = new SecurityService(db)
    await svc.logAuditEvent({
      workspaceId: 'ws',
      actorId: 'u',
      action: 'role.changed',
      description: 'x',
      ipAddress: '198.51.100.7',
    })
    assert.equal(captured.inserted.ipAddress, '198.51.100.7')
  })
})

describe('SecurityService.getAuditLogs — server-side pagination (§13.3)', () => {
  it('clamps the page size to 200 and computes the offset from page', async () => {
    const { db, captured } = buildDb([])
    const svc = new SecurityService(db)
    await svc.getAuditLogs('ws', { page: 3, limit: 999, actorId: 'u', from: new Date('2026-01-01'), actionPrefixes: ['member.', 'role.'] })
    assert.equal(captured.limit, 200) // clamped
    assert.equal(captured.offset, 400) // (page 3 - 1) * 200
  })

  it('defaults to 50 rows on the first page', async () => {
    const { db, captured } = buildDb([])
    const svc = new SecurityService(db)
    await svc.getAuditLogs('ws', {})
    assert.equal(captured.limit, 50)
    assert.equal(captured.offset, 0)
  })
})

describe('SecurityService.exportAuditLogsCsv — filtered CSV (§13.3)', () => {
  it('includes an IP address column and renders the row values', async () => {
    const rows = [
      {
        createdAt: new Date('2026-07-16T10:00:00.000Z'),
        actorEmail: 'admin@acme.test',
        actorId: 'a1',
        action: 'role.changed',
        resourceType: 'user',
        resourceId: 'u2',
        description: 'Member role changed to manager',
        ipAddress: '203.0.113.5',
      },
    ]
    const { db } = buildDb(rows)
    const svc = new SecurityService(db)
    const csv = await svc.exportAuditLogsCsv('ws', { actionPrefixes: ['role.'] })
    const [header, first] = csv.split('\n')
    assert.match(header, /IP address/)
    assert.match(first, /2026-07-16T10:00:00\.000Z/)
    assert.match(first, /admin@acme\.test/)
    assert.match(first, /203\.0\.113\.5/)
  })
})
