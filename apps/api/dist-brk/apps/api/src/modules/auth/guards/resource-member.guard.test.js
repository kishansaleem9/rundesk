"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const common_1 = require("@nestjs/common");
const resource_member_guard_1 = require("./resource-member.guard");
// Mock: the guard resolves a workspace (1 select chain) then checks membership
// (a 2nd select chain). `resolveRows` feeds the first, `memberRows` the second.
function makeDb(resolveRows, memberRows) {
    let call = 0;
    const chain = (rows) => {
        const c = {};
        c.from = () => c;
        c.innerJoin = () => c;
        c.where = () => c;
        c.limit = () => Promise.resolve(rows);
        return c;
    };
    return { select: () => chain(call++ === 0 ? resolveRows : memberRows) };
}
function ctxFor(user, params, body = {}) {
    const req = { user, params, body };
    return { switchToHttp: () => ({ getRequest: () => req }) };
}
/*
 * Ids shaped like the real thing.
 *
 * The mock db ignores them, so these used to be readable stand-ins — 'ws-1',
 * 'sp-1'. But every id the guard resolves addresses a `uuid` column, and it now
 * turns away anything that cannot be one BEFORE querying, because a non-uuid is
 * not a lookup that misses: Postgres refuses the query outright. A stand-in id
 * therefore exercised a path production can never reach.
 */
const WS = '11111111-1111-4111-8111-111111111111';
const SPACE = '22222222-2222-4222-8222-222222222222';
const LIST = '33333333-3333-4333-8333-333333333333';
const TASK = '44444444-4444-4444-8444-444444444444';
const ABSENT = '55555555-5555-4555-8555-555555555555';
(0, node_test_1.default)('rejects unauthenticated', async () => {
    const g = new resource_member_guard_1.ResourceMemberGuard(makeDb([], []));
    await strict_1.default.rejects(() => g.canActivate(ctxFor(undefined, { workspaceId: WS })), common_1.ForbiddenException);
});
(0, node_test_1.default)('DENIES a non-member for a workspace param', async () => {
    const g = new resource_member_guard_1.ResourceMemberGuard(makeDb([], [])); // workspaceId direct → membership empty
    await strict_1.default.rejects(() => g.canActivate(ctxFor({ id: 'u', role: 'member' }, { workspaceId: WS })), common_1.ForbiddenException);
});
(0, node_test_1.default)('DENIES a non-member resolving via spaceId', async () => {
    const g = new resource_member_guard_1.ResourceMemberGuard(makeDb([{ w: WS }], [])); // space resolves to WS, but no membership
    await strict_1.default.rejects(() => g.canActivate(ctxFor({ id: 'outsider', role: 'member' }, { spaceId: SPACE })), common_1.ForbiddenException);
});
/*
 * The distinction the 404 above does NOT make.
 *
 * A well-formed id that resolves to nothing is a miss, and 404 says so. An id
 * that cannot be a uuid never gets that far: Postgres refuses the query, which
 * used to surface as a database error and left `invalid input syntax for type
 * uuid` all over the CI log. `makeDb` throwing here is the point — reaching it
 * at all is the failure.
 */
(0, node_test_1.default)('REFUSES an id that cannot be one, without querying', async () => {
    const exploded = {
        select: () => {
            throw new Error('the guard queried on a malformed id');
        },
    };
    const g = new resource_member_guard_1.ResourceMemberGuard(exploded);
    await strict_1.default.rejects(() => g.canActivate(ctxFor({ id: 'u', role: 'member' }, { spaceId: 'dashboards' })), common_1.BadRequestException);
});
(0, node_test_1.default)('404 when the resource does not resolve to a workspace', async () => {
    const g = new resource_member_guard_1.ResourceMemberGuard(makeDb([], [])); // taskId resolves to nothing
    await strict_1.default.rejects(() => g.canActivate(ctxFor({ id: 'u', role: 'member' }, { taskId: ABSENT })), common_1.NotFoundException);
});
(0, node_test_1.default)('ALLOWS a member resolving via listId (body)', async () => {
    const g = new resource_member_guard_1.ResourceMemberGuard(makeDb([{ w: WS }], [{ role: 'member' }]));
    strict_1.default.equal(await g.canActivate(ctxFor({ id: 'u', role: 'member' }, {}, { listId: LIST })), true);
});
(0, node_test_1.default)('ALLOWS super_admin without a membership row', async () => {
    const g = new resource_member_guard_1.ResourceMemberGuard(makeDb([{ w: WS }], []));
    strict_1.default.equal(await g.canActivate(ctxFor({ id: 'root', role: 'super_admin' }, { taskId: TASK })), true);
});
(0, node_test_1.default)('populates req.workspaceMember for super_admin (so PermissionsGuard has workspace context)', async () => {
    const g = new resource_member_guard_1.ResourceMemberGuard(makeDb([{ w: WS }], []));
    const req = { user: { id: 'root', role: 'super_admin' }, params: {}, body: { spaceId: SPACE } };
    const ctx = { switchToHttp: () => ({ getRequest: () => req }) };
    strict_1.default.equal(await g.canActivate(ctx), true);
    strict_1.default.deepEqual(req.workspaceMember, { workspaceId: WS, userId: 'root', role: 'super_admin' });
});
//# sourceMappingURL=resource-member.guard.test.js.map