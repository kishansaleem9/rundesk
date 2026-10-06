import { test } from 'node:test'
import assert from 'node:assert/strict'
import { autoMap, normaliseHeader } from './automap'
import { mappingProblem } from './columns'
import { parseCustomCell, suggestFieldType } from './custom-fields'
import { parseImportDate, type DateFormatKey } from './dates'
import { parseCheckbox, parseDuration, parseMoney, parsePhone, parsePriority, parseWebsite, splitMulti } from './values'

const iso = (raw: string, format: DateFormatKey = 'ymd') => {
  const d = parseImportDate(raw, format)
  return d.ok ? new Date(d.ms).toISOString() : `ERR ${d.message}`
}

test('dates accepted regardless of the chosen format', () => {
  for (const f of ['ymd', 'dmy', 'mdy', 'ymd_slash'] as const) {
    assert.equal(iso('2025-12-31T13:30:00.123Z', f), '2025-12-31T13:30:00.123Z')
    assert.equal(iso('1609428600000', f), '2020-12-31T15:30:00.000Z')
    assert.equal(iso('Wednesday, December 31st 2025', f), '2025-12-31T00:00:00.000Z')
    assert.equal(iso('Wednesday, December 31st 2025, 3:30:00 pm +00:00', f), '2025-12-31T15:30:00.000Z')
  }
  // ClickUp's own `… Text` column, with its comma and a negative offset.
  assert.equal(iso('Monday, May 30th, 2019, 4:00:00 am -07:00'), '2019-05-30T11:00:00.000Z')
})

test('the chosen format decides short dates', () => {
  assert.equal(iso('2025-12-31', 'ymd'), '2025-12-31T00:00:00.000Z')
  assert.equal(iso('25-12-31', 'ymd'), '2025-12-31T00:00:00.000Z')
  assert.equal(iso('31/12/2025', 'dmy'), '2025-12-31T00:00:00.000Z')
  assert.equal(iso('12/31/2025', 'mdy'), '2025-12-31T00:00:00.000Z')
  assert.equal(iso('2025/12/31', 'ymd_slash'), '2025-12-31T00:00:00.000Z')
  assert.equal(iso('03/04/2025', 'dmy'), '2025-04-03T00:00:00.000Z')
  assert.equal(iso('03/04/2025', 'mdy'), '2025-03-04T00:00:00.000Z')
  assert.match(iso('31/12/2025', 'ymd'), /^ERR .*Year-Month-Day format \(e\.g\. 2025-12-31\)/)
})

test('times are 24-hour unless am/pm says otherwise; impossible dates and abbreviations fail', () => {
  assert.equal(iso('2025-12-31 13:30'), '2025-12-31T13:30:00.000Z')
  assert.equal(iso('12/31/2025 1:30 pm', 'mdy'), '2025-12-31T13:30:00.000Z')
  assert.equal(iso('12/31/2025 12:05 am', 'mdy'), '2025-12-31T00:05:00.000Z')
  assert.match(iso('2025-02-30'), /^ERR .*not a real date/)
  assert.match(iso('Wed, Dec 31st 2025'), /^ERR .*abbreviated/)
  assert.match(iso('2025-12-31 25:00'), /^ERR /)
})

test('durations', () => {
  const ms = (raw: string) => {
    const d = parseDuration(raw)
    return d.ok ? d.value : null
  }
  assert.equal(ms('2h 30m'), 9_000_000)
  assert.equal(ms('150m'), 9_000_000)
  assert.equal(ms('2:30'), 9_000_000)
  assert.equal(ms('9000000'), 9_000_000)
  assert.equal(ms('1 hour 15 minutes'), 4_500_000)
  assert.equal(ms('soon'), null)
  assert.equal(ms('2h then'), null)
})

test('priority: 1–4 and the words, nothing else', () => {
  assert.deepEqual(['1', '2', '3', '4', 'URGENT', 'Low'].map((v) => parsePriority(v).ok && parsePriority(v)), [
    { ok: true, value: 'urgent' },
    { ok: true, value: 'high' },
    { ok: true, value: 'normal' },
    { ok: true, value: 'low' },
    { ok: true, value: 'urgent' },
    { ok: true, value: 'low' },
  ])
  assert.equal(parsePriority('5').ok, false)
  assert.equal(parsePriority('Highest').ok, false)
})

test('checkbox, money, phone and website rules', () => {
  for (const v of ['true', 'T', '1', 'Checked']) assert.deepEqual(parseCheckbox(v), { ok: true, value: true })
  for (const v of ['false', 'f', '0', 'unchecked']) assert.deepEqual(parseCheckbox(v), { ok: true, value: false })
  assert.equal(parseCheckbox('maybe').ok, false)
  assert.deepEqual(parseMoney('15.20'), { ok: true, value: 15.2 })
  assert.deepEqual(parseMoney('£1,234.50'), { ok: true, value: 1234.5 })
  assert.equal(parsePhone('+44 20 7946 0958').ok, true)
  assert.equal(parsePhone('020 7946 0958').ok, false)
  assert.equal(parseWebsite('https://example.com/a').ok, true)
  assert.equal(parseWebsite('example.com').ok, false)
})

test('multi-value cells split on the chosen delimiter and lose ClickUp’s brackets', () => {
  assert.deepEqual(splitMulti(' a | b ||c ', '|'), ['a', 'b', 'c'])
  assert.deepEqual(splitMulti('[John Smith,Mary Smith]', ','), ['John Smith', 'Mary Smith'])
  assert.deepEqual(splitMulti('', ','), [])
})

test('custom field values and their limits', () => {
  const opts = { dateFormat: 'ymd' as const, delimiter: ',' }
  assert.equal(parseCustomCell('text', 'x'.repeat(2049), opts).ok, false)
  assert.equal(parseCustomCell('long_text', 'x'.repeat(50_000), opts).ok, true)
  assert.deepEqual(parseCustomCell('labels', 'a, b, a', opts), { ok: true, value: ['a', 'b'] })
  assert.deepEqual(parseCustomCell('rating', '5', opts), { ok: true, value: 5 })
  assert.equal(parseCustomCell('rating', '6', opts).ok, false)
  assert.equal(parseCustomCell('progress_manual', '101', opts).ok, false)
  assert.deepEqual(parseCustomCell('date', '2025-12-31', opts), { ok: true, value: '2025-12-31T00:00:00.000Z' })
  assert.equal(suggestFieldType(['1', '2.5', '-3'], opts), 'number')
  assert.equal(suggestFieldType(['a@b.co', 'c@d.org'], opts), 'email')
  assert.equal(suggestFieldType(['Red', 'Blue', 'Red'], opts), 'dropdown')
})

test('auto-mapping: memory, labels, ClickUp headers, synonyms, then custom fields', () => {
  const m = autoMap(
    ['Title', 'Assignee(s)', 'Deadline', 'Labels', 'Notes', 'Parent ID', 'Task Description', 'Due date Text', 'Budget', 'Story points', 'Name'],
    { memory: { 'story points': 'cf:new' }, customFields: [{ id: 'f1', name: 'budget' }] },
  )
  assert.deepEqual(m, {
    Title: 'taskName',
    'Assignee(s)': 'assignees',
    Deadline: 'dueDate',
    Labels: 'tags',
    Notes: 'description',
    'Parent ID': 'parentId',
    // A second description column stays unmapped rather than replacing the first.
    'Task Description': 'skip',
    'Due date Text': 'skip',
    Budget: 'cf:f1',
    'Story points': 'cf:new',
    Name: 'skip',
  })
  // A remembered field that is not in this destination is ignored.
  assert.equal(autoMap(['Budget'], { memory: { budget: 'cf:gone' } }).Budget, 'skip')
  assert.equal(normaliseHeader('  Task_Name*: '), 'task name')
})

test('a mapping needs exactly one Task Name', () => {
  assert.match(mappingProblem({ a: 'skip' }) ?? '', /Task Name is required/)
  assert.match(mappingProblem({ a: 'taskName', b: 'taskName' }) ?? '', /Only one/)
  assert.equal(mappingProblem({ a: 'taskName', b: 'cf:new', c: 'cf:new' }), null)
})
