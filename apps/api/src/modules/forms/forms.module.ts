import { Module } from '@nestjs/common'
import { FormsService } from './forms.service'
import { WorkspaceFormsController, PublicFormsController } from './forms.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { WebhooksModule } from '../webhooks/webhooks.module'

@Module({
  imports: [DatabaseModule, WebhooksModule],
  controllers: [WorkspaceFormsController, PublicFormsController],
  providers: [FormsService, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [FormsService],
})
export class FormsModule {}
