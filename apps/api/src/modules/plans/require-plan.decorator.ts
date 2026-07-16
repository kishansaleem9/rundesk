import { SetMetadata } from '@nestjs/common'
import type { PlanFeature } from './plans.constants'

/** Metadata key the PlanFeatureGuard reads. */
export const REQUIRE_PLAN_FEATURE = 'requirePlanFeature'

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
export const RequirePlan = (feature: PlanFeature) => SetMetadata(REQUIRE_PLAN_FEATURE, feature)
