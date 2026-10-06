import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { shownFieldCount } from './fields-shown.ts'

/*
 * `found-30-sep/fields-picker-counts-hidden-columns` — the Fields chip read
 * `fields − hidden`, and the hidden set holds the built-in columns too.
 */
describe('shownFieldCount — the fields shown, whatever columns are hidden', () => {
  const fields = [{ id: 'notes' }, { id: 'budget' }]

  it('counts a hidden built-in column as no hidden field', () => {
    assert.equal(shownFieldCount(fields, new Set()), 2)
    assert.equal(shownFieldCount(fields, new Set(['col:due'])), 2)
  })

  it('never reads below nought, whatever is hidden', () => {
    const everyColumn = new Set(['col:status', 'col:priority', 'col:assignees', 'col:due', 'col:created'])
    assert.equal(shownFieldCount(fields, everyColumn), 2)
    assert.equal(shownFieldCount(fields, new Set([...everyColumn, 'notes', 'budget'])), 0)
  })

  it('counts one lower for each of the fields themselves hidden', () => {
    assert.equal(shownFieldCount(fields, new Set(['col:due', 'budget'])), 1)
  })
})
