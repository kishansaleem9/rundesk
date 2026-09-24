import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { docsOutOfReach } from './doc-access'

// A private space the reader is outside of, and one they are in.
const REFUSED = 'space-refused'
const doc = (id: string, spaceId: string | null, parentDocId: string | null = null) => ({ id, spaceId, parentDocId })

describe('docsOutOfReach — where a doc lives decides who reads it', () => {
  it('hides a doc filed in a refused space, and keeps one filed elsewhere or nowhere', () => {
    const rows = [doc('private', REFUSED), doc('open', 'space-open'), doc('loose', null)]
    assert.deepEqual(docsOutOfReach(rows, new Set([REFUSED]), new Set()), ['private'])
  })

  it('hides a page with no space of its own when the doc above it is in a refused space, however deep', () => {
    const rows = [doc('root', REFUSED), doc('page', null, 'root'), doc('subpage', null, 'page'), doc('open', null)]
    assert.deepEqual(docsOutOfReach(rows, new Set([REFUSED]), new Set()).sort(), ['page', 'root', 'subpage'])
  })

  it('opens a shared doc and every page under it, and nothing above it', () => {
    const rows = [doc('root', REFUSED), doc('shared', null, 'root'), doc('page', null, 'shared'), doc('sibling', null, 'root')]
    assert.deepEqual(docsOutOfReach(rows, new Set([REFUSED]), new Set(['shared'])).sort(), ['root', 'sibling'])
  })

  it('hides a page filed in a refused space even under an open doc', () => {
    const rows = [doc('open', 'space-open'), doc('filed-away', REFUSED, 'open')]
    assert.deepEqual(docsOutOfReach(rows, new Set([REFUSED]), new Set()), ['filed-away'])
  })

  it('ends at a parent loop in the data instead of hanging, and still decides every doc on it', () => {
    const rows = [doc('a', REFUSED, 'b'), doc('b', null, 'a'), doc('c', null, 'b')]
    assert.deepEqual(docsOutOfReach(rows, new Set([REFUSED]), new Set()).sort(), ['a', 'b', 'c'])
  })

  it('treats a parent that is not among the rows (another workspace, or gone) as the top', () => {
    const rows = [doc('orphan', null, 'elsewhere'), doc('filed', REFUSED, 'elsewhere')]
    assert.deepEqual(docsOutOfReach(rows, new Set([REFUSED]), new Set()), ['filed'])
  })
})
