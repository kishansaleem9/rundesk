"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const time_entries_controller_1 = require("./time-entries.controller");
const not_guest_guard_1 = require("../../common/guards/not-guest.guard");
/**
 * §3.3 — time tracking is a member capability. Guests may read entries but must
 * not start/stop a timer or log manual time. `NotGuestGuard` is bound (on top of
 * the class-level JwtAuthGuard + ResourceMemberGuard) to the mutation handlers
 * only; the read handler stays open to guests.
 *
 * We assert the wiring via the metadata NestJS's `@UseGuards` writes onto each
 * handler, so a future refactor that drops the guard fails loudly here.
 */
const guardsOn = (method) => (Reflect.getMetadata('__guards__', time_entries_controller_1.TaskTimeEntriesController.prototype[method]) ?? []);
(0, node_test_1.describe)('TaskTimeEntriesController — NotGuestGuard on mutations (§3.3)', () => {
    for (const method of ['start', 'stop', 'manual']) {
        (0, node_test_1.it)(`guards ${method}() against guests`, () => {
            strict_1.default.ok(guardsOn(method).includes(not_guest_guard_1.NotGuestGuard), `${method}() must be protected by NotGuestGuard`);
        });
    }
    (0, node_test_1.it)('leaves the read handler (list) open to guests', () => {
        strict_1.default.equal(guardsOn('list').includes(not_guest_guard_1.NotGuestGuard), false, 'list() is a read endpoint and must not gain NotGuestGuard');
    });
});
//# sourceMappingURL=time-entries.guard.test.js.map