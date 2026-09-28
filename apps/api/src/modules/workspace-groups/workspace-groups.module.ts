import { Module } from '@nestjs/common'
import { WorkspaceGroupsService } from './workspace-groups.service'
import { WorkspaceGroupsController, TeamsHubController } from './workspace-groups.controller'
import { SecurityModule } from '../security/security.module'
import { AuthModule } from '../auth/auth.module'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'

@Module({
  // CustomRolesModule: `PermissionsGuard` resolves `groups.manage` through its service.
  imports: [SecurityModule, AuthModule, CustomRolesModule],
  controllers: [WorkspaceGroupsController, TeamsHubController],
  providers: [WorkspaceGroupsService],
  exports: [WorkspaceGroupsService],
})
export class WorkspaceGroupsModule {}
