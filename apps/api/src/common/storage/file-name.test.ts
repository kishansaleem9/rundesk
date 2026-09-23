import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { safeFileName } from './file-name'
import { isSafeSegment } from './object-key-shape'

describe('safeFileName — one rule for every upload route', () => {
  it('keeps the sanitisers’ alphabet and replaces everything else', () => {
    assert.equal(safeFileName('Q3 report (final).pdf'), 'Q3_report__final_.pdf')
    assert.equal(safeFileName('../../etc/passwd'), '.._.._etc_passwd')
  })

  it('falls back when there is no name at all, instead of throwing', () => {
    assert.equal(safeFileName(undefined), 'file')
    assert.equal(safeFileName(null), 'file')
    assert.equal(safeFileName(42), 'file')
    assert.equal(safeFileName(''), 'file')
    assert.equal(safeFileName(undefined, 'clip.webm'), 'clip.webm')
  })

  it('caps the length, and what it returns is a safe key segment', () => {
    const long = safeFileName('a'.repeat(500))
    assert.equal(long.length, 120)
    for (const name of [safeFileName('Q3 report.pdf'), long, safeFileName(undefined)]) {
      assert.equal(isSafeSegment(`1790000000000-${name}`), true)
    }
  })
})
