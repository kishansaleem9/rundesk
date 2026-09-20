"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const free_busy_1 = require("./free-busy");
/**
 * §V2-14c — "These calendars decide when you're busy."
 *
 * These checks are about the two things that make a free/busy view either
 * useful or actively harmful: that it does not invent time somebody is busy,
 * and that it does not say WHAT they are doing.
 */
const w = (startsAt, endsAt, source = 'rundesk') => ({ startsAt, endsAt, source });
(0, node_test_1.test)('a busy window has no room for a title', () => {
    /*
     * THE PRIVACY RULE, asserted on the SHAPE rather than on a value. Somebody's
     * personal calendar says things like "MRI results". A colleague may know
     * they are busy at three; they may not know why. Because the type carries no
     * title, no call site can leak one by forgetting to strip it — and this
     * check fails the moment somebody adds the field.
     */
    const [one] = (0, free_busy_1.toBusyWindows)([{ start: '2026-03-04T09:00:00Z', end: '2026-03-04T10:00:00Z' }], 'external');
    strict_1.default.deepEqual(Object.keys(one).sort(), ['endsAt', 'source', 'startsAt']);
});
(0, node_test_1.test)('what a provider returns is trusted only when it makes sense', () => {
    const out = (0, free_busy_1.toBusyWindows)([
        { start: '2026-03-04T09:00:00Z', end: '2026-03-04T10:00:00Z' }, // fine
        { start: '2026-03-04T11:00:00Z', end: null }, // no end
        { start: null, end: '2026-03-04T12:00:00Z' }, // no start
        { start: '2026-03-04T14:00:00Z', end: '2026-03-04T13:00:00Z' }, // backwards
        { start: '2026-03-04T15:00:00Z', end: '2026-03-04T15:00:00Z' }, // instant
        { start: 'not a date', end: 'also not' },
    ], 'external');
    // Dropped, not repaired: guessing a duration would draw a block on somebody's
    // calendar that nothing in the world corresponds to.
    strict_1.default.equal(out.length, 1);
    strict_1.default.equal(out[0].startsAt, '2026-03-04T09:00:00.000Z');
});
(0, node_test_1.test)('overlapping busy time is one window, not two', () => {
    const merged = (0, free_busy_1.mergeBusy)([
        w('2026-03-04T09:00:00.000Z', '2026-03-04T10:30:00.000Z'),
        w('2026-03-04T10:00:00.000Z', '2026-03-04T11:00:00.000Z', 'external'),
    ]);
    strict_1.default.equal(merged.length, 1);
    strict_1.default.equal(merged[0].startsAt, '2026-03-04T09:00:00.000Z');
    strict_1.default.equal(merged[0].endsAt, '2026-03-04T11:00:00.000Z');
});
(0, node_test_1.test)('back-to-back meetings leave no free minute between them', () => {
    // 2–3 and 3–4 is one solid block. Reporting a gap at three would offer a
    // free minute that does not exist.
    const merged = (0, free_busy_1.mergeBusy)([
        w('2026-03-04T14:00:00.000Z', '2026-03-04T15:00:00.000Z'),
        w('2026-03-04T15:00:00.000Z', '2026-03-04T16:00:00.000Z'),
    ]);
    strict_1.default.equal(merged.length, 1);
    strict_1.default.equal(merged[0].endsAt, '2026-03-04T16:00:00.000Z');
});
(0, node_test_1.test)('separate busy time stays separate', () => {
    const merged = (0, free_busy_1.mergeBusy)([
        w('2026-03-04T09:00:00.000Z', '2026-03-04T10:00:00.000Z'),
        w('2026-03-04T14:00:00.000Z', '2026-03-04T15:00:00.000Z'),
    ]);
    strict_1.default.equal(merged.length, 2);
});
(0, node_test_1.test)('merging sorts, so windows may arrive in any order', () => {
    const merged = (0, free_busy_1.mergeBusy)([
        w('2026-03-04T14:00:00.000Z', '2026-03-04T15:00:00.000Z'),
        w('2026-03-04T09:00:00.000Z', '2026-03-04T10:00:00.000Z'),
    ]);
    strict_1.default.equal(merged[0].startsAt, '2026-03-04T09:00:00.000Z');
});
(0, node_test_1.test)('a window swallowed by a longer one does not extend it', () => {
    const merged = (0, free_busy_1.mergeBusy)([
        w('2026-03-04T09:00:00.000Z', '2026-03-04T17:00:00.000Z'),
        w('2026-03-04T10:00:00.000Z', '2026-03-04T11:00:00.000Z', 'external'),
    ]);
    strict_1.default.equal(merged.length, 1);
    strict_1.default.equal(merged[0].endsAt, '2026-03-04T17:00:00.000Z');
});
(0, node_test_1.test)('a joined window that includes Rundesk time is not called external', () => {
    // The UI draws the two differently, and calling mixed time "external" would
    // hide work this product can actually explain behind an opaque block.
    const merged = (0, free_busy_1.mergeBusy)([
        w('2026-03-04T09:00:00.000Z', '2026-03-04T10:30:00.000Z', 'external'),
        w('2026-03-04T10:00:00.000Z', '2026-03-04T11:00:00.000Z', 'rundesk'),
    ]);
    strict_1.default.equal(merged[0].source, 'rundesk');
});
(0, node_test_1.test)('all-external time keeps saying so', () => {
    const merged = (0, free_busy_1.mergeBusy)([
        w('2026-03-04T09:00:00.000Z', '2026-03-04T10:30:00.000Z', 'external'),
        w('2026-03-04T10:00:00.000Z', '2026-03-04T11:00:00.000Z', 'external'),
    ]);
    strict_1.default.equal(merged[0].source, 'external');
});
(0, node_test_1.test)('nothing in the diary means free', () => {
    strict_1.default.equal((0, free_busy_1.isFree)([], '2026-03-04T09:00:00.000Z', '2026-03-04T10:00:00.000Z'), true);
});
(0, node_test_1.test)('a meeting that ends when yours starts does not block it', () => {
    // Half-open, the same convention the planner's own block range uses.
    const busy = [w('2026-03-04T09:00:00.000Z', '2026-03-04T10:00:00.000Z')];
    strict_1.default.equal((0, free_busy_1.isFree)(busy, '2026-03-04T10:00:00.000Z', '2026-03-04T11:00:00.000Z'), true);
    strict_1.default.equal((0, free_busy_1.isFree)(busy, '2026-03-04T08:00:00.000Z', '2026-03-04T09:00:00.000Z'), true);
});
(0, node_test_1.test)('any overlap at all means not free', () => {
    const busy = [w('2026-03-04T09:00:00.000Z', '2026-03-04T10:00:00.000Z')];
    // Starts inside, ends inside, spans it, and sits within it.
    strict_1.default.equal((0, free_busy_1.isFree)(busy, '2026-03-04T09:30:00.000Z', '2026-03-04T10:30:00.000Z'), false);
    strict_1.default.equal((0, free_busy_1.isFree)(busy, '2026-03-04T08:30:00.000Z', '2026-03-04T09:30:00.000Z'), false);
    strict_1.default.equal((0, free_busy_1.isFree)(busy, '2026-03-04T08:00:00.000Z', '2026-03-04T11:00:00.000Z'), false);
    strict_1.default.equal((0, free_busy_1.isFree)(busy, '2026-03-04T09:15:00.000Z', '2026-03-04T09:45:00.000Z'), false);
});
//# sourceMappingURL=free-busy.test.js.map