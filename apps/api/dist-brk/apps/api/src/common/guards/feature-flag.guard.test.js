"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const common_1 = require("@nestjs/common");
const feature_flag_guard_1 = require("./feature-flag.guard");
/**
 * The @FeatureFlag decorator + FeatureFlagGuard enforce workspace feature flags
 * at the API (defense-in-depth beside the frontend gate). Contract:
 *   - a route with NO required flag passes untouched (the guard is a no-op on
 *     the vast majority of routes), without ever hitting the flag service;
 *   - a required flag that resolves enabled passes;
 *   - a required flag that resolves disabled 404s (the feature "does not exist");
 *   - the resolution context is the request's workspace (param first, else the
 *     user's active workspace) + user id + role.
 */
function ctx(opts) {
    const reflector = { getAllAndOverride: node_test_1.mock.fn(() => opts.flags) };
    const request = { user: opts.user, params: opts.params ?? {} };
    const execCtx = {
        getHandler: () => () => undefined,
        getClass: () => class {
        },
        switchToHttp: () => ({ getRequest: () => request }),
    };
    return { reflector, execCtx };
}
(0, node_test_1.describe)('FeatureFlagGuard', () => {
    (0, node_test_1.it)('allows a route with no required flag and never calls the flag service', async () => {
        const { reflector, execCtx } = ctx({ flags: undefined });
        const svc = { isEnabled: node_test_1.mock.fn(async () => false) };
        const guard = new feature_flag_guard_1.FeatureFlagGuard(reflector, svc);
        strict_1.default.equal(await guard.canActivate(execCtx), true);
        strict_1.default.equal(svc.isEnabled.mock.callCount(), 0, 'no flag → no resolution');
    });
    (0, node_test_1.it)('allows when the required flag resolves enabled', async () => {
        const { reflector, execCtx } = ctx({
            flags: ['chat'],
            user: { id: 'u1', role: 'member' },
            params: { workspaceId: 'w1' },
        });
        const svc = { isEnabled: node_test_1.mock.fn(async () => true) };
        const guard = new feature_flag_guard_1.FeatureFlagGuard(reflector, svc);
        strict_1.default.equal(await guard.canActivate(execCtx), true);
        // Resolution context = request workspace param + user id + role.
        const arg = svc.isEnabled.mock.calls[0].arguments;
        strict_1.default.equal(arg[0], 'chat');
        strict_1.default.deepEqual(arg[1], { userId: 'u1', workspaceId: 'w1', role: 'member' });
    });
    (0, node_test_1.it)('404s when the required flag resolves disabled', async () => {
        const { reflector, execCtx } = ctx({
            flags: ['docs'],
            user: { id: 'u1', role: 'member' },
            params: { workspaceId: 'w1' },
        });
        const svc = { isEnabled: node_test_1.mock.fn(async () => false) };
        const guard = new feature_flag_guard_1.FeatureFlagGuard(reflector, svc);
        await strict_1.default.rejects(() => guard.canActivate(execCtx), common_1.NotFoundException);
    });
    (0, node_test_1.it)('falls back to the user active workspace when the route has no :workspaceId', async () => {
        const { reflector, execCtx } = ctx({
            flags: ['search'],
            user: { id: 'u1', role: 'manager', activeWorkspaceId: 'w-active' },
            params: {},
        });
        const svc = { isEnabled: node_test_1.mock.fn(async () => true) };
        const guard = new feature_flag_guard_1.FeatureFlagGuard(reflector, svc);
        await guard.canActivate(execCtx);
        strict_1.default.equal(svc.isEnabled.mock.calls[0].arguments[1].workspaceId, 'w-active');
    });
});
//# sourceMappingURL=feature-flag.guard.test.js.map