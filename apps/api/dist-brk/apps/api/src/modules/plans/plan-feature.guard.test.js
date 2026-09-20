"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const common_1 = require("@nestjs/common");
const plan_feature_guard_1 = require("./plan-feature.guard");
function ctx(request) {
    return {
        getHandler: () => () => { },
        getClass: () => class {
        },
        switchToHttp: () => ({ getRequest: () => request }),
    };
}
function reflector(feature) {
    return { getAllAndOverride: () => feature };
}
(0, node_test_1.describe)('PlanFeatureGuard', () => {
    (0, node_test_1.it)('allows when no @RequirePlan metadata is present (fail-open)', async () => {
        const plans = { assertFeature: node_test_1.mock.fn(async () => undefined) };
        const guard = new plan_feature_guard_1.PlanFeatureGuard(reflector(undefined), plans);
        strict_1.default.equal(await guard.canActivate(ctx({ body: { workspaceId: 'ws' } })), true);
        strict_1.default.equal(plans.assertFeature.mock.callCount(), 0);
    });
    (0, node_test_1.it)('allows when no workspaceId can be resolved (cannot gate → preserve behavior)', async () => {
        const plans = { assertFeature: node_test_1.mock.fn(async () => undefined) };
        const guard = new plan_feature_guard_1.PlanFeatureGuard(reflector('ai'), plans);
        strict_1.default.equal(await guard.canActivate(ctx({ body: {}, query: {}, params: {} })), true);
        strict_1.default.equal(plans.assertFeature.mock.callCount(), 0);
    });
    (0, node_test_1.it)('resolves workspaceId from the body and delegates to PlansService', async () => {
        const plans = { assertFeature: node_test_1.mock.fn(async () => undefined) };
        const guard = new plan_feature_guard_1.PlanFeatureGuard(reflector('ai'), plans);
        strict_1.default.equal(await guard.canActivate(ctx({ body: { workspaceId: 'ws-9' } })), true);
        strict_1.default.equal(plans.assertFeature.mock.callCount(), 1);
        strict_1.default.deepEqual(plans.assertFeature.mock.calls[0].arguments, ['ws-9', 'ai']);
    });
    (0, node_test_1.it)('propagates the 403 when the plan lacks the feature (free plan)', async () => {
        const plans = {
            assertFeature: node_test_1.mock.fn(async () => {
                throw new common_1.ForbiddenException('no ai');
            }),
        };
        const guard = new plan_feature_guard_1.PlanFeatureGuard(reflector('ai'), plans);
        await strict_1.default.rejects(() => guard.canActivate(ctx({ params: { workspaceId: 'ws' } })), common_1.ForbiddenException);
    });
});
//# sourceMappingURL=plan-feature.guard.test.js.map