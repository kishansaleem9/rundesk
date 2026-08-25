import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isJoinable, untilLabel } from './meetings-api'

/**
 * §2.8 — the proximity badge ("in 5m") and the Join pill, frame `330`.
 *
 * Both are about a moment, so both are easy to get subtly wrong in a way
 * nobody notices until the one time it matters: a Join button that disappears
 * exactly when someone is running late, or a countdown that rounds a meeting
 * further away than it is.
 */

const NOW = new Date('2026-08-25T12:00:00Z').getTime()
const at = (iso: string) => iso

describe('§2.8 how long until a meeting', () => {
  it('counts minutes, then hours, then days', () => {
    assert.equal(untilLabel(at('2026-08-25T12:05:00Z'), NOW), 'in 5m')
    assert.equal(untilLabel(at('2026-08-25T15:00:00Z'), NOW), 'in 3h')
    assert.equal(untilLabel(at('2026-08-28T12:00:00Z'), NOW), 'in 3d')
  })

  it('rounds DOWN, so nobody is told they have longer than they do', () => {
    // 119 seconds reading "in 2m" invites finishing a sentence first.
    assert.equal(untilLabel(at('2026-08-25T12:01:59Z'), NOW), 'in 1m')
    assert.equal(untilLabel(at('2026-08-25T13:59:00Z'), NOW), 'in 1h')
  })

  it('says "now" rather than "in 0m"', () => {
    assert.equal(untilLabel(at('2026-08-25T12:00:30Z'), NOW), 'now')
    assert.equal(untilLabel(at('2026-08-25T12:00:00Z'), NOW), 'now')
  })

  it('shows nothing for a meeting that has passed, or has no time', () => {
    assert.equal(untilLabel(at('2026-08-25T11:59:00Z'), NOW), null)
    assert.equal(untilLabel(null, NOW), null)
    assert.equal(untilLabel('not a date', NOW), null)
  })
})

describe('§2.8 when Join goes live', () => {
  it('is live in the ten minutes before', () => {
    assert.ok(isJoinable(at('2026-08-25T12:05:00Z'), NOW))
    assert.ok(isJoinable(at('2026-08-25T12:10:00Z'), NOW))
  })

  it('is not live for something hours away', () => {
    assert.ok(!isJoinable(at('2026-08-25T14:00:00Z'), NOW))
    assert.ok(!isJoinable(at('2026-08-25T12:11:00Z'), NOW))
  })

  it('stays live for an hour AFTER it started', () => {
    // The case that actually matters. A Join button that vanishes on the
    // stroke of the hour is useless to the person running late — which is
    // exactly who needs it.
    assert.ok(isJoinable(at('2026-08-25T11:30:00Z'), NOW), 'gone 30 minutes in')
    assert.ok(isJoinable(at('2026-08-25T11:01:00Z'), NOW), 'gone 59 minutes in')
  })

  it('gives up on a meeting long finished', () => {
    assert.ok(!isJoinable(at('2026-08-25T10:00:00Z'), NOW))
  })

  it('is never live without a time', () => {
    assert.ok(!isJoinable(null, NOW))
  })
})
