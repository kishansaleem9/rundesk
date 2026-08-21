import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { NotificationsService } from './notifications.service'

/**
 * §2.5 — "mere paas jitne bhi notifications hain main yahan se clear kar sakti
 * hoon. Maine sab clear kiye — woh yahan pe chale jayenge."
 *
 * Clearing was per-row and hover-only, which is not what she did on screen.
 *
 * Two things about the bulk version are easy to get wrong and invisible if you
 * do: what it touches, and what it leaves alone. Clearing a row that is already
 * cleared would re-stamp `dismissedAt` and silently restart its 30-day
 * retention — the row would sit in Cleared looking the same while its deletion
 * date moved a month into the future. And clearing while filtered to Primary
 * must not bin what the filter is hiding, because you cannot see that happen.
 */

/** Captures the predicate and the values, so both halves can be inspected. */
function fakeDb() {
  const calls: Array<{ values: Record<string, unknown>; condition: unknown }> = []
  return {
    calls,
    db: {
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: (condition: unknown) => ({
            returning: async () => {
              calls.push({ values, condition })
              return [{ id: 'n1' }, { id: 'n2' }]
            },
          }),
        }),
      }),
    },
  }
}

/**
 * Render the predicate the service built into real SQL and its parameters.
 *
 * A first version of this walked the condition object looking for strings, and
 * found them — in the column definitions. `notifications.type` is a pg enum, so
 * every notification type appears in its schema metadata whether or not the
 * query filters on it. That made the "honours the Primary filter" assertion
 * pass no matter what the service did, which is worse than it failing.
 */
const dialect = new PgDialect()
function rendered(condition: unknown): { sql: string; params: unknown[] } {
  const query = dialect.sqlToQuery(condition as never)
  return { sql: query.sql, params: query.params as unknown[] }
}

const service = () => {
  const { db, calls } = fakeDb()
  // The constructor reads APP_URL and the VAPID keys off ConfigService, so a
  // bare {} is not enough to construct one.
  const config = { get: () => undefined } as never
  return {
    svc: new NotificationsService(db as never, {} as never, {} as never, config),
    calls,
  }
}

describe('clear all (§2.5)', () => {
  it('clears, and reports how many', async () => {
    const { svc, calls } = service()
    const result = await svc.clearAll('u1')
    assert.deepEqual(result, { ok: true, cleared: 2 })
    assert.ok(calls[0].values.dismissedAt instanceof Date)
  })

  it('unsnoozes what it clears, so nothing sits in two buckets', async () => {
    const { svc, calls } = service()
    await svc.clearAll('u1')
    assert.equal(calls[0].values.snoozedUntil, null)
  })

  it('is scoped to the Inbox, so Later and already-cleared rows are untouched', async () => {
    // Re-stamping an already-cleared row would restart its 30-day retention
    // without anything on screen changing.
    const { svc, calls } = service()
    await svc.clearAll('u1')
    const { sql } = rendered(calls[0].condition)
    assert.match(
      sql,
      /"dismissed_at" is null/,
      `must exclude already-cleared rows, or it restarts their retention — got: ${sql}`,
    )
    assert.match(sql, /"user_id" = \$1/, 'and never reach another user')
  })

  it('honours the Primary filter when one is given', async () => {
    const { svc, calls } = service()
    await svc.clearAll('u1', { types: ['task_mentioned', 'chat_message'] })
    const { sql, params } = rendered(calls[0].condition)
    assert.match(sql, /"type" in \(\$\d+, \$\d+\)/, `expected a type filter, got: ${sql}`)
    assert.ok(params.includes('task_mentioned') && params.includes('chat_message'))
  })

  it('does not constrain types when none are given', async () => {
    const { svc, calls } = service()
    await svc.clearAll('u1')
    const { sql } = rendered(calls[0].condition)
    assert.ok(!/"type" in/.test(sql), `expected no type filter, got: ${sql}`)
  })

  /**
   * This assertion used to say the opposite, and was right at the time: Primary
   * was a hardcoded set, `[]` could not come from the UI, and reading it as "no
   * filter" was a harmless tidy-up of a call that could not happen.
   *
   * Making Primary customisable changed what `[]` means. It is now the literal
   * answer to "which kinds do you want in Primary?" from someone who chose
   * none — so the old reading turns the most explicit possible "nothing" into
   * the most destructive possible "everything". The button is hidden when the
   * chip has no rows, so this needs a stale list to reach from the web app, but
   * the endpoint takes it from anyone.
   */
  it('treats an empty type list as "none of them", not as "all of them"', async () => {
    const { svc, calls } = service()
    const result = await svc.clearAll('u1', { types: [] })
    assert.deepEqual(result, { ok: true, cleared: 0 })
    assert.equal(calls.length, 0, 'an empty selection must not reach the database at all')
  })

  it('still clears the whole bucket when types are omitted entirely', async () => {
    // The distinction the case above turns on: absent means unfiltered, empty
    // means nothing. Pinned here so a later tidy-up cannot collapse the two.
    const { svc, calls } = service()
    const result = await svc.clearAll('u1', {})
    assert.deepEqual(result, { ok: true, cleared: 2 })
    assert.equal(calls.length, 1)
  })
})
