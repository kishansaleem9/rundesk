import { Module } from '@nestjs/common'
import { TimeEntriesService } from './time-entries.service'
import { WorkspaceTimeEntriesController } from './time-entries.controller'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@Module({
  providers: [TimeEntriesService, WorkspaceMemberGuard],
  controllers: [WorkspaceTimeEntriesController],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}
