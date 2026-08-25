import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_TIER, MODEL_TIERS, modelForTier, tierFor } from './model-tiers'

/**
 * §15 — the composer's model picker (frames `296_1817`, `301_1836`).
 *
 * A picker that silently ignores what you picked is worse than no picker, so
 * what matters here is that every offered tier resolves to a DIFFERENT real
 * model, and that the default is exactly what chat used before one existed.
 */

describe('§15 model tiers', () => {
  it('offers a real choice, not aliases of one model', () => {
    // The failure this guards: two labels, one model. It looks like a feature
    // and changes nothing, and nobody can tell from the outside.
    const models = MODEL_TIERS.map((t) => t.model)
    assert.equal(new Set(models).size, models.length, `duplicate models: ${models.join(', ')}`)
    assert.ok(MODEL_TIERS.length >= 2)
  })

  it('names every tier and says what the trade is', () => {
    for (const tier of MODEL_TIERS) {
      assert.ok(tier.label.trim(), `${tier.id} has no label`)
      assert.ok(tier.hint.trim(), `${tier.id} has no hint — the choice would be unmakeable`)
      assert.match(tier.model, /^claude-/, `${tier.id} does not name a real model`)
    }
  })

  it('resolves each tier to its own model', () => {
    assert.equal(modelForTier('fast'), 'claude-haiku-4-5')
    assert.equal(modelForTier('deep'), 'claude-sonnet-4-6')
  })

  it('defaults to what chat used before there was a picker', () => {
    // Adding the picker must not change the answer for anyone who never
    // touches it.
    assert.equal(modelForTier(undefined), 'claude-sonnet-4-6')
    assert.equal(modelForTier(null), 'claude-sonnet-4-6')
    assert.equal(modelForTier(''), 'claude-sonnet-4-6')
    assert.equal(DEFAULT_TIER, 'deep')
  })

  it('falls back rather than throwing on a bad value', () => {
    // A stale query string should not cost someone their answer.
    assert.equal(modelForTier('turbo'), 'claude-sonnet-4-6')
    assert.equal(modelForTier('../../etc/passwd'), 'claude-sonnet-4-6')
    assert.equal(tierFor('nonsense').id, DEFAULT_TIER)
  })

  it('always has a tier matching the declared default', () => {
    // Guards the guard: if DEFAULT_TIER is renamed and no tier matches, the
    // non-null assertion inside modelForTier would throw at runtime.
    assert.ok(MODEL_TIERS.some((t) => t.id === DEFAULT_TIER))
  })
})
