import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatStandupFallback, standupHasContent, standupList, type StandupData } from './standup'

const task = (title: string) => ({ id: title, title, dueDate: null, completedAt: null })

const base = (over: Partial<StandupData> = {}): StandupData => ({
  displayName: 'Hamda Tahir',
  days: 7,
  done: [],
  active: [],
  overdue: [],
  blocked: [],
  ...over,
})

test('says so plainly when there is nothing to report', () => {
  const text = formatStandupFallback(base())
  assert.equal(standupHasContent(base()), false)
  // A fact about the workspace, not a verdict on the person.
  assert.match(text, /no recorded task activity/i)
  assert.match(text, /^Hamda /)
  assert.doesNotMatch(text, /overdue|blocked/i)
})

test('leads with finished work, not with problems', () => {
  const text = formatStandupFallback(
    base({ done: [task('Ship the invoice screen')], overdue: [task('Chase the vendor')] }),
  )
  assert.ok(
    text.indexOf('finished') < text.indexOf('overdue'),
    `problems came first: ${text}`,
  )
})

test('names what is in flight and what is in the way', () => {
  const text = formatStandupFallback(
    base({
      done: [task('A')],
      active: [task('B')],
      overdue: [task('C')],
      blocked: [task('D')],
    }),
  )
  for (const t of ['A', 'B', 'C', 'D']) assert.match(text, new RegExp(`“${t}”`))
  assert.match(text, /is working on/)
  assert.match(text, /blocked by unfinished work/)
})

test('counts rather than lists once the clause would run long', () => {
  const many = ['one', 'two', 'three', 'four', 'five'].map(task)
  const text = formatStandupFallback(base({ done: many }))
  assert.match(text, /finished 5 tasks/)
  assert.match(text, /\(\+2 more\)/)
  assert.doesNotMatch(text, /“four”/)
})

test('agrees in number for a single task', () => {
  const one = formatStandupFallback(base({ done: [task('A')], overdue: [task('C')] }))
  assert.match(one, /finished 1 task:/)
  assert.match(one, /1 task is overdue/)

  const two = formatStandupFallback(base({ done: [task('A'), task('B')], overdue: [task('C'), task('D')] }))
  assert.match(two, /finished 2 tasks:/)
  assert.match(two, /2 tasks are overdue/)
})

test('a person whose only work is overdue still gets a sentence', () => {
  const text = formatStandupFallback(base({ overdue: [task('C')] }))
  assert.match(text, /nothing finished or in flight/)
  assert.match(text, /1 task is overdue/)
})

test('one day reads as today rather than "in the last 1 days"', () => {
  assert.match(formatStandupFallback(base({ days: 1, active: [task('A')] })), /today/)
  assert.doesNotMatch(formatStandupFallback(base({ days: 1, active: [task('A')] })), /last 1 days/)
})

test('falls back to a pronoun when the person has no name', () => {
  const text = formatStandupFallback(base({ displayName: '' }))
  assert.match(text, /^They /)
})

test('standupList caps and counts', () => {
  assert.equal(standupList([task('a'), task('b')]), '“a”, “b”')
  assert.equal(standupList([task('a'), task('b'), task('c'), task('d')]), '“a”, “b”, “c” (+1 more)')
})
