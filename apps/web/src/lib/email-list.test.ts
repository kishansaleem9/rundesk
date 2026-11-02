import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseEmailList } from './email-list'

// QA WS-010 — "Paste 3 emails separated by comma, space or new line; all valid
// emails invited; any invalid email flagged on its own."

test('commas, spaces and line breaks all separate, in any mix', () => {
  assert.deepEqual(parseEmailList('a@x.com, b@x.com c@x.com\nd@x.com;e@x.com\t f@x.com'), {
    valid: ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com', 'f@x.com'],
    invalid: [],
  })
})

test('a wrong one is flagged on its own and the rest still go', () => {
  assert.deepEqual(parseEmailList('ada@example.com, not-an-email, bob@example\ncy@example.org'), {
    valid: ['ada@example.com', 'cy@example.org'],
    invalid: ['not-an-email', 'bob@example'],
  })
})

test('a mail client’s "Name <address>" is its address', () => {
  assert.deepEqual(parseEmailList('Ada Lovelace <ada@example.com>, "Bob B" <bob@example.com>; cy@example.com'), {
    valid: ['ada@example.com', 'bob@example.com', 'cy@example.com'],
    invalid: [],
  })
})

test('the same address twice, in any case, is asked once', () => {
  assert.deepEqual(parseEmailList('ada@example.com ADA@example.com Ada@Example.com'), { valid: ['ada@example.com'], invalid: [] })
})

test('nothing, or only separators, is nothing', () => {
  assert.deepEqual(parseEmailList(''), { valid: [], invalid: [] })
  assert.deepEqual(parseEmailList(' ,; \n\t, '), { valid: [], invalid: [] })
})

test('a sentence’s full stop or brackets around an address are not part of it', () => {
  assert.deepEqual(parseEmailList('(ada@example.com) ada2@example.com.'), { valid: ['ada@example.com', 'ada2@example.com'], invalid: [] })
})
