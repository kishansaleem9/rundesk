import { Module } from '@nestjs/common'
import { AutomationsService } from './automations.service'
import { AutomationsController } from './automations.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'

@Module({
  imports: [DatabaseModule],
  controllers: [AutomationsController],
  providers: [AutomationsService, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [AutomationsService],
})
export class AutomationsModule {}
