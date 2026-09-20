"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const notifications_service_1 = require("./notifications.service");
/**
 * §10.4 — the reminder cron fires a due-soon notification when a task's
 * whole-calendar-day distance from "today" is one of the assignee's configured
 * lead days. These pure helpers decide (a) which lead days are valid and
 * (b) the human label. Locking them down guards the selection logic the cron
 * depends on.
 */
(0, node_test_1.describe)('normalizeReminderLeadDays', () => {
    (0, node_test_1.it)('defaults to [1, 2] when the value is absent or not an array', () => {
        strict_1.default.deepEqual((0, notifications_service_1.normalizeReminderLeadDays)(undefined), [1, 2]);
        strict_1.default.deepEqual((0, notifications_service_1.normalizeReminderLeadDays)(null), [1, 2]);
        strict_1.default.deepEqual((0, notifications_service_1.normalizeReminderLeadDays)('nope'), [1, 2]);
        strict_1.default.deepEqual((0, notifications_service_1.normalizeReminderLeadDays)(7), [1, 2]);
        // Not shared with the exported constant (callers must not mutate defaults).
        strict_1.default.notEqual((0, notifications_service_1.normalizeReminderLeadDays)(undefined), notifications_service_1.DEFAULT_REMINDER_LEAD_DAYS);
    });
    (0, node_test_1.it)('respects an explicit empty array (overdue-only)', () => {
        strict_1.default.deepEqual((0, notifications_service_1.normalizeReminderLeadDays)([]), []);
    });
    (0, node_test_1.it)('keeps only the allowed set {1, 2, 7}, de-duped and sorted', () => {
        strict_1.default.deepEqual((0, notifications_service_1.normalizeReminderLeadDays)([2, 1]), [1, 2]);
        strict_1.default.deepEqual((0, notifications_service_1.normalizeReminderLeadDays)([7, 1, 2]), [1, 2, 7]);
        strict_1.default.deepEqual((0, notifications_service_1.normalizeReminderLeadDays)([1, 1, 2, 2]), [1, 2]);
        strict_1.default.deepEqual((0, notifications_service_1.normalizeReminderLeadDays)([7]), [7]);
    });
    (0, node_test_1.it)('drops out-of-set, non-integer, and non-numeric entries', () => {
        strict_1.default.deepEqual((0, notifications_service_1.normalizeReminderLeadDays)([3, 5, 14, 0, -1]), []);
        strict_1.default.deepEqual((0, notifications_service_1.normalizeReminderLeadDays)([1.5, 2.9]), []);
        strict_1.default.deepEqual((0, notifications_service_1.normalizeReminderLeadDays)([1, 'x', 2, null, {}]), [1, 2]);
    });
    (0, node_test_1.it)('coerces numeric strings that land in the allowed set', () => {
        strict_1.default.deepEqual((0, notifications_service_1.normalizeReminderLeadDays)(['1', '7']), [1, 7]);
    });
    (0, node_test_1.it)('every allowed value survives normalization', () => {
        for (const d of notifications_service_1.ALLOWED_REMINDER_LEAD_DAYS) {
            strict_1.default.deepEqual((0, notifications_service_1.normalizeReminderLeadDays)([d]), [d]);
        }
    });
});
(0, node_test_1.describe)('reminderLeadLabel', () => {
    (0, node_test_1.it)('labels 1 day out as "tomorrow"', () => {
        strict_1.default.equal((0, notifications_service_1.reminderLeadLabel)(1), 'tomorrow');
        strict_1.default.equal((0, notifications_service_1.reminderLeadLabel)(0), 'tomorrow');
    });
    (0, node_test_1.it)('labels a week out as "in 1 week"', () => {
        strict_1.default.equal((0, notifications_service_1.reminderLeadLabel)(7), 'in 1 week');
    });
    (0, node_test_1.it)('labels other offsets as "in N days"', () => {
        strict_1.default.equal((0, notifications_service_1.reminderLeadLabel)(2), 'in 2 days');
        strict_1.default.equal((0, notifications_service_1.reminderLeadLabel)(3), 'in 3 days');
    });
});
(0, node_test_1.describe)('lead-day selection (cron predicate)', () => {
    // Mirrors the cron: fire iff the task's calendar-day distance is one of the
    // user's configured lead days.
    const fires = (diffDays, stored) => (0, notifications_service_1.normalizeReminderLeadDays)(stored).includes(diffDays);
    (0, node_test_1.it)('default user is reminded 1 and 2 days out, but not at 7 or same-day', () => {
        strict_1.default.equal(fires(1, undefined), true);
        strict_1.default.equal(fires(2, undefined), true);
        strict_1.default.equal(fires(7, undefined), false);
        strict_1.default.equal(fires(0, undefined), false);
    });
    (0, node_test_1.it)('a user who opted into 1 week is reminded at 7 days too', () => {
        strict_1.default.equal(fires(7, [1, 2, 7]), true);
        strict_1.default.equal(fires(2, [1, 2, 7]), true);
    });
    (0, node_test_1.it)('a user with only 1-week lead is not reminded at 1 or 2 days', () => {
        strict_1.default.equal(fires(1, [7]), false);
        strict_1.default.equal(fires(2, [7]), false);
        strict_1.default.equal(fires(7, [7]), true);
    });
    (0, node_test_1.it)('a user with no lead days is never reminded (overdue only)', () => {
        strict_1.default.equal(fires(1, []), false);
        strict_1.default.equal(fires(2, []), false);
        strict_1.default.equal(fires(7, []), false);
    });
});
//# sourceMappingURL=reminder-lead.test.js.map