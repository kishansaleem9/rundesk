import { Module } from '@nestjs/common'
import { PlansService } from './plans.service'
import { PlanFeatureGuard } from './plan-feature.guard'
import { PlanRequestsController } from './plan-requests.controller'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { NotificationsModule } from '../notifications/notifications.module'

/**
 * Commercial plan model + feature gating (Plan §14.1). Exports both the service
 * (imperative limit/feature checks) and the guard (declarative @RequirePlan) so
 * any feature module can import PlansModule and use either. Depends only on the
 * global DatabaseModule, so it introduces no dependency cycles.
 */
@Module({
  // §V2-13 frame `09:26` — the paywall's "Contact your admin" needs somewhere
  // to send the ask. NotificationsModule imports only Realtime + Email, so this
  // stays cycle-free.
  imports: [NotificationsModule],
  providers: [PlansService, PlanFeatureGuard, WorkspaceMemberGuard],
  controllers: [PlanRequestsController],
  exports: [PlansService, PlanFeatureGuard],
})
export class PlansModule {}
