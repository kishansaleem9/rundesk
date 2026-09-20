"use strict";
/**
 * Billing configuration + Stripe⇄plan-tier mapping (Plan §14.1).
 *
 * Pure data + helpers (no Nest, no Stripe SDK, no DB) so the env-gating and the
 * price⇄tier translation can be unit-tested in isolation and reused by both the
 * service and the provider factory.
 *
 * ENV CONTRACT
 *   STRIPE_SECRET_KEY       — server-side Stripe API key. Its presence enables
 *                             the Stripe client (checkout / portal / retrieve).
 *   STRIPE_WEBHOOK_SECRET   — signing secret for POST /billing/webhook.
 *   STRIPE_PRICE_PRO        — recurring price id for the Pro tier.
 *   STRIPE_PRICE_BUSINESS   — recurring price id for the Business tier.
 *   STRIPE_PRICE_ENTERPRISE — recurring price id for the Enterprise tier.
 *
 * "Configured" (isConfigured) = SECRET_KEY *and* WEBHOOK_SECRET present. The
 * per-tier price ids are validated at checkout time so a partially-configured
 * deployment still gives a precise error instead of a generic one.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PURCHASABLE_TIERS = void 0;
exports.isPurchasableTier = isPurchasableTier;
exports.readBillingConfig = readBillingConfig;
exports.isBillingConfigured = isBillingConfigured;
exports.priceIdForTier = priceIdForTier;
exports.tierFromPriceId = tierFromPriceId;
/** The tiers a customer can actually purchase (free is the downgrade target). */
exports.PURCHASABLE_TIERS = ['pro', 'business', 'enterprise'];
function isPurchasableTier(value) {
    return typeof value === 'string' && exports.PURCHASABLE_TIERS.includes(value);
}
const PRICE_ENV_BY_TIER = {
    pro: 'STRIPE_PRICE_PRO',
    business: 'STRIPE_PRICE_BUSINESS',
    enterprise: 'STRIPE_PRICE_ENTERPRISE',
};
/** Normalize an env value: trim, treat empty string as absent. */
function readVar(read, key) {
    const raw = read(key);
    if (typeof raw !== 'string')
        return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function readBillingConfig(read) {
    return {
        secretKey: readVar(read, 'STRIPE_SECRET_KEY'),
        webhookSecret: readVar(read, 'STRIPE_WEBHOOK_SECRET'),
        prices: {
            pro: readVar(read, PRICE_ENV_BY_TIER.pro),
            business: readVar(read, PRICE_ENV_BY_TIER.business),
            enterprise: readVar(read, PRICE_ENV_BY_TIER.enterprise),
        },
    };
}
/** Billing is "configured" when both the API key and the webhook secret exist. */
function isBillingConfigured(config) {
    return Boolean(config.secretKey) && Boolean(config.webhookSecret);
}
/** The Stripe price id for a tier, or null if that tier's price env is unset. */
function priceIdForTier(config, tier) {
    return config.prices[tier] ?? null;
}
/**
 * Reverse-map a Stripe price id to a plan tier. Returns the tier whose configured
 * price id matches, or null when the price is unknown (e.g. a legacy price or a
 * misconfiguration) so the caller can decide the safe fallback.
 */
function tierFromPriceId(config, priceId) {
    if (!priceId)
        return null;
    for (const tier of exports.PURCHASABLE_TIERS) {
        if (config.prices[tier] === priceId)
            return tier;
    }
    return null;
}
//# sourceMappingURL=billing.constants.js.map