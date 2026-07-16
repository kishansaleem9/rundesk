import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  organizations,
  organizationMembers,
  workspaces,
  workspaceMembers,
  users,
  subscriptions,
  aiUsage,
  taskAttachments,
  chatMessageAttachments,
} from '@rundesk/db'
import { OpsService } from './ops.service'

/**
 * A drizzle-shaped fake DB that answers each select() by its `.from(table)`.
 * The query chain (from/innerJoin/leftJoin/where/groupBy/orderBy) is a no-op
 * that finally resolves to `rowsFor(table)`. No real Postgres is touched, so
 * every branch is exercised purely in memory.
 */
function makeDb(rowsFor: (table: unknown) => any[] = () => []) {
  const db: any = {
    select: (_cols?: unknown) => {
      const chain: any = { _table: null as unknown }
      chain.from = (t: unknown) => {
        chain._table = t
        return chain
      }
      chain.innerJoin = () => chain
      chain.leftJoin = () => chain
      chain.where = () => chain
      chain.groupBy = () => chain
      chain.orderBy = () => chain
      chain.then = (res: any, rej: any) => Promise.resolve(rowsFor(chain._table)).then(res, rej)
      return chain
    },
  }
  return db
}

describe('OpsService.getMetrics — revenue math', () => {
  it('MRR = seatPrice(pro=12) × seats for one active subscription', async () => {
    const N = 3
    const db = makeDb((table) => {
      if (table === subscriptions)
        return [{ workspaceId: 'w1', status: 'active', tier: 'pro', cancelAtPeriodEnd: false }]
      if (table === workspaceMembers) return [{ workspaceId: 'w1', seats: N }]
      if (table === organizations) return [{ c: 1 }]
      if (table === users) return [{ c: 2 }]
      return []
    })
    const m = await new OpsService(db).getMetrics()
    assert.equal(m.mrrUsd, 12 * N) // 36
    assert.equal(m.arrUsd, 12 * N * 12) // 432
    assert.equal(m.activeSubscriptions, 1)
    assert.equal(m.canceledSubscriptions, 0)
    assert.equal(m.arpaUsd, 12 * N) // mrr / 1 active sub
    assert.equal(m.billingConfigured, true)
    assert.deepEqual(m.subscriptionsByTier, { pro: 1 })
    assert.deepEqual(m.subscriptionsByStatus, { active: 1 })
    assert.equal(m.totalActiveUsers, 2)
  })

  it('LTV caps at ARPA × 36 when churn is zero', async () => {
    const N = 3
    const db = makeDb((table) => {
      if (table === subscriptions)
        return [{ workspaceId: 'w1', status: 'active', tier: 'pro', cancelAtPeriodEnd: false }]
      if (table === workspaceMembers) return [{ workspaceId: 'w1', seats: N }]
      if (table === organizations) return [{ c: 1 }]
      return []
    })
    const m = await new OpsService(db).getMetrics()
    assert.equal(m.churnRatePct, 0)
    assert.equal(m.ltvUsd, 12 * N * 36) // ARPA(36) × 36 = 1296
  })

  it('LTV = ARPA / churn-fraction when there is churn', async () => {
    // 1 active pro sub (5 seats → MRR 60, ARPA 60) + 1 canceled sub →
    // churn = 1/2 = 50% → LTV = 60 / 0.5 = 120.
    const db = makeDb((table) => {
      if (table === subscriptions)
        return [
          { workspaceId: 'w1', status: 'active', tier: 'pro', cancelAtPeriodEnd: false },
          { workspaceId: 'w2', status: 'canceled', tier: 'pro', cancelAtPeriodEnd: false },
        ]
      if (table === workspaceMembers) return [{ workspaceId: 'w1', seats: 5 }]
      if (table === organizations) return [{ c: 2 }]
      return []
    })
    const m = await new OpsService(db).getMetrics()
    assert.equal(m.mrrUsd, 60)
    assert.equal(m.arpaUsd, 60)
    assert.equal(m.churnRatePct, 50)
    assert.equal(m.canceledSubscriptions, 1)
    assert.equal(m.ltvUsd, 120)
  })

  it('churn rate guards divide-by-zero (0 subs → 0, not NaN)', async () => {
    const db = makeDb(() => []) // every table empty
    const m = await new OpsService(db).getMetrics()
    assert.equal(m.churnRatePct, 0)
    assert.ok(Number.isFinite(m.churnRatePct))
    assert.equal(m.arpaUsd, 0)
    assert.equal(m.ltvUsd, 0)
  })

  it('empty DB degrades to all-zeros without throwing', async () => {
    const db = makeDb(() => [])
    const m = await new OpsService(db).getMetrics()
    assert.equal(m.billingConfigured, false)
    assert.equal(m.totalOrganizations, 0)
    assert.equal(m.totalActiveUsers, 0)
    assert.equal(m.totalStorageBytes, 0)
    assert.equal(m.totalAiCostUsd, 0)
    assert.equal(m.mrrUsd, 0)
    assert.equal(m.arrUsd, 0)
    assert.equal(m.arpaUsd, 0)
    assert.equal(m.ltvUsd, 0)
    assert.equal(m.churnRatePct, 0)
    assert.equal(m.activeSubscriptions, 0)
    assert.equal(m.canceledSubscriptions, 0)
    assert.deepEqual(m.subscriptionsByTier, {})
    assert.deepEqual(m.subscriptionsByStatus, {})
    assert.equal(typeof m.generatedAt, 'string')
  })

  it('AI cost sums per-org token counts via the shared cost model', async () => {
    // haiku pricing: in $1/M, out $5/M → 1M in + 1M out = $1 + $5 = $6.
    const db = makeDb((table) => {
      if (table === aiUsage)
        return [{ organizationId: 'o1', model: 'claude-haiku-4-5', inTok: 1_000_000, outTok: 1_000_000 }]
      return []
    })
    const m = await new OpsService(db).getMetrics()
    assert.equal(m.totalAiCostUsd, 6)
  })

  it('sums storage across task + chat attachments', async () => {
    const db = makeDb((table) => {
      if (table === taskAttachments) return [{ organizationId: 'o1', bytes: 1000 }]
      if (table === chatMessageAttachments) return [{ organizationId: 'o1', bytes: 500 }]
      return []
    })
    const m = await new OpsService(db).getMetrics()
    assert.equal(m.totalStorageBytes, 1500)
  })
})

describe('OpsService.getOrganizations — per-org rows', () => {
  it('maps plan/status from the active sub and flags churn risk', async () => {
    const db = makeDb((table) => {
      if (table === organizations)
        return [{ id: 'o1', name: 'Acme', slug: 'acme', createdAt: new Date('2026-01-01') }]
      if (table === subscriptions)
        return [{ workspaceId: 'w1', status: 'active', tier: 'business', cancelAtPeriodEnd: true }]
      if (table === workspaces) return [{ id: 'w1', organizationId: 'o1' }]
      if (table === workspaceMembers) return [{ workspaceId: 'w1', seats: 4 }]
      if (table === organizationMembers) return [{ organizationId: 'o1', total: 4, active: 2 }]
      if (table === taskAttachments) return [{ organizationId: 'o1', bytes: 2048 }]
      return []
    })
    const rows = await new OpsService(db).getOrganizations()
    assert.equal(rows.length, 1)
    const r = rows[0]
    assert.equal(r.plan, 'business')
    assert.equal(r.subscriptionStatus, 'active')
    assert.equal(r.mrrUsd, 24 * 4) // business $24 × 4 seats = 96
    assert.equal(r.churnRisk, true) // cancelAtPeriodEnd
    assert.equal(r.activeUsers, 2)
    assert.equal(r.totalUsers, 4)
    assert.equal(r.storageBytes, 2048)
  })

  it('returns plan=null / status=null when the org has no active subscription', async () => {
    const db = makeDb((table) => {
      if (table === organizations)
        return [{ id: 'o1', name: 'Acme', slug: 'acme', createdAt: new Date('2026-01-01') }]
      if (table === subscriptions)
        return [{ workspaceId: 'w1', status: 'canceled', tier: 'pro', cancelAtPeriodEnd: false }]
      if (table === workspaces) return [{ id: 'w1', organizationId: 'o1' }]
      return []
    })
    const rows = await new OpsService(db).getOrganizations()
    assert.equal(rows[0].plan, null)
    assert.equal(rows[0].subscriptionStatus, null)
    assert.equal(rows[0].mrrUsd, 0)
    assert.equal(rows[0].churnRisk, true) // canceled status is a churn signal
  })

  it('empty DB returns an empty array without throwing', async () => {
    const rows = await new OpsService(makeDb(() => [])).getOrganizations()
    assert.deepEqual(rows, [])
  })
})
