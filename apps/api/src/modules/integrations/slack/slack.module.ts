import { Module } from '@nestjs/common'
import { SlackService } from './slack.service'
import { SlackController } from './slack.controller'
import { DatabaseModule } from '../../../common/database/database.module'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { CustomRolesModule } from '../../custom-roles/custom-roles.module'

@Module({
  // `CustomRolesModule` for the permission guard on the write routes, which ask
  // for `integrations.manage` rather than a workspace admin.
  imports: [DatabaseModule, CustomRolesModule],
  controllers: [SlackController],
  providers: [SlackService, WorkspaceMemberGuard],
  exports: [SlackService],
})
export class SlackModule {}
