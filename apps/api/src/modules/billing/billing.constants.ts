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

import type { PlanId } from '../plans/plans.constants'

/** The tiers a customer can actually purchase (free is the downgrade target). */
export const PURCHASABLE_TIERS = ['pro', 'business', 'enterprise'] as const
export type PurchasableTier = (typeof PURCHASABLE_TIERS)[number]

export function isPurchasableTier(value: unknown): value is PurchasableTier {
  return typeof value === 'string' && (PURCHASABLE_TIERS as readonly string[]).includes(value)
}

/** Env accessor shape shared by ConfigService (`get`) and a plain map. */
export type EnvReader = (key: string) => string | undefined

export type BillingConfig = {
  secretKey: string | null
  webhookSecret: string | null
  prices: Record<PurchasableTier, string | null>
}

const PRICE_ENV_BY_TIER: Record<PurchasableTier, string> = {
  pro: 'STRIPE_PRICE_PRO',
  business: 'STRIPE_PRICE_BUSINESS',
  enterprise: 'STRIPE_PRICE_ENTERPRISE',
}

/** Normalize an env value: trim, treat empty string as absent. */
function readVar(read: EnvReader, key: string): string | null {
  const raw = read(key)
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function readBillingConfig(read: EnvReader): BillingConfig {
  return {
    secretKey: readVar(read, 'STRIPE_SECRET_KEY'),
    webhookSecret: readVar(read, 'STRIPE_WEBHOOK_SECRET'),
    prices: {
      pro: readVar(read, PRICE_ENV_BY_TIER.pro),
      business: readVar(read, PRICE_ENV_BY_TIER.business),
      enterprise: readVar(read, PRICE_ENV_BY_TIER.enterprise),
    },
  }
}

/** Billing is "configured" when both the API key and the webhook secret exist. */
export function isBillingConfigured(config: BillingConfig): boolean {
  return Boolean(config.secretKey) && Boolean(config.webhookSecret)
}

/** The Stripe price id for a tier, or null if that tier's price env is unset. */
export function priceIdForTier(config: BillingConfig, tier: PurchasableTier): string | null {
  return config.prices[tier] ?? null
}

/**
 * Reverse-map a Stripe price id to a plan tier. Returns the tier whose configured
 * price id matches, or null when the price is unknown (e.g. a legacy price or a
 * misconfiguration) so the caller can decide the safe fallback.
 */
export function tierFromPriceId(config: BillingConfig, priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null
  for (const tier of PURCHASABLE_TIERS) {
    if (config.prices[tier] === priceId) return tier
  }
  return null
}
