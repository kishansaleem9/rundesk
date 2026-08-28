import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { startOfDayIn } from './zone'

/**
 * §G05 [06:08] — "today" has to mean the person's today.
 *
 * `now` is injected everywhere below. A function that reads the clock itself
 * can only be tested on the day it happens to be, which is how date code
 * passes all week and is wrong on the one day that matters.
 */
describe('startOfDayIn', () => {
  it('is local midnight, expressed as a real instant', () => {
    // 2026-09-16 05:00 UTC. In Karachi (+05:00) that is 10:00 the same day, so
    // the day began at 19:00 UTC the night before.
    const now = new Date('2026-09-16T05:00:00.000Z')
    assert.equal(startOfDayIn('Asia/Karachi', now).toISOString(), '2026-09-15T19:00:00.000Z')
  })

  it('and lands on the right calendar day west of UTC', () => {
    /*
     * The case that catches a naive implementation: at 05:00 UTC it is still
     * the 15th in Los Angeles, so "today" there began on the 15th — using the
     * server's date would bucket a whole day of work wrongly.
     */
    const now = new Date('2026-09-16T05:00:00.000Z')
    assert.equal(startOfDayIn('America/Los_Angeles', now).toISOString(), '2026-09-15T07:00:00.000Z')
  })

  it('handles a zone ahead of the international date line', () => {
    // Kiritimati is +14: at 12:00 UTC on the 15th it is already the 16th there.
    const now = new Date('2026-09-15T12:00:00.000Z')
    assert.equal(startOfDayIn('Pacific/Kiritimati', now).toISOString(), '2026-09-15T10:00:00.000Z')
  })

  it('survives a DST changeover rather than landing an hour into yesterday', () => {
    /*
     * The correction pass earns its keep here. On the US spring-forward day the
     * offset at UTC midnight is not the offset at local midnight, and a single
     * naive subtraction puts the boundary in the previous day.
     */
    const now = new Date('2026-03-08T18:00:00.000Z') // during PDT changeover day
    const start = startOfDayIn('America/Los_Angeles', now)
    const label = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(start)
    assert.match(label, /2026-03-08/, `start of day landed on the wrong date: ${label}`)
    assert.match(label, /00:00/, `not midnight locally: ${label}`)
  })

  it('falls back to UTC for a timezone it does not recognise', () => {
    // users.timezone is free text on some rows. A bad value must not be able
    // to take a profile page down.
    const now = new Date('2026-09-16T05:00:00.000Z')
    assert.equal(startOfDayIn('Not/AZone', now).toISOString(), '2026-09-16T00:00:00.000Z')
  })
})
