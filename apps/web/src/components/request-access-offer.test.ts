import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { offersRequestAccess } from './request-access-offer'

/**
 * `found-30-sep/private-task-reads-say-403` — a task the reader may not open is
 * answered as one that is not there (404), so the task sheet's Request access
 * is offered on that answer, and on nothing else. It was keyed on the 403 the
 * server gave a private task, which no read answers any more: keyed so, the
 * card would never render, and keyed on any error it would render on a dropped
 * connection.
 */
const WS = '11111111-1111-4111-8111-111111111111'
const TASK = '44444444-4444-4444-8444-444444444444'
const refused = (status: number) => Object.assign(new Error('refused'), { name: 'ApiError', status })

describe('the task sheet offers Request access on a refused read', () => {
  it('offers it on the 404 a task the reader may not open shares with an id that names nothing', () => {
    assert.equal(offersRequestAccess(refused(404), WS, TASK), true)
  })

  it('does not offer it on a 403, a 400, a server error or a dropped connection', () => {
    for (const status of [403, 400, 500, 503]) assert.equal(offersRequestAccess(refused(status), WS, TASK), false, `offered on ${status}`)
    assert.equal(offersRequestAccess(new TypeError('Failed to fetch'), WS, TASK), false, 'offered on a dropped connection')
    assert.equal(offersRequestAccess(null, WS, TASK), false, 'offered with no error at all')
  })

  it('does not offer it without the workspace and the id to ask about', () => {
    assert.equal(offersRequestAccess(refused(404), undefined, TASK), false)
    assert.equal(offersRequestAccess(refused(404), WS, undefined), false)
  })
})
