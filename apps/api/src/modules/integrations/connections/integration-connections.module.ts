import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../../common/database/database.module'
import { IntegrationConnectionsController } from './integration-connections.controller'
import { IntegrationConnectionsService } from './integration-connections.service'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../../auth/guards/workspace-admin.guard'
import { SecurityModule } from '../../security/security.module'
import { CustomRolesModule } from '../../custom-roles/custom-roles.module'

@Module({
  imports: [DatabaseModule, SecurityModule, CustomRolesModule],
  controllers: [IntegrationConnectionsController],
  providers: [IntegrationConnectionsService, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [IntegrationConnectionsService],
})
export class IntegrationConnectionsModule {}
