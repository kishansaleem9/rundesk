import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { measured, spanOf, spread } from './workload-spread'

/**
 * The one rule every workload reader spreads a task by (`ledger-rows/row-777`):
 * the estimate over the task's own days, a task once on each of them, and
 * nothing for a task with no date or, under estimates, no estimate.
 */
const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const start = day('2026-10-12')

describe('spread (one task over a window of days)', () => {
  it('spreads an estimate evenly over its days: 8h over two days is 4h on each', () => {
    const loads = spread({ startDate: day('2026-10-12'), dueDate: day('2026-10-13'), timeEstimate: 8 * 3600 }, start, 7, 'hours')
    assert.deepEqual(loads, [4, 4, 0, 0, 0, 0, 0])
  })

  it('puts a task with only a due date on that day', () => {
    const loads = spread({ startDate: null, dueDate: day('2026-10-14'), timeEstimate: 2 * 3600 }, start, 7, 'hours')
    assert.deepEqual(loads, [0, 0, 2, 0, 0, 0, 0])
  })

  it('takes the share over the WHOLE span, so a window that shows part of a task shows part of its hours', () => {
    // Ten days from the window's first, 10h: one hour a day, five of them inside a five-day window.
    const loads = spread({ startDate: day('2026-10-12'), dueDate: day('2026-10-21'), timeEstimate: 10 * 3600 }, start, 5, 'hours')
    assert.deepEqual(loads, [1, 1, 1, 1, 1])
  })

  it('counts a task that began before the window only on the days inside it', () => {
    const loads = spread({ startDate: day('2026-10-10'), dueDate: day('2026-10-13'), timeEstimate: 8 * 3600 }, start, 3, 'hours')
    assert.deepEqual(loads, [2, 2, 0])
  })

  it('by Tasks, counts a task once on every day of its span', () => {
    const loads = spread({ startDate: day('2026-10-12'), dueDate: day('2026-10-14'), timeEstimate: null }, start, 4, 'tasks')
    assert.deepEqual(loads, [1, 1, 1, 0])
  })

  it('by Sprint points, spreads the points like an estimate', () => {
    const loads = spread({ startDate: day('2026-10-12'), dueDate: day('2026-10-14'), timeEstimate: null, points: 6 }, start, 3, 'points')
    assert.deepEqual(loads, [2, 2, 2])
  })

  it('gives a task with no estimate nothing under estimates — not four hours it never had', () => {
    const task = { startDate: day('2026-10-12'), dueDate: day('2026-10-12'), timeEstimate: null }
    assert.equal(measured(task, 'hours'), false)
    assert.deepEqual(spread(task, start, 2, 'hours'), [0, 0])
  })

  it('gives a task with no date nothing at all: it is unscheduled', () => {
    const task = { startDate: null, dueDate: null, timeEstimate: 3600 }
    assert.equal(spanOf(task), null)
    assert.deepEqual(spread(task, start, 3, 'tasks'), [0, 0, 0])
  })
})
