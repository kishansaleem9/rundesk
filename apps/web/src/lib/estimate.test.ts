import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseEstimate, formatEstimate } from './estimate.ts'

const secondsOf = (text: string) => parseEstimate(text)?.seconds ?? null

describe('parseEstimate', () => {
  it('reads a bare number as hours — the frame\'s own example', () => {
    // `12` → "12 hours", and it is also what the old number input meant, so
    // nobody's habit changes meaning underneath them.
    assert.equal(secondsOf('12'), 12 * 3600)
  })

  it('reads hours written out', () => {
    for (const text of ['2h', '2 h', '2hr', '2 hrs', '2 hours', '2hour']) {
      assert.equal(secondsOf(text), 2 * 3600, `${text} should be two hours`)
    }
  })

  it('reads minutes, which the hours-only field could not express', () => {
    for (const text of ['90m', '90 min', '90 mins', '90 minutes']) {
      assert.equal(secondsOf(text), 90 * 60, `${text} should be ninety minutes`)
    }
  })

  it('adds the parts of a compound estimate', () => {
    assert.equal(secondsOf('1h 30m'), 5400)
    assert.equal(secondsOf('2h15m'), 2 * 3600 + 15 * 60)
  })

  it('takes a fraction', () => {
    assert.equal(secondsOf('1.5h'), 5400)
    assert.equal(secondsOf('0.25'), 900)
  })

  it('is nothing for an empty box', () => {
    assert.equal(parseEstimate(''), null)
    assert.equal(parseEstimate('   '), null)
  })

  it('refuses a typo rather than guessing at it', () => {
    // "12x" is not 12 hours. Silently dropping the x would record an estimate
    // somebody did not make.
    assert.equal(parseEstimate('12x'), null)
    assert.equal(parseEstimate('soon'), null)
    assert.equal(parseEstimate('-3h'), null)
  })

  it('refuses zero, which is not an estimate', () => {
    assert.equal(parseEstimate('0'), null)
    assert.equal(parseEstimate('0m'), null)
  })

  it('reports the units it found, for the suggestion row', () => {
    assert.deepEqual(parseEstimate('90m'), { seconds: 5400, hours: 1, minutes: 30 })
    assert.deepEqual(parseEstimate('12'), { seconds: 43200, hours: 12, minutes: 0 })
  })

  it('does NOT understand days, on purpose', () => {
    // A working day is a business decision this product has never made.
    // Reading "2d" as sixteen hours for somebody who meant forty-eight is
    // worse than not reading it at all.
    assert.equal(parseEstimate('2d'), null)
  })
})

describe('formatEstimate', () => {
  it('puts a unit on the number — frame `01:45` reads `12h`', () => {
    assert.equal(formatEstimate(12 * 3600), '12h')
  })

  it('says minutes as minutes under the hour', () => {
    assert.equal(formatEstimate(45 * 60), '45m')
  })

  it('and says both when there are both', () => {
    assert.equal(formatEstimate(5400), '1h 30m')
  })

  it('is empty for no estimate, rather than "0"', () => {
    assert.equal(formatEstimate(null), '')
    assert.equal(formatEstimate(undefined), '')
    assert.equal(formatEstimate(0), '')
  })
})

describe('the round trip', () => {
  it('survives what somebody typed', () => {
    for (const text of ['12', '90m', '1h 30m', '2h', '45m', '0.25']) {
      const parsed = parseEstimate(text)
      assert.notEqual(parsed, null, `${text} did not parse`)
      const shown = formatEstimate(parsed!.seconds)
      // Re-reading what was displayed must mean the same thing: that is what
      // makes the field safe to blur and come back to.
      assert.equal(parseEstimate(shown)?.seconds, parsed!.seconds, `${text} → ${shown} → drifted`)
    }
  })
})
