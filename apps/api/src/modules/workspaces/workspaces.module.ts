import { Module } from '@nestjs/common'
import { WorkspacesService } from './workspaces.service'
import { WorkspacesController, WorkspacesPublicController } from './workspaces.controller'
import { SecurityModule } from '../security/security.module'
import { WebhooksModule } from '../webhooks/webhooks.module'
import { PlansModule } from '../plans/plans.module'

@Module({
  imports: [SecurityModule, WebhooksModule, PlansModule],
  controllers: [WorkspacesController, WorkspacesPublicController],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
