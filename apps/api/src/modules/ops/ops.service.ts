import { Injectable, Inject } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import {
  organizations,
  organizationMembers,
  workspaces,
  workspaceMembers,
  users,
  subscriptions,
  aiUsage,
  taskAttachments,
  tasks,
  lists,
  projects,
  spaces,
  chatMessageAttachments,
  chatChannels,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { estimateAiCostUsd } from '../ai/ai-cost'

/**
 * §14.5 SaaS Ops Dashboard (Internal) — super-admin, cross-tenant platform
 * metrics. READ-ONLY analytics over existing tables (no migration). Everything
 * degrades gracefully to zeros/empty when the tables are empty (e.g. no Stripe
 * configured) — this service never throws.
 */

/**
 * Modeled per-seat monthly list price (USD) by tier. Pro/Business match the
 * marketing site's landing page ($12 / $24). Enterprise is "Custom" on the site,
 * so we use $40 as an explicit modeled list rate for internal revenue modeling.
 */
const SEAT_PRICE_USD: Record<string, number> = {
  free: 0,
  pro: 12,
  business: 24,
  enterprise: 40,
}

// A subscription entitles revenue only while ACTIVE; CANCELED feeds churn.
const ACTIVE_STATUSES = new Set(['active', 'trialing'])
const CANCELED_STATUSES = new Set(['canceled', 'incomplete_expired', 'unpaid'])
const CHURN_RISK_STATUSES = new Set(['past_due', 'canceled', 'unpaid'])

type SubRow = {
  workspaceId: string | null
  status: string
  tier: string
  cancelAtPeriodEnd: boolean
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Round to 2 decimals, coercing NaN/±Infinity to 0. */
function round2(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function seatPrice(tier: string): number {
  return SEAT_PRICE_USD[tier] ?? 0
}

function isChurnRisk(s: SubRow): boolean {
  return s.cancelAtPeriodEnd === true || CHURN_RISK_STATUSES.has(s.status)
}

export type OpsMetrics = {
  billingConfigured: boolean
  totalOrganizations: number
  totalActiveUsers: number
  totalStorageBytes: number
  totalAiCostUsd: number
  mrrUsd: number
  arrUsd: number
  arpaUsd: number
  ltvUsd: number
  churnRatePct: number
  activeSubscriptions: number
  canceledSubscriptions: number
  subscriptionsByTier: Record<string, number>
  subscriptionsByStatus: Record<string, number>
  generatedAt: string
}

export type OpsOrgRow = {
  id: string
  name: string
  slug: string
  plan: string | null
  subscriptionStatus: string | null
  activeUsers: number
  totalUsers: number
  storageBytes: number
  aiCostUsd: number
  mrrUsd: number
  churnRisk: boolean
  createdAt: Date | null
}

@Injectable()
export class OpsService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /** All subscription rows (workspace-scoped) with the fields the metrics need. */
  private async loadSubscriptions(): Promise<SubRow[]> {
    const rows = await this.db
      .select({
        workspaceId: subscriptions.workspaceId,
        status: subscriptions.status,
        tier: subscriptions.tier,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      })
      .from(subscriptions)
    return rows.map((r) => ({
      workspaceId: r.workspaceId ?? null,
      status: r.status,
      tier: r.tier,
      cancelAtPeriodEnd: Boolean(r.cancelAtPeriodEnd),
    }))
  }

  /** Map workspaceId → number of workspace_members (a subscription's "seats"). */
  private async loadSeatsByWorkspace(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        seats: sql<number>`count(*)::int`,
      })
      .from(workspaceMembers)
      .groupBy(workspaceMembers.workspaceId)
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.workspaceId, num(r.seats))
    return m
  }

  /** Map workspaceId → organizationId. */
  private async loadWorkspaceOrgs(): Promise<Map<string, string>> {
    const rows = await this.db
      .select({ id: workspaces.id, organizationId: workspaces.organizationId })
      .from(workspaces)
    const m = new Map<string, string>()
    for (const r of rows) m.set(r.id, r.organizationId)
    return m
  }

  /** Task-attachment storage bytes per organization (grouped aggregate). */
  private async loadTaskStorageByOrg(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        organizationId: workspaces.organizationId,
        bytes: sql<number>`coalesce(sum(${taskAttachments.sizeBytes}), 0)`,
      })
      .from(taskAttachments)
      .innerJoin(tasks, eq(tasks.id, taskAttachments.taskId))
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .innerJoin(workspaces, eq(workspaces.id, spaces.workspaceId))
      .groupBy(workspaces.organizationId)
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.organizationId, num(r.bytes))
    return m
  }

  /** Chat-attachment storage bytes per organization (grouped aggregate). */
  private async loadChatStorageByOrg(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        organizationId: workspaces.organizationId,
        bytes: sql<number>`coalesce(sum(${chatMessageAttachments.sizeBytes}), 0)`,
      })
      .from(chatMessageAttachments)
      .innerJoin(chatChannels, eq(chatChannels.id, chatMessageAttachments.channelId))
      .innerJoin(workspaces, eq(workspaces.id, chatChannels.workspaceId))
      .groupBy(workspaces.organizationId)
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.organizationId, num(r.bytes))
    return m
  }

  /**
   * AI cost (USD) per organization over the last 30 days. Token sums are grouped
   * per (org, model) in SQL, then priced in JS via the shared estimateAiCostUsd
   * (same cost model as ai.service).
   */
  private async loadAiCostByOrg(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        organizationId: workspaces.organizationId,
        model: aiUsage.model,
        inTok: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
        outTok: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
      })
      .from(aiUsage)
      .innerJoin(workspaces, eq(workspaces.id, aiUsage.workspaceId))
      .where(sql`${aiUsage.createdAt} >= now() - interval '30 days'`)
      .groupBy(workspaces.organizationId, aiUsage.model)
    const m = new Map<string, number>()
    for (const r of rows) {
      const cost = estimateAiCostUsd(r.model, num(r.inTok), num(r.outTok))
      m.set(r.organizationId, (m.get(r.organizationId) ?? 0) + cost)
    }
    return m
  }

  /**
   * Per-org total members and active members. Active = distinct members whose
   * user.last_seen_at is within the last 30 days (evaluated in Postgres).
   */
  private async loadUsersByOrg(): Promise<Map<string, { total: number; active: number }>> {
    const rows = await this.db
      .select({
        organizationId: organizationMembers.organizationId,
        total: sql<number>`count(distinct ${users.id})::int`,
        active: sql<number>`count(distinct ${users.id}) filter (where ${users.lastSeenAt} >= now() - interval '30 days')::int`,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .groupBy(organizationMembers.organizationId)
    const m = new Map<string, { total: number; active: number }>()
    for (const r of rows) m.set(r.organizationId, { total: num(r.total), active: num(r.active) })
    return m
  }

  /** Global distinct active users (last_seen_at within 30 days). */
  private async loadGlobalActiveUsers(): Promise<number> {
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.lastSeenAt} >= now() - interval '30 days'`)
    return num(row?.c)
  }

  /**
   * Platform-wide summary. See the class doc for the degrade-to-zero contract.
   *
   * Revenue model:
   *   MRR   = Σ over ACTIVE subs of seatPrice[tier] × seats(workspace_members)
   *   ARR   = MRR × 12
   *   ARPA  = MRR / activeSubscriptions            (0 when no active subs)
   *   churn = canceled / (active + canceled) × 100 (0 when no subs)
   *   LTV   = ARPA / (churn/100); when churn is 0 we cap LTV at ARPA × 36
   *           (a 3-year modeled ceiling), and guard NaN/Infinity → 0.
   */
  async getMetrics(): Promise<OpsMetrics> {
    const [subs, seatsByWs, totalOrgRow, totalActiveUsers, storageTask, storageChat, aiCostByOrg] =
      await Promise.all([
        this.loadSubscriptions(),
        this.loadSeatsByWorkspace(),
        this.db.select({ c: sql<number>`count(*)::int` }).from(organizations),
        this.loadGlobalActiveUsers(),
        this.loadTaskStorageByOrg(),
        this.loadChatStorageByOrg(),
        this.loadAiCostByOrg(),
      ])

    const totalOrganizations = num(totalOrgRow[0]?.c)

    let mrr = 0
    let activeCount = 0
    let canceledCount = 0
    const byTier: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    for (const s of subs) {
      byStatus[s.status] = (byStatus[s.status] ?? 0) + 1
      if (ACTIVE_STATUSES.has(s.status)) {
        activeCount += 1
        byTier[s.tier] = (byTier[s.tier] ?? 0) + 1
        const seats = s.workspaceId ? (seatsByWs.get(s.workspaceId) ?? 0) : 0
        mrr += seatPrice(s.tier) * seats
      } else if (CANCELED_STATUSES.has(s.status)) {
        canceledCount += 1
      }
    }

    const arr = mrr * 12
    const arpa = activeCount > 0 ? mrr / activeCount : 0
    const churnDenom = activeCount + canceledCount
    const churnRatePct = churnDenom > 0 ? (canceledCount / churnDenom) * 100 : 0
    // LTV = ARPA / churn-fraction. With zero churn the geometric series diverges,
    // so we cap at a 3-year (36-month) modeled lifetime.
    const ltv = churnRatePct > 0 ? arpa / (churnRatePct / 100) : arpa * 36

    let totalStorageBytes = 0
    for (const b of storageTask.values()) totalStorageBytes += b
    for (const b of storageChat.values()) totalStorageBytes += b

    let totalAiCostUsd = 0
    for (const c of aiCostByOrg.values()) totalAiCostUsd += c

    return {
      billingConfigured: subs.length >= 1,
      totalOrganizations,
      totalActiveUsers,
      totalStorageBytes,
      totalAiCostUsd: round2(totalAiCostUsd),
      mrrUsd: round2(mrr),
      arrUsd: round2(arr),
      arpaUsd: round2(arpa),
      ltvUsd: round2(ltv),
      churnRatePct: round2(churnRatePct),
      activeSubscriptions: activeCount,
      canceledSubscriptions: canceledCount,
      subscriptionsByTier: byTier,
      subscriptionsByStatus: byStatus,
      generatedAt: new Date().toISOString(),
    }
  }

  /**
   * Per-organization rows (newest-org first). `plan`/`subscriptionStatus` come
   * from the org's most relevant ACTIVE subscription (highest modeled seat price)
   * or null when the org has no active subscription. `churnRisk` flags an org if
   * ANY of its subscriptions is at risk (cancel_at_period_end, past_due, etc).
   */
  async getOrganizations(): Promise<OpsOrgRow[]> {
    const [orgs, subs, seatsByWs, wsToOrg, usersByOrg, storageTask, storageChat, aiCostByOrg] =
      await Promise.all([
        this.db
          .select({
            id: organizations.id,
            name: organizations.name,
            slug: organizations.slug,
            createdAt: organizations.createdAt,
          })
          .from(organizations)
          .orderBy(sql`${organizations.createdAt} desc`),
        this.loadSubscriptions(),
        this.loadSeatsByWorkspace(),
        this.loadWorkspaceOrgs(),
        this.loadUsersByOrg(),
        this.loadTaskStorageByOrg(),
        this.loadChatStorageByOrg(),
        this.loadAiCostByOrg(),
      ])

    // Group subscriptions by organization (via workspace → org).
    const subsByOrg = new Map<string, SubRow[]>()
    for (const s of subs) {
      if (!s.workspaceId) continue
      const orgId = wsToOrg.get(s.workspaceId)
      if (!orgId) continue
      const list = subsByOrg.get(orgId) ?? []
      list.push(s)
      subsByOrg.set(orgId, list)
    }

    return orgs.map((o) => {
      const orgSubs = subsByOrg.get(o.id) ?? []
      const activeSubs = orgSubs.filter((s) => ACTIVE_STATUSES.has(s.status))

      // Most relevant active subscription = highest modeled seat price.
      let best: SubRow | null = null
      for (const s of activeSubs) {
        if (!best || seatPrice(s.tier) > seatPrice(best.tier)) best = s
      }

      // Per-org MRR = Σ active subs' seatPrice × seats (consistent with global MRR).
      let mrr = 0
      for (const s of activeSubs) {
        const seats = s.workspaceId ? (seatsByWs.get(s.workspaceId) ?? 0) : 0
        mrr += seatPrice(s.tier) * seats
      }

      const churnRisk = orgSubs.some(isChurnRisk)
      const u = usersByOrg.get(o.id) ?? { total: 0, active: 0 }
      const storageBytes = (storageTask.get(o.id) ?? 0) + (storageChat.get(o.id) ?? 0)

      return {
        id: o.id,
        name: o.name,
        slug: o.slug,
        plan: best ? best.tier : null,
        subscriptionStatus: best ? best.status : null,
        activeUsers: u.active,
        totalUsers: u.total,
        storageBytes,
        aiCostUsd: round2(aiCostByOrg.get(o.id) ?? 0),
        mrrUsd: round2(mrr),
        churnRisk,
        createdAt: o.createdAt ?? null,
      }
    })
  }
}
