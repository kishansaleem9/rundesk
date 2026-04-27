import { Module } from '@nestjs/common'
import { SecurityService } from './security.service'
import { TotpController, ApiKeysController, AuditLogsController } from './security.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'

@Module({
  imports: [DatabaseModule],
  controllers: [TotpController, ApiKeysController, AuditLogsController],
  providers: [SecurityService, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [SecurityService],
})
export class SecurityModule {}
