import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PLAN_TIERS,
  PLAN_FEATURES,
  resolvePlanConfig,
  isPlanId,
  planCatalog,
  trialDaysForPlan,
} from './plans.constants'

// §14.1 — the load-bearing invariant: enterprise is "everything, unlimited". The
// internal tool defaults to enterprise, so gating must never restrict it.
describe('PLAN_TIERS enterprise = everything unlimited (no-regression invariant)', () => {
  it('enterprise enables every feature', () => {
    for (const feature of PLAN_FEATURES) {
      assert.equal(PLAN_TIERS.enterprise.features[feature], true, `enterprise must enable ${feature}`)
    }
  })

  it('enterprise limits are unlimited (null)', () => {
    assert.equal(PLAN_TIERS.enterprise.limits.maxMembers, null)
    assert.equal(PLAN_TIERS.enterprise.limits.maxProjects, null)
  })
})

describe('free plan gates features + caps usage', () => {
  it('free disables AI and every other paid feature', () => {
    assert.equal(PLAN_TIERS.free.features.ai, false)
    for (const feature of PLAN_FEATURES) {
      assert.equal(PLAN_TIERS.free.features[feature], false, `free must disable ${feature}`)
    }
  })

  it('free caps members at 5 and projects at 3', () => {
    assert.equal(PLAN_TIERS.free.limits.maxMembers, 5)
    assert.equal(PLAN_TIERS.free.limits.maxProjects, 3)
  })

  it('pro/business enable AI; ladder widens limits', () => {
    assert.equal(PLAN_TIERS.pro.features.ai, true)
    assert.equal(PLAN_TIERS.business.features.ai, true)
    assert.ok((PLAN_TIERS.pro.limits.maxMembers ?? 0) > (PLAN_TIERS.free.limits.maxMembers ?? 0))
    assert.ok((PLAN_TIERS.business.limits.maxProjects ?? 0) > (PLAN_TIERS.pro.limits.maxProjects ?? 0))
  })
})

describe('resolvePlanConfig', () => {
  it('unknown/garbage plan resolves to enterprise (fail-open — never restricts)', () => {
    const resolved = resolvePlanConfig('legacy-nonsense')
    assert.equal(resolved.id, 'enterprise')
    assert.equal(resolved.features.ai, true)
    assert.equal(resolved.limits.maxMembers, null)
  })

  it('null/undefined plan resolves to enterprise', () => {
    assert.equal(resolvePlanConfig(null).id, 'enterprise')
    assert.equal(resolvePlanConfig(undefined).id, 'enterprise')
  })

  it('override widens a free plan’s numeric limits without changing its id', () => {
    const resolved = resolvePlanConfig('free', { maxMembers: 50, maxProjects: null })
    assert.equal(resolved.id, 'free')
    assert.equal(resolved.limits.maxMembers, 50)
    assert.equal(resolved.limits.maxProjects, null) // explicit unlimited override
  })

  it('override can toggle an individual feature flag', () => {
    const resolved = resolvePlanConfig('free', { features: { ai: true } })
    assert.equal(resolved.features.ai, true)
    assert.equal(resolved.features.webhooks, false) // untouched flags keep tier default
  })
})

describe('free trial (§14.1) — trialDays per tier', () => {
  it('pro and business offer a 14-day trial; free and enterprise offer none', () => {
    assert.equal(PLAN_TIERS.free.trialDays, 0)
    assert.equal(PLAN_TIERS.pro.trialDays, 14)
    assert.equal(PLAN_TIERS.business.trialDays, 14)
    assert.equal(PLAN_TIERS.enterprise.trialDays, 0)
  })

  it('trialDaysForPlan resolves per tier and fails safe (0) for unknown ids', () => {
    assert.equal(trialDaysForPlan('pro'), 14)
    assert.equal(trialDaysForPlan('business'), 14)
    assert.equal(trialDaysForPlan('free'), 0)
    assert.equal(trialDaysForPlan('enterprise'), 0)
    // Unknown/garbage → enterprise default (0), never an accidental trial.
    assert.equal(trialDaysForPlan('platinum'), 0)
    assert.equal(trialDaysForPlan(null), 0)
  })

  it('resolvePlanConfig surfaces trialDays', () => {
    assert.equal(resolvePlanConfig('pro').trialDays, 14)
    assert.equal(resolvePlanConfig('free').trialDays, 0)
  })
})

describe('helpers', () => {
  it('isPlanId accepts known ids and rejects others', () => {
    assert.equal(isPlanId('free'), true)
    assert.equal(isPlanId('enterprise'), true)
    assert.equal(isPlanId('platinum'), false)
    assert.equal(isPlanId(42), false)
  })

  it('planCatalog returns all four tiers in ladder order', () => {
    const catalog = planCatalog()
    assert.deepEqual(catalog.map((p) => p.id), ['free', 'pro', 'business', 'enterprise'])
  })
})
