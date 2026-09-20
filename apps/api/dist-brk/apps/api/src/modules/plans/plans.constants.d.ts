/**
 * Commercial plan tiers (Plan §14.1). This module is the single source of truth
 * for what each plan includes — numeric limits and per-feature flags. It is pure
 * data + helpers (no DB, no Nest) so it can be imported anywhere and unit-tested
 * in isolation.
 *
 * CRITICAL INVARIANT: `enterprise` is the "everything, unlimited" tier and is the
 * default for every existing workspace (see migration 0070). Gating must never
 * restrict an enterprise workspace — every feature is `true` and every limit is
 * `null` (unlimited), so both feature gates and limit checks are no-ops.
 *
 * NOTE: this is the plan MODEL + gating only. Live payment processing (Stripe) is
 * intentionally out of scope here and is env-gated elsewhere.
 */
export declare const PLAN_IDS: readonly ["free", "pro", "business", "enterprise"];
export type PlanId = (typeof PLAN_IDS)[number];
/** Gated capabilities. Add here + to every tier below (a missing key won't compile). */
export declare const PLAN_FEATURES: readonly ["ai", "automations", "sso", "customRoles", "webhooks", "guests", "integrations", "customBranding", "prioritySupport", "teamView", "boardExport"];
export type PlanFeature = (typeof PLAN_FEATURES)[number];
/** `null` means unlimited. */
export type PlanLimits = {
    maxMembers: number | null;
    maxProjects: number | null;
};
export type PlanTier = {
    id: PlanId;
    label: string;
    /** Human-blurb for the UI. */
    description: string;
    /**
     * Free-trial length in days offered when a customer starts a subscription to
     * this tier (Plan §14.1). 0 = no trial. Passed to Stripe Checkout as
     * `subscription_data.trial_period_days`; a `trialing` subscription still grants
     * the tier (see BillingService.GRANTING_STATUSES), and if the trial ends
     * unpaid the dunning path downgrades the workspace back to free.
     */
    trialDays: number;
    limits: PlanLimits;
    features: Record<PlanFeature, boolean>;
};
export declare const PLAN_TIERS: Record<PlanId, PlanTier>;
export declare function isPlanId(value: unknown): value is PlanId;
/**
 * The ladder, as a number.
 *
 * `PLAN_IDS` is already written in ascending order of what a tier includes, and
 * `plans.constants.test.ts` asserts that order, so the rank is derived from it
 * rather than written out a second time — a second copy is the duplicated-list
 * defect and this audit has found four of them.
 */
export declare const PLAN_RANK: Record<PlanId, number>;
/**
 * Is `planId` at least `minimum`? The comparison every "this needs Pro or
 * better" gate makes.
 *
 * §V2-06 `[07:20]` — "ClickUp Apps is also dependent on that — ke aap ke paas
 * PACKAGE PLAN kaun sa hai … [Free] mein of course apna option LIMITED hota
 * hai." Gating by TIER, not by a per-feature boolean: a free workspace gets a
 * smaller set of ClickApps and a paid one gets more, which a
 * `Record<PlanFeature, boolean>` cannot express without one flag per ClickApp
 * per tier.
 *
 * Enterprise is the top of the ladder, so this is `true` for every minimum
 * there — the §14.1 invariant that gating never restricts an enterprise
 * workspace holds by construction, not by remembering to special-case it.
 */
export declare function planIncludes(planId: PlanId, minimum: PlanId): boolean;
/** Optional per-workspace override stored in `workspaces.plan_limits`. */
export type PlanLimitsOverride = {
    maxMembers?: number | null;
    maxProjects?: number | null;
    features?: Partial<Record<PlanFeature, boolean>>;
};
export type ResolvedPlan = {
    id: PlanId;
    label: string;
    description: string;
    /** Free-trial length in days for this tier (0 = no trial). */
    trialDays: number;
    limits: PlanLimits;
    features: Record<PlanFeature, boolean>;
    /**
     * Whether `id` came from a plan value this build knows, or from the fail-open
     * default below. See `resolvePlanConfig` — without this a caller cannot tell
     * "enterprise because the row says enterprise" from "enterprise because the
     * row said something nobody recognises", and those are very different facts.
     */
    recognized: boolean;
};
/**
 * Resolve the effective plan config for a stored `plan` value + optional override.
 *
 * An UNKNOWN/garbage plan id resolves to `enterprise` — a fail-open default so a
 * bad value can never accidentally restrict a workspace (reinforces the "gating
 * never restricts current behavior" guarantee). The override may widen or narrow
 * the tier's numeric limits and toggle individual features.
 *
 * §V2-06 — IS FAILING OPEN RIGHT HERE? Re-examined while putting ClickApps
 * behind the plan, and kept, for one reason that is not inertia: every existing
 * workspace stores `enterprise` (schema/workspaces.ts:69 default, migration
 * 0070), so a fail-CLOSED default would only ever fire on a value that is
 * already wrong — and it would fire by taking features away from a live
 * workspace, which is an outage, not a gate. A bad plan string is an
 * operational fault to be fixed in the row, not a reason to lock somebody out
 * of their own Space settings.
 *
 * What WAS wrong is that the fail-open was silent. `recognized` makes it
 * legible: `getWorkspacePlan` already carries `raw`, and a caller (or an
 * operator reading `GET /workspaces/:id/plan`) can now see that the tier was
 * defaulted rather than read. The gate stays open; it no longer lies about why.
 */
export declare function resolvePlanConfig(planId: string | null | undefined, override?: PlanLimitsOverride | null): ResolvedPlan;
/**
 * Free-trial length in days for a plan tier (Plan §14.1). 0 means "no trial".
 * Used by BillingService to decide whether to pass Stripe Checkout a
 * `trial_period_days`. An unknown plan id fails safe to the enterprise value
 * (0 = no trial), matching resolvePlanConfig's fail-open default tier.
 */
export declare function trialDaysForPlan(planId: string | null | undefined): number;
/** A compact, serializable catalog for the UI (plan picker, marketing table). */
export declare function planCatalog(): PlanTier[];
