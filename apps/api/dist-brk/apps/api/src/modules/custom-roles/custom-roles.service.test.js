"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const custom_roles_service_1 = require("./custom-roles.service");
const permission_catalog_1 = require("./permission-catalog");
/**
 * Drizzle-shaped mock builder. Tests script per-call returns so a single
 * service method can exercise multiple chained queries. `selectQueues`
 * is consumed in FIFO order across all `.select()` calls.
 */
function buildDb(opts = {}) {
    const queue = [...(opts.selectQueues ?? [])];
    const chainableArray = (rows) => {
        // Each terminal method (`limit`, `orderBy`, awaiting the chain itself)
        // resolves to the same rows array. We make the chain thenable so
        // `await db.select().from().where()` works without an explicit limit.
        const fns = {
            then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
            limit: node_test_1.mock.fn(async () => rows),
            orderBy: node_test_1.mock.fn(() => chainableArray(rows)),
        };
        return fns;
    };
    return {
        select: node_test_1.mock.fn(() => ({
            from: node_test_1.mock.fn(() => ({
                where: node_test_1.mock.fn(() => {
                    const next = queue.shift() ?? [];
                    return chainableArray(next);
                }),
                innerJoin: node_test_1.mock.fn(() => ({
                    where: node_test_1.mock.fn(() => {
                        const next = queue.shift() ?? [];
                        return chainableArray(next);
                    }),
                })),
                orderBy: node_test_1.mock.fn(() => chainableArray(queue.shift() ?? [])),
                limit: node_test_1.mock.fn(async () => queue.shift() ?? []),
            })),
        })),
        insert: node_test_1.mock.fn(() => ({
            values: node_test_1.mock.fn(async () => {
                if (opts.insertThrows) {
                    throw new Error(typeof opts.insertThrows === 'string'
                        ? opts.insertThrows
                        : 'insert failed');
                }
                return opts.insertReturning ?? [];
            }),
        })),
        update: node_test_1.mock.fn(() => ({
            set: node_test_1.mock.fn(() => ({
                where: node_test_1.mock.fn(async () => undefined),
            })),
        })),
        delete: node_test_1.mock.fn(() => ({
            where: node_test_1.mock.fn(async () => undefined),
        })),
    };
}
function buildSecurity() {
    return { logAuditEvent: node_test_1.mock.fn(async () => undefined) };
}
const ACTOR = { id: '11111111-1111-1111-1111-111111111111', email: 'admin@example.com' };
const WORKSPACE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
(0, node_test_1.describe)('permission-catalog', () => {
    (0, node_test_1.it)('admin and workspace_admin grant every catalog permission', () => {
        // workspace_admin should grant every key in the catalog so legacy
        // workspace admins continue to pass every permission check.
        const wsAdmin = new Set(permission_catalog_1.LEGACY_ROLE_PERMISSIONS.workspace_admin);
        for (const p of permission_catalog_1.LEGACY_ROLE_PERMISSIONS.super_admin)
            strict_1.default.ok(wsAdmin.has(p));
    });
    (0, node_test_1.it)('guests get zero permissions by default', () => {
        strict_1.default.equal(permission_catalog_1.LEGACY_ROLE_PERMISSIONS.guest.length, 0);
    });
    (0, node_test_1.it)('isKnownPermission rejects unknown keys', () => {
        strict_1.default.equal((0, permission_catalog_1.isKnownPermission)('unknown.thing'), false);
        strict_1.default.equal((0, permission_catalog_1.isKnownPermission)('sso.manage'), true);
    });
});
(0, node_test_1.describe)('CustomRolesService.create — input validation', () => {
    (0, node_test_1.it)('rejects empty names', async () => {
        const db = buildDb();
        const svc = new custom_roles_service_1.CustomRolesService(db, buildSecurity());
        await strict_1.default.rejects(() => svc.create(WORKSPACE_ID, { name: '   ' }, ACTOR), (e) => e instanceof common_1.BadRequestException);
    });
    (0, node_test_1.it)('rejects reserved names regardless of case', async () => {
        const db = buildDb();
        const svc = new custom_roles_service_1.CustomRolesService(db, buildSecurity());
        await strict_1.default.rejects(() => svc.create(WORKSPACE_ID, { name: 'Workspace Admin' }, ACTOR), (e) => e instanceof common_1.BadRequestException && /reserved/i.test(e.message));
    });
    (0, node_test_1.it)('rejects unknown permissions', async () => {
        const db = buildDb({ selectQueues: [[]] });
        const svc = new custom_roles_service_1.CustomRolesService(db, buildSecurity());
        await strict_1.default.rejects(() => svc.create(WORKSPACE_ID, { name: 'Auditor', permissions: ['some.fake.permission'] }, ACTOR), (e) => e instanceof common_1.BadRequestException && /Unknown permission/.test(e.message));
    });
    (0, node_test_1.it)('rejects malformed colors', async () => {
        const db = buildDb({ selectQueues: [[]] });
        const svc = new custom_roles_service_1.CustomRolesService(db, buildSecurity());
        await strict_1.default.rejects(() => svc.create(WORKSPACE_ID, { name: 'Auditor', color: 'red' }, ACTOR), (e) => e instanceof common_1.BadRequestException && /hex/i.test(e.message));
    });
    (0, node_test_1.it)('rejects duplicate names within the same workspace', async () => {
        // First select: name-availability check returns an existing row.
        const db = buildDb({ selectQueues: [[{ id: 'existing' }]] });
        const svc = new custom_roles_service_1.CustomRolesService(db, buildSecurity());
        await strict_1.default.rejects(() => svc.create(WORKSPACE_ID, { name: 'Auditor' }, ACTOR), (e) => e instanceof common_1.ConflictException);
    });
});
(0, node_test_1.describe)('CustomRolesService.update — locked-role guard', () => {
    (0, node_test_1.it)('refuses to rename a locked role', async () => {
        // First select: requireRole returns a locked role.
        const db = buildDb({
            selectQueues: [[{ id: 'role-1', workspaceId: WORKSPACE_ID, name: 'Admin', isLocked: true }]],
        });
        const svc = new custom_roles_service_1.CustomRolesService(db, buildSecurity());
        await strict_1.default.rejects(() => svc.update(WORKSPACE_ID, 'role-1', { name: 'Renamed' }, ACTOR), (e) => e instanceof common_1.BadRequestException && /Locked/.test(e.message));
    });
    (0, node_test_1.it)('refuses to delete a locked role', async () => {
        const db = buildDb({
            selectQueues: [[{ id: 'role-1', workspaceId: WORKSPACE_ID, name: 'Admin', isLocked: true }]],
        });
        const svc = new custom_roles_service_1.CustomRolesService(db, buildSecurity());
        await strict_1.default.rejects(() => svc.remove(WORKSPACE_ID, 'role-1', ACTOR), (e) => e instanceof common_1.BadRequestException);
    });
    (0, node_test_1.it)('throws NotFound for a missing role', async () => {
        const db = buildDb({ selectQueues: [[]] });
        const svc = new custom_roles_service_1.CustomRolesService(db, buildSecurity());
        await strict_1.default.rejects(() => svc.remove(WORKSPACE_ID, 'missing', ACTOR), (e) => e instanceof common_1.NotFoundException);
    });
});
(0, node_test_1.describe)('CustomRolesService.resolveForMember — permission union', () => {
    (0, node_test_1.it)("returns the legacy role's baseline permissions when no custom roles are assigned", async () => {
        // First select: empty role-assignment list. No second select needed
        // because `customRoleIds` is empty.
        const db = buildDb({ selectQueues: [[]] });
        const svc = new custom_roles_service_1.CustomRolesService(db, buildSecurity());
        const resolution = await svc.resolveForMember('member-1', 'member');
        strict_1.default.deepEqual(resolution.permissions.sort(), [...permission_catalog_1.LEGACY_ROLE_PERMISSIONS.member].sort());
        strict_1.default.equal(resolution.legacyRole, 'member');
        strict_1.default.deepEqual(resolution.customRoleIds, []);
    });
    (0, node_test_1.it)('unions custom role permissions on top of legacy role permissions', async () => {
        // 1st select: assignment rows (role IDs). 2nd select: permissions for those roles.
        const db = buildDb({
            selectQueues: [
                [{ roleId: 'role-1' }],
                [
                    { roleId: 'role-1', permission: 'sso.manage' },
                    { roleId: 'role-1', permission: 'workspace.audit.view' },
                ],
            ],
        });
        const svc = new custom_roles_service_1.CustomRolesService(db, buildSecurity());
        const resolution = await svc.resolveForMember('member-2', 'member');
        // Member legacy grants `space.create`, `doc.publish`, `report.export`.
        // Custom role adds `sso.manage` + `workspace.audit.view`. All unioned.
        const set = new Set(resolution.permissions);
        strict_1.default.ok(set.has('space.create'));
        strict_1.default.ok(set.has('sso.manage'));
        strict_1.default.ok(set.has('workspace.audit.view'));
    });
    (0, node_test_1.it)('drops unknown permission strings from the union (forward compatibility)', async () => {
        // Old permission strings that have since been removed from the catalog
        // should be silently filtered rather than crashing the resolver.
        const db = buildDb({
            selectQueues: [
                [{ roleId: 'role-1' }],
                [
                    { roleId: 'role-1', permission: 'sso.manage' },
                    { roleId: 'role-1', permission: 'permission.from.future.version' },
                ],
            ],
        });
        const svc = new custom_roles_service_1.CustomRolesService(db, buildSecurity());
        const resolution = await svc.resolveForMember('member-3', 'guest');
        strict_1.default.ok(resolution.permissions.includes('sso.manage'));
        strict_1.default.equal(resolution.permissions.includes('permission.from.future.version'), false);
    });
    (0, node_test_1.it)('caches resolutions per workspaceMemberId', async () => {
        const db = buildDb({ selectQueues: [[], []] });
        const svc = new custom_roles_service_1.CustomRolesService(db, buildSecurity());
        await svc.resolveForMember('member-cached', 'member');
        // Second call should hit cache and NOT consume another select.
        await svc.resolveForMember('member-cached', 'member');
        // Only one .select() invocation total (the first resolution).
        strict_1.default.equal(db.select.mock.callCount(), 1);
    });
});
//# sourceMappingURL=custom-roles.service.test.js.map