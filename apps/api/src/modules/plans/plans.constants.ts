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
] as const
export type PlanFeature = (typeof PLAN_FEATURES)[number]

/** `null` means unlimited. */
export type PlanLimits = {
  maxMembers: number | null
  maxProjects: number | null
}

export type PlanTier = {
  id: PlanId
  label: string
  /** Human-blurb for the UI. */
  description: string
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
}

export const PLAN_TIERS: Record<PlanId, PlanTier> = {
  free: {
    id: 'free',
    label: 'Free',
    description: 'For individuals getting started. Up to 5 members and 3 projects.',
    limits: { maxMembers: 5, maxProjects: 3 },
    features: { ...ALL_FEATURES_OFF },
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    description: 'For growing teams. AI, automations, webhooks, guests and integrations.',
    limits: { maxMembers: 25, maxProjects: 50 },
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
    limits: { maxMembers: 100, maxProjects: 500 },
    features: {
      ...ALL_FEATURES_ON,
      prioritySupport: false,
    },
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    description: 'Unlimited members and projects, every feature, priority support.',
    limits: { maxMembers: null, maxProjects: null },
    features: { ...ALL_FEATURES_ON },
  },
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value)
}

/** Optional per-workspace override stored in `workspaces.plan_limits`. */
export type PlanLimitsOverride = {
  maxMembers?: number | null
  maxProjects?: number | null
  features?: Partial<Record<PlanFeature, boolean>>
}

export type ResolvedPlan = {
  id: PlanId
  label: string
  description: string
  limits: PlanLimits
  features: Record<PlanFeature, boolean>
}

/**
 * Resolve the effective plan config for a stored `plan` value + optional override.
 *
 * An UNKNOWN/garbage plan id resolves to `enterprise` — a fail-open default so a
 * bad value can never accidentally restrict a workspace (reinforces the "gating
 * never restricts current behavior" guarantee). The override may widen or narrow
 * the tier's numeric limits and toggle individual features.
 */
export function resolvePlanConfig(planId: string | null | undefined, override?: PlanLimitsOverride | null): ResolvedPlan {
  const tier = PLAN_TIERS[isPlanId(planId) ? planId : 'enterprise']
  const limits: PlanLimits = {
    maxMembers: override?.maxMembers !== undefined ? override.maxMembers : tier.limits.maxMembers,
    maxProjects: override?.maxProjects !== undefined ? override.maxProjects : tier.limits.maxProjects,
  }
  const features: Record<PlanFeature, boolean> = { ...tier.features, ...(override?.features ?? {}) }
  return { id: tier.id, label: tier.label, description: tier.description, limits, features }
}

/** A compact, serializable catalog for the UI (plan picker, marketing table). */
export function planCatalog(): PlanTier[] {
  return PLAN_IDS.map((id) => PLAN_TIERS[id])
}
