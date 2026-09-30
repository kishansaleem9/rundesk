import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BadRequestException } from '@nestjs/common'
import {
  START_AFTER_DUE,
  assertDatesInOrder,
  assertEstimate,
  carriedEstimate,
  planLabelsByName,
  startsAfterDue,
  uniqueLabelNames,
  writerZone,
} from './task-values'

/**
 * What a task's dates, estimate and tags by name may be (`task-values.ts`), the
 * rules every write that sets them asks.
 */
const at = (iso: string) => new Date(iso)

describe('startsAfterDue — found-30-sep/a-task-starts-after-it-is-due', () => {
  it('compares two moments as moments and two days as days: a start after the due is found, the same day is not', () => {
    assert.equal(startsAfterDue(at('2026-10-10T12:00:00Z'), at('2026-10-03T12:00:00Z')), true)
    assert.equal(startsAfterDue(at('2026-10-03T12:00:01Z'), at('2026-10-03T12:00:00Z')), true)
    assert.equal(startsAfterDue(at('2026-10-03T12:00:00Z'), at('2026-10-03T12:00:00Z')), false)
    // Two days with no time: the day after is after; the same day is not.
    assert.equal(startsAfterDue(at('2026-10-04T00:00:00Z'), at('2026-10-03T00:00:00Z')), true)
    assert.equal(startsAfterDue(at('2026-10-03T00:00:00Z'), at('2026-10-03T00:00:00Z')), false)
  })

  it('finds a day beside a moment after it only where every reader would, and never a date that is missing', () => {
    // Due "the 5th", no time; a start at 03:00 UTC on the 6th is the evening of the 5th in Los Angeles.
    assert.equal(startsAfterDue(at('2026-10-06T03:00:00Z'), at('2026-10-05T00:00:00Z')), false)
    // A start on the 7th is after the 5th wherever it is read.
    assert.equal(startsAfterDue(at('2026-10-07T13:00:00Z'), at('2026-10-05T00:00:00Z')), true)
    // Start "the 5th", no time, due 09:00 on the 5th: the day holds the moment.
    assert.equal(startsAfterDue(at('2026-10-05T00:00:00Z'), at('2026-10-05T09:00:00Z')), false)
    // Start "the 9th", due 09:00 on the 5th: after, in every zone.
    assert.equal(startsAfterDue(at('2026-10-09T00:00:00Z'), at('2026-10-05T09:00:00Z')), true)
    assert.equal(startsAfterDue(null, at('2026-10-05T09:00:00Z')), false)
    assert.equal(startsAfterDue(at('2026-10-05T09:00:00Z'), undefined), false)
    assert.equal(startsAfterDue(new Date('not a date'), at('2026-10-05T09:00:00Z')), false)
  })

  /*
   * A review of this work: the web asked the exact question only in the create
   * modal, so from the sheet, a list row or the calendar a start at 09:00 on the
   * 5th in Karachi beside a due day of the 4th was taken (200, no toast) — the
   * rule above, with no zone, only refuses what every zone sees out of order.
   */
  it('orders a day beside a moment as the day the moment falls on where its writer is, the same instant taken where it falls on the due day', () => {
    const dueThe4th = at('2026-10-04T00:00:00Z')
    const nineInKarachiOnThe5th = at('2026-10-05T04:00:00Z')
    assert.equal(startsAfterDue(nineInKarachiOnThe5th, dueThe4th, 'Asia/Karachi'), true)
    // The same instant is 21:00 on the 4th in Los Angeles: on the day it is due.
    assert.equal(startsAfterDue(nineInKarachiOnThe5th, dueThe4th, 'America/Los_Angeles'), false)
    // No zone named: refused only where every reader would see it so.
    assert.equal(startsAfterDue(nineInKarachiOnThe5th, dueThe4th), false)
    // The last minute of the due day in Karachi is on it; the first of the next is not.
    assert.equal(startsAfterDue(at('2026-10-04T18:59:00Z'), dueThe4th, 'Asia/Karachi'), false)
    assert.equal(startsAfterDue(at('2026-10-04T19:00:00Z'), dueThe4th, 'Asia/Karachi'), true)
    // A start day beside a due moment: the moment read where the writer is.
    const startThe5th = at('2026-10-05T00:00:00Z')
    const dueAt20Z = at('2026-10-04T20:00:00Z') // 01:00 on the 5th in Karachi, 13:00 on the 4th in Los Angeles
    assert.equal(startsAfterDue(startThe5th, dueAt20Z, 'Asia/Karachi'), false)
    assert.equal(startsAfterDue(startThe5th, dueAt20Z, 'America/Los_Angeles'), true)
    // Two moments, or two days, are compared as they always were, whatever the zone.
    assert.equal(startsAfterDue(at('2026-10-03T12:00:00Z'), at('2026-10-03T12:00:00Z'), 'Asia/Karachi'), false)
    assert.equal(startsAfterDue(at('2026-10-04T00:00:00Z'), at('2026-10-03T00:00:00Z'), 'America/Los_Angeles'), true)
    assert.throws(() => assertDatesInOrder(nineInKarachiOnThe5th, dueThe4th, 'Asia/Karachi'), (e) => e instanceof BadRequestException && e.message === START_AFTER_DUE)
  })

  it('takes the writer’s zone from a header naming one this system knows, and no zone from anything else', () => {
    assert.equal(writerZone('Asia/Karachi'), 'Asia/Karachi')
    assert.equal(writerZone(['America/Los_Angeles', 'UTC']), 'America/Los_Angeles')
    for (const bad of [undefined, '', 'Asia/Karach', 'Mars/Olympus_Mons', 42, `Europe/${'x'.repeat(80)}`]) {
      assert.equal(writerZone(bad), undefined, `no zone from ${JSON.stringify(bad)}`)
    }
  })

  it('refuses a task that would start after it is due with the reason (400), and passes one in order', () => {
    assert.throws(
      () => assertDatesInOrder(at('2026-10-10T12:00:00Z'), at('2026-10-03T12:00:00Z')),
      (e) => e instanceof BadRequestException && e.message === START_AFTER_DUE,
    )
    assert.doesNotThrow(() => assertDatesInOrder(at('2026-10-01T12:00:00Z'), at('2026-10-03T12:00:00Z')))
    assert.doesNotThrow(() => assertDatesInOrder(at('2026-10-10T12:00:00Z'), null))
  })
})

describe('assertEstimate — found-30-sep/task-estimate-below-zero', () => {
  it('takes none, nought and whole seconds, and refuses one below nought, parts of a second, past the column, or not a number', () => {
    for (const ok of [undefined, null, 0, 1, 5400, 2_147_483_647]) assert.doesNotThrow(() => assertEstimate(ok), `takes ${ok}`)
    for (const bad of [-1, -3600, 1.5, 2_147_483_648, Number.NaN, Number.POSITIVE_INFINITY, '3600', true]) {
      assert.throws(() => assertEstimate(bad), BadRequestException, `refuses ${String(bad)}`)
    }
  })
})

describe('carriedEstimate — a copy made through createTask (found-30-sep/task-estimate-below-zero)', () => {
  /*
   * A review of this work: a duplicate whose subtask held -60 (written before
   * the rule) made the parent, its checklists and its values, then was refused
   * (400) at the subtask, leaving a half-made copy — one more at each try.
   */
  it('carries an estimate the rule takes, and none for one it refuses, so a copy is never refused for what its original holds', () => {
    for (const ok of [0, 60, 5400, 2_147_483_647]) assert.equal(carriedEstimate(ok), ok)
    for (const bad of [null, undefined, -60, -3600, 1.5, 2_147_483_648, Number.NaN, '60']) {
      assert.equal(carriedEstimate(bad), undefined, `carries nothing for ${String(bad)}`)
    }
  })
})

describe('tags by name — found-30-sep/refused-create-leaves-tags', () => {
  it('trims each name, drops a blank, keeps each once whatever its case, and gives one without a colour the neutral one', () => {
    assert.deepEqual(
      uniqueLabelNames([{ name: '  Design ' }, { name: 'design', color: '#ff0000' }, { name: '   ' }, { name: 'Later', color: '#00ff00' }]),
      [{ name: 'Design', color: '#94a3b8' }, { name: 'Later', color: '#00ff00' }],
    )
    assert.deepEqual(uniqueLabelNames(undefined), [])
  })

  it('finds a tag the workspace holds whatever its case, and would make the rest — none for a guest', () => {
    const wanted = [{ name: 'DESIGN', color: '#94a3b8' }, { name: 'Later', color: '#94a3b8' }]
    const existing = [{ id: 'label-design', name: 'design' }]
    assert.deepEqual(planLabelsByName(wanted, existing, { mayMake: true }), {
      foundIds: ['label-design'],
      toMake: [{ name: 'Later', color: '#94a3b8' }],
    })
    assert.deepEqual(planLabelsByName(wanted, existing, { mayMake: false }), { foundIds: ['label-design'], toMake: [] })
  })
})
