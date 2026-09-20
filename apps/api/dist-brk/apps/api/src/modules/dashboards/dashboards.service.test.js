"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const dashboards_service_1 = require("./dashboards.service");
/**
 * §5.7 — Workspace-default dashboard for admins.
 *
 * The service is exercised against a minimal chainable drizzle mock, following
 * the same idiom as the other *.service.test.ts files. `selectQueue` feeds one
 * result-set per `select(...).from(...).where(...)` call (in order); update
 * `.set(...)` arguments are captured so we can assert what was written.
 */
function buildDb(opts = {}) {
    const selectQueue = [...(opts.selectQueue ?? [])];
    const updateReturning = [...(opts.updateReturning ?? [])];
    const updateSets = [];
    // Thenable so `await select().from().where()` resolves, while still exposing
    // `.limit()` for the callers that page down to a single row.
    const chainable = (rows) => ({
        then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
        limit: node_test_1.mock.fn(async () => rows),
    });
    const db = {
        select: node_test_1.mock.fn(() => ({
            from: node_test_1.mock.fn(() => {
                const where = node_test_1.mock.fn(() => chainable(selectQueue.shift() ?? []));
                // listPresets joins the owner in, so `from(...)` must also accept a
                // leftJoin before the where.
                return { where, leftJoin: node_test_1.mock.fn(() => ({ where })) };
            }),
        })),
        update: node_test_1.mock.fn(() => ({
            set: node_test_1.mock.fn((arg) => {
                updateSets.push(arg);
                return {
                    where: node_test_1.mock.fn(() => ({
                        // Awaitable for clear-style updates (no `.returning()`)...
                        then: (resolve, reject) => Promise.resolve(undefined).then(resolve, reject),
                        // ...and `.returning()` for the update that reads the row back.
                        returning: node_test_1.mock.fn(async () => [updateReturning.shift() ?? {}]),
                    })),
                };
            }),
        })),
    };
    return { db, updateSets };
}
const WS = 'ws-1';
const PRESET = 'preset-1';
(0, node_test_1.describe)('DashboardsService.setWorkspaceDefault', () => {
    (0, node_test_1.it)('marks the target and clears the workspace-default on every other preset', async () => {
        const { db, updateSets } = buildDb({
            selectQueue: [
                [{ role: 'workspace_admin' }], // assertWorkspaceAdmin membership lookup
                [{ id: PRESET, workspaceId: WS }], // preset existence check
            ],
            updateReturning: [{ id: PRESET, isWorkspaceDefault: true }],
        });
        const svc = new dashboards_service_1.DashboardsService(db);
        const result = await svc.setWorkspaceDefault(WS, PRESET, { id: 'admin', role: 'member' });
        strict_1.default.equal(result.isWorkspaceDefault, true);
        // Two writes: first clears others, then sets the target.
        strict_1.default.equal(updateSets.length, 2);
        strict_1.default.equal(updateSets[0].isWorkspaceDefault, false);
        strict_1.default.equal(updateSets[1].isWorkspaceDefault, true);
    });
    (0, node_test_1.it)('allows a global super_admin without a membership lookup', async () => {
        const { db, updateSets } = buildDb({
            // No membership row queued — the super_admin branch must not consult it.
            selectQueue: [[{ id: PRESET, workspaceId: WS }]],
            updateReturning: [{ id: PRESET, isWorkspaceDefault: true }],
        });
        const svc = new dashboards_service_1.DashboardsService(db);
        const result = await svc.setWorkspaceDefault(WS, PRESET, { id: 'root', role: 'super_admin' });
        strict_1.default.equal(result.isWorkspaceDefault, true);
        strict_1.default.equal(updateSets.length, 2);
    });
    (0, node_test_1.it)('rejects a non-admin member', async () => {
        const { db } = buildDb({ selectQueue: [[{ role: 'member' }]] });
        const svc = new dashboards_service_1.DashboardsService(db);
        await strict_1.default.rejects(() => svc.setWorkspaceDefault(WS, PRESET, { id: 'u', role: 'member' }), (e) => e instanceof common_1.ForbiddenException);
    });
    (0, node_test_1.it)('rejects a non-member (no membership row)', async () => {
        const { db } = buildDb({ selectQueue: [[]] });
        const svc = new dashboards_service_1.DashboardsService(db);
        await strict_1.default.rejects(() => svc.setWorkspaceDefault(WS, PRESET, { id: 'outsider', role: 'member' }), (e) => e instanceof common_1.ForbiddenException);
    });
    (0, node_test_1.it)('404s when the preset is not in the workspace', async () => {
        const { db } = buildDb({
            selectQueue: [
                [{ role: 'workspace_admin' }], // passes the admin gate
                [], // preset lookup misses
            ],
        });
        const svc = new dashboards_service_1.DashboardsService(db);
        await strict_1.default.rejects(() => svc.setWorkspaceDefault(WS, PRESET, { id: 'admin', role: 'member' }), (e) => e instanceof common_1.NotFoundException);
    });
});
(0, node_test_1.describe)('DashboardsService.getDefaultPreset', () => {
    (0, node_test_1.it)("returns the user's own default when they have one (wins over the workspace default)", async () => {
        const { db } = buildDb({
            selectQueue: [[{ id: 'mine', isDefault: true }]], // personal default found
        });
        const svc = new dashboards_service_1.DashboardsService(db);
        const result = await svc.getDefaultPreset('u', WS);
        strict_1.default.equal(result?.id, 'mine');
    });
    (0, node_test_1.it)('falls back to the workspace default when the user has no personal default', async () => {
        const { db } = buildDb({
            selectQueue: [
                [], // no personal default
                [{ id: 'ws-default', isWorkspaceDefault: true }], // workspace default
            ],
        });
        const svc = new dashboards_service_1.DashboardsService(db);
        const result = await svc.getDefaultPreset('u', WS);
        strict_1.default.equal(result?.id, 'ws-default');
    });
    (0, node_test_1.it)('returns null when neither a personal nor a workspace default exists', async () => {
        const { db } = buildDb({ selectQueue: [[], []] });
        const svc = new dashboards_service_1.DashboardsService(db);
        const result = await svc.getDefaultPreset('u', WS);
        strict_1.default.equal(result, null);
    });
});
(0, node_test_1.describe)('DashboardsService.listPresets', () => {
    (0, node_test_1.it)('returns the workspace-default preset alongside the user’s own', async () => {
        const rows = [
            { id: 'mine', userId: 'u', isWorkspaceDefault: false },
            { id: 'ws-default', userId: 'admin', isWorkspaceDefault: true },
        ];
        // First select resolves the object_shares grants, second the presets.
        const { db } = buildDb({ selectQueue: [[], rows] });
        const svc = new dashboards_service_1.DashboardsService(db);
        const result = await svc.listPresets('u', WS);
        strict_1.default.equal(result.length, 2);
        strict_1.default.ok(result.some((p) => p.isWorkspaceDefault === true));
    });
    // A5.11 — a grant in object_shares is the only thing behind "Shared with me".
    (0, node_test_1.it)('flags ownership and shared-with-me from the share grants', async () => {
        const rows = [
            { id: 'mine', userId: 'u', isWorkspaceDefault: false },
            { id: 'theirs', userId: 'other', isWorkspaceDefault: false },
        ];
        const { db } = buildDb({ selectQueue: [[{ objectId: 'theirs' }], rows] });
        const svc = new dashboards_service_1.DashboardsService(db);
        const result = await svc.listPresets('u', WS);
        strict_1.default.deepEqual(result.map((p) => [p.id, p.isOwner, p.isSharedWithMe]), [
            ['mine', true, false],
            ['theirs', false, true],
        ]);
    });
});
(0, node_test_1.describe)('DashboardsService.clearWorkspaceDefault', () => {
    (0, node_test_1.it)('clears the workspace-default flag and reports ok', async () => {
        const { db, updateSets } = buildDb();
        const svc = new dashboards_service_1.DashboardsService(db);
        const result = await svc.clearWorkspaceDefault(WS);
        strict_1.default.deepEqual(result, { ok: true });
        strict_1.default.equal(updateSets.length, 1);
        strict_1.default.equal(updateSets[0].isWorkspaceDefault, false);
    });
});
//# sourceMappingURL=dashboards.service.test.js.map