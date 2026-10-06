import assert from 'node:assert/strict'
import { test } from 'node:test'
import { splitAddresses } from './link-addresses'

/*
 * THE ADDRESSES IN A ONE-LINE COMMENT (`found-5-oct/comment-links-not-links`):
 * http and https only, without the punctuation that ends the sentence, and
 * every other character as it was typed. `comment-slash-commands.mjs` reads
 * the links on a lane.
 */
test('an address is split out of the text around it, and the text is kept as typed', () => {
  assert.deepEqual(splitAddresses('see https://example.com/spec for it'), [
    { text: 'see ' },
    { href: 'https://example.com/spec' },
    { text: ' for it' },
  ])
  const typed = 'see https://example.com/a. And (http://example.com/b) too, https://x.io/c?d=1&e=2!'
  assert.equal(
    splitAddresses(typed).map((p) => ('href' in p ? p.href : p.text)).join(''),
    typed,
  )
})

test('a full stop, comma or bracket after an address is the sentence’s, and a bracket it opened is its own', () => {
  const hrefs = (s: string) => splitAddresses(s).flatMap((p) => ('href' in p ? [p.href] : []))
  assert.deepEqual(hrefs('see https://example.com/a. Then'), ['https://example.com/a'])
  assert.deepEqual(hrefs('(see https://example.com/b)'), ['https://example.com/b'])
  assert.deepEqual(hrefs('one https://example.com/c, two https://example.com/d;'), ['https://example.com/c', 'https://example.com/d'])
  assert.deepEqual(hrefs('https://en.wikipedia.org/wiki/Set_(mathematics)'), ['https://en.wikipedia.org/wiki/Set_(mathematics)'])
})

test('only http and https are addresses: javascript:, data: and ftp: stay text', () => {
  for (const s of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com/f', 'http://', 'see https:// nothing']) {
    assert.deepEqual(splitAddresses(s), [{ text: s }], s)
  }
})
