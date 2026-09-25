import { Module, forwardRef } from '@nestjs/common'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
import { SecurityModule } from '../security/security.module'
import { CustomRolesService } from './custom-roles.service'
import { CustomRolesController, MemberRolesController } from './custom-roles.controller'
import { PermissionsGuard } from './permissions.guard'

@Module({
  // forwardRef: SecurityModule's routes ask `PermissionsGuard`, from here.
  imports: [DatabaseModule, forwardRef(() => SecurityModule)],
  controllers: [CustomRolesController, MemberRolesController],
  providers: [CustomRolesService, PermissionsGuard, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [CustomRolesService, PermissionsGuard],
})
export class CustomRolesModule {}
