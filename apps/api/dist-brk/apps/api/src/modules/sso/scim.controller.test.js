"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const scim_controller_1 = require("./scim.controller");
/**
 * SCIM 2.0 provisioning is protected NOT by the workspace JWT but by the
 * long-lived SCIM bearer token: every protocol method must call
 * `scim.authenticate(bearer)` first, and the workspaceId it returns (tenant
 * scope) must be threaded into the delegated service call. These tests lock
 * that contract in for every mutation endpoint.
 */
const VALID = 'Bearer scim_valid';
function buildController(authImpl) {
    const scim = {
        authenticate: node_test_1.mock.fn(authImpl ?? (async () => 'ws-1')),
        listUsers: node_test_1.mock.fn(async () => ({})),
        getUser: node_test_1.mock.fn(async () => ({})),
        createUser: node_test_1.mock.fn(async () => ({ id: 'u1' })),
        replaceUser: node_test_1.mock.fn(async () => ({ id: 'u1' })),
        patchUser: node_test_1.mock.fn(async () => ({ id: 'u1' })),
        deleteUser: node_test_1.mock.fn(async () => undefined),
        listGroups: node_test_1.mock.fn(async () => ({})),
        getGroup: node_test_1.mock.fn(async () => ({})),
        createGroup: node_test_1.mock.fn(async () => ({ id: 'g1' })),
        replaceGroup: node_test_1.mock.fn(async () => ({ id: 'g1' })),
        patchGroup: node_test_1.mock.fn(async () => ({ id: 'g1' })),
        deleteGroup: node_test_1.mock.fn(async () => undefined),
    };
    return { controller: new scim_controller_1.ScimController(scim), scim };
}
const makeRes = () => ({ code: node_test_1.mock.fn() });
const MUTATIONS = [
    { delegate: 'createUser', call: (c, res) => c.createUser(VALID, { userName: 'a@b.c' }, res) },
    { delegate: 'replaceUser', call: (c) => c.replaceUser(VALID, 'id-1', {}) },
    { delegate: 'patchUser', call: (c) => c.patchUser(VALID, 'id-1', {}) },
    { delegate: 'deleteUser', call: (c, res) => c.deleteUser(VALID, 'id-1', res) },
    { delegate: 'createGroup', call: (c, res) => c.createGroup(VALID, { displayName: 'G' }, res) },
    { delegate: 'replaceGroup', call: (c) => c.replaceGroup(VALID, 'id-1', {}) },
    { delegate: 'patchGroup', call: (c) => c.patchGroup(VALID, 'id-1', {}) },
    { delegate: 'deleteGroup', call: (c, res) => c.deleteGroup(VALID, 'id-1', res) },
];
(0, node_test_1.describe)('ScimController — every mutation authenticates + tenant-scopes', () => {
    for (const m of MUTATIONS) {
        (0, node_test_1.it)(`${m.delegate} authenticates the bearer token and passes the token workspaceId`, async () => {
            const { controller, scim } = buildController();
            await m.call(controller, makeRes());
            strict_1.default.equal(scim.authenticate.mock.callCount(), 1, 'must authenticate exactly once');
            strict_1.default.equal(scim.authenticate.mock.calls[0].arguments[0], 'scim_valid', 'must pass the extracted bearer token');
            strict_1.default.equal(scim[m.delegate].mock.callCount(), 1);
            strict_1.default.equal(scim[m.delegate].mock.calls[0].arguments[0], 'ws-1', 'delegated service call must be scoped to the token workspaceId');
        });
    }
});
(0, node_test_1.describe)('ScimController — mutations reject when the bearer token is invalid', () => {
    for (const m of MUTATIONS) {
        (0, node_test_1.it)(`${m.delegate} rejects and does not mutate when auth fails`, async () => {
            const { controller, scim } = buildController(async () => {
                throw new common_1.UnauthorizedException('Invalid SCIM token');
            });
            await strict_1.default.rejects(() => m.call(controller, makeRes()), (e) => e instanceof common_1.UnauthorizedException);
            strict_1.default.equal(scim[m.delegate].mock.callCount(), 0, 'the service mutation must not run without auth');
        });
    }
});
//# sourceMappingURL=scim.controller.test.js.map