import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_STATUSES,
  SHEET_SOURCES,
  UNSUPPORTED_SOURCES,
  autoMap,
  detectDelimiter,
  mapSheet,
  mappingError,
  normalizePriority,
  parseSheet,
  splitDelimitedRow,
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
