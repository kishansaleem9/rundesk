import { Module } from '@nestjs/common'
import { ReportsService } from './reports.service'
import { ReportsController } from './reports.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'

@Module({
  imports: [DatabaseModule, CustomRolesModule],
  controllers: [ReportsController],
  providers: [ReportsService, WorkspaceMemberGuard],
})
export class ReportsModule {}
