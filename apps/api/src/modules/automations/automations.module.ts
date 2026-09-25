import { Module } from '@nestjs/common'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'
import { AutomationsService } from './automations.service'
import { AutomationsController } from './automations.controller'
import { DatabaseModule } from '../../common/database/database.module'
import { RealtimeModule } from '../realtime/realtime.module'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'

// NOTE: post_to_channel (§7.7) posts via a low-level insert in the service, not
// by importing ChatModule — TasksModule already imports AutomationsModule, so
// importing ChatModule (Chat → Tasks → Automations) would form a DI cycle.
// RealtimeModule is a leaf here and only supplies the broadcast gateway.
@Module({
  imports: [DatabaseModule, RealtimeModule, CustomRolesModule],
  controllers: [AutomationsController],
  providers: [AutomationsService, WorkspaceMemberGuard, WorkspaceAdminGuard],
  exports: [AutomationsService],
})
export class AutomationsModule {}
