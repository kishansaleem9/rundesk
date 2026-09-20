"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const calendar_sync_service_1 = require("./calendar-sync.service");
/**
 * The service is a thin shell around Drizzle + fetch. The unit tests
 * cover the pieces that are deterministic and decoupled from HTTP:
 *   - iCal token mint/resolve roundtrip
 *   - VEVENT formatting (escape rules, header/footer, status mapping)
 *   - iCal feed builder hydrating from the join query
 *
 * Outbound HTTP calls are intentionally NOT exercised here — they require
 * a live Google/Microsoft account to validate end-to-end and are better
 * suited to an integration test harness.
 */
function buildDb(opts = {}) {
    return {
        select: node_test_1.mock.fn(() => ({
            from: node_test_1.mock.fn(() => ({
                innerJoin: node_test_1.mock.fn(function chain() {
                    return {
                        innerJoin: node_test_1.mock.fn(() => chain()),
                        leftJoin: node_test_1.mock.fn(() => ({
                            where: node_test_1.mock.fn(async () => opts.tasksForFeed ?? []),
                        })),
                        where: node_test_1.mock.fn(async () => opts.tasksForFeed ?? []),
                    };
                }),
                where: node_test_1.mock.fn(() => ({
                    limit: node_test_1.mock.fn(async () => (opts.icalToken ? [opts.icalToken] : [])),
                })),
            })),
        })),
        insert: node_test_1.mock.fn(() => ({
            values: node_test_1.mock.fn(() => ({
                onConflictDoUpdate: node_test_1.mock.fn(async () => undefined),
                returning: node_test_1.mock.fn(async () => [{ id: 't-1' }]),
            })),
        })),
        update: node_test_1.mock.fn(() => ({
            set: node_test_1.mock.fn(() => ({
                where: node_test_1.mock.fn(() => Object.assign(Promise.resolve(undefined), {
                    catch: () => Promise.resolve(undefined),
                })),
            })),
        })),
        delete: node_test_1.mock.fn(() => ({ where: node_test_1.mock.fn(async () => undefined) })),
    };
}
(0, node_test_1.describe)('CalendarSyncService.mintIcalToken', () => {
    (0, node_test_1.it)('mints an unguessable scim_-style token prefixed with ical_', async () => {
        const svc = new calendar_sync_service_1.CalendarSyncService(buildDb());
        const result = await svc.mintIcalToken('u-1', 'ws-1');
        strict_1.default.ok(result.token.startsWith('ical_'), `token "${result.token}" missing ical_ prefix`);
        strict_1.default.ok(result.token.length >= 30, 'token should have enough entropy');
        strict_1.default.match(result.url, /\/ical\/ical_[\w-]+\.ics$/);
    });
    (0, node_test_1.it)('generates unique tokens across calls', async () => {
        const svc = new calendar_sync_service_1.CalendarSyncService(buildDb());
        const a = await svc.mintIcalToken('u-1', 'ws-1');
        const b = await svc.mintIcalToken('u-1', 'ws-1');
        strict_1.default.notEqual(a.token, b.token);
    });
});
(0, node_test_1.describe)('CalendarSyncService.resolveIcalToken', () => {
    (0, node_test_1.it)('returns null for unknown tokens', async () => {
        const svc = new calendar_sync_service_1.CalendarSyncService(buildDb());
        const result = await svc.resolveIcalToken('ical_unknown');
        strict_1.default.equal(result, null);
    });
    (0, node_test_1.it)('returns the user/workspace for a live token', async () => {
        const svc = new calendar_sync_service_1.CalendarSyncService(buildDb({
            icalToken: {
                id: 't-1',
                userId: 'u-1',
                workspaceId: 'ws-1',
                token: 'ical_abc',
                revokedAt: null,
            },
        }));
        const result = await svc.resolveIcalToken('ical_abc');
        strict_1.default.deepEqual(result, { userId: 'u-1', workspaceId: 'ws-1' });
    });
    (0, node_test_1.it)('returns null for revoked tokens', async () => {
        const svc = new calendar_sync_service_1.CalendarSyncService(buildDb({
            icalToken: {
                id: 't-1',
                userId: 'u-1',
                workspaceId: 'ws-1',
                token: 'ical_abc',
                revokedAt: new Date(),
            },
        }));
        const result = await svc.resolveIcalToken('ical_abc');
        strict_1.default.equal(result, null);
    });
});
(0, node_test_1.describe)('CalendarSyncService.buildIcalFeed', () => {
    (0, node_test_1.it)('returns a valid VCALENDAR scaffold even when there are no tasks', async () => {
        const svc = new calendar_sync_service_1.CalendarSyncService(buildDb({ tasksForFeed: [] }));
        const ics = await svc.buildIcalFeed('u-1', 'ws-1');
        strict_1.default.match(ics, /^BEGIN:VCALENDAR/);
        strict_1.default.match(ics, /END:VCALENDAR$/);
        strict_1.default.match(ics, /PRODID:-\/\/Rundesk\/\/ICAL Subscription\/\/EN/);
        // No VEVENT blocks when zero tasks
        strict_1.default.equal(/BEGIN:VEVENT/.test(ics), false);
    });
    (0, node_test_1.it)('renders one VEVENT per task and escapes commas / newlines / semicolons', async () => {
        const due = new Date('2026-06-01T15:30:00Z');
        const svc = new calendar_sync_service_1.CalendarSyncService(buildDb({
            tasksForFeed: [
                {
                    id: '11111111-1111-1111-1111-111111111111',
                    title: 'Ship, hotfix; & rollback\nrunbook',
                    description: 'Line one\nLine two',
                    startDate: null,
                    dueDate: due,
                    updatedAt: due,
                    status: 'in_progress',
                    listId: 'list-1',
                },
            ],
        }));
        const ics = await svc.buildIcalFeed('u-1', 'ws-1');
        strict_1.default.match(ics, /BEGIN:VEVENT[\s\S]+END:VEVENT/);
        strict_1.default.match(ics, /UID:task-11111111-1111-1111-1111-111111111111@rundesk/);
        strict_1.default.match(ics, /DTEND:20260601T153000Z/);
        // commas + semicolons + newlines escaped per RFC 5545
        strict_1.default.match(ics, /SUMMARY:Ship\\, hotfix\\; & rollback\\nrunbook/);
        strict_1.default.match(ics, /DESCRIPTION:Line one\\nLine two/);
        // in_progress -> TENTATIVE, closed -> CONFIRMED
        strict_1.default.match(ics, /STATUS:TENTATIVE/);
    });
    (0, node_test_1.it)('dedupes a task appearing on multiple assignee join rows', async () => {
        const due = new Date('2026-06-01T15:30:00Z');
        const dup = {
            id: '22222222-2222-2222-2222-222222222222',
            title: 'Dedupe me',
            description: null,
            startDate: null,
            dueDate: due,
            updatedAt: due,
            status: 'todo',
            listId: 'list-1',
        };
        const svc = new calendar_sync_service_1.CalendarSyncService(buildDb({ tasksForFeed: [dup, dup, dup] }));
        const ics = await svc.buildIcalFeed('u-1', 'ws-1');
        const matches = ics.match(/BEGIN:VEVENT/g) ?? [];
        strict_1.default.equal(matches.length, 1);
    });
});
//# sourceMappingURL=calendar-sync.service.test.js.map