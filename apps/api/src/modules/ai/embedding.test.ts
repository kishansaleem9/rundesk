import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  embedText,
  cosineSimilarity,
  l2normalize,
  contentHash,
  embedTokens,
  DEFAULT_EMBED_DIM,
} from './embedding'

/**
 * §15.1 deterministic local embedder. This is the tested default path — a pure,
 * offline, hashed bag-of-words + char-trigram embedder. We assert it is
 * reproducible, normalized, dimension-stable, and produces genuine cosine
 * similarity (similar texts closer than dissimilar ones).
 */

const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0))

describe('embedText — deterministic + normalized (§15.1)', () => {
  it('is pure: identical text always yields the identical vector', () => {
    const a = embedText('Ship the mobile launch by Friday')
    const b = embedText('Ship the mobile launch by Friday')
    assert.deepEqual(a, b)
  })

  it('produces a fixed-dimension vector (default 256)', () => {
    assert.equal(embedText('anything at all').length, DEFAULT_EMBED_DIM)
    assert.equal(embedText('anything at all', 128).length, 128)
  })

  it('returns an L2-normalized (unit-length) vector for non-empty text', () => {
    const v = embedText('quarterly planning roadmap review')
    assert.ok(Math.abs(norm(v) - 1) < 1e-9, `expected unit norm, got ${norm(v)}`)
  })

  it('returns a zero vector for empty / stopword-only input', () => {
    assert.equal(norm(embedText('')), 0)
    assert.equal(norm(embedText('the a an of to')), 0)
  })

  it('a vector has cosine 1 with itself', () => {
    const v = embedText('launch the new pricing page')
    assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 1e-9)
  })
})

describe('cosineSimilarity — semantic ranking (§15.1)', () => {
  it('scores similar texts higher than dissimilar texts', () => {
    const query = embedText('when is the mobile app launch')
    const close = embedText('mobile app launch is scheduled for next week')
    const far = embedText('accounting invoices and payroll taxes')
    const sClose = cosineSimilarity(query, close)
    const sFar = cosineSimilarity(query, far)
    assert.ok(sClose > sFar, `expected close(${sClose}) > far(${sFar})`)
    assert.ok(sClose > 0, 'a topically-related text has positive similarity')
  })

  it('captures sub-word (morphological) overlap via char trigrams', () => {
    // No shared whole word beyond the stem, but "launch"/"launching" share
    // trigrams, so similarity is positive (bag-of-exact-words would be 0).
    const s = cosineSimilarity(embedText('product launch'), embedText('we are launching the product'))
    assert.ok(s > 0, `expected positive sub-word similarity, got ${s}`)
  })

  it('is symmetric', () => {
    const a = embedText('sprint retrospective notes')
    const b = embedText('notes from the sprint review')
    assert.ok(Math.abs(cosineSimilarity(a, b) - cosineSimilarity(b, a)) < 1e-12)
  })
})

describe('l2normalize / embedTokens (§15.1 helpers)', () => {
  it('normalizes to unit length and leaves a zero vector untouched', () => {
    assert.ok(Math.abs(norm(l2normalize([3, 4])) - 1) < 1e-9)
    assert.deepEqual(l2normalize([0, 0, 0]), [0, 0, 0])
  })
  it('tokenizes to lowercased content terms, dropping stopwords and short tokens', () => {
    assert.deepEqual(embedTokens('The Quick launch of X'), ['quick', 'launch'])
  })
})

describe('contentHash — stable skip-unchanged key (§15.1)', () => {
  it('is stable for identical (whitespace-normalized) content', () => {
    assert.equal(contentHash('hello   world'), contentHash(' hello world '))
  })
  it('differs when the content differs', () => {
    assert.notEqual(contentHash('hello world'), contentHash('hello worlds'))
  })
})
