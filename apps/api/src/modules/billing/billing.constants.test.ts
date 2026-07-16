import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  readBillingConfig,
  isBillingConfigured,
  isPurchasableTier,
  priceIdForTier,
  tierFromPriceId,
  PURCHASABLE_TIERS,
} from './billing.constants'

const fullEnv: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_123',
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_BUSINESS: 'price_biz',
  STRIPE_PRICE_ENTERPRISE: 'price_ent',
}
const read = (env: Record<string, string | undefined>) => (k: string) => env[k]

describe('billing.constants — readBillingConfig / isBillingConfigured', () => {
  it('reads all keys and reports configured when secret + webhook present', () => {
    const cfg = readBillingConfig(read(fullEnv))
    assert.equal(cfg.secretKey, 'sk_test_123')
    assert.equal(cfg.webhookSecret, 'whsec_123')
    assert.deepEqual(cfg.prices, { pro: 'price_pro', business: 'price_biz', enterprise: 'price_ent' })
    assert.equal(isBillingConfigured(cfg), true)
  })

  it('is NOT configured when the webhook secret is missing', () => {
    const cfg = readBillingConfig(read({ STRIPE_SECRET_KEY: 'sk_x' }))
    assert.equal(isBillingConfigured(cfg), false)
  })

  it('is NOT configured on a completely empty env', () => {
    assert.equal(isBillingConfigured(readBillingConfig(read({}))), false)
  })

  it('treats blank/whitespace env values as absent', () => {
    const cfg = readBillingConfig(read({ STRIPE_SECRET_KEY: '   ', STRIPE_WEBHOOK_SECRET: '' }))
    assert.equal(cfg.secretKey, null)
    assert.equal(cfg.webhookSecret, null)
    assert.equal(isBillingConfigured(cfg), false)
  })
})

describe('billing.constants — tier ⇄ price mapping', () => {
  const cfg = readBillingConfig(read(fullEnv))

  it('isPurchasableTier accepts pro/business/enterprise only', () => {
    assert.deepEqual([...PURCHASABLE_TIERS], ['pro', 'business', 'enterprise'])
    for (const t of PURCHASABLE_TIERS) assert.equal(isPurchasableTier(t), true)
    assert.equal(isPurchasableTier('free'), false)
    assert.equal(isPurchasableTier('platinum'), false)
    assert.equal(isPurchasableTier(undefined), false)
  })

  it('priceIdForTier returns the configured price', () => {
    assert.equal(priceIdForTier(cfg, 'pro'), 'price_pro')
    assert.equal(priceIdForTier(cfg, 'business'), 'price_biz')
    assert.equal(priceIdForTier(cfg, 'enterprise'), 'price_ent')
  })

  it('priceIdForTier is null when that tier price is unset', () => {
    const partial = readBillingConfig(read({ ...fullEnv, STRIPE_PRICE_ENTERPRISE: '' }))
    assert.equal(priceIdForTier(partial, 'enterprise'), null)
  })

  it('tierFromPriceId reverse-maps a known price and returns null for unknown', () => {
    assert.equal(tierFromPriceId(cfg, 'price_pro'), 'pro')
    assert.equal(tierFromPriceId(cfg, 'price_biz'), 'business')
    assert.equal(tierFromPriceId(cfg, 'price_ent'), 'enterprise')
    assert.equal(tierFromPriceId(cfg, 'price_unknown'), null)
    assert.equal(tierFromPriceId(cfg, null), null)
  })
})
