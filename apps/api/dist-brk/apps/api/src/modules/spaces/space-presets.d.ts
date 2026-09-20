import type { StatusCategory } from '@rundesk/db';
import { type PlanId } from '../plans/plans.constants';
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
export declare const SPACE_VIEW_KEYS: readonly ["list", "board", "table", "calendar", "gantt", "team"];
export type SpaceViewKey = (typeof SPACE_VIEW_KEYS)[number];
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
export declare const SPACE_FEATURE_KEYS: readonly ["priority", "tags", "customFields", "milestones", "wipLimits", "listEmail"];
export type SpaceFeatureKey = (typeof SPACE_FEATURE_KEYS)[number];
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
export declare const CLICK_APP_MIN_PLAN: Record<SpaceFeatureKey, PlanId>;
/** The ClickApps a workspace on `planId` may switch on. */
export declare function clickAppsForPlan(planId: PlanId): SpaceFeatureKey[];
/** The ones it may not — with the tier that would unlock each, for the UI. */
export declare function lockedClickApps(planId: PlanId): Array<{
    key: SpaceFeatureKey;
    requiresPlan: PlanId;
    requiresLabel: string;
}>;
/**
 * Does this plan withhold ANY ClickApp?
 *
 * Read sites use this to stay a no-op on the tiers that withhold nothing —
 * business and enterprise — so a workspace that is not being gated is served
 * exactly the rows it was served before. `enterprise` is the default for every
 * existing workspace (§14.1), which is why this matters more than it looks.
 */
export declare function planRestrictsClickApps(planId: PlanId): boolean;
export type PresetStatus = {
    key: string;
    name: string;
    color: string;
    category: StatusCategory;
};
export type SpacePreset = {
    key: string;
    /** Wording lives in the web catalogue; this is the stable identifier. */
    views: SpaceViewKey[];
    defaultView: SpaceViewKey;
    statuses: PresetStatus[];
    features: SpaceFeatureKey[];
    /** `[07:46]` — the list the space is created with, so it is not empty. */
    seedLists: string[];
};
export declare const SPACE_PRESETS: SpacePreset[];
export declare function findPreset(key: string | undefined | null): SpacePreset | null;
/**
 * A feature map with every key present, so a reader never has to distinguish
 * "off" from "this space predates the switch". Absent keys default to ON,
 * which is what every existing space already does.
 */
export declare function featureMap(enabled: readonly string[] | null | undefined): Record<SpaceFeatureKey, boolean>;
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
export declare function effectiveFeatures(stored: Record<string, boolean> | null | undefined, planId: PlanId): Record<SpaceFeatureKey, boolean>;
