import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPickTurns, isCompoundFileSignature, isSheetFile, isZipSignature } from './sheet-file'

/*
 * WHAT THE SPREADSHEET IMPORT READS, ASKED BEFORE THE PAGE READS A FILE
 * (`found-5-oct/xlsx-read-as-text`): its name, and its first bytes.
 */
const ACCEPTED = ['.csv', '.tsv', '.txt']
const ZIP = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]
const file = (name: string, content: number[] | string) =>
  Object.assign(new Blob([typeof content === 'string' ? content : new Uint8Array(content)]), { name })

test('an .xlsx is refused by its name, whatever it holds', async () => {
  assert.equal(await isSheetFile(file('triage-board.xlsx', ZIP), ACCEPTED), false)
  assert.equal(await isSheetFile(file('board.XLSX', 'Title\nA\n'), ACCEPTED), false)
  assert.equal(await isSheetFile(file('board.xls', 'Title\nA\n'), ACCEPTED), false)
})

test('a zip named .csv is refused by its first bytes', async () => {
  assert.equal(await isSheetFile(file('triage-board.csv', ZIP), ACCEPTED), false)
  // An empty archive's and a spanned one's signatures are zips too.
  assert.equal(await isSheetFile(file('a.tsv', [0x50, 0x4b, 0x05, 0x06]), ACCEPTED), false)
  assert.equal(await isSheetFile(file('a.txt', [0x50, 0x4b, 0x07, 0x08]), ACCEPTED), false)
})

test('delimited text is read, a first column named “PK” among it', async () => {
  assert.equal(await isSheetFile(file('jira.csv', 'Summary,Status\nAlpha,Done\n'), ACCEPTED), true)
  assert.equal(await isSheetFile(file('keys.CSV', 'PK,Name\n1,Alpha\n'), ACCEPTED), true)
  assert.equal(await isSheetFile(file('board.tsv', 'Title\tStatus\n'), ACCEPTED), true)
  assert.equal(await isSheetFile(file('short.txt', 'P'), ACCEPTED), true)
})

test('the zip signature is “PK” and one of three pairs, nothing looser', () => {
  assert.equal(isZipSignature(new Uint8Array(ZIP)), true)
  assert.equal(isZipSignature(new Uint8Array([0x50, 0x4b, 0x2c, 0x4e])), false) // "PK,N"
  assert.equal(isZipSignature(new Uint8Array([0x50, 0x4b, 0x03])), false)
  assert.equal(isZipSignature(new Uint8Array([])), false)
})

// The first bytes of a real legacy .xls (an OLE2 compound file, written by xlwt).
const XLS = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00, 0x00, 0x00]

test('a legacy .xls named .csv is refused by its first bytes too — the compound file’s eight', async () => {
  assert.equal(await isSheetFile(file('legacy-board.csv', XLS), ACCEPTED), false)
  assert.equal(await isSheetFile(file('legacy-board.txt', XLS), ACCEPTED), false)
  assert.equal(isCompoundFileSignature(new Uint8Array(XLS)), true)
  // Seven of the eight, or the eight out of place, are not the signature.
  assert.equal(isCompoundFileSignature(new Uint8Array(XLS.slice(0, 7))), false)
  assert.equal(isCompoundFileSignature(new Uint8Array([0x00, ...XLS])), false)
})

test('only the last file chosen is read into the page: an earlier read that lands later is dropped', () => {
  const turns = createPickTurns()
  const slow = turns.next()
  const refused = turns.next()
  assert.equal(turns.isLatest(slow), false, 'the first file, still reading, is no longer the one chosen')
  assert.equal(turns.isLatest(refused), true)
  const third = turns.next()
  assert.equal(turns.isLatest(refused), false)
  assert.equal(turns.isLatest(third), true)
})
