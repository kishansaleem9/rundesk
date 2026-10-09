import { Module } from '@nestjs/common'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { TeamAnalyticsController } from './team-analytics.controller'
import { TeamAnalyticsService } from './team-analytics.service'

@Module({
  imports: [CustomRolesModule],
  providers: [TeamAnalyticsService, WorkspaceMemberGuard],
  controllers: [TeamAnalyticsController],
})
export class TeamAnalyticsModule {}
