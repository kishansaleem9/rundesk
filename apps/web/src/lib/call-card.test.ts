import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  callCardMode,
  callCardSubtitle,
  callCardTitleKey,
  canJoinFromCard,
  formatCallDuration,
  type CallCardState,
} from './call-card'

/**
 * §2.8 gap 9 — the card says the right one of three things.
 *
 * The failure is not a crash, it is a lie: a live "Join the SyncUp" button on
 * a call that ended last Tuesday, or "Wait for your team to join!" shown to
 * somebody who is not in the call at all.
 */

const card = (over: Partial<CallCardState> = {}): CallCardState => ({
  startedAt: '2026-08-26T10:00:00.000Z',
  endedAt: null,
  joinedCount: 1,
  presentCount: 1,
  youArePresent: false,
  ...over,
})

describe('§2.8 which of the three cards this is', () => {
  it('is "you are in it" when you are in it', () => {
    assert.equal(callCardMode(card({ youArePresent: true })), 'in')
    assert.equal(callCardTitleKey('in'), 'callCard.youAreIn')
  })

  it('is joinable when the call is live and you are not in it', () => {
    assert.equal(callCardMode(card({ youArePresent: false })), 'joinable')
    assert.equal(callCardTitleKey('joinable'), 'callCard.join')
  })

  it('is ended once it has ended, even if the server still lists you present', () => {
    // leftAt is written when you leave; a call the host ended for everyone can
    // leave rows that were never closed. Ended wins.
    const ended = card({ endedAt: '2026-08-26T10:00:45.000Z', youArePresent: true })
    assert.equal(callCardMode(ended), 'ended')
    assert.equal(callCardTitleKey('ended'), 'callCard.ended')
  })

  it('never offers Join on a call that is over', () => {
    assert.equal(canJoinFromCard(card({ endedAt: '2026-08-26T10:00:45.000Z' })), false)
    assert.equal(canJoinFromCard(card({ youArePresent: true })), false)
    assert.equal(canJoinFromCard(card()), true)
  })
})

describe('§2.8 "Lasted 45s"', () => {
  const lasted = (seconds: number) =>
    formatCallDuration('2026-08-26T10:00:00.000Z', new Date(Date.parse('2026-08-26T10:00:00.000Z') + seconds * 1000).toISOString())

  it('reads in seconds for a short call — the one she demonstrates', () => {
    assert.equal(lasted(45), '45s')
  })

  it('adds minutes once there are any', () => {
    assert.equal(lasted(192), '3m 12s')
  })

  it('drops seconds past an hour, where nobody reads them', () => {
    assert.equal(lasted(3900), '1h 5m')
  })

  it('does not report a negative duration when the clocks disagree', () => {
    assert.equal(formatCallDuration('2026-08-26T10:00:10.000Z', '2026-08-26T10:00:00.000Z'), '0s')
  })

  it('survives a timestamp it cannot read', () => {
    assert.equal(formatCallDuration('not a date', '2026-08-26T10:00:00.000Z'), '0s')
  })
})

describe('§2.8 the line under the heading', () => {
  it('says "wait for your team" only while you are alone in it', () => {
    assert.equal(callCardSubtitle(card({ youArePresent: true, presentCount: 1 })).key, 'callCard.waitForTeam')
  })

  it('counts the OTHERS once somebody else is there', () => {
    // Saying "3 in the call" to one of those three reads as three besides you.
    const sub = callCardSubtitle(card({ youArePresent: true, presentCount: 3 }))
    assert.equal(sub.key, 'callCard.inWithOthers')
    assert.equal(sub.vars?.count, 2)
  })

  it('says nobody is in an empty live call rather than "0 in the call"', () => {
    assert.equal(callCardSubtitle(card({ presentCount: 0 })).key, 'callCard.nobodyIn')
  })

  it('counts everyone present for someone outside the call', () => {
    const sub = callCardSubtitle(card({ presentCount: 2 }))
    assert.equal(sub.key, 'callCard.peopleIn')
    assert.equal(sub.vars?.count, 2)
  })

  it('reports how long it lasted and how many ever joined', () => {
    // "Lasted 45s · 1 person joined" — joined, not present: how many were ever
    // in it is the fact worth keeping about a call that is over.
    const sub = callCardSubtitle(
      card({ endedAt: '2026-08-26T10:00:45.000Z', joinedCount: 1, presentCount: 0 }),
    )
    assert.equal(sub.key, 'callCard.endedDetail')
    assert.equal(sub.vars?.duration, '45s')
    assert.equal(sub.vars?.count, 1)
  })

  it('does not use who is still present to describe an ended call', () => {
    const sub = callCardSubtitle(
      card({ endedAt: '2026-08-26T10:03:12.000Z', joinedCount: 4, presentCount: 0 }),
    )
    assert.equal(sub.vars?.count, 4, 'an ended call reported its live headcount instead')
  })
})
