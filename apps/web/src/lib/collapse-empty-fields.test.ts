import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isEmptyFieldValue } from './collapse-empty-fields.ts'

describe('isEmptyFieldValue', () => {
  it('treats nothing-there as empty', () => {
    assert.equal(isEmptyFieldValue(null), true)
    assert.equal(isEmptyFieldValue(undefined), true)
    assert.equal(isEmptyFieldValue(''), true)
    assert.equal(isEmptyFieldValue('   '), true)
    assert.equal(isEmptyFieldValue([]), true)
  })

  it('does not treat a deliberate "no" as empty', () => {
    // The whole point of the distinction: hiding `false` hides an answer
    // somebody gave, and the field then looks as if it was never asked.
    assert.equal(isEmptyFieldValue(false), false)
  })

  it('does not treat zero as empty', () => {
    // Zero hours estimated, zero percent done, zero pounds spent — each is a
    // measurement. A field-hider that eats zeroes silently deletes data from
    // the page.
    assert.equal(isEmptyFieldValue(0), false)
  })

  it('keeps anything with content', () => {
    assert.equal(isEmptyFieldValue('urgent'), false)
    assert.equal(isEmptyFieldValue(['a']), false)
    assert.equal(isEmptyFieldValue({ v: 1 }), false)
    assert.equal(isEmptyFieldValue(42), false)
  })
})
