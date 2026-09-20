"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const standup_1 = require("./standup");
const task = (title) => ({ id: title, title, dueDate: null, completedAt: null });
const base = (over = {}) => ({
    displayName: 'Hamda Tahir',
    days: 7,
    done: [],
    active: [],
    overdue: [],
    blocked: [],
    ...over,
});
(0, node_test_1.test)('says so plainly when there is nothing to report', () => {
    const text = (0, standup_1.formatStandupFallback)(base());
    strict_1.default.equal((0, standup_1.standupHasContent)(base()), false);
    // A fact about the workspace, not a verdict on the person.
    strict_1.default.match(text, /no recorded task activity/i);
    strict_1.default.match(text, /^Hamda /);
    strict_1.default.doesNotMatch(text, /overdue|blocked/i);
});
(0, node_test_1.test)('leads with finished work, not with problems', () => {
    const text = (0, standup_1.formatStandupFallback)(base({ done: [task('Ship the invoice screen')], overdue: [task('Chase the vendor')] }));
    strict_1.default.ok(text.indexOf('finished') < text.indexOf('overdue'), `problems came first: ${text}`);
});
(0, node_test_1.test)('names what is in flight and what is in the way', () => {
    const text = (0, standup_1.formatStandupFallback)(base({
        done: [task('A')],
        active: [task('B')],
        overdue: [task('C')],
        blocked: [task('D')],
    }));
    for (const t of ['A', 'B', 'C', 'D'])
        strict_1.default.match(text, new RegExp(`“${t}”`));
    strict_1.default.match(text, /is working on/);
    strict_1.default.match(text, /blocked by unfinished work/);
});
(0, node_test_1.test)('counts rather than lists once the clause would run long', () => {
    const many = ['one', 'two', 'three', 'four', 'five'].map(task);
    const text = (0, standup_1.formatStandupFallback)(base({ done: many }));
    strict_1.default.match(text, /finished 5 tasks/);
    strict_1.default.match(text, /\(\+2 more\)/);
    strict_1.default.doesNotMatch(text, /“four”/);
});
(0, node_test_1.test)('agrees in number for a single task', () => {
    const one = (0, standup_1.formatStandupFallback)(base({ done: [task('A')], overdue: [task('C')] }));
    strict_1.default.match(one, /finished 1 task:/);
    strict_1.default.match(one, /1 task is overdue/);
    const two = (0, standup_1.formatStandupFallback)(base({ done: [task('A'), task('B')], overdue: [task('C'), task('D')] }));
    strict_1.default.match(two, /finished 2 tasks:/);
    strict_1.default.match(two, /2 tasks are overdue/);
});
(0, node_test_1.test)('a person whose only work is overdue still gets a sentence', () => {
    const text = (0, standup_1.formatStandupFallback)(base({ overdue: [task('C')] }));
    strict_1.default.match(text, /nothing finished or in flight/);
    strict_1.default.match(text, /1 task is overdue/);
});
(0, node_test_1.test)('one day reads as today rather than "in the last 1 days"', () => {
    strict_1.default.match((0, standup_1.formatStandupFallback)(base({ days: 1, active: [task('A')] })), /today/);
    strict_1.default.doesNotMatch((0, standup_1.formatStandupFallback)(base({ days: 1, active: [task('A')] })), /last 1 days/);
});
(0, node_test_1.test)('falls back to a pronoun when the person has no name', () => {
    const text = (0, standup_1.formatStandupFallback)(base({ displayName: '' }));
    strict_1.default.match(text, /^They /);
});
(0, node_test_1.test)('standupList caps and counts', () => {
    strict_1.default.equal((0, standup_1.standupList)([task('a'), task('b')]), '“a”, “b”');
    strict_1.default.equal((0, standup_1.standupList)([task('a'), task('b'), task('c'), task('d')]), '“a”, “b”, “c” (+1 more)');
});
//# sourceMappingURL=standup.test.js.map