"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const model_tiers_1 = require("./model-tiers");
/**
 * §15 — the composer's model picker (frames `296_1817`, `301_1836`).
 *
 * A picker that silently ignores what you picked is worse than no picker, so
 * what matters here is that every offered tier resolves to a DIFFERENT real
 * model, and that the default is exactly what chat used before one existed.
 */
(0, node_test_1.describe)('§15 model tiers', () => {
    (0, node_test_1.it)('offers a real choice, not aliases of one model', () => {
        // The failure this guards: two labels, one model. It looks like a feature
        // and changes nothing, and nobody can tell from the outside.
        const models = model_tiers_1.MODEL_TIERS.map((t) => t.model);
        strict_1.default.equal(new Set(models).size, models.length, `duplicate models: ${models.join(', ')}`);
        strict_1.default.ok(model_tiers_1.MODEL_TIERS.length >= 2);
    });
    (0, node_test_1.it)('names every tier and says what the trade is', () => {
        for (const tier of model_tiers_1.MODEL_TIERS) {
            strict_1.default.ok(tier.label.trim(), `${tier.id} has no label`);
            strict_1.default.ok(tier.hint.trim(), `${tier.id} has no hint — the choice would be unmakeable`);
            strict_1.default.match(tier.model, /^claude-/, `${tier.id} does not name a real model`);
        }
    });
    (0, node_test_1.it)('resolves each tier to its own model', () => {
        strict_1.default.equal((0, model_tiers_1.modelForTier)('fast'), 'claude-haiku-4-5');
        strict_1.default.equal((0, model_tiers_1.modelForTier)('deep'), 'claude-sonnet-4-6');
    });
    (0, node_test_1.it)('defaults to what chat used before there was a picker', () => {
        // Adding the picker must not change the answer for anyone who never
        // touches it.
        strict_1.default.equal((0, model_tiers_1.modelForTier)(undefined), 'claude-sonnet-4-6');
        strict_1.default.equal((0, model_tiers_1.modelForTier)(null), 'claude-sonnet-4-6');
        strict_1.default.equal((0, model_tiers_1.modelForTier)(''), 'claude-sonnet-4-6');
        strict_1.default.equal(model_tiers_1.DEFAULT_TIER, 'deep');
    });
    (0, node_test_1.it)('falls back rather than throwing on a bad value', () => {
        // A stale query string should not cost someone their answer.
        strict_1.default.equal((0, model_tiers_1.modelForTier)('turbo'), 'claude-sonnet-4-6');
        strict_1.default.equal((0, model_tiers_1.modelForTier)('../../etc/passwd'), 'claude-sonnet-4-6');
        strict_1.default.equal((0, model_tiers_1.tierFor)('nonsense').id, model_tiers_1.DEFAULT_TIER);
    });
    (0, node_test_1.it)('always has a tier matching the declared default', () => {
        // Guards the guard: if DEFAULT_TIER is renamed and no tier matches, the
        // non-null assertion inside modelForTier would throw at runtime.
        strict_1.default.ok(model_tiers_1.MODEL_TIERS.some((t) => t.id === model_tiers_1.DEFAULT_TIER));
    });
});
//# sourceMappingURL=model-tiers.test.js.map