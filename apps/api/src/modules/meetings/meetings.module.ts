import { Module } from '@nestjs/common'
// §2.8 gap 10 — a call's recording is stored by key and signed on read.
import { StorageModule } from '../../common/storage/storage.module'
import { MeetingsService } from './meetings.service'
import { MeetingsController } from './meetings.controller'
import { AiModule } from '../ai/ai.module'
import { TasksModule } from '../tasks/tasks.module'

@Module({
  imports: [StorageModule, AiModule, TasksModule],
  providers: [MeetingsService],
  controllers: [MeetingsController],
  exports: [MeetingsService],
})
export class MeetingsModule {}
