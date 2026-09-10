import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { COMPOSER_BLOCKS, applyBlockAtCaret, matchBlocks } from './composer-blocks.ts'

describe('applyBlockAtCaret', () => {
  it('replaces the /query the caret sits in', () => {
    // Typing "/tab" and choosing Table must not leave "/tab" above the table.
    const { text, caret } = applyBlockAtCaret('hello /tab', 10, '| a |\n')
    assert.equal(text, 'hello | a |\n')
    assert.equal(caret, 'hello | a |\n'.length)
  })

  it('keeps what comes after the caret', () => {
    const { text } = applyBlockAtCaret('a /q b', 4, 'X')
    assert.equal(text, 'a X b')
  })

  it('inserts at the caret when there is no slash', () => {
    const { text, caret } = applyBlockAtCaret('plain', 5, '## ')
    assert.equal(text, 'plain## ')
    assert.equal(caret, 8)
  })

  it('reports a caret inside the document, not at its end', () => {
    // Inserting a table and dropping the caret past the trailing text is its
    // own small betrayal.
    // 'one /t three' with the caret at 7: the slash run is indices 4..6, so
    // '/t ' is what gets replaced and 'three' survives to the right of it.
    const { caret, text } = applyBlockAtCaret('one /t three', 7, '## ')
    assert.equal(text, 'one ## three')
    assert.equal(caret, 7)
    assert.equal(text.slice(caret), 'three')
  })
})

describe('matchBlocks', () => {
  const label = (k: string) => String(k).replace('taskDetail.slash.', '')

  it('returns everything for an empty query', () => {
    assert.equal(matchBlocks(COMPOSER_BLOCKS, '', label as never).length, COMPOSER_BLOCKS.length)
  })

  it('narrows by label', () => {
    const hits = matchBlocks(COMPOSER_BLOCKS, 'quote', label as never)
    assert.deepEqual(hits.map((b) => b.id), ['quote'])
  })

  it('narrows by id too, so "h2" finds the heading', () => {
    assert.deepEqual(matchBlocks(COMPOSER_BLOCKS, 'h2', label as never).map((b) => b.id), ['h2'])
  })

  it('finds nothing for nonsense rather than everything', () => {
    assert.equal(matchBlocks(COMPOSER_BLOCKS, 'zzzz', label as never).length, 0)
  })
})

describe('the block list itself', () => {
  it('has no image block — an image needs a file, not a string', () => {
    assert.equal(COMPOSER_BLOCKS.some((b) => b.id === 'image'), false)
  })

  it('gives every block something to insert', () => {
    for (const b of COMPOSER_BLOCKS) {
      assert.equal(typeof b.md === 'string' && b.md.length > 0, true, `${b.id} inserts nothing`)
    }
  })
})
