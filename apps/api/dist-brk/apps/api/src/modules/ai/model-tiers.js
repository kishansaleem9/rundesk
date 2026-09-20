"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TIER = exports.UNROUTABLE_PROVIDERS = exports.MODEL_TIERS = void 0;
exports.modelForTier = modelForTier;
exports.tierFor = tierFor;
exports.isSelectableTier = isSelectableTier;
exports.MODEL_TIERS = [
    {
        id: 'deep',
        model: 'claude-sonnet-4-6',
        label: 'Deep',
        hint: 'Slower, better at reasoning through your workspace',
        provider: 'anthropic',
        group: 'best',
        speed: 3,
        intelligence: 5,
    },
    {
        id: 'fast',
        model: 'claude-haiku-4-5',
        label: 'Fast',
        hint: 'Quick answers, short questions',
        provider: 'anthropic',
        group: 'best',
        speed: 5,
        intelligence: 3,
    },
];
/**
 * The two the frame names that this product has no client for.
 *
 * Listed rather than omitted on purpose. Omitting them answers "can I use
 * ChatGPT here" with silence, and silence is read as "not yet, probably soon".
 * Naming them with the reason answers it.
 */
exports.UNROUTABLE_PROVIDERS = [
    {
        id: 'openai',
        label: 'ChatGPT',
        provider: 'openai',
        reasonKey: 'aiModels.reasonNoOpenAiClient',
    },
    {
        id: 'google',
        label: 'Gemini',
        provider: 'google',
        reasonKey: 'aiModels.reasonNoGoogleClient',
    },
];
/** What chat used before a picker existed, so the default changes nothing. */
exports.DEFAULT_TIER = 'deep';
/**
 * Resolve a requested tier to a model.
 *
 * Anything unrecognised falls back to the default rather than throwing: a bad
 * value in a query string should not cost someone their answer, and the caller
 * has no better option to offer them than the one they would have got anyway.
 *
 * This is also the choke point that keeps the unroutable list honest. Ask it
 * for `openai` and it returns Claude — because that IS what would happen — so
 * any attempt to make those rows selectable shows up as the wrong model in
 * `ai_usage.model`, where the activity log will print it.
 */
function modelForTier(tier) {
    const found = exports.MODEL_TIERS.find((t) => t.id === tier);
    return (found ?? exports.MODEL_TIERS.find((t) => t.id === exports.DEFAULT_TIER)).model;
}
function tierFor(tier) {
    return exports.MODEL_TIERS.find((t) => t.id === tier) ?? exports.MODEL_TIERS.find((t) => t.id === exports.DEFAULT_TIER);
}
/**
 * Is this a tier somebody may store as their preference?
 *
 * The preference write refuses anything else instead of coercing it. Coercion
 * is how "I set Gemini and it saved" becomes true on a product that cannot run
 * Gemini — the row would round-trip through Postgres and mean nothing.
 */
function isSelectableTier(tier) {
    return typeof tier === 'string' && exports.MODEL_TIERS.some((t) => t.id === tier);
}
//# sourceMappingURL=model-tiers.js.map