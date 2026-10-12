import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addressIn, addressesIn, buildMime, fromBase64Url, gmailText, toBase64Url, withoutQuote } from './mail-message'
import { EMAIL_PLANS } from './email-plan'
import { scheduleTime } from '../tasks/comment-email'

/**
 * A task's email from a mailbox its writer linked (`found-9-oct/task-email-sends-from-the-server`):
 * the message Gmail is given, and the words read back out of an answer.
 */

const part = (raw: string, header: string) => new RegExp(`^${header}: (.*)$`, 'mi').exec(raw)?.[1] ?? null
const words = (raw: string) => Buffer.from(raw.split(/\r\n\r\n/).slice(1).join('\r\n\r\n').replace(/\s+/g, ''), 'base64').toString('utf8')

test('the message names its writer, its people, its subject and the email it answers, and carries the words', () => {
  const raw = buildMime({
    fromName: 'Olga Ann',
    fromAddress: 'olga@gmail.test',
    to: ['a@x.test', 'b@x.test'],
    cc: ['c@x.test'],
    bcc: ['d@x.test'],
    subject: 'Quarterly plan',
    text: 'The plan is attached.\nThanks',
    inReplyTo: '<m1@x.test>',
    attachments: [],
  })
  assert.equal(part(raw, 'From'), '"Olga Ann" <olga@gmail.test>')
  assert.equal(part(raw, 'To'), 'a@x.test, b@x.test')
  assert.equal(part(raw, 'Cc'), 'c@x.test')
  // Gmail sends to Bcc and strips it: it must be given.
  assert.equal(part(raw, 'Bcc'), 'd@x.test')
  assert.equal(part(raw, 'Subject'), 'Quarterly plan')
  assert.equal(part(raw, 'In-Reply-To'), '<m1@x.test>')
  assert.equal(part(raw, 'References'), '<m1@x.test>')
  assert.equal(words(raw), 'The plan is attached.\nThanks')
})

test('a subject, a name or a file name not in plain ASCII is encoded, and no header can be split', () => {
  const raw = buildMime({ fromName: 'Zoë', fromAddress: 'z@x.test', to: ['a@x.test'], cc: [], bcc: [], subject: 'Café\r\nBcc: evil@x.test', text: 'x', attachments: [{ filename: 'résumé.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF') }] })
  assert.match(part(raw, 'From') ?? '', /^=\?UTF-8\?B\?[^?]+\?= <z@x\.test>$/)
  assert.equal(Buffer.from(/=\?UTF-8\?B\?([^?]+)\?=/.exec(part(raw, 'Subject') ?? '')?.[1] ?? '', 'base64').toString('utf8'), 'Café Bcc: evil@x.test')
  assert.equal(/^Bcc:/m.test(raw), false)
  assert.match(raw, /Content-Disposition: attachment; filename\*=UTF-8''r%C3%A9sum%C3%A9\.pdf/)
  const file = /filename\*=[^\r\n]+\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/.exec(raw)?.[1] ?? ''
  assert.equal(Buffer.from(file.replace(/\s+/g, ''), 'base64').toString('utf8'), '%PDF')
})

test('an answer is read for its words — the plain part, else the HTML as text — and its sender', () => {
  const plain = { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/plain', body: { data: toBase64Url('Yes, Tuesday works.') } }, { mimeType: 'text/html', body: { data: toBase64Url('<p>Yes</p>') } }] }
  assert.equal(gmailText(plain), 'Yes, Tuesday works.')
  const html = { mimeType: 'text/html', body: { data: toBase64Url('<p>Yes &amp; no</p><br>Bye') } }
  assert.equal(gmailText(html), 'Yes & no\n\nBye')
  assert.equal(fromBase64Url(toBase64Url('ü')), 'ü')
  assert.equal(addressIn('"Bea Smith" <Bea@Client.TEST>'), 'bea@client.test')
  assert.deepEqual(addressesIn('"Smith, Bea" <bea@client.test>, max@x.test'), ['bea@client.test', 'max@x.test'])
})

test('an answer lands without the quote of what it answers', () => {
  assert.equal(withoutQuote('Sounds good.\n\nOn Mon, 12 Oct 2026, Olga wrote:\n> The plan'), 'Sounds good.')
  assert.equal(withoutQuote('Sounds good.\n> quoted\n>'), 'Sounds good.')
  assert.equal(withoutQuote('No quote here'), 'No quote here')
})

test('a send time is a moment from a minute to a year ahead', () => {
  const now = Date.parse('2026-10-12T12:00:00Z')
  assert.equal(scheduleTime('2026-10-12T13:00:00Z', now)?.toISOString(), '2026-10-12T13:00:00.000Z')
  for (const bad of ['2026-10-12T12:00:30Z', '2026-10-12T11:00:00Z', '2028-01-01T00:00:00Z', 'tomorrow', '', null, 5]) assert.equal(scheduleTime(bad, now), null, String(bad))
})

test('the plans give what ClickUp gives: Free one mailbox of 100 uses, Pro scheduling, Business two with signatures and templates', () => {
  assert.deepEqual(EMAIL_PLANS.free, { accounts: 1, uses: 100, scheduling: false, signaturesAndTemplates: false })
  assert.deepEqual(EMAIL_PLANS.pro, { accounts: 1, uses: null, scheduling: true, signaturesAndTemplates: false })
  assert.deepEqual(EMAIL_PLANS.business, { accounts: 2, uses: null, scheduling: true, signaturesAndTemplates: true })
  assert.equal(EMAIL_PLANS.enterprise.accounts, null)
})
