"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const container_access_1 = require("./container-access");
const dbWithRole = (rows) => ({
    select: () => ({
        from: () => ({
            where: () => ({
                limit: async () => rows,
            }),
        }),
    }),
});
/**
 * Delete scoping issues TWO selects in sequence (workspaceMembers role, then
 * spaceMembers membership); this mock returns a different result per call so the
 * two lookups can be distinguished.
 */
const dbQueue = (results) => {
    const q = [...results];
    return {
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: async () => q.shift() ?? [],
                }),
            }),
        }),
    };
};
(0, node_test_1.describe)('assertCanManageContainer', () => {
    (0, node_test_1.it)('allows the creator regardless of role', async () => {
        // No membership row needed — creator short-circuits before the DB lookup.
        await (0, container_access_1.assertCanManageContainer)(dbWithRole([]), {
            workspaceId: 'w1', createdById: 'u1', actorId: 'u1', kind: 'list',
        });
    });
    (0, node_test_1.it)('allows a workspace admin who is not the creator', async () => {
        await (0, container_access_1.assertCanManageContainer)(dbWithRole([{ role: 'workspace_admin' }]), {
            workspaceId: 'w1', createdById: 'someone-else', actorId: 'u2', kind: 'space',
        });
    });
    (0, node_test_1.it)('allows a manager', async () => {
        await (0, container_access_1.assertCanManageContainer)(dbWithRole([{ role: 'manager' }]), {
            workspaceId: 'w1', createdById: 'x', actorId: 'u3', kind: 'project',
        });
    });
    (0, node_test_1.it)('rejects a plain member who is not the creator', async () => {
        await strict_1.default.rejects(() => (0, container_access_1.assertCanManageContainer)(dbWithRole([{ role: 'member' }]), {
            workspaceId: 'w1', createdById: 'owner', actorId: 'intruder', kind: 'list',
        }), /Only the creator or a workspace admin/);
    });
    (0, node_test_1.it)('rejects a non-member entirely', async () => {
        await strict_1.default.rejects(() => (0, container_access_1.assertCanManageContainer)(dbWithRole([]), {
            workspaceId: 'w1', createdById: 'owner', actorId: 'stranger', kind: 'space',
        }), /Only the creator or a workspace admin/);
    });
});
(0, node_test_1.describe)('assertCanManageContainer — delete scoping (plan §3: Manager own-space)', () => {
    (0, node_test_1.it)('lets a workspace admin delete a space', async () => {
        await (0, container_access_1.assertCanManageContainer)(dbQueue([[{ role: 'workspace_admin' }]]), {
            workspaceId: 'w1', createdById: 'other', actorId: 'admin', kind: 'space',
            action: 'delete', adminOnlyDelete: true, spaceId: 's1',
        });
    });
    (0, node_test_1.it)('lets the creator delete their own space (short-circuits before any lookup)', async () => {
        await (0, container_access_1.assertCanManageContainer)(dbQueue([]), {
            workspaceId: 'w1', createdById: 'owner', actorId: 'owner', kind: 'space',
            action: 'delete', adminOnlyDelete: true, spaceId: 's1',
        });
    });
    (0, node_test_1.it)('forbids a manager from deleting an entire space (space.delete is admin-only)', async () => {
        await strict_1.default.rejects(() => (0, container_access_1.assertCanManageContainer)(dbQueue([[{ role: 'manager' }]]), {
            workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'space',
            action: 'delete', adminOnlyDelete: true, spaceId: 's1',
        }), /Only the creator or a workspace admin can delete this space/);
    });
    (0, node_test_1.it)('lets a manager delete a project in a space they belong to', async () => {
        // [workspaceMembers → manager, spaceMembers → membership row present]
        await (0, container_access_1.assertCanManageContainer)(dbQueue([[{ role: 'manager' }], [{ userId: 'mgr' }]]), {
            workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'project',
            action: 'delete', spaceId: 's1',
        });
    });
    (0, node_test_1.it)('forbids a manager from deleting a project in a space they do NOT belong to', async () => {
        // [workspaceMembers → manager, spaceMembers → empty (not a member)]
        await strict_1.default.rejects(() => (0, container_access_1.assertCanManageContainer)(dbQueue([[{ role: 'manager' }], []]), {
            workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'project',
            action: 'delete', spaceId: 's1',
        }), /Managers can only delete projects in their own spaces/);
    });
    (0, node_test_1.it)('still lets a manager EDIT (manage) any container without space membership — no regression', async () => {
        // Only the workspaceMembers lookup runs; edits never require space membership.
        await (0, container_access_1.assertCanManageContainer)(dbQueue([[{ role: 'manager' }]]), {
            workspaceId: 'w1', createdById: 'other', actorId: 'mgr', kind: 'project',
            action: 'manage', spaceId: 's1',
        });
    });
});
//# sourceMappingURL=container-access.test.js.map