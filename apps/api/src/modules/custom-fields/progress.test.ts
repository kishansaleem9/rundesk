import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  computeProgress,
  toProgressConfig,
  DEFAULT_PROGRESS_CONFIG,
  type ProgressConfig,
  type ProgressInputs,
} from './progress'

/**
 * §V2-01b — the field she actually demonstrates, frame `00:25`.
 *
 * These checks are about the two ways a derived percentage goes wrong: counting
 * the wrong things, and claiming a number when it has nothing to count.
 */

const none: ProgressInputs = {
  subtasks: { total: 0, done: 0 },
  checklists: { total: 0, done: 0 },
  assignedComments: { total: 0, done: 0 },
}
const cfg = (over: Partial<ProgressConfig> = {}): ProgressConfig => ({
  ...DEFAULT_PROGRESS_CONFIG,
  ...over,
  sources: { ...DEFAULT_PROGRESS_CONFIG.sources, ...(over.sources ?? {}) },
})

test('half the items done is half way', () => {
  const out = computeProgress(cfg(), { ...none, subtasks: { total: 4, done: 2 } }, false)
  assert.equal(out, 50)
})

test('every item weighs the same, whichever source it came from', () => {
  /*
   * Fifteen subtasks untouched and one checklist item ticked is 1 of 16, not
   * the 50% that averaging the two sources' percentages would report. The
   * averaging version is the tempting one and it lets a single checklist item
   * outweigh a fortnight of subtasks.
   */
  const out = computeProgress(
    cfg(),
    { ...none, subtasks: { total: 15, done: 0 }, checklists: { total: 1, done: 1 } },
    false,
  )
  assert.equal(out, 6)
})

test('a source that is switched off is not counted', () => {
  const inputs = {
    ...none,
    subtasks: { total: 2, done: 2 },
    checklists: { total: 2, done: 0 },
  }
  assert.equal(computeProgress(cfg(), inputs, false), 50)
  assert.equal(
    computeProgress(cfg({ sources: { ...DEFAULT_PROGRESS_CONFIG.sources, checklists: false } }), inputs, false),
    100,
  )
})

test('assigned comments count too — she lists three sources, not two', () => {
  const out = computeProgress(
    cfg(),
    { ...none, assignedComments: { total: 2, done: 1 } },
    false,
  )
  assert.equal(out, 50)
})

test('a third of the way through rounds, and does not run off', () => {
  assert.equal(computeProgress(cfg(), { ...none, subtasks: { total: 3, done: 1 } }, false), 33)
  assert.equal(computeProgress(cfg(), { ...none, subtasks: { total: 3, done: 2 } }, false), 67)
  assert.equal(computeProgress(cfg(), { ...none, subtasks: { total: 8, done: 8 } }, false), 100)
})

test('nothing to count says nothing, rather than zero', () => {
  /*
   * THE CLAIM ZERO WOULD MAKE. "0%" says none of this work is done; on a task
   * with no subtasks, no checklist and no assigned comments there is no work to
   * say it about. Null is the honest answer and the UI draws it as empty.
   */
  assert.equal(computeProgress(cfg({ doneStatusIs100: false }), none, false), null)
  assert.equal(computeProgress(cfg({ doneStatusIs100: false }), none, true), null)
})

test('but a finished task with nothing to count reads 100 — the frame’s own setting', () => {
  assert.equal(computeProgress(cfg({ doneStatusIs100: true }), none, true), 100)
  // Not done yet, so the setting does not apply.
  assert.equal(computeProgress(cfg({ doneStatusIs100: true }), none, false), null)
})

test('items outrank the done-status shortcut', () => {
  // A closed task whose checklist is half ticked reports the checklist, not
  // 100 — the setting is for tasks with nothing to count, not for all of them.
  const out = computeProgress(
    cfg({ doneStatusIs100: true }),
    { ...none, checklists: { total: 2, done: 1 } },
    true,
  )
  assert.equal(out, 50)
})

test('all three sources off is nothing to count, whatever the items say', () => {
  const out = computeProgress(
    cfg({ sources: { subtasks: false, checklists: false, assignedComments: false }, doneStatusIs100: false }),
    { ...none, subtasks: { total: 9, done: 4 } },
    false,
  )
  assert.equal(out, null)
})

test('a nonsense tally cannot push it over 100', () => {
  // More done than exist is a counting bug upstream; reporting 300% would make
  // it the reader's problem.
  const out = computeProgress(cfg(), { ...none, subtasks: { total: 1, done: 3 } }, false)
  assert.equal(out, 100)
})

test('a broken tally contributes nothing instead of poisoning the sum', () => {
  const out = computeProgress(
    cfg(),
    {
      ...none,
      subtasks: { total: Number.NaN, done: Number.NaN },
      checklists: { total: 2, done: 1 },
    },
    false,
  )
  assert.equal(out, 50)
})

test('a config from the database keeps what it says and defaults what it omits', () => {
  assert.deepEqual(toProgressConfig(null), DEFAULT_PROGRESS_CONFIG)
  assert.deepEqual(toProgressConfig({ sources: { checklists: false } }), {
    sources: { subtasks: true, checklists: false, assignedComments: true },
    doneStatusIs100: true,
  })
  assert.equal(toProgressConfig({ doneStatusIs100: false }).doneStatusIs100, false)
})
