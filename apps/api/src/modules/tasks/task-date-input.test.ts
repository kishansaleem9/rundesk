import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BadRequestException } from '@nestjs/common'
import { taskDateFrom, taskDateTimeFlags, taskTimeFlagFrom } from './task-date-input'

/**
 * `found-5-oct/years-below-100-read-back-wrong` — a task's date as `POST /tasks`,
 * `PATCH /tasks/:id` and the bulk editor take it. Year 0, a year before it and
 * one past 9999 reached Postgres, which refused them, and the routes answered
 * 500; every year from 1 to 9999 is written as sent.
 */
const refusal = (fn: () => unknown): string => {
  try {
    fn()
  } catch (err) {
    assert.ok(err instanceof BadRequestException, `a 400, not ${String(err)}`)
    return (err as BadRequestException).message
  }
  assert.fail('it was taken')
}

describe('a task date as a write sends it', () => {
  it('takes every year from 1 to 9999 as sent, year 2 and 99 among them', () => {
    for (const sent of ['0001-01-01T00:00:00.000Z', '0002-10-06T09:00:00.000Z', '0099-10-06T09:00:00.000Z', '2026-10-06T09:00:00.000Z', '9999-12-31T23:59:59.000Z']) {
      assert.equal(taskDateFrom('dueDate', sent)?.toISOString(), sent)
    }
    // Empty is no date, as clearing always was.
    assert.equal(taskDateFrom('dueDate', null), null)
    assert.equal(taskDateFrom('dueDate', ''), null)
  })

  it('refuses, in words, a year Postgres cannot take as sent: 0, before it, past 9999', () => {
    for (const sent of ['0000-10-06T09:00:00.000Z', '-000001-10-06T09:00:00.000Z', '+010000-01-01T00:00:00.000Z', '0001-01-01T00:00:00+01:00']) {
      assert.equal(refusal(() => taskDateFrom('startDate', sent)), 'startDate must fall between the years 1 and 9999', sent)
    }
    assert.equal(refusal(() => taskDateFrom('dueDate', 'not a date')), 'dueDate is not a valid date')
  })
})

/**
 * `found-6-oct/a-time-on-utc-midnight-reads-as-no-time`: each date a write sets
 * takes the time flag sent with it, or the one its instant says.
 */
describe('whether a task date carries a time, as a write leaves it', () => {
  it('takes the flag sent: 17:00 in Los Angeles is UTC midnight and still a time', () => {
    assert.deepEqual(taskDateTimeFlags({ dueDate: new Date('2026-10-09T00:00:00.000Z'), dueDateHasTime: true }), { dueDateHasTime: true })
  })

  it('reads one not sent from the instant: a UTC midnight is a date with no time, any other a time', () => {
    assert.deepEqual(
      taskDateTimeFlags({ startDate: new Date('2026-10-09T00:00:00.000Z'), dueDate: new Date('2026-10-09T17:30:00.000Z') }),
      { startDateHasTime: false, dueDateHasTime: true },
    )
  })

  it('has no time for no date, whatever is sent; leaves a date the write does not set alone', () => {
    assert.deepEqual(taskDateTimeFlags({ dueDate: null, dueDateHasTime: true }), { dueDateHasTime: false })
    assert.deepEqual(taskDateTimeFlags({ startDate: new Date('2026-10-09T10:00:00.000Z') }), { startDateHasTime: true })
    // A flag sent alone says whether the date the task holds carries a time.
    assert.deepEqual(taskDateTimeFlags({ startDateHasTime: true }), { startDateHasTime: true })
  })

  it('takes a flag as true or false, and refuses anything else in words', () => {
    assert.equal(taskTimeFlagFrom('dueDateHasTime', undefined), undefined)
    assert.equal(taskTimeFlagFrom('dueDateHasTime', false), false)
    assert.equal(refusal(() => taskTimeFlagFrom('dueDateHasTime', 'yes')), 'dueDateHasTime must be true or false')
  })
})
