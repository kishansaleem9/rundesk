import type { Db } from '@rundesk/db';
import { planCatalog, type PlanFeature, type PlanId, type PlanLimitsOverride, type ResolvedPlan } from './plans.constants';
/** A workspace's resolved plan plus the raw stored id + any override. */
export type WorkspacePlan = ResolvedPlan & {
    /** The raw `workspaces.plan` value as stored (may differ from resolved id if unknown). */
    raw: string;
    override: PlanLimitsOverride | null;
};
/** GET /workspaces/:id/plan response shape: plan + limits + features + live usage. */
export type PlanUsage = {
    plan: PlanId;
    rawPlan: string;
    label: string;
    description: string;
    limits: {
        maxMembers: number | null;
        maxProjects: number | null;
    };
    features: Record<PlanFeature, boolean>;
    usage: {
        members: number;
        projects: number;
    };
    catalog: ReturnType<typeof planCatalog>;
};
/**
 * PlansService (Plan §14.1) — reads a workspace's commercial plan and enforces
 * its limits/features. Depends only on the DB, so every consumer (workspaces,
 * projects, invitations, ai) can import PlansModule without a cycle.
 *
 * Every assertion is a NO-OP for an unlimited/enabled plan, so an enterprise
 * workspace (the default for all existing workspaces) is never restricted.
 */
export declare class PlansService {
    private db;
    constructor(db: Db);
    /** Resolve the effective plan config for a workspace (throws 404 if missing). */
    getWorkspacePlan(workspaceId: string): Promise<WorkspacePlan>;
    hasFeature(workspaceId: string, feature: PlanFeature): Promise<boolean>;
    /** Throw 403 if the workspace's plan does not include `feature`. No-op for enterprise. */
    assertFeature(workspaceId: string, feature: PlanFeature): Promise<void>;
    countMembers(workspaceId: string): Promise<number>;
    /** Non-archived projects across every space in the workspace. */
    countProjects(workspaceId: string): Promise<number>;
    /**
     * Throw 403 if adding `adding` member(s) would exceed the plan's member cap.
     * Returns immediately (no count query) when the plan is unlimited — so an
     * enterprise workspace never even runs the check.
     */
    assertCanAddMembers(workspaceId: string, adding?: number): Promise<void>;
    /** Throw 403 if creating `adding` project(s) would exceed the plan's project cap. No-op for enterprise. */
    assertCanCreateProjects(workspaceId: string, adding?: number): Promise<void>;
    /** Plan + limits + features + current usage for the plan card / GET endpoint. */
    getUsage(workspaceId: string): Promise<PlanUsage>;
    /**
     * Set a workspace's plan (super-admin action — the controller enforces the
     * super_admin gate). Validates the plan id and, optionally, a numeric-limit
     * override. Returns the fresh usage snapshot.
     */
    setWorkspacePlan(workspaceId: string, planId: string, override?: PlanLimitsOverride | null): Promise<PlanUsage>;
}
