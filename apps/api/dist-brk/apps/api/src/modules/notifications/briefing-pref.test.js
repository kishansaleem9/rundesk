"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const notifications_service_1 = require("./notifications.service");
/**
 * §7.11 — the profile Notifications tab patches `briefing: { enabled, hour }`
 * onto notification_preferences, and the cron reads it back. This locks down the
 * shared normalizer (default disabled/08:00, hour clamped to 0–23) so the patch
 * path and the due-hour selection agree.
 */
(0, node_test_1.describe)('normalizeBriefingPrefs (§7.11)', () => {
    (0, node_test_1.it)('defaults to disabled at hour 8', () => {
        strict_1.default.deepEqual((0, notifications_service_1.normalizeBriefingPrefs)(undefined), { enabled: false, hour: 8 });
        strict_1.default.deepEqual((0, notifications_service_1.normalizeBriefingPrefs)(null), { enabled: false, hour: 8 });
        strict_1.default.deepEqual((0, notifications_service_1.normalizeBriefingPrefs)({}), { enabled: false, hour: 8 });
    });
    (0, node_test_1.it)('only enables on a strict boolean true', () => {
        strict_1.default.equal((0, notifications_service_1.normalizeBriefingPrefs)({ enabled: true }).enabled, true);
        strict_1.default.equal((0, notifications_service_1.normalizeBriefingPrefs)({ enabled: 'yes' }).enabled, false);
        strict_1.default.equal((0, notifications_service_1.normalizeBriefingPrefs)({ enabled: 1 }).enabled, false);
    });
    (0, node_test_1.it)('clamps the hour to 0..23 and truncates fractions', () => {
        strict_1.default.equal((0, notifications_service_1.normalizeBriefingPrefs)({ hour: 0 }).hour, 0);
        strict_1.default.equal((0, notifications_service_1.normalizeBriefingPrefs)({ hour: 23 }).hour, 23);
        strict_1.default.equal((0, notifications_service_1.normalizeBriefingPrefs)({ hour: 30 }).hour, 23);
        strict_1.default.equal((0, notifications_service_1.normalizeBriefingPrefs)({ hour: -5 }).hour, 0);
        strict_1.default.equal((0, notifications_service_1.normalizeBriefingPrefs)({ hour: 9.8 }).hour, 9);
    });
    (0, node_test_1.it)('falls back to hour 8 on a non-numeric hour', () => {
        strict_1.default.equal((0, notifications_service_1.normalizeBriefingPrefs)({ hour: 'noon' }).hour, 8);
    });
});
//# sourceMappingURL=briefing-pref.test.js.map