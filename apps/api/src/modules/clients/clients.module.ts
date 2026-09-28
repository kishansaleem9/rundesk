import { Module } from '@nestjs/common'
import { ClientsService } from './clients.service'
import { ClientsController } from './clients.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'

@Module({
  // `PermissionsGuard` resolves `client.manage` through CustomRolesService.
  imports: [DatabaseModule, CustomRolesModule],
  controllers: [ClientsController],
  providers: [ClientsService, WorkspaceMemberGuard],
})
export class ClientsModule {}
