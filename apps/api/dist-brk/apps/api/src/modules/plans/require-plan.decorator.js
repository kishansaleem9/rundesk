"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequirePlan = exports.REQUIRE_PLAN_FEATURE = void 0;
const common_1 = require("@nestjs/common");
/** Metadata key the PlanFeatureGuard reads. */
exports.REQUIRE_PLAN_FEATURE = 'requirePlanFeature';
/**
 * Declarative plan-feature gate (Plan §14.1). Attach to a controller class or a
 * handler; the PlanFeatureGuard resolves the workspace (from the `:workspaceId`
 * route param, request body, or query) and 403s if that workspace's plan does
 * not include the feature. A no-op for enterprise (feature = true) and when no
 * workspace can be resolved (fail-open — preserves current behavior).
 *
 *   @RequirePlan('ai')
 *   @UseGuards(JwtAuthGuard, PlanFeatureGuard)
 */
const RequirePlan = (feature) => (0, common_1.SetMetadata)(exports.REQUIRE_PLAN_FEATURE, feature);
exports.RequirePlan = RequirePlan;
//# sourceMappingURL=require-plan.decorator.js.map