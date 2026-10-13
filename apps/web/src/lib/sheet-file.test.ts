import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPickTurns, isCompoundFileSignature, isZipSignature, sheetFileKind } from './sheet-file'

/*
 * HOW THE SPREADSHEET IMPORT READS A FILE, ASKED BEFORE THE PAGE READS IT
 * (`ledger-rows/row-816`, `found-5-oct/xlsx-read-as-text`): its name, and its
 * first bytes.
 */
const ACCEPTED = ['.csv', '.tsv', '.txt', '.xlsx', '.xls', '.json']
const ZIP = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]
const file = (name: string, content: number[] | string) =>
  Object.assign(new Blob([typeof content === 'string' ? content : new Uint8Array(content)]), { name })

test('a workbook or a JSON list is uploaded as the file it is', async () => {
  assert.equal(await sheetFileKind(file('triage-board.xlsx', ZIP), ACCEPTED), 'file')
  assert.equal(await sheetFileKind(file('board.XLSX', ZIP), ACCEPTED), 'file')
  assert.equal(await sheetFileKind(file('tasks.json', '[{"Name":"A"}]'), ACCEPTED), 'file')
  // Some tools save tab-separated text under an .xls name: the server reads it as the text it is.
  assert.equal(await sheetFileKind(file('board.xls', 'Title\tStatus\nA\tDone\n'), ACCEPTED), 'file')
})

test('a workbook under a CSV name is uploaded and read as the workbook, by its first bytes', async () => {
  assert.equal(await sheetFileKind(file('triage-board.csv', ZIP), ACCEPTED), 'file')
  // An empty archive's and a spanned one's signatures are zips too.
  assert.equal(await sheetFileKind(file('a.tsv', [0x50, 0x4b, 0x05, 0x06]), ACCEPTED), 'file')
  assert.equal(await sheetFileKind(file('a.txt', [0x50, 0x4b, 0x07, 0x08]), ACCEPTED), 'file')
})

test('delimited text is read by the page, a first column named “PK” among it', async () => {
  assert.equal(await sheetFileKind(file('jira.csv', 'Summary,Status\nAlpha,Done\n'), ACCEPTED), 'text')
  assert.equal(await sheetFileKind(file('keys.CSV', 'PK,Name\n1,Alpha\n'), ACCEPTED), 'text')
  assert.equal(await sheetFileKind(file('board.tsv', 'Title\tStatus\n'), ACCEPTED), 'text')
  assert.equal(await sheetFileKind(file('short.txt', 'P'), ACCEPTED), 'text')
})

test('a file of no kind the import reads is refused by its name, whatever it holds', async () => {
  assert.equal(await sheetFileKind(file('minutes.docx', ZIP), ACCEPTED), null)
  assert.equal(await sheetFileKind(file('report.pdf', '%PDF-1.7'), ACCEPTED), null)
  assert.equal(await sheetFileKind(file('board.ods', ZIP), ACCEPTED), null)
})

test('the zip signature is “PK” and one of three pairs, nothing looser', () => {
  assert.equal(isZipSignature(new Uint8Array(ZIP)), true)
  assert.equal(isZipSignature(new Uint8Array([0x50, 0x4b, 0x2c, 0x4e])), false) // "PK,N"
  assert.equal(isZipSignature(new Uint8Array([0x50, 0x4b, 0x03])), false)
  assert.equal(isZipSignature(new Uint8Array([])), false)
})

// The first bytes of a real legacy .xls (an OLE2 compound file).
const XLS = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00, 0x00, 0x00]

test('a legacy .xls under a CSV or text name is uploaded by its first bytes — the compound file’s eight', async () => {
  assert.equal(await sheetFileKind(file('legacy-board.csv', XLS), ACCEPTED), 'file')
  assert.equal(await sheetFileKind(file('legacy-board.txt', XLS), ACCEPTED), 'file')
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
