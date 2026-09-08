/**
 * §V2-01b — "Progress (Auto)", frame `00:25`.
 *
 * `[00:24]` she creates a field called **Progress**, and the config panel the
 * frame shows is the whole specification:
 *
 *   · **Track completion of** → Subtasks · Checklists · Assigned comments
 *   · **Tasks without active items** → "Display 100% when task is in a done
 *     status"
 *
 * THE VALUE IS DERIVED, NEVER STORED, and that is the point of the word Auto.
 * A percentage written into `custom_field_values` would be correct at the
 * moment it was written and wrong immediately afterwards — tick a checklist
 * item and the stored number would still claim the old figure. So nothing
 * writes it: `getValuesForTask` computes it on read, and `setValue` refuses.
 *
 * The counting lives here, away from the database, because it is the part with
 * edges: which sources are switched on, what happens when none of them has any
 * items, and how a third of the way through gets rounded.
 */

/** Which of the three the field was told to track. */
export type ProgressSources = {
  subtasks: boolean
  checklists: boolean
  assignedComments: boolean
}

export type ProgressConfig = {
  sources: ProgressSources
  /** The frame's second setting: 100% for a done task with nothing to count. */
  doneStatusIs100: boolean
}

/** One source's tally. `done` is however that source expresses completion —
 *  a closed subtask, a ticked checklist item, a resolved assigned comment. */
export type Tally = { total: number; done: number }

export type ProgressInputs = {
  subtasks: Tally
  checklists: Tally
  assignedComments: Tally
}

export const DEFAULT_PROGRESS_CONFIG: ProgressConfig = {
  // All three on, because a Progress field that counts nothing by default
  // reports nothing and looks broken on the day it is created.
  sources: { subtasks: true, checklists: true, assignedComments: true },
  doneStatusIs100: true,
}

/** A tally that cannot be trusted contributes nothing rather than poisoning the sum. */
const clean = (t: Tally | undefined): Tally => {
  const total = Number.isFinite(t?.total) ? Math.max(0, Math.trunc(t!.total)) : 0
  const done = Number.isFinite(t?.done) ? Math.max(0, Math.trunc(t!.done)) : 0
  // More done than exist is a counting bug upstream; believing it would report
  // over 100%, which is worse than believing the total.
  return { total, done: Math.min(done, total) }
}

/**
 * The percentage, or null when there is nothing honest to say.
 *
 * NULL RATHER THAN ZERO when no enabled source has any items. Zero percent is a
 * claim — "none of this work is done" — and on a task with no subtasks, no
 * checklist and no assigned comments there is no work to make that claim about.
 * The one exception is the setting the frame names: a task in a done status
 * with nothing to count reads 100%, because it is finished.
 */
export function computeProgress(
  config: ProgressConfig,
  inputs: ProgressInputs,
  taskIsDone: boolean,
): number | null {
  const enabled: Tally[] = []
  if (config.sources.subtasks) enabled.push(clean(inputs.subtasks))
  if (config.sources.checklists) enabled.push(clean(inputs.checklists))
  if (config.sources.assignedComments) enabled.push(clean(inputs.assignedComments))

  const total = enabled.reduce((n, t) => n + t.total, 0)
  const done = enabled.reduce((n, t) => n + t.done, 0)

  if (total === 0) return config.doneStatusIs100 && taskIsDone ? 100 : null

  /*
   * EVERY ITEM COUNTS THE SAME, whichever source it came from. The alternative
   * — averaging the three percentages — lets one checklist item outweigh
   * fifteen subtasks, which is not what "track completion of" means to anyone
   * reading the number.
   */
  return Math.round((done / total) * 100)
}

/** Read a stored config back, filling in anything a hand-written row omitted. */
export function toProgressConfig(raw: unknown): ProgressConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_PROGRESS_CONFIG
  const r = raw as Partial<ProgressConfig>
  const s = (r.sources ?? {}) as Partial<ProgressSources>
  return {
    sources: {
      subtasks: s.subtasks !== false,
      checklists: s.checklists !== false,
      assignedComments: s.assignedComments !== false,
    },
    doneStatusIs100: r.doneStatusIs100 !== false,
  }
}
