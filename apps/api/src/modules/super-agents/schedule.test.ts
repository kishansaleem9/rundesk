import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lastSlot, scheduleDue } from './schedule'

/**
 * When a Super Agent's schedule owes a run (`ledger-rows/row-852`): the last
 * time it names on its maker's clock, once per time, never for a time from
 * before it was set.
 */
const at = (iso: string) => new Date(iso)

describe('lastSlot', () => {
  it('daily: today at its time once that has come, else yesterday', () => {
    assert.equal(lastSlot({ every: 'daily', at: '09:00' }, at('2026-10-13T10:00:00Z'), 'UTC').toISOString(), '2026-10-13T09:00:00.000Z')
    assert.equal(lastSlot({ every: 'daily', at: '09:00' }, at('2026-10-13T08:59:00Z'), 'UTC').toISOString(), '2026-10-12T09:00:00.000Z')
  })

  it('reads the maker’s clock: 09:00 in Karachi is 04:00 UTC', () => {
    assert.equal(lastSlot({ every: 'daily', at: '09:00' }, at('2026-10-13T05:00:00Z'), 'Asia/Karachi').toISOString(), '2026-10-13T04:00:00.000Z')
  })

  it('hourly at its minute', () => {
    assert.equal(lastSlot({ every: 'hourly', at: '00:15' }, at('2026-10-13T10:20:00Z'), 'UTC').toISOString(), '2026-10-13T10:15:00.000Z')
    assert.equal(lastSlot({ every: 'hourly', at: '00:15' }, at('2026-10-13T10:10:00Z'), 'UTC').toISOString(), '2026-10-13T09:15:00.000Z')
  })

  it('weekly on its weekday (13 Oct 2026 is a Tuesday)', () => {
    assert.equal(lastSlot({ every: 'weekly', at: '09:00', weekday: 1 }, at('2026-10-13T10:00:00Z'), 'UTC').toISOString(), '2026-10-12T09:00:00.000Z')
    assert.equal(lastSlot({ every: 'weekly', at: '09:00', weekday: 2 }, at('2026-10-13T08:00:00Z'), 'UTC').toISOString(), '2026-10-06T09:00:00.000Z')
  })

  it('monthly on its day, across a year', () => {
    assert.equal(lastSlot({ every: 'monthly', at: '09:00', day: 20 }, at('2026-10-13T10:00:00Z'), 'UTC').toISOString(), '2026-09-20T09:00:00.000Z')
    assert.equal(lastSlot({ every: 'monthly', at: '09:00', day: 5 }, at('2026-01-03T10:00:00Z'), 'UTC').toISOString(), '2025-12-05T09:00:00.000Z')
  })
})

describe('scheduleDue', () => {
  const daily = { on: true, every: 'daily' as const, at: '09:00', since: '2026-10-01T00:00:00Z' }

  it('owes a run when its time has come and none ran since', () => {
    assert.equal(scheduleDue(daily, at('2026-10-13T09:00:30Z'), at('2026-10-12T09:00:10Z'), 'UTC'), true)
  })

  it('owes nothing once a run started after its time', () => {
    assert.equal(scheduleDue(daily, at('2026-10-13T09:05:00Z'), at('2026-10-13T09:00:10Z'), 'UTC'), false)
  })

  it('a schedule set after today’s time waits for tomorrow’s', () => {
    assert.equal(scheduleDue({ ...daily, since: '2026-10-13T15:00:00Z' }, at('2026-10-13T15:01:00Z'), null, 'UTC'), false)
    assert.equal(scheduleDue({ ...daily, since: '2026-10-13T15:00:00Z' }, at('2026-10-14T09:00:00Z'), null, 'UTC'), true)
  })

  it('a schedule switched off owes nothing', () => {
    assert.equal(scheduleDue({ ...daily, on: false }, at('2026-10-13T09:00:30Z'), null, 'UTC'), false)
  })
})
