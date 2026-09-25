import { Module } from '@nestjs/common'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { WorkspacesService } from './workspaces.service'
import { WorkspacesController, WorkspacesPublicController } from './workspaces.controller'
import { SecurityModule } from '../security/security.module'
import { WebhooksModule } from '../webhooks/webhooks.module'
import { PlansModule } from '../plans/plans.module'

@Module({
  // CustomRolesModule: the member routes ask their catalog keys (`PermissionsGuard`).
  imports: [SecurityModule, WebhooksModule, PlansModule, CustomRolesModule],
  controllers: [WorkspacesController, WorkspacesPublicController],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
