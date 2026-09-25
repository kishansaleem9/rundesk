import { Module, forwardRef } from '@nestjs/common'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { SecurityService } from './security.service'
import { WorkspaceSecuritySettingsService } from './workspace-security-settings.service'
import { TotpController, ApiKeysController, AuditLogsController } from './security.controller'
import { SecuritySettingsController } from './security-settings.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'

@Module({
  // CustomRolesModule for `PermissionsGuard`; it imports this module in turn.
  imports: [DatabaseModule, forwardRef(() => CustomRolesModule)],
  controllers: [TotpController, ApiKeysController, AuditLogsController, SecuritySettingsController],
  providers: [SecurityService, WorkspaceSecuritySettingsService, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [SecurityService, WorkspaceSecuritySettingsService],
})
export class SecurityModule {}
