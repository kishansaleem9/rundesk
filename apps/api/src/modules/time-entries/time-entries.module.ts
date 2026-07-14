import { Module } from '@nestjs/common'
import { TimeEntriesService } from './time-entries.service'
import { WorkspaceTimeEntriesController } from './time-entries.controller'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { SecurityModule } from '../security/security.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [SecurityModule, NotificationsModule],
  providers: [TimeEntriesService, WorkspaceMemberGuard],
  controllers: [WorkspaceTimeEntriesController],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}
