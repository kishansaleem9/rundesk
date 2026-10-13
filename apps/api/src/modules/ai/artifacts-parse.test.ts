import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseDeck, DECK_LIMITS } from './artifacts.service'
import { readComposerFile, readComposerFiles } from './composer-files'

/**
 * What Brain may keep as a deck, and which files it may be given
 * (`ledger-rows/row-853`): a model's deck is read as a typed one is, and a file
 * of a kind it cannot read is refused by name.
 */
const slide = (title: string, bullets: string[] = ['a point']) => ({ title, bullets })
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64')

describe('parseDeck', () => {
  it('keeps a titled deck of titled slides, empty points dropped', () => {
    const r = parseDeck({ title: ' Overview ', slides: [slide('One', ['a', '  ', 'b']), slide('Two')] })
    assert.equal(r.ok, true)
    if (r.ok) {
      assert.equal(r.deck.title, 'Overview')
      assert.deepEqual(r.deck.slides[0].bullets, ['a', 'b'])
    }
  })

  it('refuses a deck past fifteen slides, and says so', () => {
    const r = parseDeck({ title: 'Too long', slides: Array.from({ length: DECK_LIMITS.slides + 1 }, (_, i) => slide(`S${i}`)) })
    assert.deepEqual(r, { ok: false, reason: 'A slide deck has at most 15 slides' })
  })

  it('refuses a slide without a title, by its number', () => {
    assert.deepEqual(parseDeck({ title: 'Deck', slides: [slide('One'), { bullets: ['x'] }] }), { ok: false, reason: 'Slide 2 needs a title' })
  })

  it('refuses a slide of more than eight points', () => {
    const r = parseDeck({ title: 'Deck', slides: [slide('Busy', Array.from({ length: 9 }, (_, i) => `p${i}`))] })
    assert.deepEqual(r, { ok: false, reason: 'Slide 1 has more than 8 points' })
  })
})

describe('readComposerFile', () => {
  it('reads a text file as its words', () => {
    assert.deepEqual(readComposerFile({ name: 'notes.txt', data: b64('hello') }), { kind: 'text', name: 'notes.txt', text: 'hello' })
  })

  it('takes a PNG as an image, and refuses "photo.png" that is words', () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
    assert.equal(readComposerFile({ name: 'dot.png', data: png.toString('base64') }).kind, 'image')
    assert.throws(() => readComposerFile({ name: 'photo.png', data: b64('just words') }), /“photo\.png” is not an image/)
  })

  it('refuses a kind of file Brain cannot read, by its name', () => {
    assert.throws(() => readComposerFile({ name: 'tool.exe', data: b64('MZ') }), /not “tool\.exe”/)
  })

  it('takes at most five files', () => {
    assert.throws(() => readComposerFiles(Array.from({ length: 6 }, (_, i) => ({ name: `n${i}.txt`, data: b64('x') }))), /at most 5 files/)
  })
})
