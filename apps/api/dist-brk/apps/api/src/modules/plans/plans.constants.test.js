"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const plans_constants_1 = require("./plans.constants");
// §14.1 — the load-bearing invariant: enterprise is "everything, unlimited". The
// internal tool defaults to enterprise, so gating must never restrict it.
(0, node_test_1.describe)('PLAN_TIERS enterprise = everything unlimited (no-regression invariant)', () => {
    (0, node_test_1.it)('enterprise enables every feature', () => {
        for (const feature of plans_constants_1.PLAN_FEATURES) {
            strict_1.default.equal(plans_constants_1.PLAN_TIERS.enterprise.features[feature], true, `enterprise must enable ${feature}`);
        }
    });
    (0, node_test_1.it)('enterprise limits are unlimited (null)', () => {
        strict_1.default.equal(plans_constants_1.PLAN_TIERS.enterprise.limits.maxMembers, null);
        strict_1.default.equal(plans_constants_1.PLAN_TIERS.enterprise.limits.maxProjects, null);
    });
});
(0, node_test_1.describe)('free plan gates features + caps usage', () => {
    (0, node_test_1.it)('free disables AI and every other paid feature', () => {
        strict_1.default.equal(plans_constants_1.PLAN_TIERS.free.features.ai, false);
        for (const feature of plans_constants_1.PLAN_FEATURES) {
            strict_1.default.equal(plans_constants_1.PLAN_TIERS.free.features[feature], false, `free must disable ${feature}`);
        }
    });
    (0, node_test_1.it)('free caps members at 5 and projects at 3', () => {
        strict_1.default.equal(plans_constants_1.PLAN_TIERS.free.limits.maxMembers, 5);
        strict_1.default.equal(plans_constants_1.PLAN_TIERS.free.limits.maxProjects, 3);
    });
    (0, node_test_1.it)('pro/business enable AI; ladder widens limits', () => {
        strict_1.default.equal(plans_constants_1.PLAN_TIERS.pro.features.ai, true);
        strict_1.default.equal(plans_constants_1.PLAN_TIERS.business.features.ai, true);
        strict_1.default.ok((plans_constants_1.PLAN_TIERS.pro.limits.maxMembers ?? 0) > (plans_constants_1.PLAN_TIERS.free.limits.maxMembers ?? 0));
        strict_1.default.ok((plans_constants_1.PLAN_TIERS.business.limits.maxProjects ?? 0) > (plans_constants_1.PLAN_TIERS.pro.limits.maxProjects ?? 0));
    });
});
(0, node_test_1.describe)('resolvePlanConfig', () => {
    (0, node_test_1.it)('unknown/garbage plan resolves to enterprise (fail-open — never restricts)', () => {
        const resolved = (0, plans_constants_1.resolvePlanConfig)('legacy-nonsense');
        strict_1.default.equal(resolved.id, 'enterprise');
        strict_1.default.equal(resolved.features.ai, true);
        strict_1.default.equal(resolved.limits.maxMembers, null);
    });
    (0, node_test_1.it)('null/undefined plan resolves to enterprise', () => {
        strict_1.default.equal((0, plans_constants_1.resolvePlanConfig)(null).id, 'enterprise');
        strict_1.default.equal((0, plans_constants_1.resolvePlanConfig)(undefined).id, 'enterprise');
    });
    (0, node_test_1.it)('override widens a free plan’s numeric limits without changing its id', () => {
        const resolved = (0, plans_constants_1.resolvePlanConfig)('free', { maxMembers: 50, maxProjects: null });
        strict_1.default.equal(resolved.id, 'free');
        strict_1.default.equal(resolved.limits.maxMembers, 50);
        strict_1.default.equal(resolved.limits.maxProjects, null); // explicit unlimited override
    });
    (0, node_test_1.it)('override can toggle an individual feature flag', () => {
        const resolved = (0, plans_constants_1.resolvePlanConfig)('free', { features: { ai: true } });
        strict_1.default.equal(resolved.features.ai, true);
        strict_1.default.equal(resolved.features.webhooks, false); // untouched flags keep tier default
    });
});
(0, node_test_1.describe)('free trial (§14.1) — trialDays per tier', () => {
    (0, node_test_1.it)('pro and business offer a 14-day trial; free and enterprise offer none', () => {
        strict_1.default.equal(plans_constants_1.PLAN_TIERS.free.trialDays, 0);
        strict_1.default.equal(plans_constants_1.PLAN_TIERS.pro.trialDays, 14);
        strict_1.default.equal(plans_constants_1.PLAN_TIERS.business.trialDays, 14);
        strict_1.default.equal(plans_constants_1.PLAN_TIERS.enterprise.trialDays, 0);
    });
    (0, node_test_1.it)('trialDaysForPlan resolves per tier and fails safe (0) for unknown ids', () => {
        strict_1.default.equal((0, plans_constants_1.trialDaysForPlan)('pro'), 14);
        strict_1.default.equal((0, plans_constants_1.trialDaysForPlan)('business'), 14);
        strict_1.default.equal((0, plans_constants_1.trialDaysForPlan)('free'), 0);
        strict_1.default.equal((0, plans_constants_1.trialDaysForPlan)('enterprise'), 0);
        // Unknown/garbage → enterprise default (0), never an accidental trial.
        strict_1.default.equal((0, plans_constants_1.trialDaysForPlan)('platinum'), 0);
        strict_1.default.equal((0, plans_constants_1.trialDaysForPlan)(null), 0);
    });
    (0, node_test_1.it)('resolvePlanConfig surfaces trialDays', () => {
        strict_1.default.equal((0, plans_constants_1.resolvePlanConfig)('pro').trialDays, 14);
        strict_1.default.equal((0, plans_constants_1.resolvePlanConfig)('free').trialDays, 0);
    });
});
(0, node_test_1.describe)('helpers', () => {
    (0, node_test_1.it)('isPlanId accepts known ids and rejects others', () => {
        strict_1.default.equal((0, plans_constants_1.isPlanId)('free'), true);
        strict_1.default.equal((0, plans_constants_1.isPlanId)('enterprise'), true);
        strict_1.default.equal((0, plans_constants_1.isPlanId)('platinum'), false);
        strict_1.default.equal((0, plans_constants_1.isPlanId)(42), false);
    });
    (0, node_test_1.it)('planCatalog returns all four tiers in ladder order', () => {
        const catalog = (0, plans_constants_1.planCatalog)();
        strict_1.default.deepEqual(catalog.map((p) => p.id), ['free', 'pro', 'business', 'enterprise']);
    });
});
//# sourceMappingURL=plans.constants.test.js.map