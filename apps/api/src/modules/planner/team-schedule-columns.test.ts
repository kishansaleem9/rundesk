import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAX_TEAM_SCHEDULE_PEOPLE, teamScheduleColumns } from './planner.service'

/**
 * §V2-15c — WHICH PEOPLE A TEAM SCHEDULE DRAWS, and why this is a unit test.
 *
 * `team-schedules.mjs` is the only suite that covers the side-by-side grid, and
 * it intercepts `**\/api\/**` at the browser context — every response is a stub,
 * so no server code runs in it at all. `ts-9-dedupe-dropped` removes the
 * de-duplication from `teamSchedules` and ran GREEN against that suite for
 * exactly that reason: it changes a line nothing in the repository executes.
 *
 * A patch that cannot fail is a patch that proves nothing, and the honest fix
 * is not a looser claim but a test that can actually reach the code. So the
 * three statements that decide the columns are a named function now, and these
 * are the facts the grid depends on.
 *
 * WHY THE DE-DUPE MATTERS MORE THAN IT LOOKS. "Sara, Sara" drawing two
 * identical columns is the one failure a side-by-side grid cannot survive:
 * two columns of the same person look exactly like two people who happen to be
 * busy at the same times, so the answer is not merely wrong, it is
 * indistinguishable from a right one. Somebody books over a morning that was
 * never free.
 */
describe('team schedule columns', () => {
  it('keeps the order the caller asked for', () => {
    assert.deepEqual(teamScheduleColumns(['c', 'a', 'b']), ['c', 'a', 'b'])
  })

  it('collapses a repeated id, keeping its FIRST position', () => {
    // Last-wins would reorder the grid under somebody who typed a name twice.
    assert.deepEqual(teamScheduleColumns(['a', 'b', 'a']), ['a', 'b'])
  })

  it('drops empty ids rather than asking for a column of nobody', () => {
    assert.deepEqual(teamScheduleColumns(['a', '', 'b']), ['a', 'b'])
  })

  it('answers an empty list for nothing, rather than throwing', () => {
    // `teamSchedules` returns `{ people: [] }` on this, which is what an
    // unpicked grid draws; a throw here would make the empty state an error.
    assert.deepEqual(teamScheduleColumns([]), [])
    assert.deepEqual(teamScheduleColumns(['', '']), [])
  })

  it(`refuses more than ${MAX_TEAM_SCHEDULE_PEOPLE} people, by the count AFTER de-duplication`, () => {
    const many = Array.from({ length: MAX_TEAM_SCHEDULE_PEOPLE + 1 }, (_, i) => `u${i}`)
    assert.throws(() => teamScheduleColumns(many), /at most 8 people/)
    // And the cap is applied to the DE-DUPLICATED list, not the raw one: the
    // same person named nine times is one column, not a refusal. Capping first
    // would reject a request the grid can draw perfectly well.
    assert.deepEqual(
      teamScheduleColumns(Array.from({ length: MAX_TEAM_SCHEDULE_PEOPLE + 1 }, () => 'u1')),
      ['u1'],
    )
  })

  it('accepts exactly the cap', () => {
    const atCap = Array.from({ length: MAX_TEAM_SCHEDULE_PEOPLE }, (_, i) => `u${i}`)
    assert.equal(teamScheduleColumns(atCap).length, MAX_TEAM_SCHEDULE_PEOPLE)
  })
})
