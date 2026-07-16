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

describe('SecurityService.exportAuditLogsCsv — formula injection neutralized (security)', () => {
  it('prefixes cells starting with = + - @ so spreadsheets do not execute them', async () => {
    const rows = [
      {
        createdAt: new Date('2026-07-16T10:00:00.000Z'),
        actorEmail: '=cmd|calc', // classic CSV/DDE injection payload
        actorId: 'a1',
        action: '+SUM(A1)',
        resourceType: 'user',
        resourceId: 'u2',
        description: '@evil',
        ipAddress: '-1+1',
      },
    ]
    const { db } = buildDb(rows)
    const svc = new SecurityService(db)
    const csv = await svc.exportAuditLogsCsv('ws', {})
    const [, first] = csv.split('\n')
    // Each dangerous leading character is escaped with a single quote inside the quoted cell.
    assert.match(first, /"'=cmd\|calc"/)
    assert.match(first, /"'\+SUM\(A1\)"/)
    assert.match(first, /"'@evil"/)
    assert.match(first, /"'-1\+1"/)
    // A benign value (resource "user:u2") is left untouched — no spurious quote prefix.
    assert.match(first, /"user:u2"/)
  })
})

// ─── TOTP setup: no third-party QR / secret leak ────────────────────────────

function buildTotpDb(user: { email: string; displayName: string } | undefined) {
  return {
    select: () => ({ from: () => ({ where: async () => (user ? [user] : []) }) }),
    delete: () => ({ where: async () => undefined }),
    insert: () => ({ values: async () => undefined }),
  } as any
}

describe('SecurityService.setupTotp — client-side QR, no secret leak (security)', () => {
  it('returns an otpauth:// URI + secret and never a Google Charts URL', async () => {
    const svc = new SecurityService(buildTotpDb({ email: 'u@acme.test', displayName: 'U' }))
    const result = await svc.setupTotp('user-1')
    assert.match(result.otpauthUrl, /^otpauth:\/\/totp\//)
    assert.ok(typeof result.secret === 'string' && result.secret.length > 0)
    // The deprecated Google Charts field must be gone, and the secret must not
    // be embedded in any third-party URL anywhere in the response.
    assert.ok(!('qrCodeUrl' in result), 'qrCodeUrl field must be dropped')
    assert.doesNotMatch(JSON.stringify(result), /googleapis\.com|chart\?/)
  })
})
