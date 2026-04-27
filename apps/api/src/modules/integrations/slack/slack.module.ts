import { Module } from '@nestjs/common'
import { SlackService } from './slack.service'
import { SlackController } from './slack.controller'
import { DatabaseModule } from '../../../common/database/database.module'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../../auth/guards/workspace-admin.guard'

@Module({
  imports: [DatabaseModule],
  controllers: [SlackController],
  providers: [SlackService, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [SlackService],
})
export class SlackModule {}
