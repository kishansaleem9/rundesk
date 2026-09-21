/**
 * §V2-S17/S22 frames `16:32` and `21:15` — THE STARTER CARDS, AND THE FACT THAT
 * THEY ARE NOT THE SAME FOUR CARDS.
 *
 * At `16:32` the hub offers **Project Status** *(Summarize all current tasks)* ·
 * **Generate Brief** *(Draft new project outline)* · **Daily Plan** *(Organize
 * your daily schedule)* · **Task Ideas** *(Brainstorm project task ideas)*.
 *
 * At `21:15`, the same surface in the same session offers **Task Summary**
 * *(Summarize task progress)* · **Generate Plan** *(Draft project action
 * items)* · **Find Blockers** *(Search overdue tasks)* · **New Task** *(Create
 * new task)*.
 *
 * Four cards both times, a title and one line both times, and not one card in
 * common. The ledger row is "Contextual starter cards that CHANGE with
 * context", and the change is the whole row: a fixed list of four prompts that
 * happens to be worded like the frame's second set would photograph correctly
 * and be exactly the facade this audit exists to catch.
 *
 * WHAT RUNDESK HAD. `ai-panel.tsx` held `SUGGESTED_PROMPT_KEYS` — five
 * translation keys in a `const` array, rendered whenever `messages.length ===
 * 0`, identical in every workspace, on every surface, for every person, for
 * ever. It could not have changed; there was no input to change it with.
 *
 * WHAT DECIDES THE SET HERE. Real facts about the caller, read from Postgres
 * per request: how many of their tasks are overdue right now, how many are open,
 * how much open work the workspace has, and which surface asked. **Find
 * Blockers** is in the set when there is something to find and out of it when
 * there is not — which is also why `because` exists: every card carries the
 * fact and the NUMBER that put it there, so "the cards changed" can be checked
 * against "and here is what changed them". A card whose `because` is `always`
 * is honest about being a floor, not evidence of context.
 *
 * PURE, AND KEYS RATHER THAN SENTENCES. No I/O, so the selection is unit
 * testable outright; and the card carries translation keys because this is read
 * by a person in four locales and an English sentence baked into the API would
 * arrive untranslated in three of them — the same reason `UnroutableProvider`
 * carries a `reasonKey`.
 */

/**
 * Where the panel was opened from. The surface is context too, and cheap.
 *
 * TWO, NOT THREE. A `task` surface was drafted and removed: the panel is given
 * `describeCurrentView(routeId)`, a task opens as a sheet over the list route
 * rather than as a route of its own, and nothing in the shell could ever have
 * produced it. A third surface the server accepts and no caller can send is a
 * branch that exists only in this file — the mirror defect, one layer up from
 * a column nobody reads.
 */
export type StarterSurface = 'workspace' | 'list'

export function isStarterSurface(value: unknown): value is StarterSurface {
  return value === 'workspace' || value === 'list'
}

/**
 * What the server knows about this caller, here, now.
 *
 * Counts rather than titles: the card set is a routing decision, and shipping
 * task titles to pick four buttons would be a privacy surface for no gain.
 */
export type StarterFacts = {
  surface: StarterSurface
  /** The caller's own assigned, unfinished tasks whose due date has passed. */
  overdue: number
  /** The caller's own assigned, unfinished tasks. */
  assignedOpen: number
  /** Unfinished tasks anywhere in this workspace the caller can see. */
  workspaceOpen: number
}

export type StarterCard = {
  /** Stable across locales and releases; what a check and a metric address. */
  id: string
  titleKey: string
  subtitleKey: string
  /** The message that is actually sent when the card is pressed. */
  promptKey: string
  /**
   * The fact that selected this card, with its number — `overdue:3`,
   * `surface:list`, or `always` for one of the floor cards.
   *
   * This is the anti-facade field. Without it, "the set changed" is only
   * observable as two different lists of ids, and a set that rotated on a
   * timer would look identical. With it, the change names its cause.
   */
  because: string
}

/** The frame draws four. Four is the contract, not an upper bound. */
export const STARTER_CARD_COUNT = 4

/**
 * When "overdue" starts, for every reader in this module's family.
 *
 * ONE DEFINITION, because there were nearly two: the starter facts and the
 * assignee evidence both count late work, and the first drafts used midnight
 * here and `new Date()` there. A due date is a DAY in this product, so a task
 * due today is not overdue at one minute past midnight — and two counts of
 * "how much of your work is late" that disagree by a day is the duplicated-list
 * defect at its most deniable, because both numbers look plausible.
 */
export function overdueBefore(now: Date = new Date()): Date {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return start
}

type Candidate = {
  card: Omit<StarterCard, 'because'>
  /** `null` means "not for these facts"; a string is the reason it was picked. */
  when: (f: StarterFacts) => string | null
}

/**
 * The catalogue, MOST SPECIFIC FIRST.
 *
 * Order is the selection rule: take the first four whose `when` answers. The
 * four unconditional cards at the end are the floor, so a brand-new workspace
 * with no tasks at all still gets four somewhere to start — an empty row of
 * starter cards is the one state the frame never shows.
 */
const STARTER_CATALOGUE: Candidate[] = [
  {
    // `21:15` "Find Blockers — Search overdue tasks". Offered when there ARE
    // overdue tasks; a card promising to find blockers on a clean board finds
    // nothing and teaches people the cards are decoration.
    card: {
      id: 'findBlockers',
      titleKey: 'aiStarters.findBlockers',
      subtitleKey: 'aiStarters.findBlockersSub',
      promptKey: 'aiStarters.findBlockersPrompt',
    },
    when: (f) => (f.overdue > 0 ? `overdue:${f.overdue}` : null),
  },
  {
    // This list, specifically — the surface knows which one.
    card: {
      id: 'listSummary',
      titleKey: 'aiStarters.listSummary',
      subtitleKey: 'aiStarters.listSummarySub',
      promptKey: 'aiStarters.listSummaryPrompt',
    },
    when: (f) => (f.surface === 'list' ? 'surface:list' : null),
  },
  {
    // `16:32` "Daily Plan — Organize your daily schedule". Only means anything
    // when there is a day's worth of your own work to organise.
    card: {
      id: 'dailyPlan',
      titleKey: 'aiStarters.dailyPlan',
      subtitleKey: 'aiStarters.dailyPlanSub',
      promptKey: 'aiStarters.dailyPlanPrompt',
    },
    when: (f) => (f.assignedOpen > 0 ? `assigned:${f.assignedOpen}` : null),
  },
  {
    // `21:15` "Task Summary — Summarize task progress".
    card: {
      id: 'taskSummary',
      titleKey: 'aiStarters.taskSummary',
      subtitleKey: 'aiStarters.taskSummarySub',
      promptKey: 'aiStarters.taskSummaryPrompt',
    },
    when: (f) => (f.workspaceOpen > 0 ? `open:${f.workspaceOpen}` : null),
  },
  // ── The floor. Four, so four can always be returned. ──────────────────────
  {
    // `16:32` "Project Status — Summarize all current tasks".
    card: {
      id: 'projectStatus',
      titleKey: 'aiStarters.projectStatus',
      subtitleKey: 'aiStarters.projectStatusSub',
      promptKey: 'aiStarters.projectStatusPrompt',
    },
    when: () => 'always',
  },
  {
    // `16:32` "Generate Brief" / `21:15` "Generate Plan" — the same slot.
    card: {
      id: 'generateBrief',
      titleKey: 'aiStarters.generateBrief',
      subtitleKey: 'aiStarters.generateBriefSub',
      promptKey: 'aiStarters.generateBriefPrompt',
    },
    when: () => 'always',
  },
  {
    // `21:15` "New Task — Create new task".
    card: {
      id: 'newTask',
      titleKey: 'aiStarters.newTask',
      subtitleKey: 'aiStarters.newTaskSub',
      promptKey: 'aiStarters.newTaskPrompt',
    },
    when: () => 'always',
  },
  {
    // `16:32` "Task Ideas — Brainstorm project task ideas".
    card: {
      id: 'taskIdeas',
      titleKey: 'aiStarters.taskIdeas',
      subtitleKey: 'aiStarters.taskIdeasSub',
      promptKey: 'aiStarters.taskIdeasPrompt',
    },
    when: () => 'always',
  },
]

/**
 * The four cards these facts earn.
 *
 * Deterministic: the same facts give the same four in the same order, because
 * a starter row that reshuffled between renders would be unusable and would
 * also make "the set changed" meaningless as evidence.
 */
export function starterCards(facts: StarterFacts): StarterCard[] {
  const out: StarterCard[] = []
  for (const candidate of STARTER_CATALOGUE) {
    if (out.length >= STARTER_CARD_COUNT) break
    const because = candidate.when(facts)
    if (because === null) continue
    out.push({ ...candidate.card, because })
  }
  return out
}

/**
 * How many of the returned cards are there because of something real.
 *
 * Separated out because it is the number worth watching: a set that is four
 * floor cards is a set that context did nothing to, and the surface should be
 * able to say so rather than implying otherwise by drawing the same four.
 */
export function contextualCardCount(cards: StarterCard[]): number {
  return cards.filter((c) => c.because !== 'always').length
}
