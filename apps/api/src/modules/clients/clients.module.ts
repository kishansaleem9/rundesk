import { Module } from '@nestjs/common'
import { ClientsService } from './clients.service'
import { ClientsController } from './clients.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'

@Module({
  imports: [DatabaseModule],
  controllers: [ClientsController],
  providers: [ClientsService, WorkspaceMemberGuard, WorkspaceAdminGuard],
})
export class ClientsModule {}
