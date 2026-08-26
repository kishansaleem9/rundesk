import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canAskAgain, gateMessageKey, type GateResult } from './feature-gate'

/**
 * §2.8 gap 11 — what the modal says back.
 *
 * The whole gap is that a switched-off feature said nothing. Replacing silence
 * with a message that is wrong would be no better: "your admins have been
 * asked" when nobody was told sends someone off to wait for an answer that is
 * never coming.
 */

const r = (status: GateResult['status'], notified = 0): GateResult => ({ status, notified })

describe('§2.8 a gated feature reports what really happened', () => {
  it('says it was sent when someone was actually told', () => {
    assert.equal(gateMessageKey(r('sent', 2)), 'gate.sent')
  })

  it('does NOT claim success when every admin has muted the notice', () => {
    // The server did its job and reached nobody. That is not a failure and it
    // is not a success; it is the one case where the person has to do
    // something else.
    assert.equal(gateMessageKey(r('sent', 0)), 'gate.sentButSilent')
    assert.notEqual(gateMessageKey(r('sent', 0)), gateMessageKey(r('sent', 1)))
  })

  it('distinguishes a repeat press from a fresh ask', () => {
    assert.equal(gateMessageKey(r('already_asked')), 'gate.alreadyAsked')
  })

  it('says when there is nobody to ask', () => {
    assert.equal(gateMessageKey(r('no_admins')), 'gate.noAdmins')
  })

  it('handles the feature having been switched on while the modal was open', () => {
    assert.equal(gateMessageKey(r('already_enabled')), 'gate.nowOn')
  })

  it('treats a network failure as a failure, not a send', () => {
    assert.equal(gateMessageKey(r('failed')), 'gate.failed')
  })
})

describe('§2.8 the button stops only when asking again is pointless', () => {
  it('is pressable before anything has been tried', () => {
    assert.equal(canAskAgain(null), true)
  })

  it('stops once the request has genuinely landed', () => {
    assert.equal(canAskAgain(r('sent', 1)), false)
    assert.equal(canAskAgain(r('already_asked')), false)
  })

  it('stays pressable when nobody was reached', () => {
    // Locking the button here would leave someone staring at "nobody was told"
    // with nothing they can do about it.
    assert.equal(canAskAgain(r('sent', 0)), true)
    assert.equal(canAskAgain(r('failed')), true)
    assert.equal(canAskAgain(r('no_admins')), true)
  })
})
