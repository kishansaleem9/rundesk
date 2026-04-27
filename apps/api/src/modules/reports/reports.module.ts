import { Module } from '@nestjs/common'
import { ReportsService } from './reports.service'
import { ReportsController } from './reports.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  imports: [DatabaseModule],
  controllers: [ReportsController],
  providers: [ReportsService, WorkspaceMemberGuard],
})
export class ReportsModule {}
