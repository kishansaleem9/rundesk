import { Injectable, Inject, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import { workspaces, workspaceMembers, projects, spaces } from '@rundesk/db'
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
  limits: { maxMembers: number | null; maxProjects: number | null }
  features: Record<PlanFeature, boolean>
  usage: { members: number; projects: number }
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

  /** Throw 403 if the workspace's plan does not include `feature`. No-op for enterprise. */
  async assertFeature(workspaceId: string, feature: PlanFeature): Promise<void> {
    const plan = await this.getWorkspacePlan(workspaceId)
    if (plan.features[feature] !== true) {
      throw new ForbiddenException(
        `Your ${plan.label} plan does not include this capability (${feature}). Upgrade your plan to enable it.`,
      )
    }
  }

  async countMembers(workspaceId: string): Promise<number> {
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId))
    return row?.c ?? 0
  }

  /** Non-archived projects across every space in the workspace. */
  async countProjects(workspaceId: string): Promise<number> {
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(projects)
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(spaces.workspaceId, workspaceId), eq(projects.isArchived, false)))
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
    const [members, projectCount] = await Promise.all([
      this.countMembers(workspaceId),
      this.countProjects(workspaceId),
    ])
    return {
      plan: plan.id,
      rawPlan: plan.raw,
      label: plan.label,
      description: plan.description,
      limits: plan.limits,
      features: plan.features,
      usage: { members, projects: projectCount },
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
