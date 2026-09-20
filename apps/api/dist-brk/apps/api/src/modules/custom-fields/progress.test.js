"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const progress_1 = require("./progress");
/**
 * §V2-01b — the field she actually demonstrates, frame `00:25`.
 *
 * These checks are about the two ways a derived percentage goes wrong: counting
 * the wrong things, and claiming a number when it has nothing to count.
 */
const none = {
    subtasks: { total: 0, done: 0 },
    checklists: { total: 0, done: 0 },
    assignedComments: { total: 0, done: 0 },
};
const cfg = (over = {}) => ({
    ...progress_1.DEFAULT_PROGRESS_CONFIG,
    ...over,
    sources: { ...progress_1.DEFAULT_PROGRESS_CONFIG.sources, ...(over.sources ?? {}) },
});
(0, node_test_1.test)('half the items done is half way', () => {
    const out = (0, progress_1.computeProgress)(cfg(), { ...none, subtasks: { total: 4, done: 2 } }, false);
    strict_1.default.equal(out, 50);
});
(0, node_test_1.test)('every item weighs the same, whichever source it came from', () => {
    /*
     * Fifteen subtasks untouched and one checklist item ticked is 1 of 16, not
     * the 50% that averaging the two sources' percentages would report. The
     * averaging version is the tempting one and it lets a single checklist item
     * outweigh a fortnight of subtasks.
     */
    const out = (0, progress_1.computeProgress)(cfg(), { ...none, subtasks: { total: 15, done: 0 }, checklists: { total: 1, done: 1 } }, false);
    strict_1.default.equal(out, 6);
});
(0, node_test_1.test)('a source that is switched off is not counted', () => {
    const inputs = {
        ...none,
        subtasks: { total: 2, done: 2 },
        checklists: { total: 2, done: 0 },
    };
    strict_1.default.equal((0, progress_1.computeProgress)(cfg(), inputs, false), 50);
    strict_1.default.equal((0, progress_1.computeProgress)(cfg({ sources: { ...progress_1.DEFAULT_PROGRESS_CONFIG.sources, checklists: false } }), inputs, false), 100);
});
(0, node_test_1.test)('assigned comments count too — she lists three sources, not two', () => {
    const out = (0, progress_1.computeProgress)(cfg(), { ...none, assignedComments: { total: 2, done: 1 } }, false);
    strict_1.default.equal(out, 50);
});
(0, node_test_1.test)('a third of the way through rounds, and does not run off', () => {
    strict_1.default.equal((0, progress_1.computeProgress)(cfg(), { ...none, subtasks: { total: 3, done: 1 } }, false), 33);
    strict_1.default.equal((0, progress_1.computeProgress)(cfg(), { ...none, subtasks: { total: 3, done: 2 } }, false), 67);
    strict_1.default.equal((0, progress_1.computeProgress)(cfg(), { ...none, subtasks: { total: 8, done: 8 } }, false), 100);
});
(0, node_test_1.test)('nothing to count says nothing, rather than zero', () => {
    /*
     * THE CLAIM ZERO WOULD MAKE. "0%" says none of this work is done; on a task
     * with no subtasks, no checklist and no assigned comments there is no work to
     * say it about. Null is the honest answer and the UI draws it as empty.
     */
    strict_1.default.equal((0, progress_1.computeProgress)(cfg({ doneStatusIs100: false }), none, false), null);
    strict_1.default.equal((0, progress_1.computeProgress)(cfg({ doneStatusIs100: false }), none, true), null);
});
(0, node_test_1.test)('but a finished task with nothing to count reads 100 — the frame’s own setting', () => {
    strict_1.default.equal((0, progress_1.computeProgress)(cfg({ doneStatusIs100: true }), none, true), 100);
    // Not done yet, so the setting does not apply.
    strict_1.default.equal((0, progress_1.computeProgress)(cfg({ doneStatusIs100: true }), none, false), null);
});
(0, node_test_1.test)('items outrank the done-status shortcut', () => {
    // A closed task whose checklist is half ticked reports the checklist, not
    // 100 — the setting is for tasks with nothing to count, not for all of them.
    const out = (0, progress_1.computeProgress)(cfg({ doneStatusIs100: true }), { ...none, checklists: { total: 2, done: 1 } }, true);
    strict_1.default.equal(out, 50);
});
(0, node_test_1.test)('all three sources off is nothing to count, whatever the items say', () => {
    const out = (0, progress_1.computeProgress)(cfg({ sources: { subtasks: false, checklists: false, assignedComments: false }, doneStatusIs100: false }), { ...none, subtasks: { total: 9, done: 4 } }, false);
    strict_1.default.equal(out, null);
});
(0, node_test_1.test)('a nonsense tally cannot push it over 100', () => {
    // More done than exist is a counting bug upstream; reporting 300% would make
    // it the reader's problem.
    const out = (0, progress_1.computeProgress)(cfg(), { ...none, subtasks: { total: 1, done: 3 } }, false);
    strict_1.default.equal(out, 100);
});
(0, node_test_1.test)('a broken tally contributes nothing instead of poisoning the sum', () => {
    const out = (0, progress_1.computeProgress)(cfg(), {
        ...none,
        subtasks: { total: Number.NaN, done: Number.NaN },
        checklists: { total: 2, done: 1 },
    }, false);
    strict_1.default.equal(out, 50);
});
(0, node_test_1.test)('a config from the database keeps what it says and defaults what it omits', () => {
    strict_1.default.deepEqual((0, progress_1.toProgressConfig)(null), progress_1.DEFAULT_PROGRESS_CONFIG);
    strict_1.default.deepEqual((0, progress_1.toProgressConfig)({ sources: { checklists: false } }), {
        sources: { subtasks: true, checklists: false, assignedComments: true },
        doneStatusIs100: true,
    });
    strict_1.default.equal((0, progress_1.toProgressConfig)({ doneStatusIs100: false }).doneStatusIs100, false);
});
//# sourceMappingURL=progress.test.js.map