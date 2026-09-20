"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const web_push_1 = __importDefault(require("web-push"));
const notifications_service_1 = require("./notifications.service");
/**
 * Covers the two §10 fixes owned by this service:
 *   1. §6.9/§10.2 — the `mobile` notification channel is delivered over the same
 *      Web Push (VAPID) transport as `web` (Rundesk is a PWA), deduped so a user
 *      with BOTH channels on isn't double-pushed to the same subscription.
 *   2. §10.1 — the read path exposes a resolvable click-through `url` per
 *      notification so the frontend can jump to the relevant item.
 *
 * DB is the same hand-rolled mock idiom used by the other notifications tests.
 */
// --- mocked-DB plumbing -----------------------------------------------------
/** A drizzle-ish terminal that is both awaitable and `.limit()`-able. */
function chainable(rows) {
    return {
        then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
        limit: async () => rows,
    };
}
/**
 * DB for `create()`: each `.select()...where()` shifts the next queued result
 * (1st = the user's prefs/timezone row, optional 2nd = web_push_subscriptions),
 * and `.insert().values().returning()` yields the inserted notification.
 */
function buildCreateDb(selectQueue, insertedRow) {
    const queue = [...selectQueue];
    return {
        select: () => ({
            from: () => ({
                where: () => chainable(queue.shift() ?? []),
            }),
        }),
        insert: () => ({
            values: () => ({ returning: async () => [insertedRow] }),
        }),
        delete: () => ({ where: async () => undefined }),
    };
}
/** DB for `list()`: the join chain resolves to the supplied joined rows. */
function buildListDb(joinedRows) {
    return {
        select: () => ({
            from: () => ({
                leftJoin: () => ({
                    where: () => ({
                        orderBy: () => ({ limit: async () => joinedRows }),
                    }),
                }),
            }),
        }),
    };
}
function stubConfig(vapid) {
    return {
        get: (k) => {
            if (k === 'APP_URL')
                return 'https://app.test';
            if (k === 'WEB_PUSH_SUBJECT')
                return 'mailto:test@rundesk.internal';
            if (vapid && k === 'WEB_PUSH_PUBLIC_KEY')
                return vapid.publicKey;
            if (vapid && k === 'WEB_PUSH_PRIVATE_KEY')
                return vapid.privateKey;
            return undefined;
        },
    };
}
const INSERTED = {
    id: 'notif-1',
    workspaceId: 'ws1',
    type: 'task_assigned',
    title: 'You were assigned',
    body: null,
    target: { entityType: 'task', entityId: 't1', url: '/app/ws1/s/p/l?task=t1' },
    readAt: null,
    createdAt: new Date(),
};
/** `task_assigned` maps to the `assigned` event key; patch only that matrix. */
function prefsFor(matrix, dnd = false) {
    return {
        channels: { dndOn: dnd, dndStart: '00:00', dndEnd: '00:00' },
        events: { assigned: matrix },
    };
}
function createArgs() {
    return {
        userId: 'u1',
        workspaceId: 'ws1',
        type: 'task_assigned',
        title: 'You were assigned',
        target: { entityType: 'task', entityId: 't1', url: '/app/ws1/s/p/l?task=t1' },
    };
}
// --- §6.9/§10.2 — mobile push delivery via Web Push -------------------------
(0, node_test_1.describe)('NotificationsService.create — mobile push rides the Web Push transport', () => {
    /** Build a service whose `sendWebPush` is replaced by a call-recording stub. */
    function serviceWith(matrix, dnd = false) {
        const db = buildCreateDb([[{ notificationPreferences: prefsFor(matrix, dnd), timezone: 'UTC' }]], INSERTED);
        const realtime = { emitToUser: node_test_1.mock.fn() };
        const svc = new notifications_service_1.NotificationsService(db, realtime, {}, stubConfig());
        const pushes = [];
        svc.sendWebPush = async (userId, payload) => {
            pushes.push({ userId, payload });
        };
        return { svc, realtime, pushes };
    }
    (0, node_test_1.it)('delivers a web push when only the mobile channel is enabled', async () => {
        const { svc, pushes } = serviceWith({ inApp: false, web: false, mobile: true, email: false });
        await svc.create(createArgs());
        strict_1.default.equal(pushes.length, 1);
        strict_1.default.equal(pushes[0].userId, 'u1');
        strict_1.default.equal(pushes[0].payload.url, 'https://app.test/app/ws1/s/p/l?task=t1');
    });
    (0, node_test_1.it)('sends exactly ONE web push when both web and mobile are enabled (dedupe)', async () => {
        const { svc, pushes } = serviceWith({ inApp: false, web: true, mobile: true, email: false });
        await svc.create(createArgs());
        // One sendWebPush invocation — not one per channel — so the fan-out hits each
        // subscription a single time.
        strict_1.default.equal(pushes.length, 1);
    });
    (0, node_test_1.it)('still delivers a web push for the web channel alone (unchanged behavior)', async () => {
        const { svc, pushes } = serviceWith({ inApp: false, web: true, mobile: false, email: false });
        await svc.create(createArgs());
        strict_1.default.equal(pushes.length, 1);
    });
    (0, node_test_1.it)('does NOT web-push when neither web nor mobile is enabled (in-app only)', async () => {
        const { svc, pushes } = serviceWith({ inApp: true, web: false, mobile: false, email: false });
        await svc.create(createArgs());
        strict_1.default.equal(pushes.length, 0);
    });
    (0, node_test_1.it)('suppresses the mobile web push during quiet hours', async () => {
        // dndStart === dndEnd ⇒ always in quiet hours.
        const { svc, pushes } = serviceWith({ inApp: true, web: false, mobile: true, email: false }, true);
        await svc.create(createArgs());
        strict_1.default.equal(pushes.length, 0);
    });
    (0, node_test_1.it)('enriches the realtime payload with the click-through url', async () => {
        const { svc, realtime } = serviceWith({ inApp: false, web: false, mobile: true, email: false });
        await svc.create(createArgs());
        strict_1.default.equal(realtime.emitToUser.mock.calls.length, 1);
        const payload = realtime.emitToUser.mock.calls[0].arguments[1];
        strict_1.default.equal(payload.notification.url, '/app/ws1/s/p/l?task=t1');
    });
    (0, node_test_1.it)('with BOTH channels on, each subscription is pushed exactly once (real fan-out)', async () => {
        const vapid = web_push_1.default.generateVAPIDKeys();
        const subs = [
            { id: 's1', endpoint: 'https://push.example/s1', p256dh: 'k1', auth: 'a1' },
            { id: 's2', endpoint: 'https://push.example/s2', p256dh: 'k2', auth: 'a2' },
        ];
        const db = buildCreateDb([
            [{ notificationPreferences: prefsFor({ inApp: false, web: true, mobile: true, email: false }), timezone: 'UTC' }],
            subs,
        ], INSERTED);
        const svc = new notifications_service_1.NotificationsService(db, { emitToUser: node_test_1.mock.fn() }, {}, stubConfig(vapid));
        const original = web_push_1.default.sendNotification;
        let sent = 0;
        web_push_1.default.sendNotification = async () => {
            sent += 1;
            return {};
        };
        try {
            await svc.create(createArgs());
            // sendWebPush is fire-and-forget — let the async fan-out settle.
            await new Promise((r) => setTimeout(r, 25));
            // 2 subscriptions × 1 delivery each — NOT ×2 for the two enabled channels.
            strict_1.default.equal(sent, 2);
        }
        finally {
            ;
            web_push_1.default.sendNotification = original;
        }
    });
});
// --- §10.1 — resolvable click-through url -----------------------------------
(0, node_test_1.describe)('resolveNotificationUrl', () => {
    (0, node_test_1.it)('prefers the deep-link stored on target.url (trimmed)', () => {
        strict_1.default.equal((0, notifications_service_1.resolveNotificationUrl)({ workspaceId: 'ws1', target: { entityType: 'task', entityId: 't1', url: '  /app/ws1/board?task=t1  ' } }), '/app/ws1/board?task=t1');
    });
    (0, node_test_1.it)('falls back to a route per entity type when no url is stored', () => {
        const ws = 'ws1';
        strict_1.default.equal((0, notifications_service_1.resolveNotificationUrl)({ workspaceId: ws, target: { entityType: 'task', entityId: 't9' } }), '/app/ws1/tasks/t9');
        strict_1.default.equal((0, notifications_service_1.resolveNotificationUrl)({ workspaceId: ws, target: { entityType: 'doc', entityId: 'd9' } }), '/app/ws1/docs?doc=d9');
        strict_1.default.equal((0, notifications_service_1.resolveNotificationUrl)({ workspaceId: ws, target: { entityType: 'chat_message', entityId: 'm9' } }), '/app/ws1/chat');
        strict_1.default.equal((0, notifications_service_1.resolveNotificationUrl)({ workspaceId: ws, target: { entityType: 'timesheet', entityId: 'x' } }), '/app/ws1/time/approvals');
        strict_1.default.equal((0, notifications_service_1.resolveNotificationUrl)({ workspaceId: ws, target: { entityType: 'insights', entityId: 'x' } }), '/app/ws1/insights');
        strict_1.default.equal((0, notifications_service_1.resolveNotificationUrl)({ workspaceId: ws, target: { entityType: 'workload', entityId: 'u1' } }), '/app/ws1/insights');
        strict_1.default.equal((0, notifications_service_1.resolveNotificationUrl)({ workspaceId: ws, target: { entityType: 'billing', entityId: 'ws1' } }), '/app/ws1/settings');
    });
    (0, node_test_1.it)('returns null (never throws) when there is nothing to resolve', () => {
        strict_1.default.equal((0, notifications_service_1.resolveNotificationUrl)({ workspaceId: 'ws1', target: null }), null);
        strict_1.default.equal((0, notifications_service_1.resolveNotificationUrl)({ workspaceId: 'ws1' }), null);
        strict_1.default.equal((0, notifications_service_1.resolveNotificationUrl)({ workspaceId: 'ws1', target: { entityType: 'task' } }), null); // no entityId
        strict_1.default.equal((0, notifications_service_1.resolveNotificationUrl)({ workspaceId: null, target: { entityType: 'task', entityId: 't1' } }), null); // no workspace
        strict_1.default.equal((0, notifications_service_1.resolveNotificationUrl)({ workspaceId: 'ws1', target: { entityType: 'mystery', entityId: 'z' } }), null);
    });
});
(0, node_test_1.describe)('NotificationsService.list — url/target enrichment (§10.1)', () => {
    (0, node_test_1.it)('adds a top-level url per notification and preserves the raw target + actor', async () => {
        const rows = [
            {
                notifications: {
                    id: 'n1', type: 'task_assigned', title: 'Assigned', body: null, workspaceId: 'ws1',
                    target: { entityType: 'task', entityId: 't1', url: '/app/ws1/s/p/l?task=t1' }, readAt: null, createdAt: new Date(),
                },
                users: { id: 'u2', displayName: 'Bob', email: 'bob@example.com' },
            },
            {
                notifications: {
                    id: 'n2', type: 'ai_briefing', title: 'Briefing', body: null, workspaceId: 'ws1',
                    target: null, readAt: null, createdAt: new Date(),
                },
                users: null,
            },
            {
                notifications: {
                    id: 'n3', type: 'task_due_soon', title: 'Due soon', body: null, workspaceId: 'ws2',
                    target: { entityType: 'task', entityId: 't3' }, readAt: null, createdAt: new Date(),
                },
                users: null,
            },
        ];
        const svc = new notifications_service_1.NotificationsService(buildListDb(rows), {}, {}, stubConfig());
        const res = await svc.list('u1');
        strict_1.default.equal(res.length, 3);
        // stored url surfaced verbatim + raw target kept + actor mapped
        strict_1.default.equal(res[0].url, '/app/ws1/s/p/l?task=t1');
        strict_1.default.deepEqual(res[0].target, { entityType: 'task', entityId: 't1', url: '/app/ws1/s/p/l?task=t1' });
        strict_1.default.equal(res[0].actor.displayName, 'Bob');
        // no target ⇒ null url (not a crash)
        strict_1.default.equal(res[1].url, null);
        // entity ref without a url ⇒ best-effort fallback route
        strict_1.default.equal(res[2].url, '/app/ws2/tasks/t3');
    });
});
//# sourceMappingURL=notifications.service.test.js.map