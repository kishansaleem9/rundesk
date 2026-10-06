import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BadRequestException } from '@nestjs/common'
import { taskDateFrom } from './task-date-input'

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
