"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const billing_constants_1 = require("./billing.constants");
const fullEnv = {
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: 'whsec_123',
    STRIPE_PRICE_PRO: 'price_pro',
    STRIPE_PRICE_BUSINESS: 'price_biz',
    STRIPE_PRICE_ENTERPRISE: 'price_ent',
};
const read = (env) => (k) => env[k];
(0, node_test_1.describe)('billing.constants — readBillingConfig / isBillingConfigured', () => {
    (0, node_test_1.it)('reads all keys and reports configured when secret + webhook present', () => {
        const cfg = (0, billing_constants_1.readBillingConfig)(read(fullEnv));
        strict_1.default.equal(cfg.secretKey, 'sk_test_123');
        strict_1.default.equal(cfg.webhookSecret, 'whsec_123');
        strict_1.default.deepEqual(cfg.prices, { pro: 'price_pro', business: 'price_biz', enterprise: 'price_ent' });
        strict_1.default.equal((0, billing_constants_1.isBillingConfigured)(cfg), true);
    });
    (0, node_test_1.it)('is NOT configured when the webhook secret is missing', () => {
        const cfg = (0, billing_constants_1.readBillingConfig)(read({ STRIPE_SECRET_KEY: 'sk_x' }));
        strict_1.default.equal((0, billing_constants_1.isBillingConfigured)(cfg), false);
    });
    (0, node_test_1.it)('is NOT configured on a completely empty env', () => {
        strict_1.default.equal((0, billing_constants_1.isBillingConfigured)((0, billing_constants_1.readBillingConfig)(read({}))), false);
    });
    (0, node_test_1.it)('treats blank/whitespace env values as absent', () => {
        const cfg = (0, billing_constants_1.readBillingConfig)(read({ STRIPE_SECRET_KEY: '   ', STRIPE_WEBHOOK_SECRET: '' }));
        strict_1.default.equal(cfg.secretKey, null);
        strict_1.default.equal(cfg.webhookSecret, null);
        strict_1.default.equal((0, billing_constants_1.isBillingConfigured)(cfg), false);
    });
});
(0, node_test_1.describe)('billing.constants — tier ⇄ price mapping', () => {
    const cfg = (0, billing_constants_1.readBillingConfig)(read(fullEnv));
    (0, node_test_1.it)('isPurchasableTier accepts pro/business/enterprise only', () => {
        strict_1.default.deepEqual([...billing_constants_1.PURCHASABLE_TIERS], ['pro', 'business', 'enterprise']);
        for (const t of billing_constants_1.PURCHASABLE_TIERS)
            strict_1.default.equal((0, billing_constants_1.isPurchasableTier)(t), true);
        strict_1.default.equal((0, billing_constants_1.isPurchasableTier)('free'), false);
        strict_1.default.equal((0, billing_constants_1.isPurchasableTier)('platinum'), false);
        strict_1.default.equal((0, billing_constants_1.isPurchasableTier)(undefined), false);
    });
    (0, node_test_1.it)('priceIdForTier returns the configured price', () => {
        strict_1.default.equal((0, billing_constants_1.priceIdForTier)(cfg, 'pro'), 'price_pro');
        strict_1.default.equal((0, billing_constants_1.priceIdForTier)(cfg, 'business'), 'price_biz');
        strict_1.default.equal((0, billing_constants_1.priceIdForTier)(cfg, 'enterprise'), 'price_ent');
    });
    (0, node_test_1.it)('priceIdForTier is null when that tier price is unset', () => {
        const partial = (0, billing_constants_1.readBillingConfig)(read({ ...fullEnv, STRIPE_PRICE_ENTERPRISE: '' }));
        strict_1.default.equal((0, billing_constants_1.priceIdForTier)(partial, 'enterprise'), null);
    });
    (0, node_test_1.it)('tierFromPriceId reverse-maps a known price and returns null for unknown', () => {
        strict_1.default.equal((0, billing_constants_1.tierFromPriceId)(cfg, 'price_pro'), 'pro');
        strict_1.default.equal((0, billing_constants_1.tierFromPriceId)(cfg, 'price_biz'), 'business');
        strict_1.default.equal((0, billing_constants_1.tierFromPriceId)(cfg, 'price_ent'), 'enterprise');
        strict_1.default.equal((0, billing_constants_1.tierFromPriceId)(cfg, 'price_unknown'), null);
        strict_1.default.equal((0, billing_constants_1.tierFromPriceId)(cfg, null), null);
    });
});
//# sourceMappingURL=billing.constants.test.js.map