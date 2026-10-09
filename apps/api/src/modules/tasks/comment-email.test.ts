import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COMMENT_EMAIL_REFUSALS, EMAIL_MAX_RECIPIENTS, emailAddress, emailRecipients, emailSubject, replySubject } from './comment-email'

test('an address is something, an @ and a domain with a dot, lower-cased; a name, a second address or a line break riding in is not one', () => {
  assert.equal(emailAddress('  Ana.Lopez@Example.COM '), 'ana.lopez@example.com')
  assert.equal(emailAddress('ops+billing@mail.example.co.uk'), 'ops+billing@mail.example.co.uk')
  for (const bad of ['ana', 'ana@', '@example.com', 'ana@example', 'ana@example.c', 'Ana <ana@example.com>', 'a@b.com, c@d.com', 'a@b.com;c@d.com', 'ana@example.com\r\nBcc: x@y.com', 'an a@example.com', `${'x'.repeat(250)}@example.com`]) {
    assert.equal(emailAddress(bad), null, bad)
  }
})

test('To, CC and BCC go to each address once, in the first box that names it, and an email goes to somebody in To', () => {
  const r = emailRecipients({ to: ['a@x.com', 'A@X.com'], cc: ['a@x.com', 'b@x.com', ' '], bcc: ['b@x.com', 'c@x.com'] })
  assert.deepEqual(r, { ok: true, recipients: { to: ['a@x.com'], cc: ['b@x.com'], bcc: ['c@x.com'] } })
  assert.deepEqual(emailRecipients({ to: [], cc: ['b@x.com'] }), { ok: false, message: COMMENT_EMAIL_REFUSALS.noRecipient })
  assert.deepEqual(emailRecipients({ to: ['  '] }), { ok: false, message: COMMENT_EMAIL_REFUSALS.noRecipient })
})

test('an address that is not one is named in the refusal, and more than fifty people in all are refused', () => {
  assert.deepEqual(emailRecipients({ to: ['a@x.com'], bcc: ['not an address'] }), { ok: false, message: '“not an address” is not an email address' })
  const many = Array.from({ length: EMAIL_MAX_RECIPIENTS }, (_, i) => `p${i}@x.com`)
  assert.equal(emailRecipients({ to: many.slice(0, 30), cc: many.slice(30) }).ok, true)
  assert.deepEqual(emailRecipients({ to: many, bcc: ['one-more@x.com'] }), { ok: false, message: COMMENT_EMAIL_REFUSALS.tooMany })
})

test('a subject is one line, trimmed, and the task’s title when none is given; an answer’s is “Re:” once before the one answered', () => {
  assert.equal(emailSubject('  Quote\r\nfor   March ', 'Task'), 'Quote for March')
  // A lone line break too: one character, which no rule about runs of spaces would catch.
  assert.equal(emailSubject('Quote\nfor March', 'Task'), 'Quote for March')
  assert.equal(emailSubject(undefined, 'Renew the lease'), 'Renew the lease')
  assert.equal(emailSubject('   ', 'Renew the lease'), 'Renew the lease')
  assert.equal(replySubject('Quote for March'), 'Re: Quote for March')
  assert.equal(replySubject('RE: Quote for March'), 'RE: Quote for March')
})
