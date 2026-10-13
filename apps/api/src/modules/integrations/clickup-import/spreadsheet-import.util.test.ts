import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_STATUSES,
  NOT_DELIMITED_TEXT,
  SHEET_SOURCES,
  UNSUPPORTED_SOURCES,
  autoMap,
  detectDelimiter,
  headerHoldsNul,
  isZipContent,
  mapSheet,
  mappingError,
  mergeSet,
  normalizePriority,
  parseSheet,
  splitDelimitedRow,
  storable,
  statusCategoryOf,
} from './spreadsheet-import.util'

const trello = [
  'Card Name,Card Description,Due Date,Members,Labels,List Name',
  'Ship the thing,"Needs a, comma",2026-03-04,ada@example.com,"urgent,api",Doing',
].join('\n')

describe('delimiter + row splitting', () => {
  it('reads a comma file as comma and a tab file as tab', () => {
    assert.equal(detectDelimiter(trello), ',')
    assert.equal(detectDelimiter('a\tb\tc\n1\t2\t3'), '\t')
  })

  it('does not count a delimiter inside quotes', () => {
    // Three tabs outside quotes beats the commas inside the quoted header.
    assert.equal(detectDelimiter('"a,b,c"\tx\ty\tz'), '\t')
  })

  it('splits quoted cells containing the delimiter', () => {
    assert.deepEqual(splitDelimitedRow('a,"b,c",d', ','), ['a', 'b,c', 'd'])
    assert.deepEqual(splitDelimitedRow('a\t"b\tc"\td', '\t'), ['a', 'b\tc', 'd'])
  })
})

describe('presets', () => {
  it('maps a Trello export onto the task fields', () => {
    const table = parseSheet(trello)
    const mapping = autoMap(table.headers, 'trello')
    assert.equal(mapping['Card Name'], 'title')
    assert.equal(mapping['Card Description'], 'description')
    assert.equal(mapping['Members'], 'assignees')
    assert.equal(mapping['Labels'], 'tags')
    assert.equal(mapping['List Name'], 'list')
    assert.equal(mappingError(mapping), null)
  })

  it('falls back to the generic preset for columns a named source does not know', () => {
    const mapping = autoMap(['Card Name', 'Status'], 'trello')
    assert.equal(mapping['Status'], 'status') // from generic, not from trello
  })

  it('never maps two columns to Title', () => {
    const mapping = autoMap(['Name', 'Task Name'], 'generic')
    assert.equal((Object.values(mapping).filter((f) => f === 'title')).length, 1)
  })

  it('refuses a mapping with no title at all', () => {
    assert.match(String(mappingError({ Status: 'status' })), /Title/)
  })

  it('names every source from the frame exactly once, and draws no control for the four it cannot do', () => {
    const keys = SHEET_SOURCES.map((s) => s.key)
    assert.equal(new Set(keys).size, keys.length)
    const unsupported = UNSUPPORTED_SOURCES.map((u) => u.key)
    for (const k of unsupported) assert.ok(!(keys).includes(k))
    for (const u of UNSUPPORTED_SOURCES) assert.ok((u.reason.length) > 30)
  })
})

describe('priority scales', () => {
  it('reads Todoist numbers as the inverse of ClickUp numbers', () => {
    assert.equal(normalizePriority('4', 'todoist'), 'urgent')
    assert.equal(normalizePriority('1', 'todoist'), 'low')
    assert.equal(normalizePriority('1', 'clickup'), 'urgent')
    assert.equal(normalizePriority('4', 'clickup'), 'low')
  })

  it('reads Jira words, including the two a substring match gets wrong', () => {
    assert.equal(normalizePriority('Highest', 'text'), 'urgent')
    assert.equal(normalizePriority('Lowest', 'text'), 'low')
    assert.equal(normalizePriority('High', 'text'), 'high')
    assert.equal(normalizePriority('Medium', 'text'), 'normal')
  })

  it('ignores numbers in a text-scale source rather than guessing', () => {
    assert.equal(normalizePriority('3', 'text'), 'normal')
  })
})

describe('status categories', () => {
  it('pins the six default statuses to their buckets', () => {
    assert.deepEqual(
      DEFAULT_STATUSES.map((s) => `${s.key}:${s.category}`),
      ['backlog:open', 'todo:open', 'in_progress:in_progress', 'in_review:in_progress', 'done:closed', 'cancelled:closed'],
    )
    assert.equal(statusCategoryOf('done'), 'closed')
    assert.equal(statusCategoryOf('todo'), 'open')
  })
})

describe('row rejection', () => {
  const csv = [
    'Name,Due Date,Status',
    'Good one,2026-03-04,Done',
    ',2026-03-04,Done',
    'Bad date,tomorrow?,Done',
    'Ragged,2026-03-04,Done,extra',
    '',
  ].join('\n')

  const run = () => {
    const table = parseSheet(csv)
    return mapSheet(table, autoMap(table.headers, 'generic'), { priorityScale: 'clickup' })
  }

  it('keeps the good row and refuses the three bad ones', () => {
    const { rows, rejections } = run()
    assert.deepEqual(rows.map((r) => r.title), ['Good one'])
    assert.deepEqual(rejections.map((r) => r.code), ['title_missing', 'invalid_date', 'ragged_row'])
  })

  it('reports the file line number and the offending column on each refusal', () => {
    const { rejections } = run()
    assert.deepEqual(rejections.map((r) => r.row), [3, 4, 5])
    assert.equal(rejections[1].column, 'Due Date')
    assert.equal(rejections[1].value, 'tomorrow?')
    assert.ok(String(rejections[1].message).includes('Row 4'), rejections[1].message)
    assert.ok(String(rejections[1].message).includes('tomorrow?'), rejections[1].message)
  })

  it('stamps the status category on the row it accepts', () => {
    const { rows } = run()
    assert.equal(rows[0].status, 'done')
    assert.equal(rows[0].statusCategory, 'closed')
  })

  it('refuses a title over the 500-character limit', () => {
    const table = parseSheet(`Name\n${'x'.repeat(501)}`)
    const { rows, rejections } = mapSheet(table, autoMap(table.headers, 'generic'), { priorityScale: 'clickup' })
    assert.equal((rows).length, 0)
    assert.equal(rejections[0].code, 'title_too_long')
    assert.ok(String(rejections[0].message).includes('501'), rejections[0].message)
  })
})

/*
 * `found-5-oct/xlsx-read-as-text`: the route receives the file's content only,
 * read as text by the page, so a zip is told by its first bytes.
 */
describe('a file that is not delimited text', () => {
  // How the page's FileReader hands an .xlsx over: its first bytes are ASCII and survive.
  const XLSX_AS_TEXT = 'PK\u0003\u0004\u0014\u0000\u0000\u0000\b\u0000[Content_Types].xml'

  it('is a zip by its first bytes — and a sheet whose first column is “PK” is not one', () => {
    assert.equal(isZipContent(XLSX_AS_TEXT), true)
    assert.equal(isZipContent('PK\u0005\u0006'), true)
    assert.equal(isZipContent('PK\u0007\u0008'), true)
    assert.equal(isZipContent('PK,Name\n1,Alpha\n'), false)
    assert.equal(isZipContent('Title\nAlpha\n'), false)
    assert.equal(isZipContent(''), false)
    assert.equal(isZipContent(undefined), false)
  })

  it('is refused in words that say to send the file itself, and what the page reads', () => {
    assert.equal(
      NOT_DELIMITED_TEXT,
      'This is a workbook or another binary file sent as text: upload the file itself and send its key, as the import page does. Accepted: .csv · .tsv · .txt · .xlsx · .xls · .json.',
    )
  })

  it('is no zip when it is not a string at all — a number or an object from a client goes on to the parser', () => {
    for (const content of [123, { a: 1 }, true, null, ['PK\u0003\u0004']]) assert.equal(isZipContent(content), false)
  })

  // A legacy .xls as the page's FileReader decodes it: the OLE2 signature's bytes, then NULs.
  const XLS_AS_TEXT = new TextDecoder('utf-8').decode(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0x0a, 0x41]))

  it('holds a NUL in its first line when it is a legacy .xls read as text — and a NUL in a later row is that row’s own', () => {
    assert.equal(headerHoldsNul(XLS_AS_TEXT), true)
    assert.equal(headerHoldsNul('Ti\u0000tle\nAlpha\n'), true)
    assert.equal(headerHoldsNul('Title\r\nAl\u0000pha\r\n'), false)
    assert.equal(headerHoldsNul('Title\nBro\u0000ken\n'), false)
    assert.equal(headerHoldsNul('Title\rBro\u0000ken\r'), false)
    assert.equal(headerHoldsNul('Title,Status\nAlpha,Done\n'), false)
    for (const content of [123, { a: 1 }, undefined]) assert.equal(headerHoldsNul(content), false)
  })
})

/*
 * `found-5-oct/xlsx-read-as-text`: Postgres refuses U+0000 in text and jsonb,
 * so one NUL in one row's title reached the job's `result` and failed the run.
 */
describe('what is written to the job row', () => {
  it('holds no NUL: each one, however deep, is written as U+FFFD — and nothing else changes', () => {
    const when = new Date('2026-10-05T00:00:00.000Z')
    const summary = { errors: ['Row 3 ("Bro\u0000ken"): refused'], rowErrors: [{ row: 4, value: 'not\u0000a date', message: 'x' }], tasksCreated: 2, at: when, none: null }
    const out = storable(summary)
    assert.deepEqual(out.errors, ['Row 3 ("Bro\uFFFDken"): refused'])
    assert.equal(out.rowErrors[0].value, 'not\uFFFDa date')
    assert.equal(out.tasksCreated, 2)
    assert.equal(out.at, when)
    assert.equal(out.none, null)
    assert.equal(JSON.stringify(out).includes('\\u0000'), false)
    assert.equal(storable('Import failed'), 'Import failed')
  })
})

/*
 * `found-5-oct/import-merge-resets-fields-the-file-lacks`: a merge writes the
 * fields the file maps, and leaves the rest as the task has them.
 */
describe('what a merge writes', () => {
  const rowOf = (csv: string) => {
    const table = parseSheet(csv)
    const mapping = autoMap(table.headers, 'generic')
    return { row: mapSheet(table, mapping, { priorityScale: 'clickup' }).rows[0], mapping }
  }

  it('writes no status and no priority from a file with neither column', () => {
    const { row, mapping } = rowOf('Title,List,Description\ntwo,Alpha,new words\n')
    // The row still carries the defaults a missing cell maps to; the merge does not write them.
    assert.equal(row.status, 'todo')
    assert.equal(row.priority, 'normal')
    assert.deepEqual(mergeSet(row, mapping), { description: 'new words' })
  })

  it('writes the status, its category and the priority when the file maps them', () => {
    const { row, mapping } = rowOf('Title,Status,Priority\ntwo,Done,High\n')
    assert.deepEqual(mergeSet(row, mapping), { status: 'done', statusCategory: 'closed', priority: 'high' })
  })

  it('leaves a mapped description or date alone where the row holds none', () => {
    const { row, mapping } = rowOf('Title,Description,Due Date,Start Date\ntwo,,,2026-10-01\n')
    // The start date goes with its time flag (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`).
    assert.deepEqual(Object.keys(mergeSet(row, mapping)), ['startDate', 'startDateHasTime'])
  })

  it('writes each date with whether its cell held a time of day, midnight included', () => {
    const { row, mapping } = rowOf('Title,Due Date,Start Date\nthree,10/1/2026 12:00 AM,2026-10-01\n')
    const set = mergeSet(row, mapping)
    assert.equal(set.dueDateHasTime, true, 'a cell reading 12:00 AM holds a time, at midnight')
    assert.equal(set.startDateHasTime, false, 'a cell with a day and no clock holds no time')
  })
})
