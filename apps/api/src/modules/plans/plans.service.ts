import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import { workspaces, workspaceMembers, projects, spaces, planFeatureUses, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import {
  resolvePlanConfig,
  isPlanId,
  planCatalog,
  type PlanFeature,
  type PlanId,
  type PlanLimitsOverride,
  type ResolvedPlan,
  FEATURE_FREE_USES,
  FEATURE_LABELS,
} from './plans.constants'

/** A workspace's resolved plan plus the raw stored id + any override. */
export type WorkspacePlan = ResolvedPlan & {
  /** The raw `workspaces.plan` value as stored (may differ from resolved id if unknown). */
  raw: string
  override: PlanLimitsOverride | null
}

/** GET /workspaces/:id/plan response shape: plan + limits + features + live usage. */
export type PlanUsage = {
  plan: PlanId
  rawPlan: string
  label: string
  description: string
  limits: { maxMembers: number | null; maxProjects: number | null; aiCreditsPerMember: number | null }
  features: Record<PlanFeature, boolean>
  usage: { members: number; projects: number }
  /** The free uses left of each feature the plan lacks (`ledger-rows/row-788`). */
  freeUses: Array<{ feature: PlanFeature; label: string; allowance: number; used: number; left: number }>
  catalog: ReturnType<typeof planCatalog>
}

/**
 * PlansService (Plan §14.1) — reads a workspace's commercial plan and enforces
 * its limits/features. Depends only on the DB, so every consumer (workspaces,
 * projects, invitations, ai) can import PlansModule without a cycle.
 *
 * Every assertion is a NO-OP for an unlimited/enabled plan, so an enterprise
 * workspace (the default for all existing workspaces) is never restricted.
 */
/** The rows a raw statement answered, whichever shape the driver gives them in. */
function rowsOf(result: unknown): unknown[] {
  if (Array.isArray(result)) return result
  const rows = (result as { rows?: unknown[] } | null)?.rows
  return Array.isArray(rows) ? rows : []
}

/** ClickUp's words for spent uses: they are used up, and nothing is lost. */
export function usesExpired(planLabel: string, feature: PlanFeature, allowance: number): string {
  return `This workspace has used all ${allowance} of its free uses of ${FEATURE_LABELS[feature]} on the ${planLabel} plan. Nothing made with it is lost — upgrade to keep using it.`
}

@Injectable()
export class PlansService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /** Resolve the effective plan config for a workspace (throws 404 if missing). */
  async getWorkspacePlan(workspaceId: string): Promise<WorkspacePlan> {
    const [ws] = await this.db
      .select({ plan: workspaces.plan, planLimits: workspaces.planLimits })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
    if (!ws) throw new NotFoundException('Workspace not found')
    const override = (ws.planLimits ?? null) as PlanLimitsOverride | null
    const resolved = resolvePlanConfig(ws.plan, override)
    return { ...resolved, raw: ws.plan, override }
  }

  async hasFeature(workspaceId: string, feature: PlanFeature): Promise<boolean> {
    const plan = await this.getWorkspacePlan(workspaceId)
    return plan.features[feature] === true
  }

  /**
   * Throw 403 if the workspace's plan does not include `feature`. No-op for enterprise.
   *
   * A FEATURE WITH FREE USES (`FEATURE_FREE_USES`, `ledger-rows/row-788`) is let
   * through while the workspace has uses of it left. A use is a member's day
   * with it: their first use on a day is written, and takes one of the
   * workspace's uses, only while one is left — the test and the write are one
   * statement — and any more that day take none. Spent, it is refused with
   * what ClickUp says — the uses are used up, nothing made with it is lost —
   * and `code: 'uses_expired'`, which the paywall reads. With nobody to count
   * it against, it is refused as before.
   */
  async assertFeature(workspaceId: string, feature: PlanFeature, userId?: string): Promise<void> {
    const plan = await this.getWorkspacePlan(workspaceId)
    if (plan.features[feature] === true) return
    const free = FEATURE_FREE_USES[feature]
    if (free && userId) {
      const day = new Date().toISOString().slice(0, 10)
      const taken = await this.db.execute(sql`
        insert into ${planFeatureUses} (workspace_id, feature, user_id, day)
        select ${workspaceId}, ${feature}, ${userId}, ${day}::date
        where (select count(*) from ${planFeatureUses} where workspace_id = ${workspaceId} and feature = ${feature}) < ${free}
        on conflict do nothing
        returning 1 as ok`)
      if (rowsOf(taken).length) return
      const [already] = await this.db
        .select({ day: planFeatureUses.day })
        .from(planFeatureUses)
        .where(and(eq(planFeatureUses.workspaceId, workspaceId), eq(planFeatureUses.feature, feature), eq(planFeatureUses.userId, userId), eq(planFeatureUses.day, day)))
        .limit(1)
      if (already) return
      throw new ForbiddenException({
        message: usesExpired(plan.label, feature, free),
        code: 'uses_expired',
        feature,
        allowance: free,
      })
    }
    throw new ForbiddenException(
      `Your ${plan.label} plan does not include this capability (${feature}). Upgrade your plan to enable it.`,
    )
  }

  /** A workspace's free uses of each feature its plan lacks: how many, and how many spent. */
  async freeUses(workspaceId: string): Promise<Array<{ feature: PlanFeature; label: string; allowance: number; used: number; left: number }>> {
    const plan = await this.getWorkspacePlan(workspaceId)
    const metered = (Object.entries(FEATURE_FREE_USES) as Array<[PlanFeature, number]>).filter(([f]) => plan.features[f] !== true)
    if (!metered.length) return []
    // One row per member-day, at most a feature's allowance of them: counted here.
    const rows = await this.db
      .select({ feature: planFeatureUses.feature })
      .from(planFeatureUses)
      .where(eq(planFeatureUses.workspaceId, workspaceId))
    const used = new Map<string, number>()
    for (const r of rows) used.set(r.feature, (used.get(r.feature) ?? 0) + 1)
    return metered
      .map(([feature, allowance]) => {
        const u = Math.min(used.get(feature) ?? 0, allowance)
        return { feature, label: FEATURE_LABELS[feature], allowance, used: u, left: allowance - u }
      })
  }

  async countMembers(workspaceId: string): Promise<number> {
    // People: a Super Agent's account is a member so it can be mentioned and assigned, and takes no one's place.
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(users.isAgent, false)))
    return row?.c ?? 0
  }

  /** Non-archived projects across every space in the workspace. */
  async countProjects(workspaceId: string): Promise<number> {
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      // The personal space's container is nobody's project, and counts toward no plan (`personal-list.ts`).
      .where(and(eq(spaces.workspaceId, workspaceId), eq(spaces.isPersonal, false), eq(projects.isArchived, false)))
    return row?.c ?? 0
  }

  /**
   * Throw 403 if adding `adding` member(s) would exceed the plan's member cap.
   * Returns immediately (no count query) when the plan is unlimited — so an
   * enterprise workspace never even runs the check.
   */
  async assertCanAddMembers(workspaceId: string, adding = 1): Promise<void> {
    const plan = await this.getWorkspacePlan(workspaceId)
    const max = plan.limits.maxMembers
    if (max == null) return // unlimited (enterprise)
    const current = await this.countMembers(workspaceId)
    if (current + adding > max) {
      throw new ForbiddenException(
        `Your ${plan.label} plan allows up to ${max} member${max === 1 ? '' : 's'} (currently ${current}). Upgrade your plan to add more.`,
      )
    }
  }

  /** Throw 403 if creating `adding` project(s) would exceed the plan's project cap. No-op for enterprise. */
  async assertCanCreateProjects(workspaceId: string, adding = 1): Promise<void> {
    const plan = await this.getWorkspacePlan(workspaceId)
    const max = plan.limits.maxProjects
    if (max == null) return // unlimited (enterprise)
    const current = await this.countProjects(workspaceId)
    if (current + adding > max) {
      throw new ForbiddenException(
        `Your ${plan.label} plan allows up to ${max} project${max === 1 ? '' : 's'} (currently ${current}). Upgrade your plan to add more.`,
      )
    }
  }

  /** Plan + limits + features + current usage for the plan card / GET endpoint. */
  async getUsage(workspaceId: string): Promise<PlanUsage> {
    const plan = await this.getWorkspacePlan(workspaceId)
    const [members, projectCount, freeUses] = await Promise.all([
      this.countMembers(workspaceId),
      this.countProjects(workspaceId),
      this.freeUses(workspaceId),
    ])
    return {
      plan: plan.id,
      rawPlan: plan.raw,
      label: plan.label,
      description: plan.description,
      limits: plan.limits,
      features: plan.features,
      usage: { members, projects: projectCount },
      freeUses,
      catalog: planCatalog(),
    }
  }

  /**
   * Set a workspace's plan (super-admin action — the controller enforces the
   * super_admin gate). Validates the plan id and, optionally, a numeric-limit
   * override. Returns the fresh usage snapshot.
   */
  async setWorkspacePlan(
    workspaceId: string,
    planId: string,
    override?: PlanLimitsOverride | null,
  ): Promise<PlanUsage> {
    if (!isPlanId(planId)) {
      throw new BadRequestException(`Unknown plan '${planId}'. Must be one of: free, pro, business, enterprise`)
    }
    const set: Record<string, unknown> = { plan: planId, updatedAt: new Date() }
    // Only touch plan_limits when the caller explicitly passes an override
    // (undefined = leave as-is; null = clear back to tier defaults).
    if (override !== undefined) set.planLimits = override
    const [row] = await this.db
      .update(workspaces)
      .set(set)
      .where(eq(workspaces.id, workspaceId))
      .returning({ id: workspaces.id })
    if (!row) throw new NotFoundException('Workspace not found')
    return this.getUsage(workspaceId)
  }
}
