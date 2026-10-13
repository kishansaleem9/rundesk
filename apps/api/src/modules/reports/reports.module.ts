import { Module } from '@nestjs/common'
import { ReportsService } from './reports.service'
import { ScheduledReportsService } from './scheduled-reports.service'
import { ProjectHealthService } from './project-health.service'
import { ReportsController } from './reports.controller'
import { ListWorkloadController } from './list-workload.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { EmailModule } from '../email/email.module'
import { AiModule } from '../ai/ai.module'

@Module({
  // AiModule supplies AiService for the project-health sentiment component
  // (§7.13); it is a leaf of this module's dependency graph, so importing it
  // here introduces no cycle.
  imports: [DatabaseModule, CustomRolesModule, EmailModule, AiModule],
  controllers: [ReportsController, ListWorkloadController],
  // ProjectHealthService owns the daily @Cron that persists project-health
  // scores — it must be provided here or the cron never registers.
  providers: [ReportsService, ScheduledReportsService, ProjectHealthService, WorkspaceMemberGuard],
})
export class ReportsModule {}
