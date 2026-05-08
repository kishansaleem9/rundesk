import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../../common/database/database.module'
import { IntegrationConnectionsController } from './integration-connections.controller'
import { IntegrationConnectionsService } from './integration-connections.service'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../../auth/guards/workspace-admin.guard'

@Module({
  imports: [DatabaseModule],
  controllers: [IntegrationConnectionsController],
  providers: [IntegrationConnectionsService, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [IntegrationConnectionsService],
})
export class IntegrationConnectionsModule {}
