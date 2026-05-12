import { Module } from '@nestjs/common'
import { WebhooksService } from './webhooks.service'
import { WebhooksController } from './webhooks.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'

@Module({
  imports: [DatabaseModule, CustomRolesModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [WebhooksService],
})
export class WebhooksModule {}
