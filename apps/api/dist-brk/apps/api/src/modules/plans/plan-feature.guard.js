"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanFeatureGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const plans_service_1 = require("./plans.service");
const require_plan_decorator_1 = require("./require-plan.decorator");
/**
 * Enforces `@RequirePlan(feature)` (Plan §14.1). Resolves the workspace id from
 * the route param, request body, or query string, then asks PlansService whether
 * that workspace's plan includes the feature — throwing 403 if not.
 *
 * Fail-open by design in two cases so it can NEVER break existing behavior:
 *   1. No `@RequirePlan` metadata on the handler/class  → allow.
 *   2. No workspace id resolvable from the request      → allow (can't gate).
 *
 * For an enterprise workspace every feature is enabled, so this is always a
 * no-op there — which is every existing workspace by default.
 */
let PlanFeatureGuard = class PlanFeatureGuard {
    constructor(reflector, plans) {
        this.reflector = reflector;
        this.plans = plans;
    }
    async canActivate(ctx) {
        const feature = this.reflector.getAllAndOverride(require_plan_decorator_1.REQUIRE_PLAN_FEATURE, [
            ctx.getHandler(),
            ctx.getClass(),
        ]);
        if (!feature)
            return true;
        const req = ctx.switchToHttp().getRequest();
        const workspaceId = req.params?.workspaceId ?? req.body?.workspaceId ?? req.query?.workspaceId;
        if (!workspaceId)
            return true; // cannot determine a workspace → do not gate
        await this.plans.assertFeature(workspaceId, feature);
        return true;
    }
};
exports.PlanFeatureGuard = PlanFeatureGuard;
exports.PlanFeatureGuard = PlanFeatureGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        plans_service_1.PlansService])
], PlanFeatureGuard);
//# sourceMappingURL=plan-feature.guard.js.map