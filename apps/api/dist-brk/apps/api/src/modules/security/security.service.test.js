"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const security_service_1 = require("./security.service");
/**
 * The audit list/export filtering (Plan §13.3) is exercised against a small
 * mock DB that records the pagination arguments and echoes fixed rows, plus
 * a check that `logAuditEvent` forwards the request IP to the insert.
 */
function buildDb(rows = []) {
    const captured = {};
    // `.limit(n)` must be awaitable (export path) AND expose `.offset(o)` (list path).
    const afterOrderBy = {
        limit: (n) => {
            captured.limit = n;
            const awaitable = Promise.resolve(rows);
            return Object.assign(awaitable, {
                offset: (o) => {
                    captured.offset = o;
                    return Promise.resolve(rows);
                },
            });
        },
    };
    const db = {
        select: () => ({ from: () => ({ where: () => ({ orderBy: () => afterOrderBy }) }) }),
        insert: () => ({ values: async (v) => { captured.inserted = v; } }),
    };
    return { db, captured };
}
(0, node_test_1.describe)('SecurityService.logAuditEvent — IP capture (§13.3)', () => {
    (0, node_test_1.it)('forwards ipAddress to the inserted row', async () => {
        const { db, captured } = buildDb();
        const svc = new security_service_1.SecurityService(db);
        await svc.logAuditEvent({
            workspaceId: 'ws',
            actorId: 'u',
            action: 'role.changed',
            description: 'x',
            ipAddress: '198.51.100.7',
        });
        strict_1.default.equal(captured.inserted.ipAddress, '198.51.100.7');
    });
});
(0, node_test_1.describe)('SecurityService.getAuditLogs — server-side pagination (§13.3)', () => {
    (0, node_test_1.it)('clamps the page size to 200 and computes the offset from page', async () => {
        const { db, captured } = buildDb([]);
        const svc = new security_service_1.SecurityService(db);
        await svc.getAuditLogs('ws', { page: 3, limit: 999, actorId: 'u', from: new Date('2026-01-01'), actionPrefixes: ['member.', 'role.'] });
        strict_1.default.equal(captured.limit, 200); // clamped
        strict_1.default.equal(captured.offset, 400); // (page 3 - 1) * 200
    });
    (0, node_test_1.it)('defaults to 50 rows on the first page', async () => {
        const { db, captured } = buildDb([]);
        const svc = new security_service_1.SecurityService(db);
        await svc.getAuditLogs('ws', {});
        strict_1.default.equal(captured.limit, 50);
        strict_1.default.equal(captured.offset, 0);
    });
});
(0, node_test_1.describe)('SecurityService.exportAuditLogsCsv — filtered CSV (§13.3)', () => {
    (0, node_test_1.it)('includes an IP address column and renders the row values', async () => {
        const rows = [
            {
                createdAt: new Date('2026-07-16T10:00:00.000Z'),
                actorEmail: 'admin@acme.test',
                actorId: 'a1',
                action: 'role.changed',
                resourceType: 'user',
                resourceId: 'u2',
                description: 'Member role changed to manager',
                ipAddress: '203.0.113.5',
            },
        ];
        const { db } = buildDb(rows);
        const svc = new security_service_1.SecurityService(db);
        const csv = await svc.exportAuditLogsCsv('ws', { actionPrefixes: ['role.'] });
        const [header, first] = csv.split('\n');
        strict_1.default.match(header, /IP address/);
        strict_1.default.match(first, /2026-07-16T10:00:00\.000Z/);
        strict_1.default.match(first, /admin@acme\.test/);
        strict_1.default.match(first, /203\.0\.113\.5/);
    });
});
(0, node_test_1.describe)('SecurityService.exportAuditLogsCsv — formula injection neutralized (security)', () => {
    (0, node_test_1.it)('prefixes cells starting with = + - @ so spreadsheets do not execute them', async () => {
        const rows = [
            {
                createdAt: new Date('2026-07-16T10:00:00.000Z'),
                actorEmail: '=cmd|calc', // classic CSV/DDE injection payload
                actorId: 'a1',
                action: '+SUM(A1)',
                resourceType: 'user',
                resourceId: 'u2',
                description: '@evil',
                ipAddress: '-1+1',
            },
        ];
        const { db } = buildDb(rows);
        const svc = new security_service_1.SecurityService(db);
        const csv = await svc.exportAuditLogsCsv('ws', {});
        const [, first] = csv.split('\n');
        // Each dangerous leading character is escaped with a single quote inside the quoted cell.
        strict_1.default.match(first, /"'=cmd\|calc"/);
        strict_1.default.match(first, /"'\+SUM\(A1\)"/);
        strict_1.default.match(first, /"'@evil"/);
        strict_1.default.match(first, /"'-1\+1"/);
        // A benign value (resource "user:u2") is left untouched — no spurious quote prefix.
        strict_1.default.match(first, /"user:u2"/);
    });
});
// ─── TOTP setup: no third-party QR / secret leak ────────────────────────────
function buildTotpDb(user) {
    return {
        select: () => ({ from: () => ({ where: async () => (user ? [user] : []) }) }),
        delete: () => ({ where: async () => undefined }),
        insert: () => ({ values: async () => undefined }),
    };
}
(0, node_test_1.describe)('SecurityService.setupTotp — client-side QR, no secret leak (security)', () => {
    (0, node_test_1.it)('returns an otpauth:// URI + secret and never a Google Charts URL', async () => {
        const svc = new security_service_1.SecurityService(buildTotpDb({ email: 'u@acme.test', displayName: 'U' }));
        const result = await svc.setupTotp('user-1');
        strict_1.default.match(result.otpauthUrl, /^otpauth:\/\/totp\//);
        strict_1.default.ok(typeof result.secret === 'string' && result.secret.length > 0);
        // The deprecated Google Charts field must be gone, and the secret must not
        // be embedded in any third-party URL anywhere in the response.
        strict_1.default.ok(!('qrCodeUrl' in result), 'qrCodeUrl field must be dropped');
        strict_1.default.doesNotMatch(JSON.stringify(result), /googleapis\.com|chart\?/);
    });
});
//# sourceMappingURL=security.service.test.js.map