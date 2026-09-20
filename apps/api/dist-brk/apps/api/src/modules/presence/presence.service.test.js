"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const presence_service_1 = require("./presence.service");
const NOW = new Date('2026-08-03T12:00:00Z');
const minutesAgo = (n) => new Date(NOW.getTime() - n * 60_000);
(0, node_test_1.describe)('PresenceService.resolveStatus (§A4.8)', () => {
    (0, node_test_1.it)('falls back to the heartbeat when no override is set', () => {
        strict_1.default.equal(presence_service_1.PresenceService.resolveStatus(null, minutesAgo(1), NOW), 'online');
        strict_1.default.equal(presence_service_1.PresenceService.resolveStatus(null, minutesAgo(10), NOW), 'away');
        strict_1.default.equal(presence_service_1.PresenceService.resolveStatus(null, minutesAgo(60), NOW), 'offline');
        strict_1.default.equal(presence_service_1.PresenceService.resolveStatus(null, null, NOW), 'offline');
    });
    (0, node_test_1.it)('lets a stated status win over activity — that is the whole point of setting one', () => {
        // Actively typing, but has asked not to be interrupted.
        strict_1.default.equal(presence_service_1.PresenceService.resolveStatus('busy', minutesAgo(1), NOW), 'busy');
        strict_1.default.equal(presence_service_1.PresenceService.resolveStatus('offline', minutesAgo(1), NOW), 'offline');
        // Idle, but has declared themselves available.
        strict_1.default.equal(presence_service_1.PresenceService.resolveStatus('online', minutesAgo(60), NOW), 'online');
    });
    (0, node_test_1.it)('ignores a value outside the allowed set rather than leaking it to teammates', () => {
        strict_1.default.equal(presence_service_1.PresenceService.resolveStatus('lunch', minutesAgo(1), NOW), 'online');
    });
});
//# sourceMappingURL=presence.service.test.js.map