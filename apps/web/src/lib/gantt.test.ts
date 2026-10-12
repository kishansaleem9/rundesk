import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ganttSchedule, type GanttNode } from './gantt'

const node = (id: string, start: number, end: number, blockedBy: string[] = [], group = 'g'): GanttNode => ({
  id,
  group,
  start,
  end,
  blockedBy,
})
const ids = (s: Set<string>) => [...s].sort()

describe('ganttSchedule — the critical path and slack time, as ClickUp draws them', () => {
  it('always marks the task of a group that ends last, with no dependency at all', () => {
    const { critical, slack } = ganttSchedule([node('a', 0, 2), node('b', 1, 9), node('c', 3, 4)])
    assert.deepEqual(ids(critical), ['b'])
    assert.equal(slack.get('a'), 7)
    assert.equal(slack.get('c'), 5)
    assert.equal(slack.get('b'), 0)
  })

  it('walks back through blockers that leave no gap, and stops at the first one that does', () => {
    // a (0–2) → b (3–5) → c (6–9): no gaps, all three. d (0–1) → b: a day's gap.
    const { critical, slack } = ganttSchedule([
      node('a', 0, 2),
      node('d', 0, 1),
      node('b', 3, 5, ['a', 'd']),
      node('c', 6, 9, ['b']),
    ])
    assert.deepEqual(ids(critical), ['a', 'b', 'c'])
    // d may slip until the day before b starts: from day 1 to day 2.
    assert.equal(slack.get('d'), 1)
  })

  it('counts an overlap as no gap', () => {
    const { critical } = ganttSchedule([node('a', 0, 5), node('b', 3, 8, ['a'])])
    assert.deepEqual(ids(critical), ['a', 'b'])
  })

  it('reads each group on its own: each has its last task', () => {
    const { critical } = ganttSchedule([
      node('a', 0, 4, [], 'x'),
      node('b', 0, 2, [], 'x'),
      node('c', 0, 9, [], 'y'),
      node('d', 0, 3, [], 'y'),
    ])
    assert.deepEqual(ids(critical), ['a', 'c'])
  })

  it('gives a task that something waits on the slack to the first of them, not to the group end', () => {
    // a ends day 2; b waits on it from day 6; c ends the group on day 20.
    const { critical, slack } = ganttSchedule([node('a', 0, 2), node('b', 6, 7, ['a']), node('c', 0, 20)])
    assert.deepEqual(ids(critical), ['c'])
    assert.equal(slack.get('a'), 3)
    assert.equal(slack.get('b'), 13)
  })

  it('ignores a blocker that is not drawn, and ends on a cycle', () => {
    const { critical } = ganttSchedule([node('a', 0, 3, ['b', 'gone']), node('b', 4, 6, ['a'])])
    assert.deepEqual(ids(critical), ['a', 'b'])
  })
})
