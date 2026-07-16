import { Module } from '@nestjs/common'
import { ReportsService } from './reports.service'
import { ScheduledReportsService } from './scheduled-reports.service'
import { ReportsController } from './reports.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { EmailModule } from '../email/email.module'

@Module({
  imports: [DatabaseModule, CustomRolesModule, EmailModule],
  controllers: [ReportsController],
  providers: [ReportsService, ScheduledReportsService, WorkspaceMemberGuard],
})
export class ReportsModule {}
