import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isEmailAddress } from './email-address'

// QA WS-010 — "any invalid email flagged on its own".
describe('isEmailAddress', () => {
  it('takes an address of every ordinary shape', () => {
    for (const ok of ['ada@example.com', 'ada.lovelace+ops@mail.example.co.uk', 'a@b.io', 'x-1@rundesk.invalid', 'ÜNI@例え.jp']) {
      assert.equal(isEmailAddress(ok), true, ok)
    }
  })

  it('refuses what could never be one', () => {
    for (const bad of ['', 'ada', 'ada@', '@example.com', 'ada@example', 'ada@@example.com', 'ada example@x.com', 'ada@ex ample.com',
      'Ada <ada@example.com>', 'ada@example.com,bob@example.com', 'ada@example..com', 'ada@.example.com', 'ada@example.com.', 'a;b@x.com']) {
      assert.equal(isEmailAddress(bad), false, bad)
    }
    assert.equal(isEmailAddress(undefined), false)
    assert.equal(isEmailAddress(42), false)
    assert.equal(isEmailAddress(`${'a'.repeat(250)}@x.com`), false, 'longer than 254')
  })
})
