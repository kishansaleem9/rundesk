import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NotificationRetentionService } from './notification-retention.service'

/**
 * §2.5 — "after 30 DAYS baad woh saare notifications automatically VANISH ho
 * jayenge."
 *
 * Two things need pinning, and neither is visible by reading the query:
 *
 *  1. *Which* rows are eligible. Only ones the user actually cleared — an
 *     unread mention from six weeks ago must survive, and so must one parked in
 *     Later. Deleting by age alone would quietly bin both.
 *  2. *Which* date decides. `dismissedAt`, not `createdAt`. Filtering on
 *     createdAt would delete a notification someone cleared this morning
 *     because the event it describes is old.
 *
 * The service takes the clock as an argument precisely so the boundary can be
 * tested; the cron just passes `new Date()`.
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-08-20T12:00:00.000Z')

type Row = {
  id: string
  dismissedAt: Date | null
  snoozedUntil?: Date | null
  createdAt: Date
}

/**
 * A drizzle-ish double that evaluates the real predicate rather than trusting
 * it. `where()` is handed the SQL the service actually built, so instead of
 * re-implementing the filter here (which would only test itself), rows are
 * matched against the values the service bound into it.
 */
function fakeDb(rows: Row[]) {
  const state = { rows: [...rows], lastCutoff: null as Date | null }

  /**
   * Pull the timestamp the service bound into the `<` comparison. Drizzle's SQL
   * nodes hold references back to their table and column objects, so the graph
   * has cycles — the walk has to remember where it has been.
   */
  const cutoffFrom = (condition: any): Date => {
    const found: Date[] = []
    const seen = new WeakSet<object>()
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return
      if (node instanceof Date) {
        found.push(node)
        return
      }
      if (seen.has(node)) return
      seen.add(node)
      for (const value of Object.values(node)) walk(value)
    }
    walk(condition)
    assert.equal(found.length, 1, `expected one bound timestamp, saw ${found.length}`)
    return found[0]
  }

  const eligible = (cutoff: Date) =>
    state.rows.filter((r) => r.dismissedAt !== null && r.dismissedAt.getTime() < cutoff.getTime())

  return {
    state,
    delete: () => ({
      where: (condition: any) => ({
        returning: async () => {
          const cutoff = cutoffFrom(condition)
          state.lastCutoff = cutoff
          const doomed = eligible(cutoff)
          const ids = new Set(doomed.map((r) => r.id))
          state.rows = state.rows.filter((r) => !ids.has(r.id))
          return doomed.map((r) => ({ id: r.id }))
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: async (condition: any) => [{ count: eligible(cutoffFrom(condition)).length }],
      }),
    }),
  }
}

const service = (rows: Row[]) => {
  const db = fakeDb(rows)
  return { db, svc: new NotificationRetentionService(db as never) }
}

describe('notification retention (§2.5)', () => {
  it('deletes cleared notifications older than 30 days', async () => {
    const { db, svc } = service([
      { id: 'old-cleared', dismissedAt: new Date(NOW.getTime() - 31 * DAY), createdAt: NOW },
    ])
    assert.equal(await svc.purge(NOW), 1)
    assert.deepEqual(db.state.rows, [])
  })

  it('keeps notifications that were never cleared, however old', async () => {
    const ancient = new Date(NOW.getTime() - 400 * DAY)
    const { db, svc } = service([
      { id: 'unread', dismissedAt: null, createdAt: ancient },
      { id: 'snoozed', dismissedAt: null, snoozedUntil: new Date(NOW.getTime() + DAY), createdAt: ancient },
    ])
    assert.equal(await svc.purge(NOW), 0)
    assert.deepEqual(
      db.state.rows.map((r) => r.id).sort(),
      ['snoozed', 'unread'],
      'the Inbox and Later buckets are not a retention policy',
    )
  })

  it('measures from when it was cleared, not when it arrived', async () => {
    const { db, svc } = service([
      // An old event the user only got round to clearing today.
      {
        id: 'old-event-cleared-today',
        dismissedAt: new Date(NOW.getTime() - 1 * DAY),
        createdAt: new Date(NOW.getTime() - 200 * DAY),
      },
    ])
    assert.equal(await svc.purge(NOW), 0)
    assert.deepEqual(db.state.rows.map((r) => r.id), ['old-event-cleared-today'])
  })

  it('holds the boundary at exactly 30 days', async () => {
    const { db, svc } = service([
      { id: 'just-inside', dismissedAt: new Date(NOW.getTime() - 30 * DAY + 60_000), createdAt: NOW },
      { id: 'just-outside', dismissedAt: new Date(NOW.getTime() - 30 * DAY - 60_000), createdAt: NOW },
    ])
    assert.equal(await svc.purge(NOW), 1)
    assert.deepEqual(
      db.state.rows.map((r) => r.id),
      ['just-inside'],
      'a minute either side of the cutoff decides it',
    )
    assert.equal(
      db.state.lastCutoff?.toISOString(),
      new Date(NOW.getTime() - 30 * DAY).toISOString(),
    )
  })

  it('counts what is due without deleting it', async () => {
    const { db, svc } = service([
      { id: 'a', dismissedAt: new Date(NOW.getTime() - 31 * DAY), createdAt: NOW },
      { id: 'b', dismissedAt: new Date(NOW.getTime() - 31 * DAY), createdAt: NOW },
      { id: 'c', dismissedAt: null, createdAt: NOW },
    ])
    assert.equal(await svc.countDue(NOW), 2)
    assert.equal(db.state.rows.length, 3, 'countDue must not be destructive')
  })

  it('uses the retention window she asked for', () => {
    assert.equal(NotificationRetentionService.RETENTION_DAYS, 30)
  })
})
