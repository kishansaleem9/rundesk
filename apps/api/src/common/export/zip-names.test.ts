import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { safeEntryName, uniqueEntryNames } from './zip-names'

/**
 * A ZIP ENTRY'S NAME IS A PATH, and a task file's name is whatever its
 * uploader's browser said (`found-30-sep/attachments-have-no-download-all`).
 * Each name is made one safe segment, and two files of one name get two.
 */
describe('safeEntryName — one segment, safe to unpack', () => {
  it('leaves no path separator and no .. in a name, nor anything a file system refuses', () => {
    const cases: Array<[unknown, string]> = [
      ['notes.txt', 'notes.txt'],
      ['../../.bashrc', '._._.bashrc'],
      ['..\\..\\boot.ini', '._._boot.ini'],
      ['docs/brief.pdf', 'docs_brief.pdf'],
      ['/etc/passwd', '_etc_passwd'],
      ['..', 'file'],
      ['.', 'file'],
      ['', 'file'],
      [null, 'file'],
      ['report...final.pdf', 'report.final.pdf'],
      ['Q3: "final"?.pdf', 'Q3_ _final__.pdf'],
      ['line\nbreak\u0000.txt', 'line_break_.txt'],
      ['trailing dots... ', 'trailing dots'],
      ['CON.txt', '_CON.txt'],
      ['تقرير.pdf', 'تقرير.pdf'],
    ]
    for (const [input, want] of cases) {
      const got = safeEntryName(input)
      assert.equal(got, want, `${JSON.stringify(input)} became ${JSON.stringify(got)}`)
      assert.doesNotMatch(got, /[/\\]/, `${JSON.stringify(got)} holds a path separator`)
      assert.ok(!got.includes('..'), `${JSON.stringify(got)} holds ..`)
    }
    // Cut short, by whole characters, keeping the extension.
    const long = safeEntryName(`${'ن'.repeat(300)}.pdf`)
    assert.ok(Buffer.byteLength(long) <= 200 && long.endsWith('.pdf') && !long.includes('�'), `a long name became ${long.length} characters`)
  })
})

describe('uniqueEntryNames — no two entries of one name', () => {
  it('gives a repeated name the lowest (n) not yet used, comparing without case', () => {
    assert.deepEqual(uniqueEntryNames(['notes.txt', 'notes.txt', 'notes.txt']), ['notes.txt', 'notes (2).txt', 'notes (3).txt'])
    // A name that is already somebody's "(2)" pushes the copy on to 3.
    assert.deepEqual(uniqueEntryNames(['a.txt', 'a (2).txt', 'a.txt']), ['a.txt', 'a (2).txt', 'a (3).txt'])
    // One file on Windows and macOS.
    assert.deepEqual(uniqueEntryNames(['notes.txt', 'Notes.txt']), ['notes.txt', 'Notes (2).txt'])
    // Names made safe first, then kept apart: both of these are `x_y.txt`.
    assert.deepEqual(uniqueEntryNames(['x/y.txt', 'x\\y.txt']), ['x_y.txt', 'x_y (2).txt'])
    // No extension, and a leading dot that is not one.
    assert.deepEqual(uniqueEntryNames(['README', 'README', '.env', '.env']), ['README', 'README (2)', '.env', '.env (2)'])
    // And kept apart from the names a caller already holds.
    assert.deepEqual(uniqueEntryNames(['links.txt'], ['LINKS.txt']), ['links (2).txt'])
  })
})
