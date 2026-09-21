import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BEST_MODELS_VISIBLE,
  DEFAULT_TIER,
  MODEL_TIERS,
  modelForTier,
  splitPickerModels,
  tierFor,
} from './model-tiers'
import { MODEL_PRICING } from './ai-cost'

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
    assert.equal(modelForTier('max'), 'claude-opus-5')
  })

  /*
   * §V2-S18 `[17:16]` — the popover holds THREE rows and a disclosure.
   *
   * Asserted on the catalogue, not on the render, because the component is
   * served this split rather than computing its own: a `slice(0, 3)` in the
   * browser and a `BEST_MODELS_VISIBLE` on the server are two copies of one
   * number, and the second copy is the one that drifts.
   */
  it('offers the three rows the frame draws in "Best models"', () => {
    assert.equal(BEST_MODELS_VISIBLE, 3)
    assert.equal(MODEL_TIERS.length, 3)
    const { best, more } = splitPickerModels(MODEL_TIERS)
    assert.equal(best.length, 3)
    assert.equal(more.length, 0)
    assert.deepEqual(best.map((t) => t.id), ['max', 'deep', 'fast'])
  })

  it('pushes a fourth tier behind the disclosure rather than widening the group', () => {
    // The bound has to hold for a catalogue bigger than today's, or it is not
    // a bound — it is a coincidence that three equals three.
    const { best, more } = splitPickerModels(['a', 'b', 'c', 'd', 'e'])
    assert.deepEqual(best, ['a', 'b', 'c'])
    assert.deepEqual(more, ['d', 'e'])
  })

  /*
   * EVERY TIER IS PRICED. `estimateAiCostUsd` falls back to { in: 1, out: 5 }
   * for an unknown model — the Haiku price — so an unpriced Opus tier reports
   * a fifth of what it cost, in the Time Saved / Human Cost panel, with no
   * error anywhere. A cost that is wrong and confident is worse than absent.
   */
  it('prices every routable tier, so no tier bills at the fallback rate', () => {
    for (const tier of MODEL_TIERS) {
      assert.ok(
        MODEL_PRICING[tier.model],
        `${tier.id} resolves to ${tier.model}, which has no row in MODEL_PRICING`,
      )
    }
  })

  it('draws bars that differ between tiers, or they measure nothing', () => {
    // Two bars the same length are a decoration. The comparison the picker
    // exists to support is Fast-vs-Max, so that pair must actually differ.
    const fast = MODEL_TIERS.find((t) => t.id === 'fast')!
    const max = MODEL_TIERS.find((t) => t.id === 'max')!
    assert.ok(fast.speed > max.speed, 'the fast tier is not drawn as faster')
    assert.ok(max.intelligence > fast.intelligence, 'the max tier is not drawn as smarter')
    assert.notEqual(
      new Set(MODEL_TIERS.map((t) => `${t.speed}/${t.intelligence}`)).size,
      1,
      'every tier carries the same pair of scores',
    )
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
