import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseClickUpCsv,
  inferCustomFieldType,
  coerceCustomValue,
  buildDropdownOptions,
  dupKey,
  mapStatus,
  mapPriority,
  mergeSetOf,
} from './clickup-csv.util'

/**
 * §12.5 ClickUp import — pure CSV helpers.
 *   1. Custom-field DETECTION: columns beyond the known task/built-in fields
 *      become custom fields, with a type inferred from their values.
 *   2. Value coercion into the stored { v } shape.
 *   3. Duplicate keying.
 */

describe('parseClickUpCsv — custom-field detection', () => {
  it('detects columns beyond the known task fields and infers their types', () => {
    const csv = [
      'Task Name,Status,Priority,List,Budget,Region,Approved,Kickoff',
      'Alpha,todo,high,Sprint 1,100,North,true,2024-01-05',
      'Beta,in progress,normal,Sprint 1,250,South,false,2024-02-11',
      'Gamma,done,low,Sprint 1,175,North,true,2024-03-01',
    ].join('\n')

    const { rows, customFieldColumns } = parseClickUpCsv(csv)
    assert.equal(rows.length, 3)

    const byName = new Map(customFieldColumns.map((c) => [c.name, c]))
    // Known columns must NOT be treated as custom fields.
    for (const known of ['Task Name', 'Status', 'Priority', 'List']) {
      assert.equal(byName.has(known), false, `${known} should not be a custom field`)
    }
    // Custom columns detected with inferred types.
    assert.equal(byName.get('Budget')?.type, 'number')
    assert.equal(byName.get('Region')?.type, 'dropdown')
    assert.equal(byName.get('Approved')?.type, 'checkbox')
    assert.equal(byName.get('Kickoff')?.type, 'date')

    // Dropdown carries de-duplicated options.
    const region = byName.get('Region')!
    assert.deepEqual(
      region.options?.map((o) => o.value).sort(),
      ['North', 'South'],
    )

    // Raw custom cells attach to the row.
    assert.equal(rows[0].custom['Budget'], '100')
    assert.equal(rows[0].custom['Region'], 'North')
  })

  it('ignores standard ClickUp export columns (Space, Date Created, Time Estimate…)', () => {
    const csv = [
      'Task Name,List,Space,Date Created,Time Estimate,Assignees,Tags,Story Points',
      'Alpha,L1,Marketing,2024-01-01,3600,Alice,urgent,5',
    ].join('\n')
    const { customFieldColumns } = parseClickUpCsv(csv)
    const names = customFieldColumns.map((c) => c.name)
    // Only the genuinely user-defined column survives.
    assert.deepEqual(names, ['Story Points'])
    assert.equal(customFieldColumns[0].type, 'number')
  })

  it('returns no custom fields for a plain export', () => {
    const csv = 'Task Name,Status,List\nAlpha,todo,L1\nBeta,done,L1'
    const { customFieldColumns } = parseClickUpCsv(csv)
    assert.equal(customFieldColumns.length, 0)
  })

  it('handles an empty / header-only CSV', () => {
    assert.deepEqual(parseClickUpCsv(''), { rows: [], headers: [], customFieldColumns: [], carries: { status: false, priority: false } })
    assert.deepEqual(parseClickUpCsv('Task Name,Status').rows, [])
  })
})

describe('inferCustomFieldType', () => {
  it('checkbox for boolean-ish values', () => {
    assert.equal(inferCustomFieldType(['true', 'false', 'yes', 'no']), 'checkbox')
    assert.equal(inferCustomFieldType(['checked', 'unchecked']), 'checkbox')
  })
  it('number when every value parses numeric', () => {
    assert.equal(inferCustomFieldType(['1', '2.5', '-3', '1000']), 'number')
  })
  it('date when values parse as dates but are not plain numbers', () => {
    assert.equal(inferCustomFieldType(['2024-01-01', '2024-02-02']), 'date')
  })
  it('dropdown for low-cardinality repeated strings', () => {
    assert.equal(inferCustomFieldType(['A', 'B', 'A', 'B', 'A']), 'dropdown')
  })
  it('text for free-form / unique strings', () => {
    assert.equal(inferCustomFieldType(['hello world', 'a note', 'another entirely']), 'text')
  })
  it('text for an all-empty column', () => {
    assert.equal(inferCustomFieldType(['', '', '']), 'text')
  })
})

describe('coerceCustomValue', () => {
  it('coerces checkbox tokens to booleans', () => {
    assert.equal(coerceCustomValue('checkbox', 'true'), true)
    assert.equal(coerceCustomValue('checkbox', 'No'), false)
    assert.equal(coerceCustomValue('checkbox', 'maybe'), null)
  })
  it('coerces numbers', () => {
    assert.equal(coerceCustomValue('number', '42'), 42)
    assert.equal(coerceCustomValue('number', 'abc'), null)
  })
  it('coerces dates to ISO strings', () => {
    assert.equal(coerceCustomValue('date', '2024-01-05'), new Date('2024-01-05').toISOString())
  })
  it('passes text / dropdown through trimmed', () => {
    assert.equal(coerceCustomValue('text', '  hi  '), 'hi')
    assert.equal(coerceCustomValue('dropdown', 'North'), 'North')
  })
  it('returns null for empty cells', () => {
    assert.equal(coerceCustomValue('text', '   '), null)
  })
})

describe('buildDropdownOptions + dupKey + mappers', () => {
  it('de-dupes options case-insensitively (first casing wins)', () => {
    assert.deepEqual(buildDropdownOptions(['High', 'low', 'high', 'Low']), [
      { label: 'High', value: 'High' },
      { label: 'low', value: 'low' },
    ])
  })
  it('dupKey is list+title, case/space-insensitive', () => {
    assert.equal(dupKey('Sprint 1', 'Design Homepage'), dupKey(' sprint 1 ', ' design homepage '))
    assert.notEqual(dupKey('Sprint 1', 'Design'), dupKey('Sprint 2', 'Design'))
  })
  it('maps ClickUp status/priority', () => {
    assert.equal(mapStatus('Complete'), 'done')
    assert.equal(mapStatus('in progress'), 'in_progress')
    assert.equal(mapStatus('Working on it'), 'in_progress', 'Monday’s in-progress status')
    assert.equal(mapPriority('Urgent'), 'urgent')
    assert.equal(mapPriority('2'), 'high')
  })

  /*
   * `mapPriority` decided by SUBSTRING ORDER: `includes('high')` ran before
   * anything could look at `highest`, so "Highest" — the tier ABOVE high —
   * imported as `high`, and `lowest` was unreachable for the same reason.
   * Neither word is in ClickUp's own vocabulary, which is why it went
   * unnoticed; but the generic spreadsheet importer feeds this the same
   * column, and those are ordinary words in a sheet exported from elsewhere.
   */
  it('reads Highest as urgent and Lowest as low — the two substring order ate', () => {
    assert.equal(mapPriority('Highest'), 'urgent')
    assert.equal(mapPriority('HIGHEST'), 'urgent')
    assert.equal(mapPriority('  highest '), 'urgent')
    assert.equal(mapPriority('Lowest'), 'low')
    assert.equal(mapPriority('Priority: Highest'), 'urgent')
    assert.equal(mapPriority('Priority: Lowest'), 'low')
  })

  it('keeps the four words, the four numbers, and normal for anything else', () => {
    assert.equal(mapPriority('High'), 'high')
    assert.equal(mapPriority('Normal'), 'normal')
    assert.equal(mapPriority('Low'), 'low')
    assert.equal(mapPriority('1'), 'urgent')
    assert.equal(mapPriority('3'), 'normal')
    assert.equal(mapPriority('4'), 'low')
    assert.equal(mapPriority(undefined), 'normal')
    assert.equal(mapPriority(''), 'normal')
    assert.equal(mapPriority('banana'), 'normal')
  })
})

/*
 * `found-5-oct/import-merge-resets-fields-the-file-lacks`, in the ClickUp
 * import: a merge writes the columns the file carries, and no other.
 */
describe('what a ClickUp merge writes', () => {
  it('says which of status and priority the file carries a column for', () => {
    assert.deepEqual(parseClickUpCsv('Task Name,List\ntwo,Alpha\n').carries, { status: false, priority: false })
    assert.deepEqual(parseClickUpCsv('Task Name,Status,Priority\ntwo,done,high\n').carries, { status: true, priority: true })
    assert.deepEqual(parseClickUpCsv('Task Name\n').carries, { status: false, priority: false })
  })

  it('writes no status and no priority from a file with neither column', () => {
    const { rows, carries } = parseClickUpCsv('Task Name,List,Description\ntwo,Alpha,new words\n')
    const set = mergeSetOf(rows[0], carries)
    assert.equal('status' in set, false)
    assert.equal('priority' in set, false)
    assert.equal(set.description, 'new words')
  })

  it('writes them when the file carries them', () => {
    const { rows, carries } = parseClickUpCsv('Task Name,Status,Priority\ntwo,in progress,urgent\n')
    const set = mergeSetOf(rows[0], carries)
    assert.equal(set.status, 'in_progress')
    assert.equal(set.priority, 'urgent')
  })
})
