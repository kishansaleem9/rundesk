import { Module } from '@nestjs/common'
import { PlansService } from './plans.service'
import { PlanFeatureGuard } from './plan-feature.guard'

/**
 * Commercial plan model + feature gating (Plan §14.1). Exports both the service
 * (imperative limit/feature checks) and the guard (declarative @RequirePlan) so
 * any feature module can import PlansModule and use either. Depends only on the
 * global DatabaseModule, so it introduces no dependency cycles.
 */
@Module({
  providers: [PlansService, PlanFeatureGuard],
  exports: [PlansService, PlanFeatureGuard],
})
export class PlansModule {}
