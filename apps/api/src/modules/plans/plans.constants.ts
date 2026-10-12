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

export const PLAN_IDS = ['free', 'pro', 'business', 'enterprise'] as const
export type PlanId = (typeof PLAN_IDS)[number]

/** Gated capabilities. Add here + to every tier below (a missing key won't compile). */
export const PLAN_FEATURES = [
  'ai',
  'automations',
  'sso',
  'customRoles',
  'webhooks',
  'guests',
  'integrations',
  'customBranding',
  'prioritySupport',
  /*
   * §V2-13, frames `09:26` and `10:42` — the two surfaces the walkthrough
   * NAMES as paid.
   *
   *   `[09:26]` "Is ke baad TEAM VIEW — yeh cheez ke liye humein of course BUY
   *   karna parega."
   *   `[10:42]` "agar aap ke paas woh hai PREMIUM ACCESS … to aap ke paas board
   *   view download karne ka bhi option hoga. Lekin agar aap ke paas premium
   *   nahi [hai] to aap LIST VIEW download karo."
   *
   * The second sentence is the boundary and it is the important half: the LIST
   * export is free and stays free. `boardExport` gates the board-shaped export
   * only, which is a different artifact (grouped by board column), so a free
   * workspace loses nothing it had.
   */
  'teamView',
  'boardExport',
  /*
   * THE GANTT VIEW EXPORTED AS A PICTURE (`resume-defects/resume-5`): ClickUp's
   * "Export view" as a PDF or a PNG, on the Business plan and above
   * (changelog, "Improved Gantt view export"). It has no free uses: ClickUp
   * meters the Gantt VIEW on Free, not its export. The picture is drawn in the
   * browser from what the reader can already see, so this key is asked there.
   */
  'ganttExport',
] as const
export type PlanFeature = (typeof PLAN_FEATURES)[number]

/** `null` means unlimited. */
export type PlanLimits = {
  maxMembers: number | null
  maxProjects: number | null
  /**
   * AI CREDITS EACH MEMBER BRINGS A MONTH, pooled for the workspace
   * (`commit-log/log-3943965-1`). ClickUp's plans give each user a monthly
   * number of AI credits, pooled across the workspace, renewing each month and
   * not rolling over (Core 1,000, Business 1,500, …). Enterprise here is the
   * unlimited tier, as every limit of it is.
   */
  aiCreditsPerMember: number | null
}

export type PlanTier = {
  id: PlanId
  label: string
  /** Human-blurb for the UI. */
  description: string
  /**
   * Free-trial length in days offered when a customer starts a subscription to
   * this tier (Plan §14.1). 0 = no trial. Passed to Stripe Checkout as
   * `subscription_data.trial_period_days`; a `trialing` subscription still grants
   * the tier (see BillingService.GRANTING_STATUSES), and if the trial ends
   * unpaid the dunning path downgrades the workspace back to free.
   */
  trialDays: number
  limits: PlanLimits
  features: Record<PlanFeature, boolean>
}

const ALL_FEATURES_OFF: Record<PlanFeature, boolean> = {
  ai: false,
  automations: false,
  sso: false,
  customRoles: false,
  webhooks: false,
  guests: false,
  integrations: false,
  customBranding: false,
  prioritySupport: false,
  teamView: false,
  boardExport: false,
  ganttExport: false,
}

const ALL_FEATURES_ON: Record<PlanFeature, boolean> = {
  ai: true,
  automations: true,
  sso: true,
  customRoles: true,
  webhooks: true,
  guests: true,
  integrations: true,
  customBranding: true,
  prioritySupport: true,
  /*
   * On from Business up, which is exactly what frame `09:26` offers: the panel
   * is headed "Try Business for FREE to unlock Team View" and lists Team View
   * and Custom Exporting among what Business includes. `pro` spreads
   * ALL_FEATURES_OFF and names what it adds, so it does not get these.
   */
  teamView: true,
  boardExport: true,
  ganttExport: true,
}

export const PLAN_TIERS: Record<PlanId, PlanTier> = {
  free: {
    id: 'free',
    label: 'Free',
    description: 'For individuals getting started. Up to 5 members and 3 projects.',
    trialDays: 0,
    limits: { maxMembers: 5, maxProjects: 3, aiCreditsPerMember: 0 },
    features: { ...ALL_FEATURES_OFF },
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    description: 'For growing teams. AI, automations, webhooks, guests and integrations.',
    trialDays: 14,
    limits: { maxMembers: 25, maxProjects: 50, aiCreditsPerMember: 1_000 },
    features: {
      ...ALL_FEATURES_OFF,
      ai: true,
      automations: true,
      webhooks: true,
      guests: true,
      integrations: true,
      customBranding: true,
    },
  },
  business: {
    id: 'business',
    label: 'Business',
    description: 'For scaling orgs. Adds SSO/SCIM and custom roles on top of Pro.',
    trialDays: 14,
    limits: { maxMembers: 100, maxProjects: 500, aiCreditsPerMember: 1_500 },
    features: {
      ...ALL_FEATURES_ON,
      prioritySupport: false,
    },
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    description: 'Unlimited members and projects, every feature, priority support.',
    trialDays: 0,
    limits: { maxMembers: null, maxProjects: null, aiCreditsPerMember: null },
    features: { ...ALL_FEATURES_ON },
  },
}

/**
 * A PLAN'S FREE USES OF A FEATURE IT DOES NOT INCLUDE (`ledger-rows/row-788`).
 *
 * ClickUp's Free plan has a number of uses of some paid features — its Gantt
 * view sixty — that add up over the workspace's life and never reset; spent,
 * the feature is refused, and nothing made with it is lost (help centre,
 * "Views feature availability and limits", and the pricing page's questions;
 * read through search excerpts, 12 October). Here the two features frame
 * `09:26` names as paid, at ClickUp's sixty. What one use is, the pages read
 * do not say: here it is a member's day with the feature
 * (`PlansService.assertFeature`), so opening Team View twice takes one.
 */
export const FEATURE_FREE_USES: Partial<Record<PlanFeature, number>> = {
  teamView: 60,
  boardExport: 60,
}

/** What each gated feature is called where a person reads it. */
export const FEATURE_LABELS: Record<PlanFeature, string> = {
  ai: 'AI',
  automations: 'Automations',
  sso: 'Single sign-on',
  customRoles: 'Custom roles',
  webhooks: 'Webhooks',
  guests: 'Guests',
  integrations: 'Integrations',
  customBranding: 'Custom branding',
  prioritySupport: 'Priority support',
  teamView: 'Team View',
  boardExport: 'Board export',
  ganttExport: 'Gantt export',
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value)
}

/**
 * The ladder, as a number.
 *
 * `PLAN_IDS` is already written in ascending order of what a tier includes, and
 * `plans.constants.test.ts` asserts that order, so the rank is derived from it
 * rather than written out a second time — a second copy is the duplicated-list
 * defect and this audit has found four of them.
 */
export const PLAN_RANK: Record<PlanId, number> = Object.fromEntries(
  PLAN_IDS.map((id, i) => [id, i]),
) as Record<PlanId, number>

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
export function planIncludes(planId: PlanId, minimum: PlanId): boolean {
  return PLAN_RANK[planId] >= PLAN_RANK[minimum]
}

/** Optional per-workspace override stored in `workspaces.plan_limits`. */
export type PlanLimitsOverride = {
  maxMembers?: number | null
  maxProjects?: number | null
  aiCreditsPerMember?: number | null
  features?: Partial<Record<PlanFeature, boolean>>
}

export type ResolvedPlan = {
  id: PlanId
  label: string
  description: string
  /** Free-trial length in days for this tier (0 = no trial). */
  trialDays: number
  limits: PlanLimits
  features: Record<PlanFeature, boolean>
  /**
   * Whether `id` came from a plan value this build knows, or from the fail-open
   * default below. See `resolvePlanConfig` — without this a caller cannot tell
   * "enterprise because the row says enterprise" from "enterprise because the
   * row said something nobody recognises", and those are very different facts.
   */
  recognized: boolean
}

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
export function resolvePlanConfig(planId: string | null | undefined, override?: PlanLimitsOverride | null): ResolvedPlan {
  const recognized = isPlanId(planId)
  const tier = PLAN_TIERS[isPlanId(planId) ? planId : 'enterprise']
  const limits: PlanLimits = {
    maxMembers: override?.maxMembers !== undefined ? override.maxMembers : tier.limits.maxMembers,
    maxProjects: override?.maxProjects !== undefined ? override.maxProjects : tier.limits.maxProjects,
    aiCreditsPerMember:
      override?.aiCreditsPerMember !== undefined ? override.aiCreditsPerMember : tier.limits.aiCreditsPerMember,
  }
  const features: Record<PlanFeature, boolean> = { ...tier.features, ...(override?.features ?? {}) }
  return {
    id: tier.id,
    label: tier.label,
    description: tier.description,
    trialDays: tier.trialDays,
    limits,
    features,
    recognized,
  }
}

/**
 * Free-trial length in days for a plan tier (Plan §14.1). 0 means "no trial".
 * Used by BillingService to decide whether to pass Stripe Checkout a
 * `trial_period_days`. An unknown plan id fails safe to the enterprise value
 * (0 = no trial), matching resolvePlanConfig's fail-open default tier.
 */
export function trialDaysForPlan(planId: string | null | undefined): number {
  return PLAN_TIERS[isPlanId(planId) ? planId : 'enterprise'].trialDays
}

/** A compact, serializable catalog for the UI (plan picker, marketing table). */
export function planCatalog(): PlanTier[] {
  return PLAN_IDS.map((id) => PLAN_TIERS[id])
}
