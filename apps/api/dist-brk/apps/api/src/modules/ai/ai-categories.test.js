"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_test_1 = require("node:test");
const ai_categories_1 = require("./ai-categories");
/**
 * §V2-11 — the eight tiles of frames `18:53`/`18:56`/`18:59`.
 *
 * THE ONE TEST THAT EARNS ITS PLACE is the first: it re-derives the feature
 * strings FROM THE SOURCE rather than from a list somebody keeps up to date by
 * hand. A feature added later and forgotten in the map breaks nothing visible —
 * its runs land nowhere and the totals still add up — so a convention would
 * never catch it. This does.
 */
/** Walk up to the workspace root: this compiles to CJS, so no `import.meta`. */
function workspaceRoot(from) {
    let dir = from;
    for (;;) {
        if ((0, node_fs_1.existsSync)((0, node_path_1.join)(dir, 'pnpm-workspace.yaml')))
            return dir;
        const up = (0, node_path_1.dirname)(dir);
        if (up === dir)
            throw new Error('workspace root not found');
        dir = up;
    }
}
const SERVICE = (0, node_path_1.join)(workspaceRoot(process.cwd()), 'apps/api/src/modules/ai/ai.service.ts');
/** Every literal handed to `complete(` or `recordUsage(` as its feature name. */
function featuresInSource() {
    const src = (0, node_fs_1.readFileSync)(SERVICE, 'utf8');
    const found = new Set();
    for (const m of src.matchAll(/this\.complete\(\s*'([^']+)'/g))
        found.add(m[1]);
    for (const m of src.matchAll(/this\.recordUsage\(\s*\n?\s*'([^']+)'/g))
        found.add(m[1]);
    return [...found].sort();
}
(0, node_test_1.describe)('§V2-11 AI action categories', () => {
    (0, node_test_1.it)('maps every feature the service actually records', () => {
        const inSource = featuresInSource();
        // Sanity: if the regex stops matching, an empty list would make every
        // assertion below vacuous — the classic check that cannot fail.
        strict_1.default.ok(inSource.length >= 20, `only found ${inSource.length} feature strings — the scan broke`);
        const missing = inSource.filter((f) => !(f in ai_categories_1.FEATURE_CATEGORY));
        strict_1.default.deepEqual(missing, [], `features with no category: ${missing.join(', ')}`);
    });
    (0, node_test_1.it)('has no mapping for a feature that no longer exists', () => {
        // The mirror of the above. A stale entry is harmless but it is also a lie
        // about what the product does, and it makes the map harder to trust.
        const inSource = new Set(featuresInSource());
        // `chat` is written by the streaming path's `recordUsage('chat', model, …)`,
        // which the scan does pick up; anything else unaccounted for is stale.
        const stale = Object.keys(ai_categories_1.FEATURE_CATEGORY).filter((f) => !inSource.has(f));
        strict_1.default.deepEqual(stale, [], `mapped features that nothing records: ${stale.join(', ')}`);
    });
    (0, node_test_1.it)('assigns each feature exactly one category, and every category is real', () => {
        for (const [feature, category] of Object.entries(ai_categories_1.FEATURE_CATEGORY)) {
            strict_1.default.ok(ai_categories_1.AI_CATEGORIES.includes(category), `${feature} is filed under "${category}", which is not one of the eight`);
        }
    });
    (0, node_test_1.it)('names the three the product cannot fill, and only those', () => {
        // If somebody wires up image generation and forgets to drop it from here,
        // a real count would be hidden behind "not available" — the same defect in
        // the other direction.
        strict_1.default.deepEqual(Object.keys(ai_categories_1.UNSUPPORTED_CATEGORIES).sort(), ['externalActions', 'externalSearches', 'images']);
        for (const category of Object.keys(ai_categories_1.UNSUPPORTED_CATEGORIES)) {
            const contributors = Object.entries(ai_categories_1.FEATURE_CATEGORY).filter(([, c]) => c === category);
            strict_1.default.deepEqual(contributors, [], `${category} is marked unsupported but ${contributors.length} features feed it`);
        }
        // And every SUPPORTED category has at least one feature, or it is a tile
        // that can only ever say zero without admitting it.
        for (const category of ai_categories_1.AI_CATEGORIES.filter(ai_categories_1.isSupportedCategory)) {
            strict_1.default.ok(Object.values(ai_categories_1.FEATURE_CATEGORY).includes(category), `${category} is offered as supported but nothing can contribute to it`);
        }
    });
    (0, node_test_1.it)('returns all eight tiles whatever the data says', () => {
        const empty = (0, ai_categories_1.rollUpByCategory)({});
        strict_1.default.equal(empty.categories.length, 8);
        strict_1.default.deepEqual(empty.categories.map((c) => c.category), [...ai_categories_1.AI_CATEGORIES]);
        strict_1.default.deepEqual(empty.unmapped, []);
        // Frame order, not insertion order: a grid that reorders itself with the
        // data cannot be measured.
        strict_1.default.equal(empty.categories[0].category, 'tasks');
        strict_1.default.equal(empty.categories[7].category, 'externalSearches');
    });
    (0, node_test_1.it)('adds a feature’s runs to its bucket and nowhere else', () => {
        const { categories } = (0, ai_categories_1.rollUpByCategory)({
            'task.generate': { calls: 3, costUsd: 0.3 },
            'command': { calls: 2, costUsd: 0.2 },
            'chat.title': { calls: 5, costUsd: 0.05 },
        });
        const by = Object.fromEntries(categories.map((c) => [c.category, c]));
        strict_1.default.equal(by.tasks.runs, 5, 'two task features should total five runs');
        strict_1.default.equal(by.comments.runs, 5);
        strict_1.default.equal(by.summaries.runs, 0);
        strict_1.default.equal(Math.round(by.tasks.costUsd * 100) / 100, 0.5);
        strict_1.default.deepEqual(by.tasks.features, ['command', 'task.generate']);
    });
    (0, node_test_1.it)('reports an unmapped feature instead of hiding it in a bucket', () => {
        const { categories, unmapped } = (0, ai_categories_1.rollUpByCategory)({
            'something.new': { calls: 4, costUsd: 1 },
        });
        strict_1.default.deepEqual(unmapped, ['something.new']);
        strict_1.default.equal(categories.reduce((n, c) => n + c.runs, 0), 0, 'an unmapped feature was folded into a category, which hides the gap');
    });
    (0, node_test_1.it)('carries a reason on the three it cannot fill', () => {
        const { categories } = (0, ai_categories_1.rollUpByCategory)({});
        for (const c of categories) {
            if (c.supported)
                strict_1.default.equal(c.reasonKey, undefined);
            else
                strict_1.default.ok(c.reasonKey, `${c.category} is unsupported with no reason to show`);
        }
    });
    (0, node_test_1.it)('does not invent a category for an unknown string', () => {
        strict_1.default.equal((0, ai_categories_1.categoryOf)('nope'), null);
        strict_1.default.equal((0, ai_categories_1.categoryOf)(''), null);
        // `toString` and friends are on Object.prototype; a bare lookup would
        // return a function here and `categoryOf` would answer with garbage.
        strict_1.default.equal((0, ai_categories_1.categoryOf)('toString'), null);
    });
});
//# sourceMappingURL=ai-categories.test.js.map