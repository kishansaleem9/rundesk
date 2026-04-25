import { Module } from '@nestjs/common'
import { TimeEntriesService } from './time-entries.service'
import { WorkspaceTimeEntriesController } from './time-entries.controller'

@Module({
  providers: [TimeEntriesService],
  controllers: [WorkspaceTimeEntriesController],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}
