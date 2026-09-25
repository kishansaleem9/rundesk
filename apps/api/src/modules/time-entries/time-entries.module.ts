import { Module } from '@nestjs/common'
import { TimeEntriesService } from './time-entries.service'
import { WorkspaceTimeEntriesController } from './time-entries.controller'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { SecurityModule } from '../security/security.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'

@Module({
  // Custom roles: approving asks `time.approval.manage`, the guard and the service alike.
  imports: [SecurityModule, NotificationsModule, CustomRolesModule],
  providers: [TimeEntriesService, WorkspaceMemberGuard],
  controllers: [WorkspaceTimeEntriesController],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}
