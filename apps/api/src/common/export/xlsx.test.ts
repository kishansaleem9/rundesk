import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { toXlsx } from './xlsx'

/**
 * THE WORKBOOK, WRITTEN BY THE ONE ZIP WRITER (`found-30-sep/two-zip-writers`)
 * and read back by a real reader, Info-ZIP's `unzip`, as `zip-stream.test.ts`
 * reads Download all's archives.
 */
function readBack(bytes: Buffer): { list: string; part: (name: string) => string } {
  const dir = mkdtempSync(join(tmpdir(), 'xlsx-test-'))
  const file = join(dir, 'book.xlsx')
  writeFileSync(file, bytes)
  try {
    // -t tests every entry's CRC and sizes; it throws on a damaged archive.
    execFileSync('unzip', ['-tq', file])
    const list = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' })
    // Extracted, not named: to unzip, `[Content_Types].xml` is a wildcard pattern.
    const out = join(dir, 'out')
    execFileSync('unzip', ['-q', file, '-d', out])
    const parts = new Map<string, string>()
    for (const name of list.trim().split('\n')) parts.set(name, readFileSync(join(out, name), 'utf8'))
    return { list, part: (name) => parts.get(name) ?? '' }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('toXlsx — a workbook through zipStream', () => {
  it('writes the five parts a reader opens, every CRC right, the cells as inline strings', async () => {
    const bytes = await toXlsx('Sprint: 12', ['Name', 'Status'], [['=cmd|\'/c calc\'!A1', 'Open'], ['Ship it', 'Done']])
    const book = readBack(bytes)
    assert.deepEqual(book.list.trim().split('\n'), [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
    ])
    const sheet = book.part('xl/worksheets/sheet1.xml')
    assert.match(sheet, /<is><t[^>]*>=cmd\|'\/c calc'!A1<\/t><\/is>/)
    assert.ok(!sheet.includes('<f>'), 'no cell is a formula')
    // Excel refuses a sheet named with a colon.
    assert.match(book.part('xl/workbook.xml'), /<sheet name="Sprint {2}12"/)
  })

  it('writes the same bytes for the same rows: every entry is dated 1980-01-01, not now', async () => {
    const a = await toXlsx('List', ['Name'], [['One']])
    await new Promise((resolve) => setTimeout(resolve, 2100)) // past a DOS time's two-second step
    const b = await toXlsx('List', ['Name'], [['One']])
    assert.ok(a.equals(b), 'two exports of the same rows differ')
  })
})
