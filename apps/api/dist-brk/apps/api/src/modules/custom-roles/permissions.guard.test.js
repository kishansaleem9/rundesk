"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const permissions_guard_1 = require("./permissions.guard");
/**
 * The super_admin bypass MUST run before the workspace-context requirement.
 * Regression: on routes whose workspace is only derivable by ResourceMemberGuard
 * (e.g. POST /projects carries just `spaceId`, and ResourceMemberGuard
 * short-circuits for super_admin without populating req.workspaceMember), a
 * super-admin would otherwise be wrongly 403'd on a core action like creating a
 * project.
 */
function ctxFor(user, params = {}, body = {}, workspaceMember) {
    const req = { user, params, body, workspaceMember };
    return {
        getHandler: () => () => undefined,
        getClass: () => class {
        },
        switchToHttp: () => ({ getRequest: () => req }),
    };
}
const reflectorReturning = (val) => ({ getAllAndOverride: () => val });
const rolesStub = (perms = []) => ({ resolveForUser: async () => ({ permissions: perms }) });
(0, node_test_1.default)('no required permissions → allow', async () => {
    const g = new permissions_guard_1.PermissionsGuard(reflectorReturning(undefined), rolesStub());
    strict_1.default.equal(await g.canActivate(ctxFor({ id: 'u', role: 'member' })), true);
});
(0, node_test_1.default)('super_admin bypasses even with NO workspace context (regression: POST /projects)', async () => {
    // A required permission IS declared, and the request carries no workspaceId
    // anywhere (params/body/workspaceMember all lack it) — must NOT 403.
    const g = new permissions_guard_1.PermissionsGuard(reflectorReturning(['project.create']), rolesStub());
    strict_1.default.equal(await g.canActivate(ctxFor({ id: 'root', role: 'super_admin' }, {}, { spaceId: 'sp-1' })), true);
});
(0, node_test_1.default)('non-super_admin without any workspace context → 403 Workspace context required', async () => {
    const g = new permissions_guard_1.PermissionsGuard(reflectorReturning(['project.create']), rolesStub());
    await strict_1.default.rejects(() => g.canActivate(ctxFor({ id: 'u', role: 'member' }, {}, { spaceId: 'sp-1' })), /Workspace context required/);
});
(0, node_test_1.default)('member WITH the granted permission (workspace via req.workspaceMember) → allow', async () => {
    const g = new permissions_guard_1.PermissionsGuard(reflectorReturning(['project.create']), rolesStub(['project.create']));
    strict_1.default.equal(await g.canActivate(ctxFor({ id: 'u', role: 'member' }, {}, {}, { workspaceId: 'ws-1' })), true);
});
(0, node_test_1.default)('member MISSING the permission → 403 Missing required permission', async () => {
    const g = new permissions_guard_1.PermissionsGuard(reflectorReturning(['project.create']), rolesStub([]));
    await strict_1.default.rejects(() => g.canActivate(ctxFor({ id: 'u', role: 'member' }, { workspaceId: 'ws-1' })), /Missing required permission/);
});
//# sourceMappingURL=permissions.guard.test.js.map