"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const common_1 = require("@nestjs/common");
const db_1 = require("@rundesk/db");
const webhooks_service_1 = require("./webhooks.service");
/**
 * Outbound-webhook SSRF hardening. The delivery path runs through the shared
 * `safeFetch` guard, so a webhook pointed at a private/reserved address (e.g.
 * the 169.254.169.254 cloud-metadata endpoint) can neither be created nor used
 * to read internal responses. All checks here are synchronous literal-IP/scheme
 * rejections, so no real network is touched.
 */
/** Chainable drizzle stand-in: a queue of select results + captured writes. */
function makeDb(selects = []) {
    const selectQueue = [...selects];
    const inserts = [];
    const updates = [];
    const VERBS = ['from', 'where', 'orderBy', 'limit', 'returning'];
    const node = (rows) => {
        const p = Promise.resolve(rows);
        for (const v of VERBS)
            p[v] = () => p;
        return p;
    };
    const db = {
        select: () => node(selectQueue.shift() ?? []),
        insert: (table) => ({
            values: (v) => {
                inserts.push({ table, values: v });
                return node([{ id: 'new-id', ...v }]);
            },
        }),
        update: (table) => ({
            set: (s) => {
                updates.push({ table, set: s });
                return { where: () => node([{ id: 'upd', ...s }]) };
            },
        }),
    };
    return { db, inserts, updates };
}
const isBadRequest = (err) => err instanceof common_1.BadRequestException;
(0, node_test_1.describe)('WebhooksService.create — URL safety', () => {
    (0, node_test_1.it)('rejects a private/reserved-IP webhook URL (SSRF into cloud metadata) and persists nothing', async () => {
        const { db, inserts } = makeDb();
        const svc = new webhooks_service_1.WebhooksService(db);
        await strict_1.default.rejects(() => svc.create('ws-1', 'user-1', {
            name: 'evil',
            url: 'http://169.254.169.254/latest/meta-data/',
            events: ['task.created'],
        }), isBadRequest);
        strict_1.default.equal(inserts.length, 0, 'nothing persisted');
    });
    (0, node_test_1.it)('rejects loopback and non-http(s) schemes', async () => {
        const { db } = makeDb();
        const svc = new webhooks_service_1.WebhooksService(db);
        await strict_1.default.rejects(() => svc.create('ws-1', 'user-1', { name: 'x', url: 'http://127.0.0.1/hook', events: ['task.created'] }), isBadRequest);
        await strict_1.default.rejects(() => svc.create('ws-1', 'user-1', { name: 'x', url: 'file:///etc/passwd', events: ['task.created'] }), isBadRequest);
    });
    (0, node_test_1.it)('persists a webhook with a public https URL (and generates a secret)', async () => {
        const { db, inserts } = makeDb();
        const svc = new webhooks_service_1.WebhooksService(db);
        const row = await svc.create('ws-1', 'user-1', {
            name: 'ok',
            url: 'https://example.com/hook',
            events: ['task.created'],
        });
        strict_1.default.ok(row);
        strict_1.default.equal(inserts.length, 1);
        strict_1.default.equal(inserts[0].table, db_1.webhooks);
        strict_1.default.equal(inserts[0].values.url, 'https://example.com/hook');
        strict_1.default.ok(inserts[0].values.secret, 'a secret was generated');
    });
    (0, node_test_1.it)('update rejects repointing an existing webhook at an internal address', async () => {
        // assertOwnership select → an existing benign webhook.
        const existing = { id: 'wh-1', workspaceId: 'ws-1', url: 'https://example.com/hook' };
        const { db, updates } = makeDb([[existing]]);
        const svc = new webhooks_service_1.WebhooksService(db);
        await strict_1.default.rejects(() => svc.update('ws-1', 'wh-1', { url: 'http://10.0.0.5/internal' }), isBadRequest);
        strict_1.default.equal(updates.length, 0, 'no write when the new URL is blocked');
    });
});
(0, node_test_1.describe)('WebhooksService delivery — blocked host records a failure', () => {
    (0, node_test_1.it)('records a failed delivery (no retries) when the target resolves to a blocked address', async () => {
        const hook = {
            id: 'wh-1',
            workspaceId: 'ws-1',
            url: 'http://169.254.169.254/',
            secret: 'sek',
            successCount: 0,
            failureCount: 0,
        };
        // assertOwnership select → [hook]
        const { db, inserts, updates } = makeDb([[hook]]);
        const svc = new webhooks_service_1.WebhooksService(db);
        const res = await svc.testWebhook('ws-1', 'wh-1');
        strict_1.default.deepEqual(res, { ok: true });
        // A delivery row was recorded as a failure, with the SSRF block as the body.
        const deliveryInserts = inserts.filter((r) => r.table === db_1.webhookDeliveries);
        strict_1.default.equal(deliveryInserts.length, 1);
        const rec = deliveryInserts[0].values;
        strict_1.default.equal(rec.success, false);
        strict_1.default.equal(rec.statusCode, undefined);
        strict_1.default.equal(rec.attempts, 1, 'an SSRF block is permanent — not retried');
        strict_1.default.match(String(rec.responseBody), /blocked|private|reserved/i);
        // The webhook's failure counter was bumped (not the success counter).
        const whUpdates = updates.filter((u) => u.table === db_1.webhooks);
        strict_1.default.equal(whUpdates.length, 1);
        strict_1.default.equal(whUpdates[0].set.failureCount, 1);
    });
});
//# sourceMappingURL=webhooks.service.test.js.map