import type { StatusCategory } from '@rundesk/db'
import { PLAN_TIERS, planIncludes, type PlanId } from '../plans/plans.constants'

/**
 * §V2-06 — "Define your workflow", frame `07:06`.
 *
 * "Choose a pre-configured solution or customize to your liking with advanced
 * ClickApps, required views, and task statuses." Four cards, each expanding
 * into **Default views**, **Task statuses** and **ClickApps** — and, per
 * `[07:46]`, each SEEDING THE SPACE'S FIRST LIST: "yeh LIST automatically
 * generate kar deta hai ClickUp … us base pe jo aap ne ooper di ho, ke haan
 * mujhe marketing purpose ke liye chahiye."
 *
 * That last part is why the purpose question is worth asking at all. A wizard
 * that collects an answer and then drops you into an empty space has asked you
 * a question for nothing.
 *
 * WHAT IS READ FROM THE FRAME AND WHAT IS OURS.
 *
 * The four names, their one-line descriptions, and Starter's status pipeline
 * (`TO DO → IN PROGRESS → COMPLETE`) are on screen. The video never opens the
 * other three, so their statuses, views, features and seeded lists are
 * Rundesk's choice — made to be defensible for the domain each card names,
 * not to guess at ClickUp's contents.
 *
 * Served to the web from `GET /spaces/presets` rather than duplicated there:
 * the wizard then previews exactly what the server will apply, and the two
 * cannot drift into disagreeing about what "Marketing Teams" means.
 */

/**
 * The list views, ClickUp's eleven (frame `07:10`, "Default settings for views"):
 * each one a tab a list draws (`commit-log/log-68bc188-1`, `ledger-rows/row-777`).
 */
export const SPACE_VIEW_KEYS = ['list', 'board', 'table', 'calendar', 'gantt', 'team', 'activity', 'workload', 'timeline', 'mindmap', 'map'] as const
export type SpaceViewKey = (typeof SPACE_VIEW_KEYS)[number]

/**
 * The views a space shows when it has chosen none: the six it always showed.
 * The other five are a space's to turn on, in its wizard or its Views settings,
 * so no space already in use wakes to eleven tabs.
 */
export const DEFAULT_SPACE_VIEWS: readonly SpaceViewKey[] = ['list', 'board', 'table', 'calendar', 'gantt', 'team']

/**
 * The per-space feature switches — ClickApps, frame `07:19`.
 *
 * Every key here is a feature Rundesk has AND that something reads. That
 * second half is the rule: a switch whose value nothing consults is the facade
 * this codebase has spent two videos removing.
 *
 * So Time Tracking, Time Estimates and Multiple Assignees are NOT here, even
 * though Rundesk has all three. They live on the task detail sheet, which does
 * not know which space its task belongs to — threading that through is its own
 * change, and until it is done those three switches would toggle a column
 * nobody reads. ClickUp's Remap Subtask Due Dates and Incomplete Warning are
 * absent for the simpler reason that Rundesk has nothing to switch.
 *
 * `label` is not translated here on purpose — the web owns the wording, and a
 * server-side English string leaking into an Urdu UI is the bug that pattern
 * exists to avoid. The key is the contract.
 */
export const SPACE_FEATURE_KEYS = [
  'priority',
  'tags',
  'customFields',
  'milestones',
  'wipLimits',
  'listEmail',
] as const
export type SpaceFeatureKey = (typeof SPACE_FEATURE_KEYS)[number]

/**
 * §V2-06 `[07:20]` — which plan a ClickApp needs.
 *
 * > "ClickUp Apps is also dependent on that — ke aap ke paas PACKAGE PLAN
 * > kaun sa hai." `[07:24]` "[Free] mein of course apna option LIMITED hota
 * > hai, lekin agar aap jaate ho [premium ki taraf]…"
 *
 * The frame never opens the ClickApps panel, so the SET is not readable from
 * the pixels — the transcript is the whole requirement, and what it requires is
 * a LADDER: free sees fewer switches than paid. So this is a minimum TIER per
 * ClickApp, not a boolean, and not a feature flag.
 *
 * WHY NOT A FEATURE FLAG. Gating here was by `packages/feature-flags` and never
 * by plan, which is a different question answered by the same switch: a flag
 * says "is this built and turned on", a plan says "has this customer paid for
 * it". A flag is global/workspace/role/user scoped and is an operator's tool;
 * it cannot express "Pro and above". Both still apply — a ClickApp needs its
 * flag on AND the plan to reach it.
 *
 * WHERE THE LINE IS. The two that every task already shows in every product —
 * Priority and Tags — stay free, because taking them away from an existing free
 * workspace is an outage dressed as a gate. Custom Fields and Milestones are
 * the ones a team starts wanting when it starts planning, so Pro. WIP limits
 * and Email-to-List are operational plumbing for a bigger org, so Business.
 *
 * Typed as `Record<SpaceFeatureKey, PlanId>`: a ClickApp added above without a
 * tier here does not compile, and a tier written for a key that is not a
 * ClickApp does not compile either.
 */
export const CLICK_APP_MIN_PLAN: Record<SpaceFeatureKey, PlanId> = {
  priority: 'free',
  tags: 'free',
  customFields: 'pro',
  milestones: 'pro',
  wipLimits: 'business',
  listEmail: 'business',
}

/** The ClickApps a workspace on `planId` may switch on. */
export function clickAppsForPlan(planId: PlanId): SpaceFeatureKey[] {
  return SPACE_FEATURE_KEYS.filter((key) => planIncludes(planId, CLICK_APP_MIN_PLAN[key]))
}

/** The ones it may not — with the tier that would unlock each, for the UI. */
export function lockedClickApps(planId: PlanId): Array<{ key: SpaceFeatureKey; requiresPlan: PlanId; requiresLabel: string }> {
  return SPACE_FEATURE_KEYS.filter((key) => !planIncludes(planId, CLICK_APP_MIN_PLAN[key])).map((key) => ({
    key,
    requiresPlan: CLICK_APP_MIN_PLAN[key],
    requiresLabel: PLAN_TIERS[CLICK_APP_MIN_PLAN[key]].label,
  }))
}

/**
 * Does this plan withhold ANY ClickApp?
 *
 * Read sites use this to stay a no-op on the tiers that withhold nothing —
 * business and enterprise — so a workspace that is not being gated is served
 * exactly the rows it was served before. `enterprise` is the default for every
 * existing workspace (§14.1), which is why this matters more than it looks.
 */
export function planRestrictsClickApps(planId: PlanId): boolean {
  return SPACE_FEATURE_KEYS.some((key) => !planIncludes(planId, CLICK_APP_MIN_PLAN[key]))
}

export type PresetStatus = { key: string; name: string; color: string; category: StatusCategory }

export type SpacePreset = {
  key: string
  /** Wording lives in the web catalogue; this is the stable identifier. */
  views: SpaceViewKey[]
  defaultView: SpaceViewKey
  statuses: PresetStatus[]
  features: SpaceFeatureKey[]
  /** `[07:46]` — the list the space is created with, so it is not empty. */
  seedLists: string[]
}

/** Frame `07:06`, verbatim: `TO DO → IN PROGRESS → COMPLETE`. */
const STARTER_STATUSES: PresetStatus[] = [
  { key: 'todo', name: 'To do', color: '#94a3b8', category: 'open' },
  { key: 'in_progress', name: 'In progress', color: '#3b82f6', category: 'in_progress' },
  { key: 'complete', name: 'Complete', color: '#22c55e', category: 'closed' },
]

/** The other three are ours, and each adds the one stage its domain lives on. */
const REVIEW_STATUSES: PresetStatus[] = [
  { key: 'todo', name: 'To do', color: '#94a3b8', category: 'open' },
  { key: 'in_progress', name: 'In progress', color: '#3b82f6', category: 'in_progress' },
  { key: 'in_review', name: 'In review', color: '#a855f7', category: 'in_progress' },
  { key: 'complete', name: 'Complete', color: '#22c55e', category: 'closed' },
]

const DELIVERY_STATUSES: PresetStatus[] = [
  { key: 'backlog', name: 'Backlog', color: '#94a3b8', category: 'open' },
  { key: 'todo', name: 'To do', color: '#64748b', category: 'open' },
  { key: 'in_progress', name: 'In progress', color: '#3b82f6', category: 'in_progress' },
  { key: 'blocked', name: 'Blocked', color: '#ef4444', category: 'in_progress' },
  { key: 'complete', name: 'Complete', color: '#22c55e', category: 'closed' },
]

export const SPACE_PRESETS: SpacePreset[] = [
  {
    key: 'starter',
    views: ['list', 'board'],
    defaultView: 'list',
    statuses: STARTER_STATUSES,
    features: ['priority', 'tags'],
    seedLists: ['Tasks'],
  },
  {
    key: 'marketing',
    views: ['list', 'board', 'calendar'],
    defaultView: 'board',
    statuses: REVIEW_STATUSES,
    features: ['priority', 'tags', 'customFields', 'listEmail'],
    // A campaign space with one list called "Tasks" would have learned nothing
    // from the question it just asked.
    seedLists: ['Campaigns', 'Content calendar'],
  },
  {
    key: 'project',
    views: ['list', 'board', 'gantt', 'calendar'],
    defaultView: 'list',
    statuses: DELIVERY_STATUSES,
    features: ['priority', 'tags', 'customFields', 'milestones'],
    seedLists: ['Project plan', 'Milestones'],
  },
  {
    key: 'product',
    views: ['list', 'board', 'table'],
    defaultView: 'board',
    statuses: DELIVERY_STATUSES,
    features: ['priority', 'tags', 'customFields', 'wipLimits', 'milestones'],
    seedLists: ['Roadmap', 'Bugs'],
  },
]

export function findPreset(key: string | undefined | null): SpacePreset | null {
  if (!key) return null
  return SPACE_PRESETS.find((p) => p.key === key) ?? null
}

/**
 * A feature map with every key present, so a reader never has to distinguish
 * "off" from "this space predates the switch". Absent keys default to ON,
 * which is what every existing space already does.
 */
export function featureMap(enabled: readonly string[] | null | undefined): Record<SpaceFeatureKey, boolean> {
  const out = {} as Record<SpaceFeatureKey, boolean>
  for (const key of SPACE_FEATURE_KEYS) out[key] = enabled ? enabled.includes(key) : true
  return out
}

/**
 * What a space's ClickApps ACTUALLY are, once the plan has had its say.
 *
 * The stored map is what someone chose; this is what they get. A space made on
 * enterprise with Custom Fields on, in a workspace that later drops to free,
 * must stop showing custom fields — otherwise the gate only ever applies at the
 * moment of choosing, which is not a gate, it is a form validator.
 *
 * `stored === null` means "made before the column existed", which reads as
 * every switch ON — so the plan's set is exactly the answer there.
 */
export function effectiveFeatures(
  stored: Record<string, boolean> | null | undefined,
  planId: PlanId,
): Record<SpaceFeatureKey, boolean> {
  const out = {} as Record<SpaceFeatureKey, boolean>
  for (const key of SPACE_FEATURE_KEYS) {
    const chosen = stored ? stored[key] !== false : true
    out[key] = chosen && planIncludes(planId, CLICK_APP_MIN_PLAN[key])
  }
  return out
}
