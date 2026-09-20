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
    subtasks: boolean;
    checklists: boolean;
    assignedComments: boolean;
};
export type ProgressConfig = {
    sources: ProgressSources;
    /** The frame's second setting: 100% for a done task with nothing to count. */
    doneStatusIs100: boolean;
};
/** One source's tally. `done` is however that source expresses completion —
 *  a closed subtask, a ticked checklist item, a resolved assigned comment. */
export type Tally = {
    total: number;
    done: number;
};
export type ProgressInputs = {
    subtasks: Tally;
    checklists: Tally;
    assignedComments: Tally;
};
export declare const DEFAULT_PROGRESS_CONFIG: ProgressConfig;
/**
 * The percentage, or null when there is nothing honest to say.
 *
 * NULL RATHER THAN ZERO when no enabled source has any items. Zero percent is a
 * claim — "none of this work is done" — and on a task with no subtasks, no
 * checklist and no assigned comments there is no work to make that claim about.
 * The one exception is the setting the frame names: a task in a done status
 * with nothing to count reads 100%, because it is finished.
 */
export declare function computeProgress(config: ProgressConfig, inputs: ProgressInputs, taskIsDone: boolean): number | null;
/** Read a stored config back, filling in anything a hand-written row omitted. */
export declare function toProgressConfig(raw: unknown): ProgressConfig;
