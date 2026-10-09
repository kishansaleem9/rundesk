/**
 * §V2-11 — "Actions completed", frames `18:53` / `18:56` / `18:59`.
 *
 * WHAT THE FRAME DRAWS. Under **Time Saved** and **Human Cost Savings** sits a
 * heading, *Actions completed*, over a grid of eight tiles in two rows of four:
 *
 *   Tasks created or updated · Docs created or updated · Images generated ·
 *   Comments or chats sent · Summaries or updates generated ·
 *   Assets searched or loaded · External app actions · External app searches
 *
 * A third row begins below the fold and the video never scrolls to it; eight is
 * what the frames actually show and eight is what is built.
 *
 * WHAT RUNDESK HAD. `usageSummary` grouped on the RAW `ai_usage.feature`
 * string — twenty-four values like `chat.title` and `contribution.narrative` —
 * so the panel listed twenty-four internal identifiers where the frame shows
 * eight readable buckets. Nothing was wrong with the numbers; there was simply
 * no taxonomy, and every caller that wanted one would have had to invent its
 * own. That is how the same list ends up written out in three places and two
 * of them drift.
 *
 * SO THE GROUPING LIVES HERE, SERVER-SIDE, ONCE. The panel renders what it is
 * given. A second reader — a report, an export, the usage tab — gets the same
 * buckets by construction rather than by everybody agreeing to be careful.
 *
 * ── THE WORD "ACTIONS", WHICH IS NOT A DETAIL ──────────────────────────────
 *
 * `ai-value.ts` and `ai-value-panel.tsx` both carry a comment refusing it:
 * one row in `ai_usage` is ONE CALL TO THE MODEL, a single thing a person did
 * can be several calls, so counting runs and calling them "actions" inflates
 * every figure on the page in a way nobody can see from the screen.
 *
 * That reason is still true — `recordUsage` still fires once per
 * `messages.create` — so it is honoured rather than overridden. What the frame
 * is actually asking for is the GROUPING, and the grouping is what is built.
 * The unit stays a run: the API returns `runs`, the tiles are labelled with the
 * frame's category names and counted in runs, and no string anywhere renames
 * one to the other.
 *
 * ── TWO CATEGORIES RUNDESK CANNOT FILL, SAID OUT LOUD ──────────────────────
 *
 * `externalActions` and `externalSearches` have no contributing feature and
 * no code path that could produce one: every tool in `COMMAND_TOOLS` acts on this
 * product's own rows — §V2-S16 added `create_list` / `create_folder` to it and
 * neither reaches a connected app, so the reason below is re-checked rather
 * than assumed and still holds. A tile that can only ever render 0 is
 * indistinguishable from a true zero on screen — this audit's "confident zero"
 * — so those two carry `supported: false` and the surface prints the reason
 * instead of a number. A count of zero is a fact about your workspace; "not
 * available" is a fact about the product, and they must not look the same.
 */

/** The eight buckets frames `18:53`–`18:59` show, in the order they are drawn. */
export const AI_CATEGORIES = [
  'tasks',
  'docs',
  'images',
  'comments',
  'summaries',
  'assets',
  'externalActions',
  'externalSearches',
] as const

export type AiCategory = (typeof AI_CATEGORIES)[number]

/**
 * The categories no feature can contribute to, with why.
 *
 * `reasonKey` rather than a sentence, because this is shown to a person in four
 * locales and an English string returned by the API appears untranslated in
 * three of them.
 */
export const UNSUPPORTED_CATEGORIES: Readonly<Record<string, string>> = {
  externalActions: 'aiValue.reasonNoConnectedAppActions',
  externalSearches: 'aiValue.reasonNoConnectedAppSearch',
}

export function isSupportedCategory(c: AiCategory): boolean {
  return !(c in UNSUPPORTED_CATEGORIES)
}

/**
 * Every `feature` string any call site passes to `complete()` / `recordUsage`,
 * mapped to exactly one category.
 *
 * EXHAUSTIVE ON PURPOSE, and `ai-categories.test.ts` re-derives the list from
 * the source to prove it stays that way. A feature added later and forgotten
 * here would not break anything visibly — its runs would land in `other` and
 * the totals would still add up — which is precisely why it needs a test
 * rather than a convention.
 *
 * The judgement calls, so the next reader can disagree with the reasoning
 * rather than guess at it:
 *
 *   · `command` is the tool-calling path, and every one of its six tools
 *     (`create_task`, `set_task_status`, `reschedule_task`, `assign_task`,
 *     `bulk_reschedule`, `search_tasks`) acts on tasks — so it is `tasks`, not
 *     a category of its own.
 *   · `workload.balance` and `automation.suggest` propose changes to tasks and
 *     to the rules that move tasks; they are `tasks` for the same reason.
 *   · `meeting.notes` and `meeting.transcript` produce a written artefact that
 *     is filed as a doc, so they are `docs` rather than `summaries`. A
 *     transcript is a record, not a précis.
 *   · `knowledge.answer`, `help.answer`, `meetings.ask` and `skill.mine` all
 *     RETRIEVE from workspace content before answering — that is the frame's
 *     "Assets searched or loaded".
 *   · `insights`, `project.sentiment`, `people.standup`,
 *     `contribution.narrative`, `daily.briefing`, `summarize` and
 *     `dashboard.layout` each render existing work back as a summary or an
 *     update, which is the frame's fifth tile.
 */
export const FEATURE_CATEGORY: Readonly<Record<string, AiCategory>> = {
  // Tasks created or updated
  'command':                'tasks',
  'task.generate':          'tasks',
  'task.suggest':           'tasks',
  'task.priority':          'tasks',
  'task.deadline':          'tasks',
  'workload.balance':       'tasks',
  'automation.suggest':     'tasks',

  // Images generated — `image-generation.ts` (`ledger-rows/row-870`)
  'image.generate':         'images',

  // Docs created or updated
  'writing.improve':        'docs',
  'meeting.notes':          'docs',
  'meeting.transcript':     'docs',
  'skill.propose':          'docs',

  // Comments or chats sent
  'chat.mention':           'comments',
  'comment.reply':          'comments',
  'chat.title':             'comments',
  'chat':                   'comments',

  // Summaries or updates generated
  'summarize':              'summaries',
  'insights':               'summaries',
  'daily.briefing':         'summaries',
  'people.standup':         'summaries',
  'project.sentiment':      'summaries',
  'contribution.narrative': 'summaries',
  'dashboard.layout':       'summaries',

  // Assets searched or loaded
  'knowledge.answer':       'assets',
  'help.answer':            'assets',
  'meetings.ask':           'assets',
  'skill.mine':             'assets',
}

/**
 * Which bucket a raw feature string belongs to.
 *
 * An unknown feature returns null rather than being folded into a plausible
 * neighbour. Folding it would make a forgotten mapping invisible; returning
 * null lets the caller put it somewhere labelled, and lets the test catch it.
 */
export function categoryOf(feature: string): AiCategory | null {
  // An own-property check, not a bare lookup: `FEATURE_CATEGORY['toString']`
  // finds `Object.prototype.toString` and `?? null` does not save you from it.
  // (`Object.hasOwn` would read better; this package's `lib` predates it.)
  return Object.prototype.hasOwnProperty.call(FEATURE_CATEGORY, feature)
    ? FEATURE_CATEGORY[feature]
    : null
}

export type CategoryRollup = {
  category: AiCategory
  /** Runs, not "actions". See the header. */
  runs: number
  costUsd: number
  /** False when no feature in this product can contribute to this bucket. */
  supported: boolean
  /** Translation key explaining why, present only when `supported` is false. */
  reasonKey?: string
  /** The raw feature strings that fed this number, so a total can be broken down. */
  features: string[]
}

/**
 * Roll a per-feature breakdown up into the frame's eight.
 *
 * Returns all eight every time, including the empty and the unsupported ones,
 * in the frame's order. A grid that grows and shrinks with the data cannot be
 * measured, and the absence of a tile reads as the absence of a feature.
 *
 * Features with no mapping are returned SEPARATELY as `unmapped` rather than
 * silently dropped: a run that happened and appears in no tile is a confident
 * zero, and the caller should be able to notice.
 */
export function rollUpByCategory(
  byFeature: Record<string, { calls: number; costUsd: number }>,
): { categories: CategoryRollup[]; unmapped: string[] } {
  const acc = new Map<AiCategory, CategoryRollup>()
  for (const category of AI_CATEGORIES) {
    const supported = isSupportedCategory(category)
    acc.set(category, {
      category,
      runs: 0,
      costUsd: 0,
      supported,
      ...(supported ? {} : { reasonKey: UNSUPPORTED_CATEGORIES[category] }),
      features: [],
    })
  }

  const unmapped: string[] = []
  for (const [feature, row] of Object.entries(byFeature)) {
    const category = categoryOf(feature)
    if (!category) {
      unmapped.push(feature)
      continue
    }
    const bucket = acc.get(category)!
    bucket.runs += row.calls ?? 0
    bucket.costUsd += row.costUsd ?? 0
    bucket.features.push(feature)
  }

  return {
    categories: AI_CATEGORIES.map((c) => {
      const bucket = acc.get(c)!
      return {
        ...bucket,
        costUsd: Math.round(bucket.costUsd * 10000) / 10000,
        features: bucket.features.sort(),
      }
    }),
    unmapped: unmapped.sort(),
  }
}
