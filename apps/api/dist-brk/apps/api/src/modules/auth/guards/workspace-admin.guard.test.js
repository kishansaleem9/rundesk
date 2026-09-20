"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const common_1 = require("@nestjs/common");
const workspace_admin_guard_1 = require("./workspace-admin.guard");
// Minimal drizzle chain mock: select().from().where().limit() resolves to `rows`.
function makeDb(rows) {
    const chain = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.limit = () => Promise.resolve(rows);
    return { select: () => chain };
}
function ctxFor(user, params) {
    const req = { user, params };
    return { switchToHttp: () => ({ getRequest: () => req }) };
}
const WS = 'ws-1';
(0, node_test_1.default)('WorkspaceAdminGuard rejects an unauthenticated request', async () => {
    const guard = new workspace_admin_guard_1.WorkspaceAdminGuard(makeDb([]));
    await strict_1.default.rejects(() => guard.canActivate(ctxFor(undefined, { workspaceId: WS })), common_1.ForbiddenException);
});
(0, node_test_1.default)('WorkspaceAdminGuard rejects when no workspace context', async () => {
    const guard = new workspace_admin_guard_1.WorkspaceAdminGuard(makeDb([]));
    await strict_1.default.rejects(() => guard.canActivate(ctxFor({ id: 'u', role: 'workspace_admin' }, {})), common_1.ForbiddenException);
});
(0, node_test_1.default)('WorkspaceAdminGuard DENIES a guest member', async () => {
    const guard = new workspace_admin_guard_1.WorkspaceAdminGuard(makeDb([{ userId: 'u', workspaceId: WS, role: 'guest' }]));
    await strict_1.default.rejects(() => guard.canActivate(ctxFor({ id: 'u', role: 'member' }, { workspaceId: WS })), common_1.ForbiddenException);
});
(0, node_test_1.default)('WorkspaceAdminGuard DENIES a plain member', async () => {
    const guard = new workspace_admin_guard_1.WorkspaceAdminGuard(makeDb([{ userId: 'u', workspaceId: WS, role: 'member' }]));
    await strict_1.default.rejects(() => guard.canActivate(ctxFor({ id: 'u', role: 'member' }, { workspaceId: WS })), common_1.ForbiddenException);
});
(0, node_test_1.default)('WorkspaceAdminGuard DENIES a non-member (no membership row)', async () => {
    const guard = new workspace_admin_guard_1.WorkspaceAdminGuard(makeDb([]));
    await strict_1.default.rejects(() => guard.canActivate(ctxFor({ id: 'outsider', role: 'member' }, { workspaceId: WS })), common_1.NotFoundException);
});
(0, node_test_1.default)('WorkspaceAdminGuard ALLOWS a workspace_admin', async () => {
    const guard = new workspace_admin_guard_1.WorkspaceAdminGuard(makeDb([{ userId: 'u', workspaceId: WS, role: 'workspace_admin' }]));
    strict_1.default.equal(await guard.canActivate(ctxFor({ id: 'u', role: 'member' }, { workspaceId: WS })), true);
});
(0, node_test_1.default)('WorkspaceAdminGuard ALLOWS a manager', async () => {
    const guard = new workspace_admin_guard_1.WorkspaceAdminGuard(makeDb([{ userId: 'u', workspaceId: WS, role: 'manager' }]));
    strict_1.default.equal(await guard.canActivate(ctxFor({ id: 'u', role: 'member' }, { workspaceId: WS })), true);
});
(0, node_test_1.default)('WorkspaceAdminGuard ALLOWS a super_admin when the workspace exists', async () => {
    const guard = new workspace_admin_guard_1.WorkspaceAdminGuard(makeDb([{ id: WS }]));
    strict_1.default.equal(await guard.canActivate(ctxFor({ id: 'root', role: 'super_admin' }, { workspaceId: WS })), true);
});
(0, node_test_1.default)('WorkspaceAdminGuard 404s a super_admin when the workspace is missing', async () => {
    const guard = new workspace_admin_guard_1.WorkspaceAdminGuard(makeDb([]));
    await strict_1.default.rejects(() => guard.canActivate(ctxFor({ id: 'root', role: 'super_admin' }, { workspaceId: 'nope' })), common_1.NotFoundException);
});
//# sourceMappingURL=workspace-admin.guard.test.js.map