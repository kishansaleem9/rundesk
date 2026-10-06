import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dateBoxCommit } from './date-box'
import { fromDateTimeInput, withDatePart } from './task-dates'

/**
 * `found-30-sep/sheet-dates-write-as-typed` — the task sheet's date boxes write
 * what is typed on Enter or when they are left, not at each whole value passed
 * through on the way: the day "25" passes through the 2nd, the year "2027"
 * through year 0002.
 */
describe('a date box writes what was typed when it is accepted', () => {
  const shown = '2026-10-08T16:00'
  const toValue = fromDateTimeInput

  it('writes the date typed, once: as the instant it means, and not again while it is on its way', () => {
    assert.deepEqual(dateBoxCommit({ draft: '2026-10-25T16:00', shown, badInput: false, sending: null, toValue }), {
      kind: 'write',
      iso: fromDateTimeInput('2026-10-25T16:00'),
    })
    // Enter, then leaving the box: the second is not a second write.
    assert.deepEqual(dateBoxCommit({ draft: '2026-10-25T16:00', shown, badInput: false, sending: '2026-10-25T16:00', toValue }), { kind: 'none' })
    assert.deepEqual(dateBoxCommit({ draft: null, shown, badInput: false, sending: null, toValue }), { kind: 'none' })
  })

  it('writes nothing for a date typed only in part, or for the date stored', () => {
    // A box with a segment emptied reads '' and says `badInput`; that is not a cleared date.
    assert.deepEqual(dateBoxCommit({ draft: '', shown, badInput: true, sending: null, toValue }), { kind: 'discard' })
    assert.deepEqual(dateBoxCommit({ draft: shown, shown, badInput: false, sending: null, toValue }), { kind: 'discard' })
  })

  it('clears the date when the box is emptied, as clearing always did', () => {
    assert.deepEqual(dateBoxCommit({ draft: '', shown, badInput: false, sending: null, toValue }), { kind: 'write', iso: null })
  })

  it('writes the stored date typed back while another is on its way, which is about to replace it', () => {
    // Enter on the 25th, and before that write lands the 8th it held is typed again.
    assert.deepEqual(dateBoxCommit({ draft: shown, shown, badInput: false, sending: '2026-10-25T16:00', toValue }), {
      kind: 'write',
      iso: fromDateTimeInput(shown),
    })
  })

  it('writes a day box as the day picked, keeping the time the date carries', () => {
    const stored = '2026-10-08T16:00:00.000Z'
    assert.deepEqual(
      dateBoxCommit({ draft: '2026-10-25', shown: '2026-10-08', badInput: false, sending: null, toValue: (ymd) => withDatePart(stored, ymd) }),
      { kind: 'write', iso: withDatePart(stored, '2026-10-25') },
    )
  })
})
