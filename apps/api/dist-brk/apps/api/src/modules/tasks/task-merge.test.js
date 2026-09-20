"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const task_merge_1 = require("./task-merge");
const task = (over) => ({
    listId: 'l1',
    parentTaskId: null,
    description: null,
    isArchived: false,
    ...over,
});
const A = task({ id: 'a' });
const B = task({ id: 'b' });
const none = new Set();
(0, node_test_1.test)('an ordinary merge is allowed', () => {
    strict_1.default.equal((0, task_merge_1.mergeRefusal)(A, B, false, none), null);
});
(0, node_test_1.test)('a task cannot be merged into itself', () => {
    strict_1.default.equal((0, task_merge_1.mergeRefusal)(A, A, false, none), 'same-task');
});
(0, node_test_1.test)('a missing task on either side is a not-found, not a bad request', () => {
    // The distinction matters at the controller: one is a typo in a URL, the
    // other is a rule being broken.
    strict_1.default.equal((0, task_merge_1.mergeRefusal)(null, B, false, none), 'source-missing');
    strict_1.default.equal((0, task_merge_1.mergeRefusal)(A, null, false, none), 'target-missing');
});
(0, node_test_1.test)('a task cannot be merged into its own subtask', () => {
    // The survivor would become a child of the task being binned, and the parent
    // chain would point into the bin.
    strict_1.default.equal((0, task_merge_1.mergeRefusal)(A, B, false, new Set(['a'])), 'target-is-descendant');
});
(0, node_test_1.test)('a task with subtasks cannot be merged into a subtask', () => {
    // Its children would move under the target and become grandchildren, which
    // `updateTask` refuses everywhere else. Refused rather than flattened,
    // because flattening loses the grouping somebody built.
    const subtaskTarget = task({ id: 'b', parentTaskId: 'c' });
    strict_1.default.equal((0, task_merge_1.mergeRefusal)(A, subtaskTarget, true, none), 'would-nest-twice');
    // ...but a childless task merging into a subtask is fine.
    strict_1.default.equal((0, task_merge_1.mergeRefusal)(A, subtaskTarget, false, none), null);
});
(0, node_test_1.test)('a binned task cannot be merged', () => {
    // Otherwise a merge could quietly resurrect work from the bin into a live
    // task, which nobody watching the live task asked for.
    strict_1.default.equal((0, task_merge_1.mergeRefusal)(task({ id: 'a', isArchived: true }), B, false, none), 'already-binned');
});
(0, node_test_1.test)('the refusal order puts identity before every other rule', () => {
    // Merging a task into itself while it also looks like its own descendant
    // must report the simple truth, not the exotic one.
    strict_1.default.equal((0, task_merge_1.mergeRefusal)(A, A, true, new Set(['a'])), 'same-task');
});
(0, node_test_1.test)('every kind of thing that moves is counted, starting at zero', () => {
    const tally = (0, task_merge_1.emptyMergeTally)();
    strict_1.default.equal(Object.keys(tally).length, task_merge_1.MERGE_MOVES.length);
    strict_1.default.ok(task_merge_1.MERGE_MOVES.includes('comments'));
    strict_1.default.ok(task_merge_1.MERGE_MOVES.includes('attachments'));
    strict_1.default.ok(task_merge_1.MERGE_MOVES.includes('subtasks'));
    strict_1.default.ok(Object.values(tally).every((n) => n === 0));
});
(0, node_test_1.test)('the merged description keeps both halves, target first', () => {
    const out = (0, task_merge_1.mergedDescription)('what continues', 'the evidence', 'Old bug');
    strict_1.default.ok(out !== null);
    strict_1.default.ok(out.startsWith('what continues'), out);
    strict_1.default.ok(out.includes('the evidence'), out);
    // Named, so nobody later reads the two halves as one person's text.
    strict_1.default.ok(out.includes('Old bug'), out);
});
(0, node_test_1.test)('an empty target still gets the incoming description', () => {
    const out = (0, task_merge_1.mergedDescription)(null, 'the evidence', 'Old bug');
    strict_1.default.ok(out?.includes('the evidence'), String(out));
});
(0, node_test_1.test)('nothing to merge means no write at all', () => {
    // Null rather than an unchanged string: the caller skips the update, so a
    // merge that adds no description does not create a description-history entry
    // recording a change that never happened.
    strict_1.default.equal((0, task_merge_1.mergedDescription)('what continues', null, 'Old bug'), null);
    strict_1.default.equal((0, task_merge_1.mergedDescription)('what continues', '   ', 'Old bug'), null);
    strict_1.default.equal((0, task_merge_1.mergedDescription)(null, null, 'Old bug'), null);
});
(0, node_test_1.test)('the target description is never replaced, only added to', () => {
    // The guard against the obvious wrong implementation: keeping the source's
    // text and dropping the survivor's.
    const out = (0, task_merge_1.mergedDescription)('KEEP ME', 'incoming', 'Old bug');
    strict_1.default.ok(out?.includes('KEEP ME'), String(out));
});
//# sourceMappingURL=task-merge.test.js.map