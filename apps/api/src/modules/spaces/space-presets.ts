import type { StatusCategory } from '@rundesk/db'

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

/** The list views Rundesk can actually render. Not ClickUp's eleven. */
export const SPACE_VIEW_KEYS = ['list', 'board', 'table', 'calendar', 'gantt', 'team'] as const
export type SpaceViewKey = (typeof SPACE_VIEW_KEYS)[number]

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
