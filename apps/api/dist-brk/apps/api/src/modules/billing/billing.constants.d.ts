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
import type { PlanId } from '../plans/plans.constants';
/** The tiers a customer can actually purchase (free is the downgrade target). */
export declare const PURCHASABLE_TIERS: readonly ["pro", "business", "enterprise"];
export type PurchasableTier = (typeof PURCHASABLE_TIERS)[number];
export declare function isPurchasableTier(value: unknown): value is PurchasableTier;
/** Env accessor shape shared by ConfigService (`get`) and a plain map. */
export type EnvReader = (key: string) => string | undefined;
export type BillingConfig = {
    secretKey: string | null;
    webhookSecret: string | null;
    prices: Record<PurchasableTier, string | null>;
};
export declare function readBillingConfig(read: EnvReader): BillingConfig;
/** Billing is "configured" when both the API key and the webhook secret exist. */
export declare function isBillingConfigured(config: BillingConfig): boolean;
/** The Stripe price id for a tier, or null if that tier's price env is unset. */
export declare function priceIdForTier(config: BillingConfig, tier: PurchasableTier): string | null;
/**
 * Reverse-map a Stripe price id to a plan tier. Returns the tier whose configured
 * price id matches, or null when the price is unknown (e.g. a legacy price or a
 * misconfiguration) so the caller can decide the safe fallback.
 */
export declare function tierFromPriceId(config: BillingConfig, priceId: string | null | undefined): PlanId | null;
